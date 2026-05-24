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
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.supplierId) params.append('supplierId', filters.supplierId);
      if (filters.status) params.append('status', filters.status);

      const url = `${API_ENDPOINTS.PURCHASES}?${params.toString()}`;
      const response = await api.get<ApiResponse<any[]>>(url);
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
