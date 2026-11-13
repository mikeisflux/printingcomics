/**
 * Staff "view as": an admin, or staff holding the Distribution area, opens the
 * publisher or retailer portal as a chosen publisher / shop. The pick lives in
 * localStorage and rides along on every API call as a header; the server only
 * honors it for staff. Changing the pick notifies the open portal.
 */
export type ViewAsKind = 'partner' | 'retailer';

const KEY = (kind: ViewAsKind) => `pod.viewAs.${kind}`;
const EVENT = 'pod:view-as';

export function getViewAs(kind: ViewAsKind): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(KEY(kind));
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; name?: string };
    return v.id ? { id: v.id, name: v.name ?? '' } : null;
  } catch { return null; }
}

export function setViewAs(kind: ViewAsKind, pick: { id: string; name: string } | null): void {
  try {
    if (pick) localStorage.setItem(KEY(kind), JSON.stringify(pick));
    else localStorage.removeItem(KEY(kind));
  } catch { /* private window: the pick lasts for this page only */ }
  window.dispatchEvent(new Event(EVENT));
}

export function onViewAsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Headers for the API client. Harmless for everyone who is not staff. */
export function viewAsHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const p = getViewAs('partner'); if (p) h['X-View-As-Partner'] = p.id;
  const r = getViewAs('retailer'); if (r) h['X-View-As-Retailer'] = r.id;
  return h;
}

/** Can this signed-in user step into the portals? Mirrors `isPodStaff` on the server. */
export function isPodStaff(user: { role: string; permissions?: string[] } | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || (user.role === 'STAFF' && (user.permissions ?? []).includes('pod'));
}

/** For plain links (downloads) that cannot carry a header: the pick as a query. */
export function withViewAs(url: string, kind: ViewAsKind): string {
  const v = getViewAs(kind);
  if (!v) return url;
  return `${url}${url.includes('?') ? '&' : '?'}viewAs=${encodeURIComponent(v.id)}`;
}
