/**
 * Sales Service - POS checkout and sales history
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse, Sale, PaymentMethod } from '../types';

export interface CheckoutPayload {
  customerId: string; // wajib, tidak boleh null/undefined untuk schema backend
  items: {
    productId: string;
    productUnitId: string; // ← KRITIS: ID dari tabel ProductUnit (bukan unitId)
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;    // ← KRITIS: qty * unitPrice - itemDiscount
  }[];
  totalAmount: number;   // ← KRITIS: sum of all item subtotals
  discount: number;      // diskon keseluruhan (bukan per item)
  tax: number;
  grandTotal: number;    // ← KRITIS: totalAmount - discount + tax
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;  // ← KRITIS: paidAmount - grandTotal (min 0)
  notes?: string;
}

export interface SaleListResponse {
  sales: Sale[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const salesService = {
  async checkout(payload: CheckoutPayload): Promise<ApiResponse<Sale>> {
    try {
      const response = await api.post<ApiResponse<Sale>>(API_ENDPOINTS.SALES, payload);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal checkout transaksi' };
    }
  },

  async getSales(filters: {
    search?: string;
    customerId?: string;
    page?: number;
    limit?: number;
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<ApiResponse<SaleListResponse>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, String(value));
      });
      const response = await api.get<ApiResponse<SaleListResponse>>(
        `${API_ENDPOINTS.SALES}?${params.toString()}`
      );
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat riwayat penjualan' };
    }
  },

  async getSaleById(id: string): Promise<ApiResponse<Sale>> {
    try {
      const response = await api.get<ApiResponse<Sale>>(API_ENDPOINTS.SALE_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail penjualan' };
    }
  },
};
