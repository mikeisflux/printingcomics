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
  update: (itemId: string, quantity: number) => Promise<void>;
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
  update: async (itemId, quantity) => {
    const { cart } = await api.patch<{ cart: Cart }>(`/cart/items/${itemId}`, { quantity });
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
