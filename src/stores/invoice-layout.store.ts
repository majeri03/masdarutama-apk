import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LayoutType = 'STRUK_KECIL' | 'INVOICE_BESAR' | 'SURAT_JALAN' | 'FAKTUR_NCR';

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

  // Actions
  updateLayout: (layout: Partial<Omit<InvoiceLayoutState, 'updateLayout' | 'resetLayout'>>) => void;
  resetLayout: () => void;
}

const DEFAULT_STATE = {
  layoutType: 'INVOICE_BESAR' as LayoutType,
  showHeader: true,
  showLogo: true,
  showCustomerInfo: true,
  showPaymentInfo: true,
  showSignature: true,
  showFooter: true,
  bankName: 'BRI',
  bankAccount: '4055505757',
  bankHolder: 'TB MASDAR UTAMA',
  footerTerms: 'BARANG YANG SUDAH DIBELI TIDAK DAPAT DITUKAR/DIKEMBALIKAN KECUALI ADA PERJANJIAN.',
  fontSizeScale: 1.0,
  paperSize: '58mm',
  invoicePaperSize: 'A4',
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
      }),
    }
  )
);
