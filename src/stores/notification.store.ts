import { create } from 'zustand';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { AppState } from 'react-native';

interface NotificationState {
  waOrdersPending: number;
  deliveriesPending: number;
  lastFetched: number | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  fetchCounts: () => Promise<void>;
}

let intervalId: NodeJS.Timeout | null = null;
let appStateSubscription: any = null;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  waOrdersPending: 0,
  deliveriesPending: 0,
  lastFetched: null,
  isPolling: false,

  fetchCounts: async () => {
    try {
      // Create API_ENDPOINTS.NOTIFICATIONS_COUNT if not exists in constants/api.ts
      // For now we'll just hardcode the path if needed, but assuming API_BASE_URL is set in api instance
      const response = await api.get('/api/notifications/count');
      if (response.data.success) {
        set({
          waOrdersPending: response.data.data.waOrders,
          deliveriesPending: response.data.data.deliveries,
          lastFetched: Date.now(),
        });
      }
    } catch (error) {
      // Silently fail to not spam errors on polling
      console.warn('[Notification Store] Failed to fetch counts', error);
    }
  },

  startPolling: () => {
    if (get().isPolling) return;
    
    // Initial fetch
    get().fetchCounts();

    // Setup interval (every 10 seconds)
    intervalId = setInterval(() => {
      get().fetchCounts();
    }, 10000);

    // Setup app state listener to pause polling when in background
    appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Resume polling
        if (!intervalId) {
          get().fetchCounts();
          intervalId = setInterval(() => get().fetchCounts(), 10000);
        }
      } else {
        // Pause polling
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    });

    set({ isPolling: true });
  },

  stopPolling: () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
    set({ isPolling: false });
  },
}));
