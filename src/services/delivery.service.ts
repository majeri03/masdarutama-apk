import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse } from '../types';

export interface DeliveryItemPayload {
  productId: string;
  unitId: string;
  quantity: number;
  notes?: string;
}

export interface CreateDeliveryPayload {
  customerId: string;
  saleId?: string;
  deliveryDate: string;
  driver?: string;
  vehicle?: string;
  notes?: string;
  items: DeliveryItemPayload[];
}

export interface UpdateDeliveryStatusPayload {
  id: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  receivedBy?: string;
  receivedDate?: string;
}

export const deliveryService = {
  async getDeliveryOrders(filters: {
    search?: string;
    customerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.customerId) params.append('customerId', filters.customerId);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const url = `${API_ENDPOINTS.DELIVERY_ORDERS}?${params.toString()}`;
      const response = await api.get<ApiResponse<any[]>>(url);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat surat jalan' };
    }
  },

  async getDeliveryOrderById(id: string): Promise<ApiResponse<any>> {
    try {
      const response = await api.get<ApiResponse<any>>(API_ENDPOINTS.DELIVERY_ORDER_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail surat jalan' };
    }
  },

  async createDeliveryOrder(payload: CreateDeliveryPayload): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>(API_ENDPOINTS.DELIVERY_ORDERS, payload);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat surat jalan' };
    }
  },

  async updateDeliveryStatus(payload: UpdateDeliveryStatusPayload): Promise<ApiResponse<any>> {
    try {
      const { id, ...body } = payload;
      const response = await api.put<ApiResponse<any>>(API_ENDPOINTS.DELIVERY_ORDER_DETAIL(id), body);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memperbarui status pengiriman' };
    }
  },

  async deleteDeliveryOrder(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(API_ENDPOINTS.DELIVERY_ORDER_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus surat jalan' };
    }
  },
};
