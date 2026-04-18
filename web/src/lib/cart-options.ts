// Resolves a cart item's raw options map (internalKey → raw value) into
// human-readable `{ label, value }` pairs using the product's options metadata
// that the server includes on cart items.

interface OptionValueLite {
  label: string;
  subLabel?: string | null;
}

interface OptionLite {
  id: string;
  name: string;
  internalKey?: string | null;
  type: string;
  values: OptionValueLite[];
}

// Loose typing — cart and order items both flow through here and have
// slightly different product shapes. We only read `product.options` when
// it's present.
interface CartItemLite {
  product: { options?: OptionLite[] | null } & Record<string, unknown>;
  options?: Record<string, unknown> | null;
}

export interface FormattedOption {
  label: string;
  value: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function formatCartItemOptions(item: CartItemLite): FormattedOption[] {
  const raw = item.options;
  if (!raw || typeof raw !== 'object') return [];
  const options = item.product.options ?? [];

  // Build lookup from {internalKey|slug(name)} -> option.
  const byKey = new Map<string, OptionLite>();
  for (const o of options) {
    const key = o.internalKey || slug(o.name);
    byKey.set(key, o);
  }

  const out: FormattedOption[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    const opt = byKey.get(k);

    // Hide CONFIRM checkmarks and UPLOAD URLs from the summary (they're
    // implementation details; show uploads separately).
    if (opt?.type === 'CONFIRM') continue;

    const label = opt?.name ?? k;
    let value: string;
    if (opt?.type === 'TOGGLE') {
      value = v ? 'Yes' : 'No';
    } else if (opt?.type === 'UPLOAD' && typeof v === 'string') {
      const short = v.split('/').pop() ?? v;
      value = `📎 ${short}`;
    } else if (typeof v === 'boolean') {
      value = v ? 'Yes' : 'No';
    } else {
      value = String(v);
      const match = opt?.values.find((x) => x.label === value);
      if (match?.subLabel) value = `${value} (${match.subLabel})`;
    }
    out.push({ label, value });
  }
  return out;
}
