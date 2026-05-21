import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Fetched once per page session — the discount rarely changes and every
// configurator view would otherwise re-request it.
let cachedBps: number | null = null;

/**
 * Active site-wide discount in basis points (0 = none). Applied on top of
 * each product's qty-tier discount by computePricing — pass the return value
 * as `siteDiscountBps` in the pricing inputs.
 */
export function useSiteDiscount(): number {
  const [bps, setBps] = useState<number>(cachedBps ?? 0);
  useEffect(() => {
    if (cachedBps !== null) {
      setBps(cachedBps);
      return;
    }
    api
      .get<{ discountBps: number }>('/config/site-discount')
      .then((r) => {
        cachedBps = Number(r.discountBps) || 0;
        setBps(cachedBps);
      })
      .catch(() => {
        cachedBps = 0;
      });
  }, []);
  return bps;
}
