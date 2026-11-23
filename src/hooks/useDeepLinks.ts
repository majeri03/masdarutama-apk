/**
 * useDeepLinks — Tangani tautan aplikasi tbmasdarutama://...
 *
 * Dipakai untuk tombol "Buka di Aplikasi" di email ringkasan utang
 * (PKG-H): tbmasdarutama://utang?jenis=customer|supplier membuka layar
 * Utang di tab yang sesuai.
 *
 * Cara kerja:
 * - Skema didaftarkan lewat "scheme" di app.json — Android memasang
 *   intent-filter saat EAS build (BUKAN lewat OTA update). Tanpa build
 *   baru, tautan skema tidak membuka aplikasi.
 * - Cold start (aplikasi tertutup saat tautan diketuk): Linking.getInitialURL().
 * - Warm start (aplikasi sudah terbuka): listener event 'url'.
 * - Tautan yang masuk disimpan dulu (pending) dan baru dijalankan setelah
 *   sesi login selesai dicek dan user sudah login — jadi kalau aplikasi
 *   dibuka dari tautan dalam keadaan logout, layar Utang tetap terbuka
 *   setelah login selesai. Meniru pola retry di usePushNotifications.
 *
 * TIDAK butuh dependensi baru: pakai Linking bawaan 'react-native'
 * (expo-linking tidak dipasang) + navigateToScreen yang sudah ada.
 */
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { navigationRef } from '../utils/navigation';
import { navigateToScreen } from './usePushNotifications';

export const APP_DEEP_LINK_SCHEME = 'tbmasdarutama';

type PendingDeepLink = {
  screen: string;
  params?: Record<string, unknown>;
};

const MAX_ATTEMPTS = 60; // 60 x 300ms = 18 detik (cukup untuk cold start + cek sesi)

/**
 * Parse tbmasdarutama://utang?jenis=supplier&search=Nama
 * -> { screen: 'Debt', params: { tab: 'supplier', search: 'Nama' } }
 * Path lain mengembalikan null (diabaikan).
 */
function parseDeepLink(url: string): PendingDeepLink | null {
  try {
    const withoutScheme = url.replace(/^tbmasdarutama:\/\//i, '');
    const [rawPath, rawQuery] = withoutScheme.split('?');
    const path = (rawPath || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    const query: Record<string, string> = {};
    if (rawQuery) {
      for (const pair of rawQuery.split('&')) {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
    }
    if (path === 'utang' || path === 'debt') {
      const jenis = query.jenis === 'supplier' || query.jenis === 'customer' ? query.jenis : 'customer';
      const params: Record<string, unknown> = { tab: jenis };
      if (query.search) params.search = query.search;
      return { screen: 'Debt', params };
    }
    return null;
  } catch {
    return null;
  }
}

export function useDeepLinks() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const pendingRef = useRef<PendingDeepLink | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryConsume = (attempt = 0): void => {
    const pending = pendingRef.current;
    if (!pending) return;
    const { isAuthenticated: authed, isLoading: loading } = useAuthStore.getState();
    // Sesi masih dicek: jangan habiskan percobaan, coba lagi sebentar lagi.
    if (loading) {
      if (attempt < MAX_ATTEMPTS) {
        timerRef.current = setTimeout(() => tryConsume(attempt + 1), 300);
      }
      return;
    }
    // Belum login: biarkan tertunda — effect di bawah memanggil tryConsume
    // lagi begitu isAuthenticated berubah (selesai login).
    if (!authed) return;
    if (!navigationRef.isReady()) {
      if (attempt < MAX_ATTEMPTS) {
        timerRef.current = setTimeout(() => tryConsume(attempt + 1), 300);
      }
      return;
    }
    pendingRef.current = null;
    const ok = navigateToScreen(pending.screen, pending.params);
    if (!ok) console.warn('[DeepLink] Navigasi gagal ke:', pending.screen);
  };

  const queueDeepLink = (url: string | null): void => {
    if (!url) return;
    const parsed = parseDeepLink(url);
    if (!parsed) {
      console.log('[DeepLink] URL tidak dikenal, diabaikan:', url);
      return;
    }
    pendingRef.current = parsed;
    tryConsume();
  };

  useEffect(() => {
    // Cold start: aplikasi dibuka dari tautan saat masih tertutup.
    Linking.getInitialURL().then(queueDeepLink).catch(() => {});
    // Warm start: aplikasi sudah terbuka lalu tautan diketuk.
    const sub = Linking.addEventListener('url', (e) => queueDeepLink(e.url));
    return () => {
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Konsumsi tautan tertunda begitu status login berubah (selesai login).
  useEffect(() => {
    tryConsume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);
}
