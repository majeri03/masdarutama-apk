/**
 * API Configuration Constants
 * Change API_BASE_URL to your backend server address
 */

// Development: use your local network IP or ngrok URL
// Production: use your deployed domain
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://masdarutama.tech';

export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_SESSION: '/api/auth/session',
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

  // WA Orders
  WA_ORDERS: '/api/wa-orders',
  WA_ORDER_CONFIRM: (id: string) => `/api/wa-orders/${id}/confirm`,
  WA_ORDER_REJECT: (id: string) => `/api/wa-orders/${id}/reject`,

  // Settings
  STORE_SETTINGS: '/api/settings',
} as const;

export const SECURE_STORE_KEYS = {
  AUTH_COOKIE: 'auth_session_cookie',
  USER_DATA: 'user_data',
  CSRF_TOKEN: 'csrf_token',
} as const;
