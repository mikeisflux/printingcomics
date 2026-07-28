/**
 * Cloudflare R2 object storage (S3-compatible).
 *
 * Requests are signed with AWS SigV4 using node:crypto — no SDK dependency,
 * so nothing new to install on the server. Credentials come from
 * Admin → Settings → Storage (see getR2Config in settings.ts).
 *
 * Objects are keyed by MediaFile.filename, so a media row needs no new column:
 * an absolute `url` means the object lives in R2, a `/uploads/...` url means
 * it's still on local disk. That lets old and new files coexist with no
 * migration.
 */
import { createHash, createHmac } from 'node:crypto';
import { getR2Config } from './settings.js';

const SERVICE = 's3';
const REGION = 'auto'; // R2 ignores region but SigV4 requires one

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** RFC 3986 encoding; S3 requires each path segment encoded but "/" kept. */
function uriEncode(str: string, encodeSlash = true): string {
  return str
    .split('')
    .map((c) => {
      if (/[A-Za-z0-9_\-~.]/.test(c)) return c;
      if (c === '/') return encodeSlash ? '%2F' : '/';
      return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    })
    .join('');
}

function amzDate(d: Date) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, short: iso.slice(0, 8) };
}

function signingKey(secret: string, short: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, short), REGION), SERVICE), 'aws4_request');
}

export interface R2Ready {
  configured: true;
  endpoint: string;   // https://<account>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string; // may be '' when the bucket isn't public
}

/**
 * Resolved config, or null when R2 isn't set up (callers fall back to disk).
 *
 * `ignoreEnabled` lets the admin "Test connection" button verify credentials
 * BEFORE flipping the switch — you shouldn't have to enable a storage backend
 * you haven't proven works yet.
 */
export async function r2Config(opts: { ignoreEnabled?: boolean } = {}): Promise<R2Ready | null> {
  const c = await getR2Config();
  if (!c.enabled && !opts.ignoreEnabled) return null;
  if (!c.accountId || !c.accessKeyId || !c.secretAccessKey || !c.bucket) return null;
  const endpoint = (c.endpoint || `https://${c.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, '');
  return {
    configured: true,
    endpoint,
    bucket: c.bucket,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    publicBaseUrl: (c.publicBaseUrl || '').replace(/\/$/, ''),
  };
}

export async function isR2Enabled(): Promise<boolean> {
  return (await r2Config()) !== null;
}

/**
 * Signed request against the bucket. `key` is the object key (no leading /).
 *
 * `body` may be a Buffer or a Node stream. Streams are sent with
 * `UNSIGNED-PAYLOAD` (permitted for S3/R2 over HTTPS) so a multi-hundred-MB
 * print PDF never has to be read into memory just to hash it — buffering
 * those was enough to OOM the process.
 */
async function signedFetch(
  cfg: R2Ready,
  method: 'PUT' | 'DELETE' | 'GET' | 'HEAD',
  key: string,
  body?: Buffer | NodeJS.ReadableStream,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`);
  const { amz, short } = amzDate(new Date());
  const isStream = !!body && !Buffer.isBuffer(body);
  const payloadHash = isStream ? 'UNSIGNED-PAYLOAD' : sha256Hex((body as Buffer) ?? '');

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
    ...extraHeaders,
  };

  const sortedNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = sortedNames
    .map((h) => {
      const v = Object.entries(headers).find(([k]) => k.toLowerCase() === h)![1];
      return `${h}:${String(v).trim()}\n`;
    })
    .join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [
    method,
    `/${uriEncode(cfg.bucket, false)}/${uriEncode(key, false)}`,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${short}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, short), toSign).toString('hex');

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), {
    method,
    headers,
    body: body as any,
    // Required by undici when streaming a request body.
    ...(isStream ? { duplex: 'half' } : {}),
  } as RequestInit);
}

export interface PutObjectArgs {
  key: string;
  body: Buffer;
  contentType?: string;
  /** Original filename — preserved so downloads don't save as the random key. */
  downloadName?: string;
  cacheSeconds?: number;
}

