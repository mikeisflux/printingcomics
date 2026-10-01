import { create } from 'zustand';
import { api } from '../api/client';

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPriceCents: number;
  options?: Record<string, string> | null;
  product: {
    id: string;
    slug: string;
    name: string;
    images: { url: string }[];
    backorder?: boolean;
    backorderEta?: string | null;
    /** The configurator's options, when the product has any — editable from the cart. */
    options?: { id: string; name: string; internalKey?: string | null; type: string; values: { label: string; subLabel?: string | null }[] }[];
    categories?: { category: { slug: string } }[];
  };
  variant?: { id: string; label: string } | null;
}

export interface Cart {
  id: string;
  items: CartItem[];
}

interface CartState {
  cart: Cart | null;
  loading: boolean;
  load: () => Promise<void>;
  add: (input: {
    productId: string;
    variantId?: string;
    quantity: number;
    options?: Record<string, string>;
  }) => Promise<void>;
  /**
   * Change the quantity, or (for a configured book) the whole set of
   * selections — and, when the trim size changed while editing, the product.
   */
  update: (itemId: string, quantity: number, options?: Record<string, string>, productId?: string) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  subtotal: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  cart: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const { cart } = await api.get<{ cart: Cart }>('/cart');
      set({ cart });
    } finally {
      set({ loading: false });
    }
  },
  add: async (input) => {
    const { cart } = await api.post<{ cart: Cart }>('/cart/items', input);
    set({ cart });
  },
  update: async (itemId, quantity, options, productId) => {
    const body: Record<string, unknown> = { quantity };
    if (options) body.options = options;
    if (productId) body.productId = productId;
    const { cart } = await api.patch<{ cart: Cart }>(`/cart/items/${itemId}`, body);
    set({ cart });
  },
  remove: async (itemId) => {
    const { cart } = await api.del<{ cart: Cart }>(`/cart/items/${itemId}`);
    set({ cart });
  },
  subtotal: () => {
    const items = get().cart?.items ?? [];
    return items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  },
}));
