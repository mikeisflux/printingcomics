import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? 'pc_session',
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  },
};

export const isProd = config.env === 'production';

/**
 * Largest single file accepted on any upload: customer artwork, proofs, the
 * media library, email attachments and the partner API. nginx must allow at
 * least this much per request (client_max_body_size in deploy/nginx.conf) or
 * it rejects the upload before the API ever sees it.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '5 GB';