/** Upload an object. Returns the object key on success; throws otherwise. */
export async function r2Put(args: PutObjectArgs): Promise<string> {
  const cfg = await r2Config();
  if (!cfg) throw new Error('R2 is not configured');
  return r2PutWith(cfg, args);
}

/**
 * Stream a file from disk straight into R2 — constant memory regardless of
 * file size, which matters for print-ready PDFs.
 */
export async function r2PutFile(args: Omit<PutObjectArgs, 'body'> & { localPath: string }): Promise<string> {
  const cfg = await r2Config();
  if (!cfg) throw new Error('R2 is not configured');
  const { createReadStream } = await import('node:fs');
  return r2PutWith(cfg, { ...args, body: createReadStream(args.localPath) });
}

/** Upload against an already-resolved config (used by the connection test). */
async function r2PutWith(cfg: R2Ready, args: Omit<PutObjectArgs, 'body'> & { body: Buffer | NodeJS.ReadableStream }): Promise<string> {
  // Deliberately NOT signing content-length: undici sets it itself, and a
  // value it recomputes would no longer match the signature.
  const extra: Record<string, string> = {
    'content-type': args.contentType || 'application/octet-stream',
    'cache-control': `public, max-age=${args.cacheSeconds ?? 31536000}`,
  };
  if (args.downloadName) {
    // Keep the customer's filename on download straight from the CDN edge.
    const fallback = args.downloadName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'");
    const encoded = encodeURIComponent(args.downloadName).replace(
      /['()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    extra['content-disposition'] = `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
  }

  const res = await signedFetch(cfg, 'PUT', args.key, args.body, extra);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return args.key;
}

/** Delete an object. Never throws — deletion is best-effort cleanup. */
export async function r2Delete(key: string): Promise<boolean> {
  try {
    const cfg = await r2Config();
    if (!cfg) return false;
    const res = await signedFetch(cfg, 'DELETE', key);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * A time-limited GET URL, for buckets without a public domain. Query-string
 * SigV4 so the browser can fetch it directly (no proxying through the API).
 */
export async function r2SignedUrl(key: string, expiresSeconds = 3600): Promise<string | null> {
  const cfg = await r2Config();
  if (!cfg) return null;
  const { amz, short } = amzDate(new Date());
  const scope = `${short}/${REGION}/${SERVICE}/aws4_request`;
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`);

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k]!)}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    `/${uriEncode(cfg.bucket, false)}/${uriEncode(key, false)}`,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, short), toSign).toString('hex');
  return `${url.toString()}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Public URL for an object when the bucket has a public/custom domain. */
export async function r2PublicUrl(key: string): Promise<string | null> {
  const cfg = await r2Config();
  if (!cfg || !cfg.publicBaseUrl) return null;
  return `${cfg.publicBaseUrl}/${key}`;
}

/**
 * Probe used by the admin "Test connection" button: a real write + delete
 * round-trip. Runs whether or not the enable toggle is on, so credentials can
 * be validated first.
 */
export async function r2Test(): Promise<{ ok: boolean; message: string }> {
  const c = await getR2Config();
  const missing = [
    !c.accountId && 'Account ID',
    !c.accessKeyId && 'Access key ID',
    !c.secretAccessKey && 'Secret access key',
    !c.bucket && 'Bucket name',
  ].filter(Boolean);
  if (missing.length) return { ok: false, message: `Missing: ${missing.join(', ')}.` };

  const cfg = await r2Config({ ignoreEnabled: true });
  if (!cfg) return { ok: false, message: 'R2 credentials are incomplete.' };

  const key = `_healthcheck/${Date.now()}.txt`;
  try {
    await r2PutWith(cfg, { key, body: Buffer.from('printingcomics r2 ok'), contentType: 'text/plain', cacheSeconds: 0 });
    await signedFetch(cfg, 'DELETE', key).catch(() => undefined);
    const note = c.enabled
      ? ''
      : ' Tick “Use R2 for new uploads” to start using it.';
    return {
      ok: true,
      message:
        (cfg.publicBaseUrl
          ? `Connected to bucket "${cfg.bucket}". Files will serve from ${cfg.publicBaseUrl}.`
          : `Connected to bucket "${cfg.bucket}". No public URL set — files will use time-limited signed links.`) + note,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'R2 test failed' };
  }
}
