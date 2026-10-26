import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '../services/api';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { useAuthStore } from '../stores/auth.store';
import { navigationRef } from '../utils/navigation';

// ── Task Name untuk background notification handler ─────────────────────────
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-handler';

// ── Daftarkan background notification task ──────────────────────────────────
// Ini memastikan notifikasi TETAP diproses bahkan saat app di background/killed
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[BackgroundNotif] Error:', error);
    return;
  }
  if (!data) return;

  // Saat app background/killed, simpan notifikasi ke store lokal via AsyncStorage
  try {
    const rawContent = data.notification?.request?.content || data.data || data;
    const title = rawContent.title || rawContent.name || 'Notifikasi Baru';
    const body = rawContent.body || rawContent.message || '';
    const notifData = rawContent.data || data.data || {};

    if ((!title || title.trim() === '') && (!body || body.trim() === '')) return;

    // Tambahkan ke notification center store
    const { addNotification } = useNotificationCenterStore.getState();
    addNotification({
      title: title || 'Notifikasi Baru',
      body: body || '',
      data: notifData || {},
    });
  } catch (e) {
    console.warn('[BackgroundNotif] Gagal proses notif background:', e);
  }
});

// ── Kirim notifikasi lokal native (muncul di system tray saat app foreground/background) ─
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = 'default',
) {
  if (!title || !body || title.trim() === '' || body.trim() === '') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // tampil langsung
    });
  } catch (e) {
    console.warn('[PushNotif] Gagal jadwalkan notif lokal:', e);
  }
}

// ── Handler: tampilkan notifikasi walau app sedang foreground ──────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { title, body } = notification.request.content;
    // Jangan tampilkan notifikasi kosong
    if (!title || !body || title.trim() === '' || body.trim() === '') {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// ── Daftarkan background notification handler (expo-notifications) ───────────
// Ini penting agar notifikasi push dari FCM diproses saat app BACKGROUND/KILLED
if (Platform.OS === 'android') {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) => {
    // Jika sudah terdaftar, tidak apa-apa
    if (!e?.message?.includes('already')) {
      console.warn('[PushNotif] Gagal daftarkan background task:', e?.message);
    }
  });
}

// ── Buat Android channel di module-level (sebelum kirim notif apa pun) ─────
if (Platform.OS === 'android') {
  const channels = [
    { id: 'masdar_channel_v2', name: 'TB Masdar Utama (Suara Khas)', desc: 'Notifikasi utama sistem dengan suara khas Masdar Utama' },
    { id: 'default', name: 'Notifikasi Umum', desc: 'Notifikasi umum sistem' },
    { id: 'orders', name: 'Pesanan & Penjualan', desc: 'Pesanan POS baru dan orderan WA' },
    { id: 'deliveries', name: 'Surat Jalan & Pengiriman', desc: 'Status pengiriman dan armada' },
    { id: 'finance', name: 'Keuangan & Piutang', desc: 'Pembayaran cicilan dan jatuh tempo' },
  ];
  for (const ch of channels) {
    Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      description: ch.desc,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      enableVibrate: true,
      showBadge: true,
      sound: ch.id === 'masdar_channel_v2' ? 'masdar_utama.mp3' : 'default',
    }).catch(() => {});
  }
}

/**
 * Peta nama screen di notifikasi → rute navigasi yang BENAR.
 *
 * ATURAN:
 * - Screen di dalam Tab (Main) butuh navigate('Main', { screen: 'NamaTab' })
 * - Screen di Stack langsung butuh navigate('NamaStack')
 *
 * Jika salah di sini → notifikasi tap membuka layar kosong atau tidak jalan.
 */
const SCREEN_ROUTES: Record<
  string,
  | { type: 'tab'; tabName: string }
  | { type: 'stack'; stackName: string }
