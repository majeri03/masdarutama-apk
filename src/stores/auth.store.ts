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
    // code: kode mesin backend kalau login gagal — "unverified" berarti
  // password benar tapi akun belum terverifikasi (24 Nov 2026, APK OTP);
  // LoginScreen memakai ini untuk menampilkan tombol verifikasi OTP.
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; code?: string }>;
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
    return { success: false, error: result.error || 'Login gagal', code: result.code };
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
    try {
      const { unregisterPushTokenFromServer } = await import('../hooks/usePushNotifications');
      await unregisterPushTokenFromServer();
    } catch {}
    // Cabut sesi di server (best-effort): endpoint POST /api/auth/logout
    // BELUM ADA di backend (Nov 2026) — request ini akan 404 dan diabaikan.
    // Setelah backend menerapkannya (kontrak: menaikkan tokenVersion user
    // sehingga token mobile lama tidak berlaku lagi), pemanggilan ini yang
    // membuat logout benar-benar mencabut token, bukan sekadar hapus lokal.
    try {
      await api.post('/api/auth/logout');
    } catch {}
    await authService.logout();
    // Reset baseline polling supaya setelah login ulang tidak muncul
    // notifikasi "Pesanan Baru" palsu untuk penjualan lama.
    try {
      const { useNotificationStore } = await import('../stores/notification.store');
      useNotificationStore.getState().resetBaselines();
    } catch {}
    // FIX (Nov 2026): bersihkan pusat notifikasi saat logout — sebelumnya
    // notifikasi pemilik sebelumnya tetap tampil untuk pengguna berikutnya
    // di HP yang sama.
    try {
      const { useNotificationCenterStore } = await import('../stores/notificationCenter.store');
      // WS-2: clearAll sekarang async + melempar kalau hapus server gagal —
      // harus di-await/ditangkap supaya tidak jadi unhandled rejection.
      await useNotificationCenterStore.getState().clearAll().catch(() => {});
    } catch {}
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
      } else if (userRole === 'ADMIN') {
        // Respons tidak membawa daftar halaman — fallback seperti di catch.
        // WS-1 (25 Nov 2026): 'fleet_tracking' ikut di fallback supaya
        // allowedPages tetap benar untuk ADMIN/KASIR. Drawer sendiri kini
        // memakai minRole untuk menu ini, jadi ini hanya pengaman.
        set({
          allowedPages: ['pos', 'products', 'reports_settings', 'stock_opname', 'delivery', 'purchase', 'debt', 'customers', 'fleet_tracking'],
        });
      } else if (userRole === 'KASIR') {
        set({
          allowedPages: ['pos', 'products', 'stock_opname', 'delivery', 'debt', 'customers', 'fleet_tracking'],
        });
      }
    } catch (error) {
      console.warn('Gagal memuat dynamic allowed pages:', error);
      // QA fix M-37: sebelumnya hanya ADMIN yang punya fallback — kalau
      // /api/page-access gagal, KASIR mendapat allowedPages kosong dan
      // dashboard-nya kosong total. Beri menu default sesuai role,
      // sama seperti ADMIN (tanpa users_management / system_settings).
      if (userRole === 'ADMIN') {
        set({
          allowedPages: ['pos', 'products', 'reports_settings', 'stock_opname', 'delivery', 'purchase', 'debt', 'customers', 'fleet_tracking'],
        });
      } else if (userRole === 'KASIR') {
        set({
          allowedPages: ['pos', 'products', 'stock_opname', 'delivery', 'debt', 'customers', 'fleet_tracking'],
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
