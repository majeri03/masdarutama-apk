import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '../services/api';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { navigationRef } from '../utils/navigation';

// ── Handler: tampilkan notifikasi walau app sedang foreground ──────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Buat Android channel di module-level (sebelum kirim notif apa pun) ─────
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Notifikasi Utama',
    description: 'Notifikasi pesanan WA, hutang, dan stok',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    enableVibrate: true,
    showBadge: true,
    sound: 'default',
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
  | { type: 'stack-with-params'; stackName: string }
> = {
  // === STACK SCREENS (route langsung) ===
  Debt: { type: 'stack', stackName: 'Debt' },
  Purchase: { type: 'stack', stackName: 'Purchase' },
  Delivery: { type: 'stack', stackName: 'Delivery' },
  WaOrders: { type: 'stack', stackName: 'WaOrders' },
  WaOrderConfirm: { type: 'stack', stackName: 'WaOrderConfirm' },
  Customers: { type: 'stack', stackName: 'Customers' },
  NotificationCenter: { type: 'stack', stackName: 'NotificationCenter' },
  StockOpname: { type: 'stack', stackName: 'StockOpname' },
  AiChat: { type: 'stack', stackName: 'AiChat' },
  DeviceSettings: { type: 'stack', stackName: 'DeviceSettings' },

  // === TAB SCREENS (harus navigate ke 'Main' dulu) ===
  Dashboard: { type: 'tab', tabName: 'Dashboard' },
  POS: { type: 'tab', tabName: 'POS' },
  Products: { type: 'tab', tabName: 'Products' },
  History: { type: 'tab', tabName: 'History' },
  Reports: { type: 'tab', tabName: 'Reports' },
  Settings: { type: 'tab', tabName: 'Settings' },
};

/**
 * Navigasi cerdas berdasarkan nama screen yang dikirim di payload notifikasi.
 * Menangani perbedaan antara Tab screen dan Stack screen secara otomatis.
 */
const navigateToScreen = (screen: string, params?: any): boolean => {
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
      if (params) {
        (navigationRef as any).navigate('Main', {
          screen: route.tabName,
          params,
        });
      } else {
        (navigationRef as any).navigate('Main', {
          screen: route.tabName,
        });
      }
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

// ── Hook utama ─────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // 1. Daftarkan perangkat dan dapatkan token
    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) {
          setExpoPushToken(token);
          // Kirim token ke backend agar server bisa push notifikasi
          api.post('/api/users/push-token', { token }).catch((err) => {
            console.warn('[PushNotif] Gagal simpan token ke backend:', err?.message);
          });
          console.log('[PushNotif] Token terdaftar:', token.slice(0, 40) + '...');
        }
      })
      .catch((err) => {
        console.warn('[PushNotif] Registrasi gagal:', err);
      });

    // 2. Listener: notifikasi diterima saat app FOREGROUND
    //    → Simpan ke in-app center. Navigasi TIDAK dilakukan (user sedang aktif pakai app).
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;

      // Cegah duplikat jika notifikasi ini sudah ada di center (misal dari polling)
      const state = useNotificationCenterStore.getState();
      const alreadyExists = state.notifications.some(
        (n) => n.title === (title || '') && n.body === (body || '') &&
          // Hanya cek dalam 10 detik terakhir untuk cegah spam tapi bukan duplikat lama
          (Date.now() - new Date(n.date).getTime()) < 10_000
      );

      if (!alreadyExists) {
        state.addNotification({
          title: title || 'Notifikasi Baru',
          body: body || '',
          data: data || {},
        });
      }
    });

    // 3. Listener: user mengetuk notifikasi (dari BACKGROUND atau KILLED state)
    //    → Simpan ke center (jika belum ada) + navigasi ke screen tujuan.
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const notif = response.notification;
      const { title, body, data } = notif.request.content;
      const screen = (data as any)?.screen;
      const params = (data as any)?.params;

      // Simpan ke history jika belum ada
      const state = useNotificationCenterStore.getState();
      const exists = state.notifications.some(
        (n) => n.title === title && n.body === body
      );
      if (!exists) {
        state.addNotification({
          title: title || 'Notifikasi Baru',
          body: body || '',
          data: data || {},
        });
      }

      // Navigasi ke layar yang relevan
      if (screen) {
        // Jika navigationRef belum siap (app baru dibuka dari killed state),
        // tunda hingga siap dengan polling pendek.
        const tryNavigate = (attemptsLeft: number) => {
          if (navigationRef.isReady()) {
            const ok = navigateToScreen(screen, params);
            if (!ok) {
              // Fallback ke NotificationCenter jika screen tidak dikenali
              (navigationRef as any).navigate('NotificationCenter');
            }
          } else if (attemptsLeft > 0) {
            setTimeout(() => tryNavigate(attemptsLeft - 1), 300);
          } else {
            console.warn('[PushNotif] Navigation belum siap setelah beberapa percobaan.');
          }
        };
        tryNavigate(10); // Max 10 percobaan × 300ms = 3 detik
      } else {
        // Tidak ada screen target → buka NotificationCenter
        if (navigationRef.isReady()) {
          (navigationRef as any).navigate('NotificationCenter');
        }
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { expoPushToken };
}

// ── Registrasi perangkat dan ambil push token ──────────────────────────────
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.log('[PushNotif] Harus menggunakan perangkat fisik.');
    return undefined;
  }

  // Pastikan channel dibuat sebelum meminta izin (Android)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifikasi Utama',
      description: 'Notifikasi pesanan WA, hutang, dan stok',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      enableVibrate: true,
      showBadge: true,
      sound: 'default',
    });
  }

  // Minta izin notifikasi
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

  // Ambil EAS Project ID dari app.json
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    '6e4aad91-e3dc-44f4-97f3-0f332f02dd6e'; // fallback hardcode dari app.json

  try {
    // Expo Push Token (didukung FCM via google-services.json saat build native)
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e: any) {
    console.warn('[PushNotif] Gagal ambil Expo Push Token:', e?.message);
    // Coba tanpa projectId sebagai fallback
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (e2: any) {
      console.error('[PushNotif] Semua metode token gagal:', e2?.message);
      return undefined;
    }
  }
}
