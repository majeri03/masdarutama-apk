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
}

interface NotificationCenterState {
  notifications: AppNotification[];
  isLoading: boolean;
  lastNotificationTimestamp: number;
  triggerRefresh: () => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'date' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
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
      
      addNotification: (notif) => {
        const newNotif: AppNotification = {
          ...notif,
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          date: new Date().toISOString(),
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
        api.patch('/api/notifications', { id }).catch(() => {});
      },
      
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
        api.patch('/api/notifications', { readAll: true }).catch(() => {});
      },
      
      clearAll: () => {
        set({ notifications: [] });
      },

      fetchRemoteNotifications: async () => {
        try {
          set({ isLoading: true });
          const res = await api.get('/api/notifications?limit=50');
          if (res.data?.success && Array.isArray(res.data?.data?.items)) {
            const remoteItems: AppNotification[] = res.data.data.items.map((item: any) => ({
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

            // Merge with local notifications (dedup by ID)
            const local = get().notifications;
            const existingIds = new Set(remoteItems.map((n) => n.id));
            const merged = [...remoteItems, ...local.filter((n) => !existingIds.has(n.id))];

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
        const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        
        set((state) => ({
          notifications: state.notifications.filter((n) => {
            const notifDate = new Date(n.date).getTime();
            return (now - notifDate) < FIVE_DAYS_MS;
          }),
        }));
      },
    }),
    {
      name: 'notification-center-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

