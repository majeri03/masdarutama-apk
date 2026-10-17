/**
 * Auth Store - Zustand global state for authentication
 */
import { create } from 'zustand';
import { authService } from '../services/auth.service';
import api from '../services/api';
import type { AuthUser, Role } from '../types';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  allowedPages: string[];

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  checkSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  fetchAllowedPages: () => Promise<void>;

  // Role helpers
  isKasir: () => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  hasMinRole: (role: Role) => boolean;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  KASIR: 1,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  allowedPages: [],

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    const result = await authService.login(email, password);

    if (result.success && result.data?.user) {
      set({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
      // Fetch allowed pages immediately after login
      await get().fetchAllowedPages();
      return { success: true };
    }

    set({ isLoading: false });
    return { success: false, error: result.error || 'Login gagal' };
  },

  checkSession: async () => {
    set({ isLoading: true });

    // First try stored user for instant feedback
    const storedUser = await authService.getStoredUser();
    if (storedUser) {
      set({ user: storedUser, isAuthenticated: true });
      // Fetch allowed pages in background
      get().fetchAllowedPages().catch(err => console.error("Error loading pages", err));
    }

    // Then verify with server
    const serverUser = await authService.checkSession();
    if (serverUser) {
      set({ user: serverUser, isAuthenticated: true, isLoading: false });
      await get().fetchAllowedPages();
      return true;
    }

    // Session invalid
    set({ user: null, isAuthenticated: false, isLoading: false, allowedPages: [] });
    return false;
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false, isLoading: false, allowedPages: [] });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    if (user) {
      get().fetchAllowedPages().catch(err => console.error(err));
    } else {
      set({ allowedPages: [] });
    }
  },

  fetchAllowedPages: async () => {
    try {
      const res = await api.get('/api/page-access');
      if (res.data?.success && res.data?.data?.allowedPages) {
        set({ allowedPages: res.data.data.allowedPages });
      } else if (res.data?.success && res.data?.allowedPages) {
        set({ allowedPages: res.data.allowedPages });
      }
    } catch (error) {
      console.warn('Gagal memuat dynamic allowed pages:', error);
    }
  },

  isKasir: () => get().user?.role === 'KASIR',
  isAdmin: () => {
    const role = get().user?.role;
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  },
  isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
  hasMinRole: (role: Role) => {
    const userRole = get().user?.role;
    if (!userRole) return false;
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[role];
  },
}));
