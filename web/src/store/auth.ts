import { create } from 'zustand';
import { api } from '../api/client';

export interface CurrentUser {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  firstName?: string | null;
  lastName?: string | null;
  /** False for accounts created at checkout until the customer chooses a password. */
  hasPassword?: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<'ok' | 'claim'>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  loaded: false,
  load: async () => {
    set({ loading: true });
    try {
      const { user } = await api.get<{ user: CurrentUser }>('/auth/me');
      set({ user, loading: false, loaded: true });
    } catch {
      set({ user: null, loading: false, loaded: true });
    }
  },
  login: async (email, password) => {
    const { user } = await api.post<{ user: CurrentUser }>('/auth/login', { email, password });
    set({ user });
  },
  register: async (email, password, firstName, lastName) => {
    const r = await api.post<{ user?: CurrentUser; claim?: boolean }>('/auth/register', {
      email, password, firstName, lastName,
    });
    // An account already exists for that email (every order creates one): the
    // server emailed it a set-password link instead of signing anyone in.
    if (r.claim) return 'claim';
    set({ user: r.user ?? null });
    return 'ok';
  },
  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },
}));
