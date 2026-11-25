import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import {
  normalizeNotificationData,
  deriveDedupKey,
  humanizeNotificationBody,
} from '../utils/notificationText';

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
  /** Hapus SATU notifikasi (lokal + server). Return false kalau server gagal (item dikembalikan). */
  deleteNotification: (id: string) => Promise<boolean>;
  clearReadNotifications: () => Promise<void>;
  clearAll: () => Promise<void>;
  cleanupOldNotifications: () => void;
  fetchRemoteNotifications: () => Promise<void>;
}

/**
 * PATCH mark-as-read yang masih "in-flight". clearReadNotifications WAJIB
 * menunggu semuanya selesai dulu — kalau tidak, ada race: pengguna mengetuk
 * notifikasi (PATCH belum sampai) lalu menekan "Bersihkan Terbaca"
 * (DELETE ...?clearRead=true hanya menghapus yang isRead=true di server),
 * baris itu lolos dari DELETE lalu MUNCUL LAGI saat fetch berikutnya.
 * Inilah salah satu penyebab "sudah dihapus tapi muncul lagi".
 */
const pendingMarkRead = new Set<Promise<unknown>>();

function trackMarkRead(promise: Promise<unknown>): void {
  const tracked = promise.catch(() => {});
  pendingMarkRead.add(tracked);
  tracked.finally(() => {
    pendingMarkRead.delete(tracked);
  });
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
      // WS-2 (25 Nov 2026): sanitasi + dedupKey turunan. Kalau body berisi
      // JSON mentah (payload push), ubah jadi pesan manusiawi DULU — kalau
      // tidak, dedup judul+isi gagal membedakan salinan bersih vs salinan
      // JSON dari kejadian yang sama. dedupKey juga diturunkan dari
      // params.saleId/doId/productId, karena baris server tidak membawa
      // kolom dedupKey (belum ada di tabel Notification backend).
      addNotification: (notif) => {
        const state = get();
        const data = normalizeNotificationData(notif.data);
        const title = notif.title || 'Notifikasi Baru';
        const body = humanizeNotificationBody(notif.body, data);
        const dedupKey = deriveDedupKey(data, notif.dedupKey);
        const id = notif.id ?? Date.now().toString() + Math.random().toString(36).substring(2, 9);
        if (state.notifications.some((n) => n.id === id)) return;
        if (dedupKey && state.notifications.some((n) => n.dedupKey === dedupKey)) return;
        const now = Date.now();
        if (state.notifications.some((n) => n.title === title && n.body === body &&
          (now - new Date(n.date).getTime()) < 2 * 60 * 1000)) return;
        const newNotif: AppNotification = {
          ...notif,
          title,
          body,
          data,
          dedupKey,
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
        // WS-2: PATCH dilacak supaya clearReadNotifications bisa menunggu
        // PATCH ini selesai dulu (menghilangkan race hapus-vs-tandai-baca).
        if (!id.startsWith('local-')) {
          trackMarkRead(api.patch('/api/notifications', { id }));
        }
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
        trackMarkRead(api.patch('/api/notifications', { readAll: true }));
      },

      // WS-2 (25 Nov 2026): hapus SATU notifikasi. Sebelumnya layar tidak
      // punya tombol hapus per item sama sekali — pengguna hanya bisa
      // "Bersihkan Terbaca", yang diam-diam gagal kalau baris itu belum
      // sempat tertandai dibaca di server. Hapus per ID tidak tergantung
      // isRead, jadi deterministik. Kalau server gagal, item dikembalikan
      // ke daftar dan pemanggil menampilkan pesan error (tidak lagi
      // gagal diam-diam lalu "muncul lagi" tanpa penjelasan).
      deleteNotification: async (id) => {
        const target = get().notifications.find((n) => n.id === id);
        if (!target) return false;
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
        // ID lokal (push/polling, awalan "local-") tidak ada di DB.
        if (id.startsWith('local-')) return true;
        try {
          await api.delete(`/api/notifications?id=${encodeURIComponent(id)}`);
          return true;
        } catch (e) {
          // Server gagal (offline / 401 / 404): kembalikan item supaya
          // tidak terlihat "sudah dihapus" padahal masih ada di server
          // dan akan muncul lagi saat fetch berikutnya.
          set((state) => ({
            notifications: [target, ...state.notifications].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            ),
          }));
          return false;
        }
      },

      clearReadNotifications: async () => {
        // Tunggu PATCH tandai-baca yang masih in-flight selesai dulu (lihat
        // komentar di pendingMarkRead): kalau tidak, DELETE clearRead di
        // server melewatkan baris yang baru diketuk dan baris itu muncul lagi.
        if (pendingMarkRead.size > 0) {
          await Promise.allSettled([...pendingMarkRead]);
        }
        const snapshot = get().notifications;
        // Hapus notifikasi yang sudah dibaca (lokal)
        set((state) => ({
          notifications: state.notifications.filter((n) => !n.isRead),
        }));
        // Sync hapus permanen notifikasi terbaca di backend.
        // WS-2: dulu .catch(()=>{}) — gagal diam-diam, lalu fetch
        // berikutnya mengembalikan semuanya. Sekarang gagal = kembalikan
        // daftar lokal + lempar supaya layar bisa menampilkan error.
        try {
          await api.delete('/api/notifications?clearRead=true');
        } catch (e) {
          set({ notifications: snapshot });
          throw e;
        }
      },

      // WS-2: dulu clearAll menghapus SEMUA notifikasi lokal tapi ke server
      // hanya memanggil DELETE ?clearRead=true — baris yang BELUM dibaca
      // tidak ikut terhapus di server, jadi muncul lagi saat login /
      // fetch berikutnya (mis. setelah logout, notifikasi pemilik lama
      // muncul lagi untuk login berikutnya). Sekarang: tandai semua dibaca
      // dulu di server, baru hapus yang terbaca. Dipakai saat logout —
      // kalau server gagal, lokal tetap kosong (pengguna berikutnya tidak
      // boleh melihat notifikasi pemilik sebelumnya) dan error hanya dicatat.
      clearAll: async () => {
        set({ notifications: [] });
        try {
          await api.patch('/api/notifications', { readAll: true });
          await api.delete('/api/notifications?clearRead=true');
        } catch (e) {
          console.warn('[NotifCenter] clearAll: hapus server gagal, baris belum-dibaca bisa muncul lagi saat fetch berikutnya:', e);
          throw e;
        }
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
              .map((item: any) => {
                // WS-2: normalisasi data + sanitasi body + dedupKey turunan.
                // params dari server bisa berupa objek (kolom Json Prisma)
                // atau string JSON; body bisa berisi JSON mentah dari
                // build lama — JANGAN PERNAH tampilkan JSON mentah.
                const data = normalizeNotificationData({
                  screen: item.screen,
                  params: item.params,
                  type: item.type,
                });
                return {
                  id: item.id,
                  title: item.title,
                  body: humanizeNotificationBody(item.body, data),
                  date: item.createdAt,
                  isRead: item.isRead,
                  // FIX (Nov 2026): dedupKey dulu DIBUANG saat mapping — salinan
                  // lokal dari kejadian yang sama (mis. push `sale-<id>`) tidak
                  // bisa dikenali sebagai duplikat baris server. Sekarang
                  // dipertahankan supaya dedup lintas jalur (push vs polling
                  // vs server) jalan.
                  // WS-2: kolom `dedupKey` belum ada di tabel Notification
                  // backend (Nov 2026), jadi nilainya undefined sampai backend
                  // menambah kolom itu — mapping ini tetap aman (forward-compatible).
                  // Sementara itu dedupKey DITURUNKAN dari params.saleId/doId/
                  // productId (lihat deriveDedupKey): salinan bersih dan
                  // salinan JSON-mentah dari penjualan yang sama akhirnya
                  // punya kunci yang sama dan hanya satu yang tampil.
                  dedupKey: deriveDedupKey(data, item.dedupKey ?? undefined),
                  data,
                };
              })
              // WS-2: dedup antar baris SERVER sendiri — dulu tidak ada.
              // Kalau DB punya 2 baris untuk penjualan yang sama (mis. satu
              // bersih + satu JSON mentah, yang lolos dari guard 5 menit
              // backend karena judul+isinya berbeda), keduanya tampil.
              // Simpan yang terbaru per dedupKey; tanpa dedupKey, pakai
              // judul+isi sebagai kunci.
              // FIX tsc (26 Nov 2026, TS7006): rantai di atas berawal dari
              // `res.data` (any dari axios), jadi hasil .map() juga `any`
              // dan callback .filter() ini tidak mendapat tipe kontekstual —
              // parameternya jadi implicit any. Dianotasi eksplisit sebagai
              // AppNotification (bentuk objek hasil .map() sudah sama, dan
              // `remoteItems` di bawah memang dideklarasi AppNotification[]).
              .filter((item: AppNotification, index: number, arr: AppNotification[]) => {
                const key = item.dedupKey ?? `${item.title}||${item.body}`;
                return arr.findIndex((n: AppNotification) => (n.dedupKey ?? `${n.title}||${n.body}`) === key) === index;
              });

            // Merge dengan notifikasi lokal: dedup by ID, LALU by dedupKey,
            // LALU by judul+isi — salinan lokal (ID acak) dari kejadian yang
            // sama dengan baris server harus dibuang, dulu keduanya tampil berdua.
            const local = get().notifications.filter((n) => (now - new Date(n.date).getTime()) < THREE_DAYS_MS);
            const existingIds = new Set(remoteItems.map((n) => n.id));
            const remoteDedupKeys = new Set(remoteItems.map((n) => n.dedupKey).filter(Boolean));
            const remoteKeys = new Set(remoteItems.map((n) => `${n.title}||${n.body}`));
            const merged = [...remoteItems, ...local.filter((n) => !existingIds.has(n.id) && !(n.dedupKey && remoteDedupKeys.has(n.dedupKey)) && !remoteKeys.has(`${n.title}||${n.body}`))];

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

