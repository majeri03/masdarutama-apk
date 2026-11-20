import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: string; // ISO string
  isRead: boolean;
  data?: Record<string, unknown>;
  /** Kunci dedup lintas jalur (push vs polling vs lokal), mis. `sale-<id>`. */
  dedupKey?: string;
}

interface NotificationCenterState {
  notifications: AppNotification[];
  isLoading: boolean;
  lastNotificationTimestamp: number;
  triggerRefresh: () => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'date' | 'isRead'> & { id?: string; date?: string }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearReadNotifications: () => Promise<void>;
  clearAll: () => void;
  cleanupOldNotifications: () => void;
  fetchRemoteNotifications: () => Promise<void>;
}

export const useNotificationCenterStore = create<NotificationCenterState>()(
  persist(
    (set, get) => ({
      notifications: [],
      isLoading: false,
      lastNotificationTimestamp: 0,

      triggerRefresh: () => {
        set({ lastNotificationTimestamp: Date.now() });
      },
      
      // DEDUP TERPUSAT (Nov 2026): dulu tiap jalur (push foreground, drain
      // background, ketuk banner, polling, fetch server) menambah entri sendiri
      // dengan ID acak — 1 transaksi jadi 11 entri. Sekarang SEMUA jalur lewat
      // sini dan dicek 3 kunci: ID server, dedupKey, lalu judul+isi (2 menit).
      addNotification: (notif) => {
        const state = get();
        const id = notif.id ?? Date.now().toString() + Math.random().toString(36).substring(2, 9);
        if (state.notifications.some((n) => n.id === id)) return;
        if (notif.dedupKey && state.notifications.some((n) => n.dedupKey === notif.dedupKey)) return;
        const now = Date.now();
        if (state.notifications.some((n) => n.title === notif.title && n.body === notif.body &&
          (now - new Date(n.date).getTime()) < 2 * 60 * 1000)) return;
        const newNotif: AppNotification = {
          ...notif,
          id,
          date: notif.date ?? new Date().toISOString(),
          isRead: false,
        };

        set((state) => ({
          notifications: [newNotif, ...state.notifications],
          lastNotificationTimestamp: Date.now(),
        }));
      },
      
      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        }));
        // Hanya kirim ke server untuk ID server asli — ID lokal (awalan
        // "local-") tidak ada di DB, dulu PATCH-nya gagal diam-diam.
        if (!id.startsWith('local-')) api.patch('/api/notifications', { id }).catch(() => {});
      },
      
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
        api.patch('/api/notifications', { readAll: true }).catch(() => {});
      },
      
      clearReadNotifications: async () => {
        // Hapus notifikasi yang sudah dibaca (lokal)
        set((state) => ({
          notifications: state.notifications.filter((n) => !n.isRead),
        }));
        // Sync hapus permanen notifikasi terbaca di backend
        api.delete('/api/notifications?clearRead=true').catch(() => {});
      },

      clearAll: () => {
        set({ notifications: [] });
        api.delete('/api/notifications?clearRead=true').catch(() => {});
      },

      fetchRemoteNotifications: async () => {
        try {
          set({ isLoading: true });
          const res = await api.get('/api/notifications?limit=50');
          if (res.data?.success && Array.isArray(res.data?.data?.items)) {
            const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            const remoteItems: AppNotification[] = res.data.data.items
              .filter((item: any) => (now - new Date(item.createdAt).getTime()) < THREE_DAYS_MS)
              .map((item: any) => ({
                id: item.id,
                title: item.title,
                body: item.body,
                date: item.createdAt,
                isRead: item.isRead,
                data: {
                  screen: item.screen,
                  params: item.params,
                  type: item.type,
                },
              }));

            // Merge dengan notifikasi lokal: dedup by ID, LALU by judul+isi —
            // salinan lokal (ID acak) dari kejadian yang sama dengan baris server
            // harus dibuang, dulu keduanya tampil berdua.
            const local = get().notifications.filter((n) => (now - new Date(n.date).getTime()) < THREE_DAYS_MS);
            const existingIds = new Set(remoteItems.map((n) => n.id));
            const remoteKeys = new Set(remoteItems.map((n) => `${n.title}||${n.body}`));
            const merged = [...remoteItems, ...local.filter((n) => !existingIds.has(n.id) && !remoteKeys.has(`${n.title}||${n.body}`))];

            merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            set({ notifications: merged, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch {
          set({ isLoading: false });
        }
      },
      
      cleanupOldNotifications: () => {
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari otomatis hapus
        const now = Date.now();
        
        set((state) => ({
          notifications: state.notifications.filter((n) => {
            const notifDate = new Date(n.date).getTime();
            return (now - notifDate) < THREE_DAYS_MS;
          }),
        }));

        // Hapus juga di server yang sudah lewat 3 hari
        api.delete('/api/notifications?olderThanDays=3').catch(() => {});
      },
    }),
    {
      name: 'notification-center-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

