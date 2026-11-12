import { createClient } from 'npm:@supabase/supabase-js@2';

type TitleFileType = 'downloadable_cover' | 'cover_print_pdf' | 'interior_print_pdf' | 'marketing_image' | 'additional_asset';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID') ?? '';
const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET') ?? '';
const refreshToken = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN') ?? '';
const privateRootFolderId = Deno.env.get('GOOGLE_DRIVE_PRIVATE_FOLDER_ID')
  ?? Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')
  ?? '';
const configuredOrigins = (Deno.env.get('PHILBO_ALLOWED_ORIGINS') ?? 'https://philbopod.com,https://www.philbopod.com')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const allowedFileTypes = new Set<TitleFileType>([
  'downloadable_cover',
  'cover_print_pdf',
  'interior_print_pdf',
  'marketing_image',
  'additional_asset'
]);
const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/zip'
]);
const maxFileSize = 1024 * 1024 * 1024;

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && configuredOrigins.includes(origin) ? origin : configuredOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

function cleanName(value: unknown, fallback: string) {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|#%{}[\]]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  return cleaned || fallback;
}

function driveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getGoogleAccessToken() {
  if (!clientId || !clientSecret || !refreshToken || !privateRootFolderId) {
    throw new Error('DRIVE_NOT_CONFIGURED');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('DRIVE_AUTHORIZATION_FAILED');
  return String(data.access_token);
}

async function driveRequest(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    console.error('Google Drive request failed', response.status, await response.text());
    throw new Error('DRIVE_REQUEST_FAILED');
  }
  return response;
}

