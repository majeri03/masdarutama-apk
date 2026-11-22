import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import { toDayStartISO, toDayEndISO } from '../utils/dates';
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
  proofImage?: string;
  items: DeliveryItemPayload[];
}

export interface UpdateDeliveryStatusPayload {
  id: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  receivedBy?: string;
  receivedDate?: string;
  notes?: string;
  proofImage?: string;
}

export interface UpdateDeliveryOrderPayload {
  id: string;
  driver?: string;
  vehicle?: string;
  deliveryDate?: string;
  notes?: string;
  status?: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  receivedBy?: string;
  receivedDate?: string;
  proofImage?: string;
}

export const deliveryService = {
  async getDeliveryOrders(filters: {
    search?: string;
    customerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    /** @deprecated pakai dateFrom — dipertahankan supaya pemanggil lama tidak rusak */
    startDate?: string;
    /** @deprecated pakai dateTo — dipertahankan supaya pemanggil lama tidak rusak */
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.customerId) params.append('customerId', filters.customerId);
      if (filters.status) params.append('status', filters.status);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      // QA fix M-33: backend hanya membaca `dateFrom`/`dateTo`
      // (parseSearchParams), jadi `startDate`/`endDate` selama ini diam-diam
      // dibuang dan filter tanggal pengiriman tidak pernah jalan.
      const dateFrom = filters.dateFrom ?? filters.startDate;
      const dateTo = filters.dateTo ?? filters.endDate;
      if (dateFrom) params.append('dateFrom', toDayStartISO(dateFrom));
      if (dateTo) params.append('dateTo', toDayEndISO(dateTo));

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

  async updateDeliveryOrder(payload: UpdateDeliveryOrderPayload): Promise<ApiResponse<any>> {
    try {
      const { id, ...body } = payload;
      const response = await api.patch<ApiResponse<any>>(API_ENDPOINTS.DELIVERY_ORDER_DETAIL(id), body);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengubah data surat jalan' };
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

  async getDeliveryPhotos(deliveryOrderId: string): Promise<ApiResponse<{ photos: any[]; totalCount: number; totalSizeBytes: number }>> {
    try {
      const response = await api.get<ApiResponse<any>>(`/api/delivery-orders/${deliveryOrderId}/photos`);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat foto surat jalan' };
    }
  },

  async addDeliveryPhoto(
    deliveryOrderId: string,
    photoData: { url: string; filename: string; sizeBytes?: number; mimeType?: string }
  ): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>(`/api/delivery-orders/${deliveryOrderId}/photos`, photoData);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menyimpan foto' };
    }
  },

  async deleteDeliveryPhoto(deliveryOrderId: string, photoId: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(
        `/api/delivery-orders/${deliveryOrderId}/photos?photoId=${encodeURIComponent(photoId)}`
      );
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus foto' };
    }
  },
};
