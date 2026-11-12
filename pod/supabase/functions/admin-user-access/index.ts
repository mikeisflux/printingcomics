import { createClient } from 'npm:@supabase/supabase-js@2';

type AppRole = 'moos' | 'admin' | 'preflight' | 'publisher' | 'retailer' | 'pod';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const siteUrl = Deno.env.get('PHILBO_SITE_URL') ?? 'http://127.0.0.1:5173';
const configuredOrigins = (Deno.env.get('PHILBO_ALLOWED_ORIGINS') ?? siteUrl)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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

async function requireStaff(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) throw new Error('UNAUTHENTICATED');

  const [{ data: profile }, { data: roles }] = await Promise.all([
    service.from('profiles').select('account_status').eq('user_id', userData.user.id).single(),
    service.from('user_roles').select('role').eq('user_id', userData.user.id).eq('is_active', true)
  ]);
  const roleNames = new Set((roles ?? []).map((row) => row.role as AppRole));
  if (profile?.account_status !== 'active' || (!roleNames.has('moos') && !roleNames.has('admin'))) {
    throw new Error('FORBIDDEN');
  }
  return { user: userData.user, roles: roleNames };
}

async function inviteUser(email: string, role: AppRole, metadata: Record<string, unknown>) {
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: { ...metadata, role },
    redirectTo: `${siteUrl}/?set_password=1`
  });
  if (error) throw error;
  if (!data.user) throw new Error('The invitation did not create a user.');
  return data.user;
}

async function assignRole(userId: string, role: AppRole, grantedBy: string) {
  const { error } = await service.from('user_roles').upsert({
    user_id: userId,
    role,
    is_active: true,
    granted_by: grantedBy,
    revoked_at: null
  }, { onConflict: 'user_id,role' });
  if (error) throw error;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, origin);

  try {
    const caller = await requireStaff(request);
    const payload = await request.json();
    const action = String(payload.action ?? '');

    if (action === 'invite_staff') {
      const email = String(payload.email ?? '').trim().toLowerCase();
      const role = payload.role as AppRole;
      if (!email || !['admin', 'preflight'].includes(role)) throw new Error('INVALID_REQUEST');
      const invited = await inviteUser(email, role, {
        first_name: payload.firstName ?? '', last_name: payload.lastName ?? '', display_name: payload.displayName ?? ''
      });
      await assignRole(invited.id, role, caller.user.id);
      await service.from('profiles').update({ account_status: 'active' }).eq('user_id', invited.id);
      return json(200, { ok: true, userId: invited.id }, origin);
    }

    if (action === 'approve_application') {
      const applicationId = String(payload.applicationId ?? '');
      const { data: application, error: applicationError } = await service
        .from('portal_applications').select('*').eq('id', applicationId).single();
      if (applicationError || !application) throw applicationError ?? new Error('Application not found.');
      if (!['submitted', 'under_review'].includes(application.status)) throw new Error('Application was already reviewed.');

      const roleMap: Record<string, AppRole> = { publisher: 'publisher', retailer: 'retailer', pod_customer: 'pod' };
      const role = roleMap[application.applicant_type];
      if (!role) throw new Error('INVALID_REQUEST');

      const { data: organization, error: organizationError } = await service.from('organizations').insert({
        organization_type: application.applicant_type,
        name: application.company_name,
        website: application.website,
        account_status: 'active'
      }).select('id').single();
      if (organizationError || !organization) throw organizationError ?? new Error('Organization creation failed.');

      const invited = await inviteUser(application.email, role, {
        first_name: application.contact_first_name ?? '',
        last_name: application.contact_last_name ?? '',
        display_name: `${application.contact_first_name ?? ''} ${application.contact_last_name ?? ''}`.trim(),
        organization_id: organization.id
      });
      await assignRole(invited.id, role, caller.user.id);
      const { error: membershipError } = await service.from('organization_memberships').insert({
        organization_id: organization.id, user_id: invited.id, is_primary_contact: true, is_active: true
      });
      if (membershipError) throw membershipError;
      await service.from('profiles').update({ account_status: 'active' }).eq('user_id', invited.id);

      if (application.applicant_type === 'publisher') {
        await service.from('publisher_profiles').insert({ organization_id: organization.id });
      } else if (application.applicant_type === 'retailer') {
        await service.from('retailer_profiles').insert({ organization_id: organization.id });
      } else {
        await service.from('pod_customer_profiles').insert({
          organization_id: organization.id,
          customer_type: application.application_data?.customerType ?? null,
          expected_quantity_range: application.application_data?.expectedQuantities ?? null
        });
      }

      const { error: approvalError } = await service.from('portal_applications').update({
        status: 'approved', reviewed_by: caller.user.id, reviewed_at: new Date().toISOString(), approved_organization_id: organization.id
      }).eq('id', application.id);
      if (approvalError) throw approvalError;
      return json(200, { ok: true, userId: invited.id, organizationId: organization.id }, origin);
    }

    if (action === 'suspend_user' || action === 'restore_user') {
      const userId = String(payload.userId ?? '');
      if (!userId || userId === caller.user.id) throw new Error('INVALID_REQUEST');
      const restoring = action === 'restore_user';
      const { data: targetRoles } = await service.from('user_roles').select('role').eq('user_id', userId).eq('is_active', true);
      if ((targetRoles ?? []).some((row) => row.role === 'moos') && !caller.roles.has('moos')) throw new Error('FORBIDDEN');

      const { error: authError } = await service.auth.admin.updateUserById(userId, {
        ban_duration: restoring ? 'none' : '876000h'
      });
      if (authError) throw authError;
      await service.from('profiles').update({
        account_status: restoring ? 'active' : 'suspended',
        sessions_revoked_after: restoring ? null : new Date().toISOString()
      }).eq('user_id', userId);
      return json(200, { ok: true }, origin);
    }

    if (action === 'send_password_reset') {
      const email = String(payload.email ?? '').trim().toLowerCase();
      if (!email) throw new Error('INVALID_REQUEST');
      const { error } = await service.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/?set_password=1` });
      if (error) throw error;
      return json(200, { ok: true }, origin);
    }

    return json(400, { error: 'Unknown action.' }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.';
    if (message === 'UNAUTHENTICATED') return json(401, { error: 'Please sign in.' }, origin);
    if (message === 'FORBIDDEN') return json(403, { error: 'You do not have permission for this action.' }, origin);
    if (message === 'INVALID_REQUEST') return json(400, { error: 'The request is missing required information.' }, origin);
    console.error(error);
    return json(500, { error: 'The account action could not be completed.' }, origin);
  }
});