> = {
  // === STACK SCREENS (route langsung) ===
  Debt: { type: 'stack', stackName: 'Debt' },
  Purchase: { type: 'stack', stackName: 'Purchase' },
  Delivery: { type: 'stack', stackName: 'Delivery' },
  Customers: { type: 'stack', stackName: 'Customers' },
  NotificationCenter: { type: 'stack', stackName: 'NotificationCenter' },
  StockOpname: { type: 'stack', stackName: 'StockOpname' },
  DeviceSettings: { type: 'stack', stackName: 'DeviceSettings' },
  FleetTracking: { type: 'stack', stackName: 'FleetTracking' },
  AppUpdate: { type: 'stack', stackName: 'AppUpdate' },
  StorageManager: { type: 'stack', stackName: 'StorageManager' },
  EditTransaction: { type: 'stack', stackName: 'EditTransaction' },
  InvoiceLayout: { type: 'stack', stackName: 'InvoiceLayout' },

  // === TAB SCREENS (harus navigate ke 'Main' dulu) ===
  Dashboard: { type: 'tab', tabName: 'Dashboard' },
  POS: { type: 'tab', tabName: 'POS' },
  Products: { type: 'tab', tabName: 'Products' },
  History: { type: 'tab', tabName: 'History' },
  Reports: { type: 'tab', tabName: 'Reports' },
  Settings: { type: 'tab', tabName: 'Settings' },

  // === TIPE NOTIFIKASI → mapping ke screen ===
  orders: { type: 'tab', tabName: 'History' },
  deliveries: { type: 'stack', stackName: 'Delivery' },
  delivery: { type: 'stack', stackName: 'Delivery' },
  finance: { type: 'stack', stackName: 'Debt' },
  stock: { type: 'tab', tabName: 'Products' },
  purchase: { type: 'stack', stackName: 'Purchase' },
  customers: { type: 'stack', stackName: 'Customers' },
};

/**
 * Navigasi cerdas berdasarkan nama screen yang dikirim di payload notifikasi.
 * Menangani perbedaan antara Tab screen dan Stack screen secara otomatis.
 */
export const navigateToScreen = (screen: string, params?: any): boolean => {
  if (!screen || !navigationRef.isReady()) return false;

  const route = SCREEN_ROUTES[screen];

  try {
    if (!route) {
      // Fallback: coba navigate langsung, jika gagal buka NotificationCenter
      (navigationRef as any).navigate(screen, params);
      return true;
    }

    if (route.type === 'tab') {
      // Tab screen: harus navigate ke Main dulu, lalu ke tab
      // params diforward agar screen bisa langsung apply filter (misal: tab aktif)
      (navigationRef as any).navigate('Main', {
        screen: route.tabName,
        ...(params ? { params } : {}),
      });
      return true;
    }

    if (route.type === 'stack') {
      // Stack screen: navigate langsung
      if (params) {
        (navigationRef as any).navigate(route.stackName, params);
      } else {
        (navigationRef as any).navigate(route.stackName);
      }
      return true;
    }
  } catch (e) {
    console.warn('[PushNotif] Navigasi gagal ke screen:', screen, e);
  }

  return false;
};

// ── Registrasi perangkat dan ambil push token ──────────────────────────────
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.log('[PushNotif] Harus menggunakan perangkat fisik.');
    return undefined;
  }

  // Pastikan channel dibuat sebelum meminta izin (Android)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('masdar_channel_v2', {
      name: 'TB Masdar Utama (Suara Khas)',
      description: 'Notifikasi utama sistem dengan suara khas Masdar Utama',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      enableVibrate: true,
      showBadge: true,
      sound: 'masdar_utama.mp3',
    });
  }

  // Minta izin notifikasi (Android 13+ POST_NOTIFICATIONS)
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[PushNotif] Izin notifikasi DITOLAK oleh pengguna.');
    return undefined;
  }

  // 1. Prioritaskan Native FCM Push Token (langsung didukung Firebase Admin HTTP v1)
  try {
    const deviceTokenData = await Notifications.getDevicePushTokenAsync();
    if (deviceTokenData?.data) {
      console.log('[PushNotif] Berhasil memperoleh Native Device Push Token (FCM)');
      return deviceTokenData.data;
    }
  } catch (fcmErr: any) {
    console.warn('[PushNotif] Tidak dapat mengambil Native Device Push Token, fallback ke Expo Push Token:', fcmErr?.message);
  }

  // 2. Fallback: Expo Push Token (misal saat Expo Go / tanpa bundle native)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    '6e4aad91-e3dc-44f4-97f3-0f332f02dd6e';

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e: any) {
    console.warn('[PushNotif] Gagal ambil Expo Push Token:', e?.message);
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (e2: any) {
      console.error('[PushNotif] Semua metode token gagal:', e2?.message);
      return undefined;
    }
  }
}

// ── Sinkronisasi push token ke server backend ──────────────────────────────
export async function syncPushTokenToServer(customToken?: string): Promise<string | undefined> {
  try {
    const token = customToken || (await registerForPushNotificationsAsync());
    if (!token) return undefined;

    // Kirim token ke backend multi-device registration
    await api.post('/api/notifications/register-token', {
      token,
      platform: Platform.OS,
      deviceName: Device.modelName ?? undefined,
    }).catch(async () => {
      // Fallback ke endpoint legacy
      await api.post('/api/users/push-token', { token }).catch(() => {});
    });

    console.log('[PushNotif] Token terdaftar dan disinkronkan:', token.slice(0, 40) + '...');
    return token;
  } catch (err) {
    console.warn('[PushNotif] Gagal sinkronisasi token:', err);
    return undefined;
  }
}

