import { create } from 'zustand';
import { api } from '../api/client';

export interface CurrentUser {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  firstName?: string | null;
  lastName?: string | null;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
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
    const { user } = await api.post<{ user: CurrentUser }>('/auth/register', {
      email, password, firstName, lastName,
    });
    set({ user });
  },
  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },
}));
