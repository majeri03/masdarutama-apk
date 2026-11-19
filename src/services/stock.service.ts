/**
 * Stock Service - Stock movements and adjustments (Stock Opname)
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse } from '../types';

export interface StockAdjustmentPayload {
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  notes: string;
  referenceType?: string;
  referenceId?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  product: {
    id: string;
    code: string;
    name: string;
    barcode: string | null;
    currentStock: number;
    productUnits?: {
      id: string;
      isPrimary: boolean;
      unit: {
        name: string;
      };
    }[];
  };
}

export interface StockMovementListResponse {
  movements: StockMovement[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const stockService = {
  /**
   * Get stock movements history with filters.
   */
  async getStockMovements(filters: {
    search?: string;
    productId?: string;
    type?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<StockMovement[] | StockMovementListResponse>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      const response = await api.get<ApiResponse<any>>(
        `/api/stocks?${params.toString()}`
      );
      
      // Normalize response data if backend returns array or paginated structure
      if (response.data.success && response.data.data) {
        const rawData = response.data.data;
        if (Array.isArray(rawData)) {
          // QA fix M-26: sama seperti produk — route backend membuang
          // `pagination` dari action (`successResponse(result.data)`),
          // jadi layar hanya pernah melihat halaman pertama (15 item).
          // Sintesis seperti di product.service: halaman penuh berarti
          // mungkin masih ada halaman berikut.
          const pageNum = filters.page || 1;
          const limitNum = filters.limit || 15;
          return {
            success: true,
            data: {
              movements: rawData,
              pagination: {
                total: rawData.length,
                page: pageNum,
                limit: limitNum,
                totalPages: rawData.length < limitNum ? pageNum : pageNum + 1,
              },
            } as StockMovementListResponse,
          };
        }
        // Bentuk { movements, pagination } — teruskan apa adanya.
        if ((rawData as any).movements) {
          return {
            success: true,
            data: rawData as StockMovementListResponse,
          };
        }
      }

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal memuat riwayat pergerakan stok',
      };
    }
  },

  /**
   * Create a new stock adjustment (Stock Opname).
   */
  async createAdjustment(payload: StockAdjustmentPayload): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>('/api/stocks', payload);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal melakukan penyesuaian stok',
      };
    }
  },
};
