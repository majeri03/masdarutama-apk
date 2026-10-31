/**
 * index.js — Entry point utama aplikasi.
 *
 * PENTING: TaskManager.defineTask HARUS dipanggil di sini (di luar React tree),
 * agar handler berjalan saat app di-killed dan ada push notification masuk.
 * React context / Zustand store TIDAK tersedia di headless mode ini,
 * jadi data disimpan sementara ke AsyncStorage dan dibaca ulang saat app dibuka.
 */
import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-handler';
const PENDING_NOTIF_KEY = 'masdar_pending_notifications';

// ─── Background Notification Handler ─────────────────────────────────────────
// Dipanggil oleh sistem saat app KILLED dan ada notifikasi push masuk.
// Simpan ke AsyncStorage; App.tsx akan membacanya saat app dibuka kembali.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[BG-Notif] Error:', error);
    return;
  }
  if (!data) return;

  try {
    const rawContent =
      data?.notification?.request?.content ||
      data?.data ||
      data;

    const title = rawContent?.title || rawContent?.name || '';
    const body  = rawContent?.body  || rawContent?.message || '';
    const notifData = rawContent?.data || {};

    // Abaikan notifikasi kosong
    if (!title.trim() && !body.trim()) return;

    // Simpan ke AsyncStorage — aman diakses di headless mode
    const raw = await AsyncStorage.getItem(PENDING_NOTIF_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    existing.unshift({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      title,
      body,
      data: notifData,
      date: new Date().toISOString(),
    });
    // Simpan max 50 notifikasi pending
    await AsyncStorage.setItem(PENDING_NOTIF_KEY, JSON.stringify(existing.slice(0, 50)));
    console.log('[BG-Notif] Notifikasi disimpan ke pending queue:', title);
  } catch (e) {
    console.warn('[BG-Notif] Gagal simpan notifikasi background:', e);
  }
});

// ─── Daftarkan task ke sistem notifikasi ─────────────────────────────────────
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) => {
  if (!e?.message?.includes('already')) {
    console.warn('[BG-Notif] Gagal registrasi background task:', e?.message);
  }
});

// ─── Mount React App ──────────────────────────────────────────────────────────
import App from './App';
registerRootComponent(App);
