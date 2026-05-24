import { create } from 'zustand';

export type LayoutType = 'STRUK_KECIL' | 'INVOICE_BESAR' | 'SURAT_JALAN';

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
};

export const useInvoiceLayoutStore = create<InvoiceLayoutState>((set) => ({
  ...DEFAULT_STATE,
  updateLayout: (layout) => set((state) => ({ ...state, ...layout })),
  resetLayout: () => set(DEFAULT_STATE),
}));
