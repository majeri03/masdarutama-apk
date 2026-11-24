/**
 * API Configuration Constants
 * Change API_BASE_URL to your backend server address
 */

// Development: use your local network IP or ngrok URL
// Production: use your deployed domain
// PKG-J (23 Nov 2026, migrasi domain): domain lama masdarutama.tech
// (gratisan, mau expired) diganti domain baru tbmasdarutama.vercel.app.
// Nilai ini hanya fallback — saat EAS build, EXPO_PUBLIC_API_URL dari
// eas.json (preview/production) yang dipakai. .env lokal juga harus
// diganti (EXPO_PUBLIC_API_URL), lihat README.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tbmasdarutama.vercel.app';

export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  // Verifikasi OTP email (24 Nov 2026, APK OTP) — route REST publik di
  // atas server action web (patch backend-apk-routes). Dipakai SEBELUM
  // login, jadi tanpa token: kode 6 digit, hash SHA-256, 15 menit,
  // maks 5x salah, rate limit — sama seperti halaman web /verify-email.
  AUTH_VERIFY_EMAIL: '/api/auth/verify-email',
  AUTH_RESEND_OTP: '/api/auth/resend-otp',
  AUTH_SESSION: '/api/auth/session-check', // JANGAN pakai '/api/auth/session' — path itu milik endpoint session bawaan NextAuth (lihat pkg-g)
  AUTH_LOGOUT: '/api/auth/callback/credentials', // NextAuth signout

  // Products
  PRODUCTS: '/api/products',
  PRODUCT_DETAIL: (id: string) => `/api/products/${id}`,

  // Categories
  CATEGORIES: '/api/categories',
  CATEGORY_DETAIL: (id: string) => `/api/categories/${id}`,

  // Units
  UNITS: '/api/units',
  UNIT_DETAIL: (id: string) => `/api/units/${id}`,

  // Customers
  CUSTOMERS: '/api/customers',
  CUSTOMER_DETAIL: (id: string) => `/api/customers/${id}`,

  // Suppliers
  SUPPLIERS: '/api/suppliers',
  SUPPLIER_DETAIL: (id: string) => `/api/suppliers/${id}`,

  // Sales (POS)
  SALES: '/api/sales',
  SALE_DETAIL: (id: string) => `/api/sales/${id}`,

  // Salesmen (24 Nov 2026, pisah Sales & Poin) — GET: KASIR+,
  // POST/PUT/DELETE: SUPER_ADMIN (dicek backend).
  SALESMEN: '/api/salesmen',
  SALESMAN_DETAIL: (id: string) => `/api/salesmen/${id}`,

  // Fee salesman (24 Nov 2026, APK fee) — route REST tipis di atas server
  // action web (patch backend-apk-routes). Detail: GET KASIR+; ubah
  // pengaturan global + override per invoice: SUPER_ADMIN saja.
  SALESMAN_FEE_SETTING: '/api/salesmen/fee-setting',
  SALESMAN_DETAIL_VIEW: (id: string) => `/api/salesmen/${id}/detail`,
  SALE_FEE: (id: string) => `/api/sales/${id}/fee`,

  // Poin loyalitas (24 Nov 2026) — penyesuaian manual, SUPER_ADMIN saja.
  CUSTOMER_POINTS: (id: string) => `/api/customers/${id}/points`,

  // Purchases
  PURCHASES: '/api/purchases',
  PURCHASE_DETAIL: (id: string) => `/api/purchases/${id}`,
  PURCHASE_RECEIVE: '/api/purchases/receive',

  // Delivery Orders
  DELIVERY_ORDERS: '/api/delivery-orders',
  DELIVERY_ORDER_DETAIL: (id: string) => `/api/delivery-orders/${id}`,

  // Debts
  CUSTOMER_DEBTS: '/api/debts/customers',
  SUPPLIER_DEBTS: '/api/debts/suppliers',
  DEBT_PAYMENTS: '/api/debts/payments',

  // Reports
  REPORT_FINANCIAL: '/api/reports/financial',
  REPORT_INVENTORY: '/api/reports/inventory',
  REPORT_DEBTS: '/api/reports/debts',

  // Settings
  STORE_SETTINGS: '/api/settings',
} as const;

export const SECURE_STORE_KEYS = {
  AUTH_COOKIE: 'auth_session_cookie',
  USER_DATA: 'user_data',
  CSRF_TOKEN: 'csrf_token',
} as const;
