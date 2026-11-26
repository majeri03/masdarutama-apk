/**
 * Tombol Cepat (Quick Actions) — WS-4, 25 Nov 2026.
 *
 * Katalog fitur yang bisa dipilih user di Dashboard + penyimpanan pilihan
 * per user di AsyncStorage. Daftar fitur di bawah HANYA berisi layar yang
 * benar-benar terdaftar sebagai route di App.tsx (Tab "Main" atau Stack
 * root) — jadi setiap tombol yang ditambahkan pasti punya layar tujuan.
 *
 * Yang SENGAJA tidak ada di katalog:
 * - "Kas" — tidak ada layar Kas sendiri di APK (kas ada di dalam POS /
 *   Laporan). "Supplier" — tidak ada layar Supplier sendiri (data supplier
 *   ada di dalam Purchase Order & Produk).
 * - EditTransaction — butuh parameter (id transaksi) jadi tidak bisa dibuka
 *   dari tombol cepat. Login / VerifyOtp — layar auth, bukan fitur.
 * - Dashboard sendiri — tombol cepat sudah ada di Dashboard.
 *
 * Gating peran memakai aturan yang SUDAH ADA di APK (sama seperti
 * SidebarDrawer + App.tsx): SUPER_ADMIN boleh semua; pageKey dicek ke
 * allowedPages dari GET /api/page-access; minRole dicek ke hierarki
 * SUPER_ADMIN 3 > ADMIN 2 > KASIR 1 (hasMinRole di auth.store).
 * Fitur yang tidak boleh diakses peran itu TIDAK MUNCUL di pemilih dan
 * otomatis dibuang dari simpanan kalau aksesnya dicabut.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import type { Role } from '../types';

export type QuickActionTarget = 'tab' | 'stack';

export interface QuickActionDef {
  /** Id stabil yang disimpan di AsyncStorage (jangan diubah setelah rilis). */
  id: string;
  label: string;
  desc: string;
  /** Nama ikon Ionicons. */
  icon: string;
  iconBg: string;
  iconColor: string;
  /** Nama route persis seperti di App.tsx. */
  route: string;
  /** 'tab' = tab di MainTabNavigator, 'stack' = layar Stack root. */
  target: QuickActionTarget;
  /** Kunci matriks akses halaman (auth.store / GET /api/page-access). */
  pageKey?: string;
  /** Peran minimum (dipakai Salesman & Poin, sama seperti SidebarDrawer). */
  minRole?: Role;
}

/**
 * Katalog lengkap. Urutan di sini = urutan tampil di pemilih fitur.
 * Ikon/warna mengikuti gaya kartu yang sudah ada di Dashboard.
 */
