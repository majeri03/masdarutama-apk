import { create } from 'zustand';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
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
  // Snapshot sebelumnya untuk deteksi perubahan
  _prevWaPending: number;
  _prevOverdueDebts: number;
  _prevPendingPurchases: number;
  startPolling: () => void;
  stopPolling: () => void;
  fetchCounts: () => Promise<void>;
}

let intervalId: NodeJS.Timeout | null = null;
let appStateSubscription: any = null;

// Kirim notifikasi lokal (terlihat di luar aplikasi)
const sendLocalNotification = async (title: string, body: string, data?: any) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
      },
      trigger: null, // Langsung tampil
    });
  } catch (e) {
    console.warn('[Notification] Failed to send local notification:', e);
  }
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
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
            // Tambah ke in-app notification center
            addNotif({
              title: '📦 Orderan WA Baru!',
              body: `Ada ${total} orderan WA yang menunggu konfirmasi.`,
              data: { screen: 'WaOrders' },
            });
            // Kirim local push (terlihat di luar app)
            if (total > prev) {
              await sendLocalNotification(
                '📦 Orderan WA Baru!',
                `Ada ${total} orderan WA yang menunggu konfirmasi.`,
                { screen: 'WaOrders' }
              );
            }
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

            if (count > prev) {
              await sendLocalNotification('⚠️ Hutang Jatuh Tempo!', msg, { screen: 'Debt' });
            }
          }

          set({ overdueDebts: count, _prevOverdueDebts: count });
        }
      } catch {}

      // 3. Purchase Order pending (belum diterima)
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

            if (count > prev) {
              await sendLocalNotification(
                '🛒 Purchase Order Pending',
                `Ada ${count} PO yang belum dikonfirmasi/diterima.`,
                { screen: 'Purchase' }
              );
            }
          }

          set({ pendingPurchases: count, _prevPendingPurchases: count });
        }
      } catch {}

      // 4. Stok rendah
      try {
        const stockRes = await api.get('/api/products?lowStock=true&limit=50');
        if (stockRes.data?.success || stockRes.data?.status === 'success') {
          const stockList = stockRes.data?.data?.products || stockRes.data?.products || [];
          const count = Array.isArray(stockList) ? stockList.length : 0;
          if (count > 0) {
            // Hanya tambahkan ke in-app (tidak push luar, karena bisa sering)
            // Cek apakah sudah ada notif stok rendah hari ini
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

    // Fetch pertama kali
    get().fetchCounts();

    // Interval setiap 60 detik (lebih hemat baterai, tidak 10 detik)
    intervalId = setInterval(() => {
      get().fetchCounts();
    }, 60000);

    // Pause saat di background, resume saat aktif
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
}));