// ── Hapus push token dari server saat logout ────────────────────────────────
export async function unregisterPushTokenFromServer(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;

    await api.delete('/api/notifications/register-token', {
      data: { token },
    }).catch(() => {});
    console.log('[PushNotif] Token berhasil dihapus dari server');
  } catch (err) {
    console.warn('[PushNotif] Gagal menghapus token:', err);
  }
}

// ── Hook utama ─────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  // Daftarkan dan sinkronkan token saat mount dan saat status login berubah
  useEffect(() => {
    syncPushTokenToServer().then((token) => {
      if (token) setExpoPushToken(token);
    });
  }, [isAuthenticated, userId]);

  useEffect(() => {
    // 2. Listener: notifikasi diterima saat app FOREGROUND
    //    → Simpan ke in-app center & trigger real-time refresh ke screen aktif
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;

      // Skip notifikasi dengan konten kosong (mencegah entri blank di notification center)
      if (!title || !body || title.trim() === '' || body.trim() === '') return;

      const notifId = notification.request.identifier;
      const state = useNotificationCenterStore.getState();

      // Trigger automatic UI refresh across screens
      state.triggerRefresh();

      // Cek berdasarkan ID terlebih dahulu (lebih reliable)
      const idExists = state.notifications.some((n) => n.id === notifId);
      if (idExists) return;

      // Fallback: cegah duplikat konten dalam 2 menit (untuk notif lokal tanpa ID unik)
      const DEDUP_WINDOW_MS = 2 * 60 * 1000;
      const contentExists = state.notifications.some(
        (n) => n.title === (title || '') && n.body === (body || '') &&
          (Date.now() - new Date(n.date).getTime()) < DEDUP_WINDOW_MS
      );

      if (!contentExists) {
        state.addNotification({
          title: title || 'Notifikasi Baru',
          body: body || '',
          data: (data as Record<string, unknown>) || {},
        });
      }
    });

    // 3. Listener: user mengetuk notifikasi (dari BACKGROUND atau KILLED state)
    //    → Simpan ke center (jika belum ada) + navigasi ke screen tujuan.
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const notif = response.notification;
      const { title, body, data } = notif.request.content;
      const typedData = data as Record<string, any>;

      // screen bisa dari 'screen' field atau 'type' field (mapping ke screen)
      let screen = typedData?.screen;
      const notifType = typedData?.type;
      const params = typedData?.params;

      // Jika tidak ada 'screen' field, coba resolve dari 'type'
      if (!screen && notifType && SCREEN_ROUTES[notifType]) {
        const route = SCREEN_ROUTES[notifType];
        screen = route.type === 'tab' ? route.tabName : route.stackName;
      }

      // Simpan ke notification center jika ada konten valid
      if (title && body && title.trim() !== '' && body.trim() !== '') {
        const state = useNotificationCenterStore.getState();
        const notifId = notif.request.identifier;
        const idExists = state.notifications.some((n) => n.id === notifId);

        if (!idExists) {
          // Cek duplikat konten dalam 2 menit
          const DEDUP_WINDOW_MS = 2 * 60 * 1000;
          const contentExists = state.notifications.some(
            (n) => n.title === title && n.body === body &&
              (Date.now() - new Date(n.date).getTime()) < DEDUP_WINDOW_MS
          );
          if (!contentExists) {
            state.addNotification({
              title: title || 'Notifikasi Baru',
              body: body || '',
              data: typedData || {},
            });
          }
        }
      }

      // Fungsi navigasi dengan retry saat cold start
      const doNavigate = (targetScreen: string | undefined, attemptsLeft: number) => {
        if (!navigationRef.isReady()) {
          if (attemptsLeft > 0) {
            setTimeout(() => doNavigate(targetScreen, attemptsLeft - 1), 300);
          }
          return;
        }

        if (targetScreen) {
          const ok = navigateToScreen(targetScreen, params);
          if (!ok) {
            // Fallback ke NotificationCenter
            try { (navigationRef as any).navigate('NotificationCenter'); } catch {}
          }
        } else {
          // Tidak ada target → buka Pusat Notifikasi
          try { (navigationRef as any).navigate('NotificationCenter'); } catch {}
        }
      };

      // Max 20 percobaan × 300ms = 6 detik (cukup untuk cold start)
      doNavigate(screen, 20);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { expoPushToken };
}
