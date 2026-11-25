/**
 * TypeScript interfaces mirroring the Prisma schema for mobile app.
 * All Decimal fields are serialized as `number` from the API.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'KASIR';
export type CustomerType = 'REGULER' | 'GROSIR' | 'PROYEK' | 'UMUM';
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CREDIT' | 'DEBIT_CARD' | 'QRIS';
export type SaleStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'RETURN';
export type PurchaseStatus = 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
export type DebtStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
export type CashType = 'IN' | 'OUT';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  // Kode mesin dari backend (mis. "unverified" dari POST /api/auth/login
  // kalau password benar tapi akun belum terverifikasi — 24 Nov 2026,
  // APK OTP). Dipakai UI untuk memilih pesan/tombol yang tepat.
  code?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface SessionResponse {
  user: AuthUser;
  isAuthenticated: boolean;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  subCategories?: SubCategory[];
  _count?: { products: number };
}

export interface SubCategory {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUnit {
  id: string;
  productId: string;
  unitId: string;
  conversionValue: number;
  buyPrice: number;
  sellPrice: number;
  isPrimary: boolean;
  unit: Unit;
}

export interface ProductImage {
  id: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  subCategoryId: string | null;
  supplierId: string | null;
  minStock: number;
  currentStock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string };
  subCategory?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  productUnits: ProductUnit[];
  productImages: ProductImage[];
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  type: CustomerType;
  isActive: boolean;
  // Poin loyalitas (PKG-D, perbaikan 7 item #6) — diisi backend setelah
  // PKG-A di-deploy; opsional supaya data lama tanpa field ini tetap jalan.
  points?: number;
  // Total belanja lunas (WS-8, 25 Nov 2026) — dikirim backend (getCustomers):
  // jumlah grandTotal penjualan COMPLETED bukan CREDIT. Opsional supaya
  // data lama tanpa field ini tetap jalan.
  totalBelanja?: number;
  createdAt: string;
  updatedAt: string;
}

// Salesman (PKG-D, perbaikan 7 item #5) — dikelola di Pengaturan web
// (tab "Sales & Poin", SUPER_ADMIN) dan dipilih per transaksi di POS.
export interface Salesman {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  // Jumlah transaksi yang mencatat salesman ini (dikirim backend).
  salesCount?: number;
  // Total penjualan & total fee (WS-8, 25 Nov 2026) — dikirim backend
  // (getSalesmen), dihitung server dengan rumus yang sama seperti detail.
  // Opsional supaya data lama tanpa field ini tetap jalan.
  totalSales?: number;
  totalFee?: number;
  createdAt: string;
  updatedAt: string;
}

// Fee salesman (24 Nov 2026, APK fee) — sama dengan tipe web
// (SalesmanFeeSetting / SalesmanDetail di salesman.actions.ts).
// Angka fee dihitung di SERVER (GET /api/salesmen/[id]/detail), APK
// hanya menampilkan — jadi total APK = total web. Aturan: fee global
// MATI = fee Rp0 semua invoice; fee = floor(grandTotal x persen / 100).
export interface SalesmanFeeSetting {
  enabled: boolean;
  percent: number;
}

export interface SalesmanDetailSaleRow {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  customerName: string;
  grandTotal: number;
  status: string;
  feeEnabledOverride: boolean | null;
  feePercentOverride: number | null;
  feeEnabled: boolean;
  feePercent: number;
  feeAmount: number;
}

export interface SalesmanDetail {
  salesman: { id: string; name: string; phone: string | null; isActive: boolean };
  feeSetting: SalesmanFeeSetting;
  sales: SalesmanDetailSaleRow[];
  totalSales: number;
  totalFee: number;
  salesCount: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  productUnitId: string;
  unitId: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  originalPrice: number;
  availableUnits: {
    id: string;
    unitId: string;
    unitName: string;
    conversionFactor: number;
    price: number;
    isBase: boolean;
  }[];
}

export interface CartCalculation {
  subtotal: number;
  itemDiscount: number;
  totalDiscount: number;
  customerDiscount: number;
  tax: number;
  grandTotal: number;
}

export interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  product: { id: string; code: string; name: string };
  unit: { id: string; name: string; symbol: string | null };
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  cashierId: string;
  // Salesman yang menangani transaksi ini (PKG-D, perbaikan 7 item #5) —
  // tercatat internal saja, TIDAK PERNAH dicetak di invoice/struk/surat jalan.
  salesmanId?: string | null;
  salesman?: { id: string; name: string } | null;
  saleDate: string;
  totalAmount: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;
  notes: string | null;
  status: SaleStatus;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    type: string;
    phone: string | null;
    address: string | null;
  } | null;
  cashier: { id: string; name: string; email: string };
  saleItems: SaleItem[];
}

export interface PurchaseItem {
  id?: string;
  productId: string;
  product?: { id: string; code: string; name: string };
  unitId: string;
  unit?: { id: string; name: string };
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  poNumber: string;
  purchaseDate: string;
  totalAmount: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  status: PurchaseStatus;
  receivedDate: string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  admin: { id: string; name: string; email: string };
  purchaseItems: PurchaseItem[];
}

export interface DebtPayment {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  admin?: { id: string; name: string };
}

export interface CustomerDebt {
  id: string;
  debtNumber: string;
  saleId: string;
  customerId: string;
  totalDebt: number;
  paidAmount: number;
  remainingDebt: number;
  dueDate: string;
  status: DebtStatus;
  createdAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
  };
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: string;
    grandTotal: number;
  };
  payments: DebtPayment[];
}

export interface SupplierDebt {
  id: string;
  debtNumber: string;
  purchaseId: string;
  supplierId: string;
  totalDebt: number;
  paidAmount: number;
  remainingDebt: number;
  dueDate: string;
  status: DebtStatus;
  notes: string | null;
  createdAt: string;
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
  };
  purchase: {
    id: string;
    poNumber: string;
    purchaseDate: string;
    grandTotal: number;
  };
  payments: DebtPayment[];
}

export interface DeliveryItem {
  id: string;
  productId: string;
  unitId: string;
  quantity: number;
  notes: string | null;
  product: { id: string; name: string; code: string };
  unit: { id: string; name: string; symbol: string | null };
}

export interface DeliveryOrder {
  id: string;
  doNumber: string;
  customerId: string;
  saleId: string | null;
  deliveryDate: string;
  driver: string | null;
  vehicle: string | null;
  notes: string | null;
  status: DeliveryStatus;
  receivedBy: string | null;
  receivedDate: string | null;
  proofImage?: string | null;
  createdAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  createdBy: { id: string; name: string };
  deliveryItems: DeliveryItem[];
  sale?: { id: string; invoiceNumber: string } | null;
}

export interface FinancialReport {
  totalRevenue: number;
  totalProfit: number;
  totalTransactions: number;
  averageTransaction: number;
  totalCustomerDebt?: number;
  salesByDate: { date: string; total: number; count: number }[];
  salesByPayment: { method: PaymentMethod; total: number; count: number }[];
}

export interface InventoryReport {
  totalProducts: number;
  totalStockValue: number;
  lowStockProducts: Product[];
  outOfStockProducts: Product[];
}

export interface StoreSetting {
  id: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  // Poin loyalitas (24 Nov 2026, halaman Poin) — dikirim backend
  // (GET /api/settings); opsional supaya data lama tetap jalan.
  pointsEnabled?: boolean;
  pointsRupiahPerPoint?: number;
}
