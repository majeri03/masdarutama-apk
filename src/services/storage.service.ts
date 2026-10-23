import api from './api';
import type { ApiResponse } from '../types';

export interface StorageCategoryStat {
  id: string;
  name: string;
  productCount: number;
  imageCount: number;
  estimatedSizeKB: number;
}

export interface StorageStatsData {
  quota: {
    maxGB: number;
    maxMB: number;
    estimatedUsedMB: number;
    usedPercent: number;
    totalImages: number;
  };
  productCategories: StorageCategoryStat[];
  totals: {
    productImages: number;
    deliveryProofs: {
      total: number;
      olderThan30Days: number;
      olderThan60Days: number;
    };
    paymentProofs: {
      total: number;
      olderThan30Days: number;
    };
    heroImages: number;
  };
}

export type StorageCleanupTarget =
  | 'PRODUCT_CATEGORY'
  | 'ALL_PRODUCTS'
  | 'DELIVERY_PROOFS'
  | 'PAYMENT_PROOFS'
  | 'HERO_IMAGES';

export interface StorageCleanupParams {
  target: StorageCleanupTarget;
  categoryId?: string;
  olderThanDays?: number;
}

export const storageService = {
  /**
   * Mengambil data statistik penyimpanan gambar Cloudflare R2
   */
  async getStorageStats(): Promise<ApiResponse<StorageStatsData>> {
    try {
      const response = await api.get<any>('/api/storage/cleanup');
      if (response.data?.success) {
        return {
          success: true,
          data: response.data.data,
        };
      }
      return {
        success: false,
        error: response.data?.error || 'Gagal memuat statistik penyimpanan',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal memuat data penyimpanan R2',
      };
    }
  },

  /**
   * Menghapus gambar sesuai kategori / target pembersihan
   */
  async cleanupStorage(
    params: StorageCleanupParams
  ): Promise<ApiResponse<{ deletedCount: number; message: string }>> {
    try {
      const response = await api.post<any>('/api/storage/cleanup', params);
      if (response.data?.success) {
        return {
          success: true,
          data: {
            deletedCount: response.data.deletedCount || 0,
            message: response.data.message || 'Gambar berhasil dibersihkan',
          },
        };
      }
      return {
        success: false,
        error: response.data?.error || 'Gagal membersihkan gambar',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Terjadi kesalahan sistem saat pembersihan',
      };
    }
  },
};
