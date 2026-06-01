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
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      // Simpan ke in-app notification center
      useNotificationCenterStore.getState().addNotification({
        title: title || 'Notifikasi Baru',
        body: body || '',
        data: data || {},
      });
    });

    // 3. Listener: user mengetuk notifikasi (dari background / killed state)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const notif = response.notification;
      const { title, body, data } = notif.request.content;

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
      if (navigationRef.isReady()) {
        const screen = (data as any)?.screen;
        const params = (data as any)?.params;
        if (screen) {
          try {
            if (params) {
              (navigationRef as any).navigate(screen, params);
            } else {
              (navigationRef as any).navigate(screen);
            }
          } catch (e) {
            (navigationRef as any).navigate('NotificationCenter');
          }
        } else {
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
