/**
 * The URL that saves a stored file to disk with its original name.
 *
 * A plain <a download> is not enough: our /api/files links redirect to R2,
 * the download attribute is ignored across that redirect, and the object is
 * marked inline — so "download" opened PDFs in the browser's viewer instead.
 * ?download=1 makes the server sign an attachment disposition. The bytes
 * are the untouched original.
 */
export function downloadHref(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/files/')) return url + (url.includes('?') ? '&' : '?') + 'download=1';
  if (url.startsWith('/uploads/')) return url; // same-origin: the download attribute works as-is
  if (/^https?:\/\//i.test(url)) {
    // A public-bucket URL: route the download through the API so it can be
    // signed as an attachment. The object key is the path.
    try { return `/api/files/${new URL(url).pathname.replace(/^\/+/, '')}?download=1`; } catch { return url; }
  }
  return url;
}
