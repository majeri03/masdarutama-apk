import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNotificationCenterStore } from './notificationCenter.store';

interface NotificationState {
  waOrdersPending: number;
  deliveriesPending: number;
  overdueDebts: number;
  pendingPurchases: number;
  lastFetched: number | null;
  isPolling: boolean;
  // Snapshot sebelumnya untuk deteksi perubahan (di-persist agar tidak spam saat restart)
  _prevWaPending: number;
  _prevOverdueDebts: number;
  _prevPendingPurchases: number;
  startPolling: () => void;
  stopPolling: () => void;
  fetchCounts: () => Promise<void>;
}

let intervalId: NodeJS.Timeout | null = null;
let appStateSubscription: any = null;

// Notifikasi push di-handle murni via Expo Server (backend) agar tidak terjadi double-push.

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      waOrdersPending: 0,
      deliveriesPending: 0,
      overdueDebts: 0,
      pendingPurchases: 0,
      lastFetched: null,
      isPolling: false,
      _prevWaPending: 0,
      _prevOverdueDebts: 0,
      _prevPendingPurchases: 0,

      fetchCounts: async () => {
        try {
          const state = get();
          const addNotif = useNotificationCenterStore.getState().addNotification;

          // 1. WA Orders pending
          try {
            const waRes = await api.get('/api/wa-orders?status=PENDING&limit=1');
            if (waRes.data?.success || waRes.data?.status === 'success') {
              const total = waRes.data?.meta?.total ?? (waRes.data?.data?.length || 0);
              const prev = state._prevWaPending;

              if (total > 0 && total !== prev) {
                addNotif({
                  title: '📦 Orderan WA Baru!',
                  body: `Ada ${total} orderan WA yang menunggu konfirmasi.`,
                  data: { screen: 'WaOrders' },
                });
              }

              set({ waOrdersPending: total, _prevWaPending: total });
            }
          } catch {}

          // 2. Hutang / Piutang Jatuh Tempo
          try {
            const debtRes = await api.get('/api/debts?overdue=true&limit=50');
            if (debtRes.data?.success || debtRes.data?.status === 'success') {
              const overdueList = debtRes.data?.data || [];
              const count = Array.isArray(overdueList) ? overdueList.length : 0;
              const prev = state._prevOverdueDebts;

              if (count > 0 && count !== prev) {
                const totalAmount = overdueList.reduce((sum: number, d: any) =>
                  sum + (d.remainingAmount || d.amount || 0), 0);
                const msg = `${count} hutang/piutang jatuh tempo. Total: Rp${totalAmount.toLocaleString('id-ID')}`;

                addNotif({
                  title: '⚠️ Hutang Jatuh Tempo!',
                  body: msg,
                  data: { screen: 'Debt' },
                });
              }

              set({ overdueDebts: count, _prevOverdueDebts: count });
            }
          } catch {}

          // 3. Purchase Order pending
          try {
            const poRes = await api.get('/api/purchases?status=PENDING&limit=50');
            if (poRes.data?.success || poRes.data?.status === 'success') {
              const poList = poRes.data?.data || poRes.data?.purchases || [];
              const count = Array.isArray(poList) ? poList.length : 0;
              const prev = state._prevPendingPurchases;

              if (count > 0 && count !== prev) {
                addNotif({
                  title: '🛒 Purchase Order Pending',
                  body: `Ada ${count} PO yang belum dikonfirmasi/diterima.`,
                  data: { screen: 'Purchase' },
                });
              }

              set({ pendingPurchases: count, _prevPendingPurchases: count });
            }
          } catch {}

          // 4. Stok rendah (in-app only — push luar terlalu sering)
          try {
            const stockRes = await api.get('/api/products?lowStock=true&limit=50');
            if (stockRes.data?.success || stockRes.data?.status === 'success') {
              const stockList = stockRes.data?.data?.products || stockRes.data?.products || [];
              const count = Array.isArray(stockList) ? stockList.length : 0;
              if (count > 0) {
                const existingNotifs = useNotificationCenterStore.getState().notifications;
                const today = new Date().toDateString();
                const alreadyNotified = existingNotifs.some(n =>
                  n.title.includes('Stok Rendah') &&
                  new Date(n.date).toDateString() === today
                );
                if (!alreadyNotified) {
                  addNotif({
                    title: '📉 Stok Rendah!',
                    body: `${count} produk di bawah stok minimum. Segera lakukan pembelian.`,
                    data: { screen: 'Products' },
                  });
                }
              }
            }
          } catch {}

          set({ lastFetched: Date.now() });
        } catch (error) {
          console.warn('[Notification Store] Failed to fetch counts', error);
        }
      },

      startPolling: () => {
        if (get().isPolling) return;

        // Fetch pertama kali segera
        get().fetchCounts();

        // Interval setiap 60 detik (hemat baterai)
        intervalId = setInterval(() => {
          get().fetchCounts();
        }, 60000);

        // Pause saat background, resume saat aktif kembali
        appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
          if (nextAppState === 'active') {
            if (!intervalId) {
              get().fetchCounts();
              intervalId = setInterval(() => get().fetchCounts(), 60000);
            }
          } else {
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
    }),
    {
      name: 'notification-store-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Hanya persist _prev counters — state lainnya (polling, dll) tidak perlu
      partialize: (state) => ({
        _prevWaPending: state._prevWaPending,
        _prevOverdueDebts: state._prevOverdueDebts,
        _prevPendingPurchases: state._prevPendingPurchases,
      }),
    }
  )
);
