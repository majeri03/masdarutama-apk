/**
 * Auth Store - Zustand global state for authentication
 */
import { create } from 'zustand';
import { authService } from '../services/auth.service';
import type { AuthUser, Role } from '../types';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  checkSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;

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

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    const result = await authService.login(email, password);

    if (result.success && result.data?.user) {
      set({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
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
    }

    // Then verify with server
    const serverUser = await authService.checkSession();
    if (serverUser) {
      set({ user: serverUser, isAuthenticated: true, isLoading: false });
      return true;
    }

    // Session invalid
    set({ user: null, isAuthenticated: false, isLoading: false });
    return false;
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
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