export const QUICK_ACTION_CATALOG: QuickActionDef[] = [
  // ── Tab utama ──────────────────────────────────────────────────────
  {
    id: 'pos',
    label: 'Buat Transaksi',
    desc: 'Point of Sale POS',
    icon: 'calculator-outline',
    iconBg: Colors.successLight,
    iconColor: Colors.success,
    route: 'POS',
    target: 'tab',
    pageKey: 'pos',
  },
  {
    id: 'products',
    label: 'Daftar Produk',
    desc: 'Cari & cek stok',
    icon: 'cube-outline',
    iconBg: Colors.infoLight,
    iconColor: Colors.info,
    route: 'Products',
    target: 'tab',
  },
  {
    id: 'history',
    label: 'Riwayat Transaksi',
    desc: 'Laporan penjualan',
    icon: 'receipt-outline',
    iconBg: Colors.primaryStart + '18',
    iconColor: Colors.primaryStart,
    route: 'History',
    target: 'tab',
  },
  {
    id: 'reports',
    label: 'Laporan Keuangan',
    desc: 'Omzet, laba & arus kas',
    icon: 'bar-chart-outline',
    iconBg: Colors.primaryStart + '18',
    iconColor: Colors.primaryStart,
    route: 'Reports',
    target: 'tab',
    pageKey: 'reports_settings',
  },
  {
    id: 'settings',
    label: 'Pengaturan',
    desc: 'Pengaturan toko & akun',
    icon: 'settings-outline',
    iconBg: Colors.textTertiary + '18',
    iconColor: Colors.textSecondary,
    route: 'Settings',
    target: 'tab',
    pageKey: 'reports_settings',
  },
  // ── Layar Stack ────────────────────────────────────────────────────
  {
    id: 'stock-opname',
    label: 'Stock Opname',
    desc: 'Penyesuaian stok',
    icon: 'clipboard-outline',
    iconBg: Colors.warningLight,
    iconColor: Colors.warning,
    route: 'StockOpname',
    target: 'stack',
    pageKey: 'stock_opname',
  },
  {
    id: 'delivery',
    label: 'Surat Jalan & Pengiriman',
    desc: 'Kirim barang ke pelanggan',
    icon: 'paper-plane-outline',
    iconBg: Colors.infoLight,
    iconColor: Colors.info,
    route: 'Delivery',
    target: 'stack',
  },
  {
    id: 'purchase',
    label: 'Purchase Order (PO)',
    desc: 'Beli stok dari supplier',
    icon: 'cart-outline',
    iconBg: Colors.warningLight,
    iconColor: Colors.warning,
    route: 'Purchase',
    target: 'stack',
    pageKey: 'po',
  },
  {
    id: 'debt',
    label: 'Utang & Piutang',
    desc: 'Tagihan pelanggan & supplier',
    icon: 'journal-outline',
    iconBg: Colors.errorLight,
    iconColor: Colors.error,
    route: 'Debt',
    target: 'stack',
  },
  {
    id: 'customers',
    label: 'Pelanggan',
    desc: 'Data & poin pelanggan',
    icon: 'people-outline',
    iconBg: Colors.primaryStart + '18',
    iconColor: Colors.primaryStart,
    route: 'Customers',
    target: 'stack',
  },
  {
    id: 'fleet-tracking',
    label: 'Tracking Armada',
    desc: 'Live GPS & peta rute',
    icon: 'car-outline',
    iconBg: Colors.primaryStart + '18',  // WS-7: merah merek, dulu biru #2563EB18
    iconColor: Colors.primaryStart,
    route: 'FleetTracking',
    target: 'stack',
    pageKey: 'fleet_tracking',
  },
  {
    id: 'salesmen',
    label: 'Salesman',
    desc: 'Data salesman toko',
    icon: 'briefcase-outline',
    iconBg: Colors.successLight,
    iconColor: Colors.success,
    route: 'Salesmen',
    target: 'stack',
    minRole: 'KASIR',
  },
  {
    id: 'points',
    label: 'Poin Loyalitas',
    desc: 'Poin & reward pelanggan',
    icon: 'star-outline',
    iconBg: Colors.warningLight,
    iconColor: Colors.warning,
    route: 'Points',
    target: 'stack',
    minRole: 'KASIR',
  },
  {
    id: 'invoice-layout',
    label: 'Desain Invoice',
    desc: 'Layout struk & faktur',
    icon: 'color-palette-outline',
    iconBg: Colors.primaryStart + '18',  // WS-7: merah merek, dulu pink #DB277718
    iconColor: Colors.primaryStart,  // WS-7: merah merek, dulu pink #DB2777
    route: 'InvoiceLayout',
    target: 'stack',
    pageKey: 'invoice_layout',
  },
  {
    id: 'device-settings',
    label: 'Printer & Device',
    desc: 'Bluetooth & scanner',
    icon: 'print-outline',
    iconBg: '#05966918',
    iconColor: Colors.success,
    route: 'DeviceSettings',
    target: 'stack',
  },
  {
    id: 'notification-center',
    label: 'Notifikasi',
    desc: 'Semua pemberitahuan',
    icon: 'notifications-outline',
    iconBg: Colors.primaryStart + '18',
    iconColor: Colors.primaryStart,
    route: 'NotificationCenter',
    target: 'stack',
  },
  {
    id: 'app-update',
    label: 'Update Aplikasi',
    desc: 'Cek & unduh update APK',
    icon: 'download-outline',
    iconBg: Colors.infoLight,
    iconColor: Colors.info,
    route: 'AppUpdate',
    target: 'stack',
  },
  {
    id: 'storage-manager',
    label: 'Kelola Penyimpanan',
    desc: 'Statistik & bersih-bersih data',
    icon: 'folder-outline',
    iconBg: Colors.textTertiary + '18',
    iconColor: Colors.textSecondary,
    route: 'StorageManager',
    target: 'stack',
  },
];

export const QUICK_ACTION_MAP: Record<string, QuickActionDef> = Object.fromEntries(
  QUICK_ACTION_CATALOG.map((def) => [def.id, def]),
);

/**
 * Default = persis 6 tombol cepat yang sudah ada di Dashboard sebelum
 * patch ini, dengan urutan tampil yang sama.
 */
