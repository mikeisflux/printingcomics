import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const publicRoot = join(process.cwd(), 'dist');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const browserRuntimeConfig = Object.freeze({
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  VITE_USE_SUPABASE_BACKEND: process.env.VITE_USE_SUPABASE_BACKEND || 'false',
  VITE_ENABLE_PAYMENTS: process.env.VITE_ENABLE_PAYMENTS || 'false'
});

const runtimeConfigScript = `<script>window.__PHILBO_RUNTIME_CONFIG__=${JSON.stringify(browserRuntimeConfig).replace(/</g, '\\u003c')}</script>`;

createServer((request, response) => {
  const hostname = String(request.headers.host || '').split(':')[0].toLowerCase();
  const holdingPageHosts = new Set(['philbopod.com', 'www.philbopod.com']);
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const relativePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const holdingPageAsset = relativePath.startsWith('assets/');
  const holdingPageRequest = holdingPageHosts.has(hostname) && !holdingPageAsset;
  let filePath = join(publicRoot, holdingPageRequest ? 'under-construction.html' : (relativePath || 'index.html'));

  if (!filePath.startsWith(publicRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(publicRoot, 'index.html');
  }

  response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (holdingPageRequest) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }

  if (!holdingPageRequest && filePath === join(publicRoot, 'index.html')) {
    const html = readFileSync(filePath, 'utf8').replace('</head>', `${runtimeConfigScript}</head>`);
    response.end(html);
    return;
  }

  createReadStream(filePath)
    .on('error', () => {
      response.statusCode = 500;
      response.end('The portal could not be loaded.');
    })
    .pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Philbo portal listening on port ${port}`);
});
