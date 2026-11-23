/**
 * Auth Service - Login, Session Check, Logout
 */
import * as SecureStore from 'expo-secure-store';
import api from './api';
import { API_ENDPOINTS, SECURE_STORE_KEYS } from '../constants/api';
import type { ApiResponse, LoginResponse, SessionResponse, AuthUser } from '../types';

/** Baca user tersimpan tanpa lewat service (dipakai saat offline). */
async function getStoredUserSafe(): Promise<AuthUser | null> {
  try {
    const data = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USER_DATA);
    if (data) return JSON.parse(data) as AuthUser;
    return null;
  } catch {
    return null;
  }
}

export const authService = {
  /**
   * Login with email and password.
   * Captures the Set-Cookie header and stores it securely.
   */
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    try {
      const response = await api.post<ApiResponse<LoginResponse & { sessionToken?: string; cookieName?: string }>>(
        API_ENDPOINTS.AUTH_LOGIN,
        { email, password }
      );

      if (response.data.success && response.data.data?.user) {
        // Store user data
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.USER_DATA,
          JSON.stringify(response.data.data.user)
        );

        // Simpan session token dari response body jika tersedia
        if (response.data.data.sessionToken) {
          const cookieName = response.data.data.cookieName || 'authjs.session-token';
          const cookieString = `${cookieName}=${response.data.data.sessionToken}`;
          await SecureStore.setItemAsync(
            SECURE_STORE_KEYS.AUTH_COOKIE,
            cookieString
          );
        }
      }

      return response.data as any;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data as ApiResponse<LoginResponse>;
      }
      return {
        success: false,
        error: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
      };
    }
  },

  /**
   * Check current session validity by calling GET /api/auth/session-check.
   * (Path lama /api/auth/session TIDAK BOLEH dipakai: itu endpoint session
   * bawaan NextAuth di backend, dan route kustom di sana membayangi
   * useSession() di web — lihat pkg-g.)
   *
   * QA fix M-36: sebelumnya SEMUA kegagalan (termasuk tidak ada jaringan)
   * mengembalikan null, sehingga membuka aplikasi offline menendang user
   * ke Login walau sesi tersimpan masih valid. Sekarang dibedakan:
   * - ada respons server (mis. 401) -> sesi memang tidak valid -> null.
   * - tidak ada respons (offline / timeout) -> kembalikan user tersimpan,
   *   supaya aplikasi tetap bisa dibuka dalam mode offline.
   */
  async checkSession(): Promise<AuthUser | null> {
    try {
      const cookie = await SecureStore.getItemAsync(SECURE_STORE_KEYS.AUTH_COOKIE);
      if (!cookie) return null;

      const response = await api.get<ApiResponse<SessionResponse>>(
        API_ENDPOINTS.AUTH_SESSION
      );

      if (response.data.success && response.data.data?.isAuthenticated) {
        return response.data.data.user;
      }

      return null;
    } catch (error: any) {
      if (error?.response) return null; // server menjawab: sesi tidak valid
      console.warn('[AUTH] checkSession gagal tanpa respons (offline?), pakai sesi tersimpan.');
      return getStoredUserSafe();
    }
  },

  /**
   * Get stored user data from SecureStore (offline-first).
   */
  async getStoredUser(): Promise<AuthUser | null> {
    try {
      const data = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USER_DATA);
      if (data) return JSON.parse(data) as AuthUser;
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Logout - clear all stored session data.
   */
  async logout(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.AUTH_COOKIE);
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.USER_DATA);
    } catch (error) {
      console.warn('[AUTH] Error clearing session:', error);
    }
  },
};
