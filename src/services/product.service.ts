/**
 * Product Service - CRUD & search for products
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse, Product, Category } from '../types';

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
  lowStock?: boolean;
}

export interface ProductListResponse {
  products: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const productService = {
  async getProducts(filters: ProductFilters = {}): Promise<ApiResponse<ProductListResponse>> {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.categoryId) params.append('categoryId', filters.categoryId);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.isActive !== undefined) params.append('isActive', String(filters.isActive));
      if (filters.lowStock) params.append('lowStock', 'true');

      const response = await api.get<ApiResponse<any>>(
        `${API_ENDPOINTS.PRODUCTS}?${params.toString()}`
      );

      if (response.data.success) {
        const rawData = response.data.data;
        const productsList = Array.isArray(rawData)
          ? rawData
          : rawData?.products || [];

        const pagination = response.data.pagination || rawData?.pagination || {
          total: productsList.length,
          page: 1,
          limit: 10,
          totalPages: 1,
        };

        return {
          ...response.data,
          data: {
            products: productsList,
            pagination,
          }
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat produk' };
    }
  },

  async getProductById(id: string): Promise<ApiResponse<Product>> {
    try {
      const response = await api.get<ApiResponse<Product>>(API_ENDPOINTS.PRODUCT_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail produk' };
    }
  },

  async createProduct(data: Partial<Product>): Promise<ApiResponse<Product>> {
    try {
      const response = await api.post<ApiResponse<Product>>(API_ENDPOINTS.PRODUCTS, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat produk' };
    }
  },

  async updateProduct(id: string, data: Partial<Product>): Promise<ApiResponse<Product>> {
    try {
      const response = await api.put<ApiResponse<Product>>(API_ENDPOINTS.PRODUCT_DETAIL(id), data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengupdate produk' };
    }
  },

  async deleteProduct(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(API_ENDPOINTS.PRODUCT_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus produk' };
    }
  },

  async getCategories(): Promise<ApiResponse<Category[]>> {
    try {
      const response = await api.get<ApiResponse<{ categories: Category[] }>>(API_ENDPOINTS.CATEGORIES);
      if (response.data.success && response.data.data) {
        return { success: true, data: response.data.data.categories || response.data.data as any };
      }
      return { success: false, error: 'Gagal memuat kategori' };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat kategori' };
    }
  },

  async uploadImage(imageUri: string): Promise<ApiResponse<{ url: string; filename: string }>> {
    try {
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      // @ts-ignore
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type,
      });

      const response = await api.post<any>('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        return {
          success: true,
          data: {
            url: response.data.url,
            filename: response.data.filename,
          },
        };
      }
      return { success: false, error: response.data.error || 'Gagal mengupload gambar' };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengupload gambar' };
    }
  },
};
