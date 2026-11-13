/**
 * What a staff account may do in the admin. Admins have every area; a STAFF
 * account has the areas ticked on it; customers have none. Mirrored for the
 * admin UI in web/src/lib/permissions.ts — keep the two in step.
 */
import type { NextFunction, Request, Response } from 'express';

export const PERMISSIONS = [
  { key: 'orders', label: 'Orders', description: 'See and work orders: proofs, files, adjustments, refunds, order emails.' },
  { key: 'fulfillment', label: 'Fulfillment', description: 'Packages, shipments, buying and refunding labels.' },
  { key: 'products', label: 'Catalog', description: 'Products, categories, shared stock, media library, print costs.' },
  { key: 'customers', label: 'Customers', description: 'See customer accounts, their orders and addresses.' },
  { key: 'email', label: 'Email', description: 'The inbox, campaigns, templates and subscribers.' },
  { key: 'marketing', label: 'Marketing', description: 'Discount codes, the site-wide sale, reviews and SEO.' },
  { key: 'partners', label: 'Partners', description: 'Partner accounts, projects and API keys.' },
  { key: 'settings', label: 'Settings', description: 'Store, payments, shipping, EasyPost, email setup, security and backups.' },
  { key: 'pod', label: 'Distribution', description: 'Publisher listings, catalog cycles, retailers, production runs, purchase orders and payouts.' },
  { key: 'preflight', label: 'Preflight', description: 'Production files for Distribution runs only — no prices, quantities or customer money.' },
  { key: 'users', label: 'Users & access', description: 'Create and edit accounts, roles, permissions and passwords. Admins only.' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];
/** Areas a STAFF account may be granted; `users` is held by admins alone. */
export const STAFF_GRANTABLE = PERMISSION_KEYS.filter((k) => k !== 'users');

export interface Grantee { role: 'CUSTOMER' | 'STAFF' | 'ADMIN'; permissions?: string[] | null }

export function hasPermission(who: Grantee | null | undefined, key: PermissionKey): boolean {
  if (!who) return false;
  if (who.role === 'ADMIN') return true;
  if (who.role === 'STAFF') return key !== 'users' && (who.permissions ?? []).includes(key);
  return false;
}

/** The admin areas an account can use, as sent to the admin UI. */
export function effectivePermissions(who: Grantee): PermissionKey[] {
  if (who.role === 'ADMIN') return [...PERMISSION_KEYS];
  if (who.role === 'STAFF') return STAFF_GRANTABLE.filter((k) => (who.permissions ?? []).includes(k));
  return [];
}

/** Express guard for an admin area. Sits after requireAdmin. */
export function requirePermission(key: PermissionKey) {
  const label = PERMISSIONS.find((p) => p.key === key)?.label ?? key;
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
    if (!hasPermission(req.session, key)) {
      return res.status(403).json({ error: `Your account does not have access to ${label}. Ask an admin to grant it under Users & access.`, permission: key });
    }
    next();
  };
}
