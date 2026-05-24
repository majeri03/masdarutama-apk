/**
 * Axios Instance with automatic cookie injection from SecureStore.
 * Handles auth cookies for NextAuth v5 session management.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, SECURE_STORE_KEYS } from '../constants/api';
import type { ApiResponse } from '../types';
// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  // Important: allow cookies to be sent cross-origin
  withCredentials: true,
});

// ==================== REQUEST INTERCEPTOR ====================
// Inject stored session cookie into every request
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const cookie = await SecureStore.getItemAsync(SECURE_STORE_KEYS.AUTH_COOKIE);
      if (cookie) {
        // Inject cookie sebagai header
        config.headers.set('Cookie', cookie);

        // Ekstrak session token dan sisipkan sebagai Bearer token di Authorization header
        const match = cookie.match(/(?:__Secure-)?authjs\.session-token=([^;]+)/);
        if (match && match[1]) {
          config.headers.set('Authorization', `Bearer ${match[1]}`);
        } else if (!cookie.includes('=')) {
          // Jika isinya raw token tanpa format key=value
          config.headers.set('Authorization', `Bearer ${cookie}`);
          config.headers.set('Cookie', `authjs.session-token=${cookie}`);
        }
      }
    } catch (error) {
      console.warn('[API] Failed to read cookie from SecureStore:', error);
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ==================== RESPONSE INTERCEPTOR ====================
// Capture Set-Cookie header from responses and store them
api.interceptors.response.use(
  async (response) => {
    try {
      // Extract Set-Cookie from response headers
      const setCookie = response.headers['set-cookie'] as string | string[] | undefined;
      if (setCookie) {
        // Ambil semua cookies dan gabungkan (termasuk authjs.session-token)
        let cookieString = '';
        if (Array.isArray(setCookie)) {
          // Filter dan ambil setiap cookie (hanya nilai sebelum ';')
          cookieString = setCookie
            .map((c) => c.split(';')[0])
            .join('; ');
        } else {
          cookieString = setCookie.split(';')[0];
        }

        if (cookieString) {
          await SecureStore.setItemAsync(
            SECURE_STORE_KEYS.AUTH_COOKIE,
            cookieString
          );
          console.log('[API] Session cookie updated.');
        }
      }
    } catch (error) {
      console.warn('[API] Failed to store cookie:', error);
    }
    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    // Handle 401 - session expired — hapus cookie dan paksa re-login
    if (error.response?.status === 401) {
      console.warn('[API] 401 Unauthorized — clearing session cookie.');
      try {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.AUTH_COOKIE);
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.USER_DATA);
      } catch (e) {
        console.warn('[API] Failed to clear stored session:', e);
      }
    }

    // Handle HTML/String error response (Gagal JSON fix)
    const responseData = error.response?.data;
    if (responseData && typeof responseData === 'string') {
      const isHtml = (responseData as string).includes('<html') || (responseData as string).includes('<!DOCTYPE html>');
      if (error.response) {
        error.response.data = {
          success: false,
          error: isHtml ? 'Terjadi kesalahan server (500).' : responseData,
        } as ApiResponse;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
