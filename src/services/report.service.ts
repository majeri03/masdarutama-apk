/**
 * Reports Service - Financial and Inventory reports
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import type { ApiResponse, FinancialReport, InventoryReport } from '../types';

export const reportService = {
  async getFinancialReport(params?: {
    dateFrom?: string;
    dateTo?: string;
    period?: 'daily' | 'weekly' | 'monthly';
  }): Promise<ApiResponse<FinancialReport>> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.dateFrom) searchParams.append('dateFrom', params.dateFrom);
      if (params?.dateTo) searchParams.append('dateTo', params.dateTo);
      if (params?.period) searchParams.append('period', params.period);

      const response = await api.get<ApiResponse<any>>(
        `${API_ENDPOINTS.REPORT_FINANCIAL}?${searchParams.toString()}`
      );

      if (response.data.success && response.data.data) {
        const { summary } = response.data.data;
        const mappedData: FinancialReport = {
          totalRevenue: summary?.totalRevenue || 0,
          totalProfit: summary?.netProfit || summary?.grossProfit || 0,
          totalTransactions: summary?.transactionCount || 0,
          totalCustomerDebt: summary?.totalCustomerDebt || 0,
          averageTransaction: summary?.totalRevenue && summary?.transactionCount
            ? summary.totalRevenue / summary.transactionCount
            : 0,
          salesByDate: [],
          salesByPayment: [],
        };
        return {
          ...response.data,
          data: mappedData,
        };
      }
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat laporan' };
    }
  },

  async getInventoryReport(): Promise<ApiResponse<InventoryReport>> {
    try {
      const response = await api.get<ApiResponse<InventoryReport>>(API_ENDPOINTS.REPORT_INVENTORY);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat laporan inventori' };
    }
  },
};