async function ensureFolder(accessToken: string, name: string, parentId: string) {
  const query = [
    `name = '${driveQueryValue(name)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${driveQueryValue(parentId)}' in parents`,
    'trashed = false'
  ].join(' and ');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`;
  const existing = await (await driveRequest(accessToken, listUrl)).json();
  if (existing.files?.[0]?.id) return String(existing.files[0].id);

  const created = await (await driveRequest(accessToken, 'https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  })).json();
  return String(created.id);
}

async function requireTitleAccess(request: Request, titleId: string) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) throw new Error('UNAUTHENTICATED');

  const { data: title, error: titleError } = await service
    .from('titles')
    .select('id,title,philbo_id,publisher_organization_id')
    .eq('id', titleId)
    .single();
  if (titleError || !title) throw new Error('TITLE_NOT_FOUND');

  const [{ data: memberships }, { data: roles }, { data: organization }] = await Promise.all([
    service.from('organization_memberships').select('id').eq('user_id', userData.user.id).eq('organization_id', title.publisher_organization_id).eq('is_active', true),
    service.from('user_roles').select('role').eq('user_id', userData.user.id).eq('is_active', true),
    service.from('organizations').select('name,account_status').eq('id', title.publisher_organization_id).single()
  ]);
  const staff = (roles ?? []).some(row => row.role === 'moos' || row.role === 'admin');
  if (!memberships?.length && !staff) throw new Error('FORBIDDEN');
  if (organization?.account_status !== 'active' && !staff) throw new Error('FORBIDDEN');
  return { user: userData.user, title, organization, staff };
}

async function getTitleFolder(accessToken: string, context: Awaited<ReturnType<typeof requireTitleAccess>>) {
  const organizationName = cleanName(context.organization?.name, `Publisher ${context.title.publisher_organization_id}`);
  const titleName = cleanName(
    [context.title.philbo_id, context.title.title].filter(Boolean).join(' - '),
    `Title ${context.title.id}`
  );
  const publisherFolderId = await ensureFolder(accessToken, organizationName, privateRootFolderId);
  return ensureFolder(accessToken, titleName, publisherFolderId);
}

async function startUpload(request: Request, payload: Record<string, unknown>) {
  const titleId = String(payload.titleId ?? '');
  const fileType = String(payload.fileType ?? '') as TitleFileType;
  const fileName = cleanName(payload.fileName, 'uploaded-file');
  const mimeType = String(payload.mimeType ?? 'application/octet-stream').toLowerCase();
  const sizeBytes = Number(payload.sizeBytes ?? 0);
  if (!/^[0-9a-f-]{36}$/i.test(titleId) || !allowedFileTypes.has(fileType)) throw new Error('INVALID_REQUEST');
  if (!allowedMimeTypes.has(mimeType) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxFileSize) {
    throw new Error('INVALID_FILE');
  }

  const context = await requireTitleAccess(request, titleId);
  const accessToken = await getGoogleAccessToken();
  const titleFolderId = await getTitleFolder(accessToken, context);
  const typeFolderId = await ensureFolder(accessToken, fileType.replaceAll('_', ' '), titleFolderId);
  const response = await driveRequest(
    accessToken,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,parents,webViewLink',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(sizeBytes)
      },
      body: JSON.stringify({ name: fileName, parents: [typeFolderId] })
    }
  );
  const uploadUrl = response.headers.get('Location');
  if (!uploadUrl) throw new Error('DRIVE_UPLOAD_SESSION_FAILED');
  return { uploadUrl, titleId, fileType, fileName, mimeType, sizeBytes, parentFolderId: typeFolderId };
}

async function completeUpload(request: Request, payload: Record<string, unknown>) {
  const titleId = String(payload.titleId ?? '');
  const fileType = String(payload.fileType ?? '') as TitleFileType;
  const fileId = String(payload.fileId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(titleId) || !allowedFileTypes.has(fileType) || !fileId) throw new Error('INVALID_REQUEST');

  const context = await requireTitleAccess(request, titleId);
  const accessToken = await getGoogleAccessToken();
  const titleFolderId = await getTitleFolder(accessToken, context);
  const expectedParentId = await ensureFolder(accessToken, fileType.replaceAll('_', ' '), titleFolderId);
  const fields = 'id,name,mimeType,size,parents,webViewLink,md5Checksum,trashed';
  const file = await (await driveRequest(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`)).json();
  if (file.trashed || !file.parents?.includes(expectedParentId)) throw new Error('DRIVE_FILE_MISMATCH');

  const { data: existing } = await service.from('title_files').select('*').eq('provider_file_id', file.id).maybeSingle();
  if (existing) return { file: existing, webViewLink: file.webViewLink };
  const { data: latest } = await service.from('title_files').select('version').eq('title_id', titleId).eq('file_type', fileType).order('version', { ascending: false }).limit(1);
  const version = Number(latest?.[0]?.version ?? 0) + 1;
  const { data: saved, error: saveError } = await service.from('title_files').insert({
    title_id: titleId,
    file_type: fileType,
    storage_provider: 'google_drive',
    object_path: `google-drive/${file.id}`,
    provider_file_id: file.id,
    original_filename: file.name,
    mime_type: file.mimeType,
    size_bytes: Number(file.size ?? 0),
    version,
    review_status: 'uploaded',
    uploaded_by: context.user.id
  }).select('*').single();
  if (saveError) throw saveError;
  return { file: saved, webViewLink: file.webViewLink };
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (origin && !configuredOrigins.includes(origin)) return json(403, { error: 'This site is not approved for uploads.' }, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, origin);

  try {
    const payload = await request.json();
    const action = String(payload.action ?? '');
    if (action === 'start') return json(200, { ok: true, ...(await startUpload(request, payload)) }, origin);
    if (action === 'complete') return json(200, { ok: true, ...(await completeUpload(request, payload)) }, origin);
    return json(400, { error: 'Unknown upload action.' }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UPLOAD_FAILED';
    if (message === 'UNAUTHENTICATED') return json(401, { error: 'Please sign in again.' }, origin);
    if (message === 'FORBIDDEN') return json(403, { error: 'You do not have access to this title.' }, origin);
    if (message === 'TITLE_NOT_FOUND') return json(404, { error: 'The selected title could not be found.' }, origin);
    if (message === 'INVALID_FILE') return json(400, { error: 'Choose an approved PDF, JPG, PNG, TIFF, or ZIP file under 1 GB.' }, origin);
    if (message === 'INVALID_REQUEST') return json(400, { error: 'The upload request is missing required information.' }, origin);
    if (message === 'DRIVE_NOT_CONFIGURED' || message === 'DRIVE_AUTHORIZATION_FAILED') return json(503, { error: 'Google Drive authorization still needs to be completed by Philbo.' }, origin);
    console.error(error);
    return json(500, { error: 'The file could not be saved to Google Drive.' }, origin);
  }
});
