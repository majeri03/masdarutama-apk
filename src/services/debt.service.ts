import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse } from '../types';

export interface DebtPaymentPayload {
  type: 'customer' | 'supplier';
  debtId: string;
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  notes?: string;
}

export const debtService = {
  async getCustomerDebts(filters: {
    search?: string;
    customerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, String(value));
      });

      const response = await api.get<ApiResponse<any[]>>(
        `${API_ENDPOINTS.CUSTOMER_DEBTS}?${params.toString()}`
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal memuat piutang pelanggan',
      };
    }
  },

  async getSupplierDebts(filters: {
    search?: string;
    supplierId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, String(value));
      });

      const response = await api.get<ApiResponse<any[]>>(
        `${API_ENDPOINTS.SUPPLIER_DEBTS}?${params.toString()}`
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal memuat utang supplier',
      };
    }
  },

  async payDebt(payload: DebtPaymentPayload): Promise<ApiResponse<any>> {
    try {
      const response = await api.post<ApiResponse<any>>(
        API_ENDPOINTS.DEBT_PAYMENTS,
        payload
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal melakukan pembayaran utang/piutang',
      };
    }
  },
};
