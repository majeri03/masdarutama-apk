import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: string; // ISO string
  isRead: boolean;
  data?: any;
}

interface NotificationCenterState {
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, 'id' | 'date' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  cleanupOldNotifications: () => void;
}

export const useNotificationCenterStore = create<NotificationCenterState>()(
  persist(
    (set, get) => ({
      notifications: [],
      
      addNotification: (notif) => {
        const newNotif: AppNotification = {
          ...notif,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          date: new Date().toISOString(),
          isRead: false,
        };
        
        set((state) => ({
          notifications: [newNotif, ...state.notifications],
        }));
      },
      
      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        }));
      },
      
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
      },
      
      clearAll: () => {
        set({ notifications: [] });
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
