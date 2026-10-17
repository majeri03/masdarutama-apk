import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { AppState } from 'react-native';
import { useNotificationCenterStore } from './notificationCenter.store';

interface NotificationState {
  deliveriesPending: number;
  overdueDebts: number;
  pendingPurchases: number;
  lastFetched: number | null;
  isPolling: boolean;
  // Snapshot sebelumnya untuk deteksi perubahan
  _prevOverdueDebts: number;
  _prevPendingPurchases: number;
  _prevWaPending: number;
  // Timestamp terakhir tiap jenis notifikasi (untuk dedup 5 menit)
  _lastDebtNotifAt: number;
  _lastPoNotifAt: number;
  _lastStockNotifAt: number;
  startPolling: () => void;
  stopPolling: () => void;
  fetchCounts: () => Promise<void>;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// Jeda minimum antar notifikasi jenis yang sama: 5 menit
const NOTIF_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * shouldSendNotif — Cek apakah notifikasi layak dikirim.
 * Mencegah double notif dan konten kosong.
 */
const shouldSendNotif = (
  lastNotifAt: number,
  title: string,
  body: string,
): boolean => {
  // Skip notifikasi dengan konten kosong
  if (!title || !body || title.trim() === '' || body.trim() === '') return false;

  // Cooldown: jangan kirim notif jenis yang sama dalam 5 menit terakhir
  const timeSinceLast = Date.now() - lastNotifAt;
  if (timeSinceLast < NOTIF_COOLDOWN_MS) return false;

  return true;
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      deliveriesPending: 0,
      overdueDebts: 0,
      pendingPurchases: 0,
      lastFetched: null,
      isPolling: false,
      _prevOverdueDebts: -1,
      _prevPendingPurchases: -1,
      _prevWaPending: -1,
      _lastDebtNotifAt: 0,
      _lastPoNotifAt: 0,
      _lastStockNotifAt: 0,

      fetchCounts: async () => {
        try {
          const state = get();
          const addNotif = useNotificationCenterStore.getState().addNotification;

          // 1. Hutang / Piutang Jatuh Tempo
          try {
            const debtRes = await api.get('/api/debts?overdue=true&limit=50');
            if (debtRes.data?.success || debtRes.data?.status === 'success') {
              const overdueList = debtRes.data?.data || [];
              const count = Array.isArray(overdueList) ? overdueList.length : 0;
              const prev = state._prevOverdueDebts;

              if (count > 0 && count !== prev && prev !== -1) {
                const totalAmount = overdueList.reduce((sum: number, d: { remainingAmount?: number; amount?: number }) =>
                  sum + (d.remainingAmount || d.amount || 0), 0);
                const title = '⚠️ Hutang Jatuh Tempo!';
                const body = `${count} hutang/piutang jatuh tempo. Total: Rp${totalAmount.toLocaleString('id-ID')}`;
                if (shouldSendNotif(state._lastDebtNotifAt, title, body)) {
                  addNotif({ title, body, data: { screen: 'Debt' } });
                  set({ _lastDebtNotifAt: Date.now() });
                }
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

              if (count > 0 && count > prev && prev !== -1) {
                const title = '🛒 Purchase Order Pending';
                const body = `Ada ${count} PO yang belum dikonfirmasi/diterima.`;
                if (shouldSendNotif(state._lastPoNotifAt, title, body)) {
                  addNotif({ title, body, data: { screen: 'Purchase' } });
                  set({ _lastPoNotifAt: Date.now() });
                }
              }

              set({ pendingPurchases: count, _prevPendingPurchases: count });
            }
          } catch {}

          // 4. Stok rendah (1x per hari max)
          try {
            const stockRes = await api.get('/api/products?lowStock=true&limit=50');
            if (stockRes.data?.success || stockRes.data?.status === 'success') {
              const stockList = stockRes.data?.data?.products || stockRes.data?.products || [];
              const count = Array.isArray(stockList) ? stockList.length : 0;
              if (count > 0) {
                const title = '📉 Stok Rendah!';
                const body = `${count} produk di bawah stok minimum. Segera lakukan pembelian.`;
                // Cooldown 1 hari untuk stok rendah (tidak perlu tiap 5 menit)
                const timeSinceLast = Date.now() - get()._lastStockNotifAt;
                if (timeSinceLast > 24 * 60 * 60 * 1000 && shouldSendNotif(get()._lastStockNotifAt, title, body)) {
                  addNotif({ title, body, data: { screen: 'Products' } });
                  set({ _lastStockNotifAt: Date.now() });
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

        // Reset snapshot saat mulai polling agar deteksi perubahan fresh
        // Tapi jangan reset ke -1 kalau sudah pernah fetch (hanya saat pertama kali)
        const state = get();
        if (state._prevWaPending === -1) {
          // Pertama kali: fetch dulu, set baseline, tidak trigger notif
          get().fetchCounts();
        } else {
          // Sudah pernah fetch: langsung fetch, notif hanya jika ada perubahan
          get().fetchCounts();
        }

        // Interval setiap 60 detik (hemat baterai)
        intervalId = setInterval(() => {
          get().fetchCounts();
        }, 60000);

        // Pause saat background, resume saat aktif kembali
        appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
          if (nextAppState === 'active') {
            if (!intervalId) {
              // App kembali aktif: fetch segera
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
      name: 'notification-store-storage-v3', // bump version untuk reset
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        _prevOverdueDebts: state._prevOverdueDebts,
        _prevPendingPurchases: state._prevPendingPurchases,
        _lastDebtNotifAt: state._lastDebtNotifAt,
        _lastPoNotifAt: state._lastPoNotifAt,
        _lastStockNotifAt: state._lastStockNotifAt,
      }),
    }
  )
);
