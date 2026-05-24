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
          return {
            success: true,
            data: rawData,
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
