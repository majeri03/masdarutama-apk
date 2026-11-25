import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LayoutType = 'STRUK_KECIL' | 'INVOICE_BESAR' | 'SURAT_JALAN' | 'FAKTUR_NCR';

export const LAYOUT_TYPES: LayoutType[] = ['STRUK_KECIL', 'INVOICE_BESAR', 'SURAT_JALAN', 'FAKTUR_NCR'];

/** Bentuk data pengaturan toko dari GET /api/settings (web). */
export interface ServerInvoiceSettings {
  invoiceLayoutType?: string | null;
  invoicePaperSize?: string | null;
  invoiceDocumentPaperSize?: string | null;
  invoiceShowHeader?: boolean | null;
  invoiceShowLogo?: boolean | null;
  invoiceShowCustomerInfo?: boolean | null;
  invoiceShowPaymentInfo?: boolean | null;
  invoiceShowSignature?: boolean | null;
  invoiceShowFooter?: boolean | null;
  invoiceFooterTerms?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
}

/** Payload PUT /api/settings untuk mendorong layout APK ke web. */
export const toServerInvoiceSettings = (s: InvoiceLayoutState): ServerInvoiceSettings => ({
  invoiceLayoutType: s.layoutType,
  invoicePaperSize: s.paperSize,
  invoiceDocumentPaperSize: s.invoicePaperSize,
  invoiceShowHeader: s.showHeader,
  invoiceShowLogo: s.showLogo,
  invoiceShowCustomerInfo: s.showCustomerInfo,
  invoiceShowPaymentInfo: s.showPaymentInfo,
  invoiceShowSignature: s.showSignature,
  invoiceShowFooter: s.showFooter,
  invoiceFooterTerms: s.footerTerms,
  bankName: s.bankName,
  bankAccount: s.bankAccount,
  bankHolder: s.bankHolder,
});

export interface InvoiceLayoutState {
  layoutType: LayoutType;
  showHeader: boolean;
  showLogo: boolean;
  showCustomerInfo: boolean;
  showPaymentInfo: boolean;
  showSignature: boolean;
  showFooter: boolean;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  footerTerms: string;
  fontSizeScale: number;
  paperSize: string;
  invoicePaperSize: string;
  /** Waktu (ms) terakhir layout berhasil disinkron dari server; null = belum pernah. */
  serverSyncedAt: number | null;

  // Actions
  updateLayout: (layout: Partial<Omit<InvoiceLayoutState, 'updateLayout' | 'resetLayout' | 'syncFromServer'>>) => void;
  resetLayout: () => void;
  /**
   * WS-6: tarik pengaturan layout + rekening dari server (GET /api/settings,
   * sumber yang sama dengan web) ke store lokal. Web adalah sumber kebenaran:
   * nilai server yang ada (termasuk string kosong = "belum diisi") menimpa
   * nilai lokal, supaya invoice APK sama dengan web. fontSizeScale tidak
   * ada di web, jadi tetap lokal dan tidak disentuh di sini.
   */
  syncFromServer: (settings: ServerInvoiceSettings | null | undefined) => void;
}

const DEFAULT_STATE = {
  layoutType: 'INVOICE_BESAR' as LayoutType,
  showHeader: true,
  showLogo: true,
  showCustomerInfo: true,
  showPaymentInfo: true,
  showSignature: true,
  showFooter: true,
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  footerTerms: 'BARANG YANG SUDAH DIBELI TIDAK DAPAT DITUKAR/DIKEMBALIKAN KECUALI ADA PERJANJIAN.',
  fontSizeScale: 1.0,
  paperSize: '58mm',
  invoicePaperSize: 'A4',
  serverSyncedAt: null as number | null,
};

// FIX (24 Nov 2026): store ini sebelumnya tanpa persist — semua pengaturan
// layout invoice hanya hidup di memori dan hilang tiap aplikasi ditutup,
// padahal layar InvoiceLayoutScreen menampilkan tombol "Simpan".
// Pola persist yang sama dengan notification.store.ts.
export const useInvoiceLayoutStore = create<InvoiceLayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      updateLayout: (layout) => set((state) => ({ ...state, ...layout })),
      resetLayout: () => set(DEFAULT_STATE),
      syncFromServer: (settings) => {
        if (!settings) return;
        set((state) => {
          const next: Partial<InvoiceLayoutState> = { serverSyncedAt: Date.now() };
          // Tipe layout: hanya terima 4 nilai yang dikenal web/APK.
          if (typeof settings.invoiceLayoutType === 'string' && (LAYOUT_TYPES as string[]).includes(settings.invoiceLayoutType)) {
            next.layoutType = settings.invoiceLayoutType as LayoutType;
          }
          if (typeof settings.invoicePaperSize === 'string' && settings.invoicePaperSize.trim()) {
            next.paperSize = settings.invoicePaperSize;
          }
          if (typeof settings.invoiceDocumentPaperSize === 'string' && settings.invoiceDocumentPaperSize.trim()) {
            next.invoicePaperSize = settings.invoiceDocumentPaperSize;
          }
          if (typeof settings.invoiceShowHeader === 'boolean') next.showHeader = settings.invoiceShowHeader;
          if (typeof settings.invoiceShowLogo === 'boolean') next.showLogo = settings.invoiceShowLogo;
          if (typeof settings.invoiceShowCustomerInfo === 'boolean') next.showCustomerInfo = settings.invoiceShowCustomerInfo;
          if (typeof settings.invoiceShowPaymentInfo === 'boolean') next.showPaymentInfo = settings.invoiceShowPaymentInfo;
          if (typeof settings.invoiceShowSignature === 'boolean') next.showSignature = settings.invoiceShowSignature;
          if (typeof settings.invoiceShowFooter === 'boolean') next.showFooter = settings.invoiceShowFooter;
          if (typeof settings.invoiceFooterTerms === 'string') next.footerTerms = settings.invoiceFooterTerms;
          // Rekening: server adalah sumber kebenaran — string kosong berarti
          // "belum diisi" (blok rekening lalu disembunyikan), bukan data rekaan.
          // null dari DB = dikosongkan di web — samakan (jangan pertahankan
          // rekening lokal yang sudah dihapus di web).
          next.bankName = typeof settings.bankName === 'string' ? settings.bankName : settings.bankName === null ? '' : state.bankName;
          next.bankAccount = typeof settings.bankAccount === 'string' ? settings.bankAccount : settings.bankAccount === null ? '' : state.bankAccount;
          next.bankHolder = typeof settings.bankHolder === 'string' ? settings.bankHolder : settings.bankHolder === null ? '' : state.bankHolder;
          return { ...state, ...next };
        });
      },
    }),
    {
      name: 'invoice-layout-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        layoutType: state.layoutType,
        showHeader: state.showHeader,
        showLogo: state.showLogo,
        showCustomerInfo: state.showCustomerInfo,
        showPaymentInfo: state.showPaymentInfo,
        showSignature: state.showSignature,
        showFooter: state.showFooter,
        bankName: state.bankName,
        bankAccount: state.bankAccount,
        bankHolder: state.bankHolder,
        footerTerms: state.footerTerms,
        fontSizeScale: state.fontSizeScale,
        paperSize: state.paperSize,
        invoicePaperSize: state.invoicePaperSize,
        serverSyncedAt: state.serverSyncedAt,
      }),
    }
  )
);
