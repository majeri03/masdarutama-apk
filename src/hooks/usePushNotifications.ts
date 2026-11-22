import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { useAuthStore } from '../stores/auth.store';
import { navigationRef } from '../utils/navigation';


// ── Pastikan channel Android sudah dibuat sebelum menjadwalkan ────────────
// FIX (Nov 2026): channel sebelumnya dibuat dengan promise mengambang tanpa
// await di level modul, jadi notifikasi pertama bisa dijadwalkan sebelum
// channel-nya selesai dibuat. Sekarang setiap penjadwalan menunggu channel.
// SATU channel suara khas (Nov 2026): dulu ada 5 channel, hanya
// masdar_channel_v2 yang bersuara khas — dan itu pun hanya dipakai tombol Tes.
// Semua notifikasi nyata (orders/deliveries/finance) memakai channel lain
// dengan suara 'default'. Sekarang semua lewat masdar_channel_v3.
// Channel Android TIDAK BISA diubah suaranya setelah dibuat, makanya ID-nya
// dinaikkan v2 -> v3 (channel lama dihapus saat startup, lihat bawah).
export const NOTIF_CHANNEL_ID = 'masdar_channel_v3';
const LEGACY_CHANNEL_IDS = ['masdar_channel_v2', 'default', 'orders', 'deliveries', 'finance'];
const CHANNEL_CONFIGS: Record<string, { name: string; description: string; sound: string }> = {
  masdar_channel_v3: { name: 'TB Masdar Utama (Suara Khas)', description: 'Notifikasi utama sistem dengan suara khas Masdar Utama', sound: 'masdar_utama.mp3' },
};

async function ensureNotificationChannel(channelId: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Paksa ke channel suara khas — ID lama (orders/deliveries/...) diarahkan ke v3.
  channelId = NOTIF_CHANNEL_ID;
  const cfg = CHANNEL_CONFIGS[channelId] ?? { name: 'TB Masdar Utama (Suara Khas)', description: 'Notifikasi utama sistem dengan suara khas Masdar Utama', sound: 'masdar_utama.mp3' };
  try {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: cfg.name,
      description: cfg.description,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      enableVibrate: true,
      showBadge: true,
      sound: cfg.sound,
    });
  } catch (e) {
    console.warn('[PushNotif] Gagal membuat channel:', channelId, e);
  }
}

// ── Kirim notifikasi lokal native (muncul di system tray saat app foreground/background) ─
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = NOTIF_CHANNEL_ID,
) {
  if (!title || !body || title.trim() === '' || body.trim() === '') return;
  try {
    // Semua notifikasi lokal lewat channel suara khas v3.
    channelId = NOTIF_CHANNEL_ID;
    await ensureNotificationChannel(channelId);
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: 'masdar_utama.mp3',
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // tampil langsung
    });
  } catch (e) {
    console.warn('[PushNotif] Gagal jadwalkan notif lokal:', e);
  }
}

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



if (Platform.OS === 'android') {
  // Hapus channel lama (suaranya sudah terlanjur 'default' dan tidak bisa
  // diubah) lalu buat SATU channel suara khas v3.
  for (const legacyId of LEGACY_CHANNEL_IDS) {
    Notifications.deleteNotificationChannelAsync(legacyId).catch(() => {});
  }
  Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
    name: 'TB Masdar Utama (Suara Khas)',
    description: 'Notifikasi utama sistem dengan suara khas Masdar Utama',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    enableVibrate: true,
    showBadge: true,
    sound: 'masdar_utama.mp3',
  }).catch(() => {});
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

  Dashboard: { type: 'tab', tabName: 'Dashboard' },
  POS: { type: 'tab', tabName: 'POS' },
  Products: { type: 'tab', tabName: 'Products' },
  History: { type: 'tab', tabName: 'History' },
  Reports: { type: 'tab', tabName: 'Reports' },
  Settings: { type: 'tab', tabName: 'Settings' },

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

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.log('[PushNotif] Harus menggunakan perangkat fisik.');
    return undefined;
  }

  // Pastikan channel dibuat sebelum meminta izin (Android)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
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

  // SELALU gunakan Expo Push Token — kompatibel dengan expo-server-sdk di backend.
  // expo-server-sdk hanya menerima token format ExponentPushToken[...],
  // bukan raw FCM token dari getDevicePushTokenAsync().
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    '6e4aad91-e3dc-44f4-97f3-0f332f02dd6e';

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (tokenData?.data) {
      console.log('[PushNotif] Expo Push Token berhasil didapat:', tokenData.data.slice(0, 40) + '...');
      return tokenData.data;
    }
  } catch (e: any) {
    console.warn('[PushNotif] Gagal ambil Expo Push Token (dengan projectId):', e?.message);
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      if (tokenData?.data) {
        console.log('[PushNotif] Expo Push Token (fallback) berhasil:', tokenData.data.slice(0, 40) + '...');
        return tokenData.data;
      }
    } catch (e2: any) {
      console.error('[PushNotif] Semua metode token gagal:', e2?.message);
    }
  }

  return undefined;
}

const STORED_PUSH_TOKEN_KEY = 'masdar_expo_push_token';

