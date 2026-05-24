/**
 * Master Data Service - Customers, Suppliers, Units, Categories
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse, Customer, Supplier, Unit, Category, SubCategory } from '../types';

export const masterService = {
  // ==================== CUSTOMERS ====================
  async getCustomers(search?: string): Promise<ApiResponse<{ customers: Customer[] }>> {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await api.get<ApiResponse<any>>(
        `${API_ENDPOINTS.CUSTOMERS}${params}`
      );
      if (response.data.success) {
        const rawData = response.data.data;
        const customersList = Array.isArray(rawData) ? rawData : rawData?.customers || [];
        return {
          ...response.data,
          data: { customers: customersList }
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat pelanggan' };
    }
  },

  async createCustomer(data: Partial<Customer>): Promise<ApiResponse<Customer>> {
    try {
      const response = await api.post<ApiResponse<Customer>>(API_ENDPOINTS.CUSTOMERS, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat pelanggan' };
    }
  },

  async updateCustomer(id: string, data: Partial<Customer>): Promise<ApiResponse<Customer>> {
    try {
      const response = await api.put<ApiResponse<Customer>>(API_ENDPOINTS.CUSTOMER_DETAIL(id), data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengupdate pelanggan' };
    }
  },

  async deleteCustomer(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(API_ENDPOINTS.CUSTOMER_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus pelanggan' };
    }
  },

  // ==================== SUPPLIERS ====================
  async getSuppliers(search?: string): Promise<ApiResponse<{ suppliers: Supplier[] }>> {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await api.get<ApiResponse<any>>(
        `${API_ENDPOINTS.SUPPLIERS}${params}`
      );
      if (response.data.success) {
        const rawData = response.data.data;
        const suppliersList = Array.isArray(rawData) ? rawData : rawData?.suppliers || [];
        return {
          ...response.data,
          data: { suppliers: suppliersList }
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat supplier' };
    }
  },

  async createSupplier(data: Partial<Supplier>): Promise<ApiResponse<Supplier>> {
    try {
      const response = await api.post<ApiResponse<Supplier>>(API_ENDPOINTS.SUPPLIERS, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat supplier' };
    }
  },

  async updateSupplier(id: string, data: Partial<Supplier>): Promise<ApiResponse<Supplier>> {
    try {
      const response = await api.put<ApiResponse<Supplier>>(API_ENDPOINTS.SUPPLIER_DETAIL(id), data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengupdate supplier' };
    }
  },

  // ==================== UNITS ====================
  async getUnits(): Promise<ApiResponse<{ units: Unit[] }>> {
    try {
      const response = await api.get<ApiResponse<any>>(`${API_ENDPOINTS.UNITS}?limit=100`);
      if (response.data.success) {
        const rawData = response.data.data;
        const unitsList = Array.isArray(rawData) ? rawData : rawData?.units || [];
        return {
          ...response.data,
          data: { units: unitsList }
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat satuan' };
    }
  },

  async createUnit(data: Partial<Unit>): Promise<ApiResponse<Unit>> {
    try {
      const response = await api.post<ApiResponse<Unit>>(API_ENDPOINTS.UNITS, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat satuan' };
    }
  },

  // ==================== CATEGORIES ====================
  async getCategories(): Promise<ApiResponse<{ categories: Category[] }>> {
    try {
      const response = await api.get<ApiResponse<any>>(API_ENDPOINTS.CATEGORIES);
      if (response.data.success) {
        const rawData = response.data.data;
        const categoriesList = Array.isArray(rawData) ? rawData : rawData?.categories || [];
        return {
          ...response.data,
          data: { categories: categoriesList }
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat kategori' };
    }
  },

  async createCategory(data: Partial<Category>): Promise<ApiResponse<Category>> {
    try {
      const response = await api.post<ApiResponse<Category>>(API_ENDPOINTS.CATEGORIES, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat kategori' };
    }
  },

  async createSubCategory(data: { name: string; categoryId: string }): Promise<ApiResponse<SubCategory>> {
    try {
      const response = await api.post<ApiResponse<SubCategory>>(`${API_ENDPOINTS.CATEGORIES}/sub`, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal membuat sub-kategori' };
    }
  },

  async getPublicSettings(): Promise<ApiResponse<{ name: string; tagline: string | null; logoUrl: string | null }>> {
    try {
      const response = await api.get<ApiResponse<any>>('/api/settings/public');
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat info logo toko' };
    }
  },
};
