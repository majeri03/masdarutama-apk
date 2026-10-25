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

const normalizeUser = (user: AuthUser | null): AuthUser | null => {
  if (!user) return null;
  return {
    ...user,
    role: (user.role || 'KASIR').toUpperCase() as Role,
  };
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
      const normalized = normalizeUser(result.data.user);
      set({
        user: normalized,
        isAuthenticated: true,
        isLoading: false,
      });
      // Fetch allowed pages immediately after login
      await get().fetchAllowedPages();
      // Sync push token ke server setelah autentikasi sukses
      import('../hooks/usePushNotifications')
        .then(({ syncPushTokenToServer }) => syncPushTokenToServer())
        .catch(() => {});
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
      const normalized = normalizeUser(storedUser);
      set({ user: normalized, isAuthenticated: true });
      // Fetch allowed pages in background
      get().fetchAllowedPages().catch(err => console.error("Error loading pages", err));
    }

    // Then verify with server
    const serverUser = await authService.checkSession();
    if (serverUser) {
      const normalized = normalizeUser(serverUser);
      set({ user: normalized, isAuthenticated: true, isLoading: false });
      await get().fetchAllowedPages();
      // Sync push token ke server setelah session diverifikasi
      import('../hooks/usePushNotifications')
        .then(({ syncPushTokenToServer }) => syncPushTokenToServer())
        .catch(() => {});
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
    const normalized = normalizeUser(user);
    set({ user: normalized, isAuthenticated: !!normalized });
    if (normalized) {
      get().fetchAllowedPages().catch(err => console.error(err));
    } else {
      set({ allowedPages: [] });
    }
  },

  fetchAllowedPages: async () => {
    // SUPER_ADMIN always gets full access — no API call needed
    const currentUser = get().user;
    const userRole = (currentUser?.role || '').toUpperCase();
    if (userRole === 'SUPER_ADMIN') {
      set({
        allowedPages: [
          'pos', 'products', 'reports_settings', 'stock_opname', 'po',
          'invoice_layout', 'delivery', 'purchase', 'debt', 'customers',
          'fleet_tracking', 'users_management', 'system_settings',
        ],
      });
      return;
    }

    try {
      const res = await api.get('/api/page-access');
      if (res.data?.success && res.data?.data?.allowedPages) {
        set({ allowedPages: res.data.data.allowedPages });
      } else if (res.data?.success && res.data?.allowedPages) {
        set({ allowedPages: res.data.allowedPages });
      }
    } catch (error) {
      console.warn('Gagal memuat dynamic allowed pages:', error);
      // Fallback: If ADMIN, give basic access
      if (userRole === 'ADMIN') {
        set({
          allowedPages: ['pos', 'products', 'reports_settings', 'stock_opname', 'delivery', 'purchase', 'debt', 'customers'],
        });
      }
    }
  },

  isKasir: () => (get().user?.role || '').toUpperCase() === 'KASIR',
  isAdmin: () => {
    const role = (get().user?.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  },
  isSuperAdmin: () => (get().user?.role || '').toUpperCase() === 'SUPER_ADMIN',
  hasMinRole: (role: Role) => {
    const userRole = (get().user?.role || '').toUpperCase() as Role;
    if (!userRole) return false;
    return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[role] || 0);
  },
}));