export const DEFAULT_QUICK_ACTION_IDS: string[] = [
  'pos',
  'products',
  'stock-opname',
  'history',
  'fleet-tracking',
  'device-settings',
];

/** Kunci AsyncStorage — per user, supaya HP yang dipakai bergantian
 *  (kasir berbeda) tidak saling menimpa pilihan tombol cepat. */
export const quickActionsStorageKey = (userId: string): string =>
  `masdar_quick_actions:${userId}`;

export interface QuickActionGate {
  role?: string;
  allowedPages: string[];
  hasMinRole: (role: Role) => boolean;
}

/** Apakah peran ini boleh memakai fitur ini? Aturan yang sama seperti
 *  SidebarDrawer (SUPER_ADMIN lolos semua) + App.tsx (tab POS /
 *  Laporan / Pengaturan dicek ke allowedPages). */
export const isQuickActionAllowed = (
  def: QuickActionDef,
  gate: QuickActionGate,
): boolean => {
  if ((gate.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
  if (def.minRole) return gate.hasMinRole(def.minRole);
  if (def.pageKey) return gate.allowedPages.includes(def.pageKey);
  return true;
};

/** Bersihkan daftar id simpanan: buang id yang tidak dikenal, buang yang
 *  tidak boleh diakses peran ini, buang duplikat (pakai kemunculan pertama). */
export const sanitizeQuickActionIds = (
  ids: unknown,
  gate: QuickActionGate,
): string[] => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const def = QUICK_ACTION_MAP[raw];
    if (!def || seen.has(raw)) continue;
    if (!isQuickActionAllowed(def, gate)) continue;
    seen.add(raw);
    clean.push(raw);
  }
  return clean;
};

/**
 * Muat pilihan tersimpan.
 * @returns null kalau user ini belum pernah mengatur (pakai default);
 *   array (bisa kosong = user sengaja menghapus semua tombol) kalau sudah.
 *   Data rusak / bukan array dianggap belum pernah mengatur (null).
 */
export const loadQuickActionIds = async (
  userId: string | null | undefined,
  gate: QuickActionGate,
): Promise<string[] | null> => {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(quickActionsStorageKey(userId));
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return sanitizeQuickActionIds(parsed, gate);
  } catch (e) {
    console.warn('[QUICK_ACTIONS] Gagal memuat tombol cepat:', e);
    return null;
  }
};

/** Simpan pilihan. Gagal simpan tidak boleh merusak Dashboard — hanya
 *  dicatat ke console, tampilan tetap memakai pilihan di memori. */
export const saveQuickActionIds = async (
  userId: string | null | undefined,
  ids: string[],
): Promise<void> => {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(
      quickActionsStorageKey(userId),
      JSON.stringify(ids),
    );
  } catch (e) {
    console.warn('[QUICK_ACTIONS] Gagal menyimpan tombol cepat:', e);
  }
};

/** Ubah daftar id menjadi definisi lengkap (yang masih diizinkan saja). */
export const resolveQuickActions = (
  ids: string[],
  gate: QuickActionGate,
): QuickActionDef[] =>
  sanitizeQuickActionIds(ids, gate)
    .map((id) => QUICK_ACTION_MAP[id])
    .filter((def): def is QuickActionDef => !!def);

/**
 * Pindah satu item dalam daftar (dipakai tombol ↑ / ↓ di mode edit).
 * Mengembalikan array baru; index di luar jangkauan dikembalikan apa adanya.
 */
export const moveQuickActionId = (
  ids: string[],
  index: number,
  direction: -1 | 1,
): string[] => {
  const target = index + direction;
  if (index < 0 || index >= ids.length) return ids;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
};

/**
 * Navigasi dari Dashboard. Dashboard ada di dalam MainTabNavigator, jadi
 * route tab (POS / Products / History / Reports / Settings) maupun route
 * Stack root (StockOpname, Delivery, ...) sama-sama bisa dibuka dengan
 * navigation.navigate(route) — persis seperti 6 tombol lama di Dashboard.
 * Semua route di katalog sudah diverifikasi terdaftar di App.tsx.
 */
export const navigateToQuickAction = (
  navigation: { navigate: (route: string) => void },
  def: QuickActionDef,
): void => {
  try {
    navigation.navigate(def.route);
  } catch (e) {
    console.warn('[QUICK_ACTIONS] Gagal membuka', def.route, e);
  }
};
