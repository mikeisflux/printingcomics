/**
 * The admin areas an account can be granted. Mirrors
 * server/src/lib/permissions.ts — keep the two in step.
 */
export const PERMISSIONS = [
  { key: 'orders', label: 'Orders', description: 'See and work orders: proofs, files, adjustments, refunds, order emails.' },
  { key: 'fulfillment', label: 'Fulfillment', description: 'Packages, shipments, buying and refunding labels.' },
  { key: 'products', label: 'Catalog', description: 'Products, categories, shared stock, media library, print costs.' },
  { key: 'customers', label: 'Customers', description: 'See customer accounts, their orders and addresses.' },
  { key: 'email', label: 'Email', description: 'The inbox, campaigns, templates and subscribers.' },
  { key: 'marketing', label: 'Marketing', description: 'Discount codes, the site-wide sale, reviews and SEO.' },
  { key: 'partners', label: 'Partners', description: 'Partner accounts, projects and API keys.' },
  { key: 'settings', label: 'Settings', description: 'Store, payments, shipping, EasyPost, email setup, security and backups.' },
  { key: 'pod', label: 'Print on Demand', description: 'Publisher listings, catalog cycles, retailers, production runs, purchase orders and payouts.' },
  { key: 'preflight', label: 'Preflight', description: 'Production files for Print on Demand runs only — no prices, quantities or customer money.' },
  { key: 'users', label: 'Users & access', description: 'Create and edit accounts, roles, permissions and passwords. Admins only.' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const STAFF_GRANTABLE: PermissionKey[] = PERMISSIONS.map((p) => p.key).filter((k) => k !== 'users');

export function can(user: { role: string; permissions?: string[] } | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'STAFF') return key !== 'users' && (user.permissions ?? []).includes(key);
  return false;
}

/** Which permission an admin path needs (null: any staff). */
export function permissionForPath(path: string): PermissionKey | null {
  const p = path.replace(/^\/admin\/?/, '');
  if (p === '' ) return null;
  if (p.startsWith('orders')) return 'orders';
  if (p.startsWith('fulfillment')) return 'fulfillment';
  if (p.startsWith('products') || p.startsWith('categories') || p.startsWith('media')) return 'products';
  if (p.startsWith('customers')) return 'customers';
  if (p.startsWith('users')) return 'users';
  if (p.startsWith('email')) return 'email';
  if (p.startsWith('coupons') || p.startsWith('sitediscounts') || p.startsWith('reviews') || p.startsWith('seo')) return 'marketing';
  if (p.startsWith('partners') || p.startsWith('api-keys')) return 'partners';
  if (p.startsWith('settings') || p.startsWith('security')) return 'settings';
  if (p.startsWith('pod/preflight')) return 'preflight';
  if (p.startsWith('pod')) return 'pod';
  return null;
}

/** The areas that make up the rest of the admin (everything but Print on Demand). */
export const GENERAL_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key).filter((k) => k !== 'pod' && k !== 'preflight');

/** A staff account whose only areas are Print on Demand and/or Preflight: it lives in /admin/pod and sees nothing else. */
export function podOnly(user: { role: string; permissions?: string[] } | null | undefined): boolean {
  if (!user || user.role !== 'STAFF') return false;
  const p = user.permissions ?? [];
  return p.length > 0 && p.every((k) => k === 'pod' || k === 'preflight');
}

/** May this account open this admin path? Preflight is also open to Print on Demand holders. */
export function canPath(user: { role: string; permissions?: string[] } | null | undefined, path: string): boolean {
  const needed = permissionForPath(path);
  if (!needed) {
    // The store dashboard is for general staff; a POD-only account is sent into its section.
    return !podOnly(user);
  }
  if (needed === 'preflight') return can(user, 'preflight') || can(user, 'pod');
  return can(user, needed);
}