/** Tes cepat: kirim satu notifikasi lokal langsung. Dipakai tombol "Tes Notifikasi". */
export async function sendTestNotification(): Promise<{ ok: boolean; permission: string; reason?: string }> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') {
      return { ok: false, permission: req.status, reason: 'Izin notifikasi belum diberikan. Aktifkan di Pengaturan HP > Aplikasi > TB Masdar Utama > Notifikasi.' };
    }
    return sendTestNotification();
  }
  await scheduleLocalNotification(
    '🔔 Tes Notifikasi Masdar Utama',
    'Kalau banner ini muncul, notifikasi lokal HP kamu sudah jalan. Kalau pesanan tetap tidak muncul, masalahnya di server/token push.',
    { screen: 'NotificationCenter' },
    NOTIF_CHANNEL_ID,
  );
  return { ok: true, permission: status };
}

export async function getPushTokenStatus(): Promise<{ permission: string; tokenPreview: string; isDevice: boolean }> {
  const { status } = await Notifications.getPermissionsAsync();
  const stored = (await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY)) ?? '';
  return {
    permission: status,
    tokenPreview: stored ? stored.slice(0, 30) + '...' : '(belum ada token tersimpan)',
    isDevice: Device.isDevice,
  };
}

export async function syncPushTokenToServer(customToken?: string): Promise<string | undefined> {
  try {
    const token = customToken || (await registerForPushNotificationsAsync());
    if (!token) return undefined;
    // Simpan token secara lokal supaya unregister tidak perlu minta token lagi
    await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, token).catch(() => {});

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

export async function unregisterPushTokenFromServer(): Promise<void> {
  try {
    // FIX (Nov 2026): sebelumnya fungsi ini memanggil register lagi untuk
    // mendapatkan token — itu meminta izin ulang dan bisa gagal saat logout.
    // Sekarang pakai token yang sudah tersimpan saat sync.
    const token = (await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY)) ?? undefined;
    if (!token) return;

    await api.delete('/api/notifications/register-token', {
      data: { token },
    }).catch(() => {});
    await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY).catch(() => {});
    console.log('[PushNotif] Token berhasil dihapus dari server');
  } catch (err) {
    console.warn('[PushNotif] Gagal menghapus token:', err);
  }
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  // Daftarkan dan sinkronkan token saat mount dan saat status login berubah
  useEffect(() => {
    // Jangan minta izin notifikasi / kirim token sebelum login (dulu dialog
    // izin muncul di layar Login dan token dikirim tanpa autentikasi).
    if (!isAuthenticated) return;
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

      const state = useNotificationCenterStore.getState();

      // Trigger automatic UI refresh across screens
      state.triggerRefresh();

      // Teruskan ID server + dedupKey dari payload backend — dedup terpusat
      // di addNotification. Dulu di sini dicek notification.request.identifier
      // (ID push Expo) terhadap ID lokal acak: tidak pernah cocok, jadi dedup gagal.
      const typedData = (data as Record<string, any>) || {};
      state.addNotification({
        id: typeof typedData.id === 'string' ? typedData.id : undefined,
        dedupKey: typeof typedData.dedupKey === 'string' ? typedData.dedupKey : undefined,
        title: title || 'Notifikasi Baru',
        body: body || '',
        data: (data as Record<string, unknown>) || {},
      });
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
      let params = typedData?.params;

      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch {}
      }

      // Jika tidak ada 'screen' field, coba resolve dari 'type'
      if (!screen && notifType && SCREEN_ROUTES[notifType]) {
        const route = SCREEN_ROUTES[notifType];
        screen = route.type === 'tab' ? route.tabName : route.stackName;
      }

      // Log sementara (Nov 2026): pastikan params DO sampai ke listener.
      // Kalau log ini tidak pernah muncul / params kosong, masalahnya ada di
      // payload push (FCM), bukan di layar. Hapus setelah terkonfirmasi.
      console.log('[PushTap]', JSON.stringify({ screen, type: notifType, params }));

      // Simpan ke notification center jika ada konten valid
      if (title && body && title.trim() !== '' && body.trim() !== '') {
        const state = useNotificationCenterStore.getState();
        state.addNotification({
          id: typeof typedData?.id === 'string' ? typedData.id : undefined,
          dedupKey: typeof typedData?.dedupKey === 'string' ? typedData.dedupKey : undefined,
          title: title || 'Notifikasi Baru',
          body: body || '',
          data: typedData || {},
        });
        // Ketuk = dibaca (dulu tidak pernah ditandai, badge tidak turun).
        if (typeof typedData?.id === 'string') state.markAsRead(typedData.id);
      }

      // Fungsi navigasi dengan retry saat cold start
      const doNavigate = (targetScreen: string | undefined, attemptsLeft: number) => {
        if (!navigationRef.isReady()) {
          if (attemptsLeft > 0) {
            setTimeout(() => doNavigate(targetScreen, attemptsLeft - 1), 300);
          }
          return;
        }

        // FIX (Nov 2026): jangan hitung mundur selagi sesi login belum dicek.
        // Dulu retry 6 detik bisa habis sebelum checkSession selesai, sehingga
        // navigate('Delivery') dipanggil saat stack hanya berisi Login —
        // route tidak ada, navigasi gagal diam-diam, layar tertutup splash abu-abu.
        const { isAuthenticated, isLoading } = useAuthStore.getState();
        if (isLoading) {
          setTimeout(() => doNavigate(targetScreen, attemptsLeft), 300);
          return;
        }
        if (!isAuthenticated) {
          // Belum login (atau baru logout): beri kesempatan login dulu.
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
