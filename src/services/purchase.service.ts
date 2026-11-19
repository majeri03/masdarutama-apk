import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse } from '../types';

export interface PurchaseItemPayload {
  productId: string;
  unitId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface CreatePurchasePayload {
  supplierId: string;
  purchaseDate: string;
  discount: number;
  tax: number;
  paidAmount: number;
  paymentMethod?: string;
  notes?: string;
  items: PurchaseItemPayload[];
}

export const purchaseService = {
  async getPurchases(filters: {
    search?: string;
    supplierId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.supplierId) params.append('supplierId', filters.supplierId);
      if (filters.status) params.append('status', filters.status);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      const url = `${API_ENDPOINTS.PURCHASES}?${params.toString()}`;
      const response = await api.get<ApiResponse<any>>(url);

      // QA fix M-27: backend membuang `pagination` dari action
      // (`successResponse(result.data)`), jadi daftar PO hanya pernah
      // menampilkan 10 PO pertama. Sintesis seperti produk/stok:
      // halaman penuh berarti mungkin masih ada halaman berikut.
      // (Perbaikan permanen tetap di backend: teruskan pagination.)
      if (response.data.success && response.data.data) {
        const rawData = response.data.data;
        const list = Array.isArray(rawData) ? rawData : rawData?.purchases || rawData;
        const pageNum = filters.page || 1;
        const limitNum = filters.limit || 10;
        const pagination = response.data.pagination || (rawData as any)?.pagination || {
          total: Array.isArray(list) ? list.length : 0,
          page: pageNum,
          limit: limitNum,
          totalPages: Array.isArray(list) && list.length < limitNum ? pageNum : pageNum + 1,
        };
        return { ...response.data, data: list, pagination };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat PO barang' };
    }
  },

  async getPurchaseById(id: string): Promise<ApiResponse<any>> {
    try {
      const response = await api.get<ApiResponse<any>>(API_ENDPOINTS.PURCHASE_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail PO' };
    }
  },

  async createPurchase(payload: CreatePurchasePayload): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>(API_ENDPOINTS.PURCHASES, payload);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat Purchase Order' };
    }
  },

  async receivePurchase(id: string, receivedDate: string): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>(API_ENDPOINTS.PURCHASE_RECEIVE, { id, receivedDate });
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menerima barang PO' };
    }
  },

  async deletePurchase(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(API_ENDPOINTS.PURCHASE_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus PO' };
    }
  },
};
