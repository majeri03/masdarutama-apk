/**
 * AI Executor Service — The bridge between LLM tool calls and real app services.
 * ALL tools are connected to REAL services. No mocks, no half-measures.
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import { useAuthStore } from '../stores/auth.store';
import { productService } from './product.service';
import { salesService } from './sales.service';
import { debtService } from './debt.service';
import { deliveryService } from './delivery.service';
import { purchaseService } from './purchase.service';
import { stockService } from './stock.service';
import { masterService } from './master.service';
import { reportService } from './report.service';
import type { AuthUser } from '../types';

export interface ToolCallPayload {
  type: 'tool_call';
  tool: string;
  params: any;
}

/**
 * Check if the current user has the required role for destructive actions.
 */
const requireSuperAdmin = (): { allowed: boolean; error?: string } => {
  const user = useAuthStore.getState().user as AuthUser | null;
  if (!user) return { allowed: false, error: 'Anda belum login.' };
  if (user.role !== 'SUPER_ADMIN') {
    return { allowed: false, error: `Akses ditolak. Hanya SUPER ADMIN yang bisa melakukan aksi ini. Anda login sebagai ${user.role}.` };
  }
  return { allowed: true };
};

export const executeAiToolCall = async (payload: ToolCallPayload): Promise<any> => {
  try {
    switch (payload.tool) {

      // ==================== PILAR A: WA ORDERS ====================
      case 'getPendingWaOrders': {
        const res = await api.get(API_ENDPOINTS.WA_ORDERS + '?status=PENDING');
        return { success: true, data: res.data?.data || res.data };
      }

      case 'confirmWaOrder': {
        const { orderId, parsedItems } = payload.params;
        return {
          type: 'draft_wa_confirm',
          action: 'KONFIRMASI ORDER WA',
          data: { orderId, parsedItems },
          executeEndpoint: API_ENDPOINTS.WA_ORDER_CONFIRM(orderId),
        };
      }

      case 'rejectWaOrder': {
        const { orderId, reason } = payload.params;
        const res = await api.post(API_ENDPOINTS.WA_ORDER_REJECT(orderId), { reason });
        return { success: true, data: res.data?.data || res.data, message: `Order ${orderId} ditolak.` };
      }

      // ==================== PILAR B: POS / TRANSAKSI ====================
      case 'searchProduct': {
        const res = await productService.getProducts({ search: payload.params.keyword, limit: 10 });
        if (!res.success) return { error: res.error };
        const products = (res.data as any)?.products || [];
        return {
          success: true,
          data: products.map((p: any) => ({
            code: p.code,
            name: p.name,
            currentStock: p.currentStock,
            minStock: p.minStock,
            category: p.category?.name || '-',
            units: p.productUnits?.map((pu: any) => ({
              unitName: pu.unit?.name,
              sellPrice: pu.sellPrice,
              buyPrice: pu.buyPrice,
              isPrimary: pu.isPrimary,
            })) || [],
          })),
        };
      }

      case 'getProductDetail': {
        const res = await productService.getProductById(payload.params.productId);
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftTransaction': {
        return {
          type: 'draft_transaction',
          action: 'BUAT TRANSAKSI PENJUALAN',
          data: payload.params,
        };
      }

      case 'getSaleDetail': {
        const res = await salesService.getSales({ search: payload.params.invoiceNumber, limit: 1 });
        if (!res.success) return { error: res.error };
        const sales = (res.data as any)?.sales || [];
        return { success: true, data: sales[0] || null, message: sales.length ? undefined : 'Invoice tidak ditemukan.' };
      }

      // ==================== PILAR C: HUTANG & PIUTANG ====================
      case 'getCustomerDebts': {
        const res = await debtService.getCustomerDebts({ search: payload.params?.search });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'getSupplierDebts': {
        const res = await debtService.getSupplierDebts({ search: payload.params?.search });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftDebtPayment': {
        return {
          type: 'draft_debt_payment',
          action: 'BAYAR HUTANG/PIUTANG',
          data: payload.params,
        };
      }

      // ==================== PILAR D: PURCHASE ORDER & SURAT JALAN ====================
      case 'getPurchases': {
        const res = await purchaseService.getPurchases({ search: payload.params?.search });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftPurchase': {
        return {
          type: 'draft_purchase',
          action: 'BUAT PURCHASE ORDER (PO)',
          data: payload.params,
        };
      }

      case 'getDeliveryOrders': {
        const res = await deliveryService.getDeliveryOrders({ search: payload.params?.search });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftDelivery': {
        return {
          type: 'draft_delivery',
          action: 'BUAT SURAT JALAN',
          data: payload.params,
        };
      }

      // ==================== PILAR E: INVENTARIS & STOK ====================
      case 'getLowStockProducts': {
        const res = await productService.getProducts({ lowStock: true, limit: 50 });
        if (!res.success) return { error: res.error };
        const products = (res.data as any)?.products || [];
        return {
          success: true,
          data: products.map((p: any) => ({
            code: p.code,
            name: p.name,
            currentStock: p.currentStock,
            minStock: p.minStock,
            category: p.category?.name || '-',
          })),
          message: products.length === 0 ? 'Semua stok aman, tidak ada produk di bawah batas minimum.' : undefined,
        };
      }

      case 'getStockMovements': {
        const res = await stockService.getStockMovements({ search: payload.params?.search, limit: 20 });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftStockAdjustment': {
        return {
          type: 'draft_stock_adjustment',
          action: 'PENYESUAIAN STOK (STOCK OPNAME)',
          data: payload.params,
        };
      }

      // ==================== PILAR F: DATA MASTER & PENGATURAN ====================
      case 'searchCustomer': {
        const res = await masterService.getCustomers(payload.params?.keyword);
        if (!res.success) return { error: res.error };
        const customers = (res.data as any)?.customers || [];
        return { success: true, data: customers };
      }

      case 'searchSupplier': {
        const res = await masterService.getSuppliers(payload.params?.keyword);
        if (!res.success) return { error: res.error };
        const suppliers = (res.data as any)?.suppliers || [];
        return { success: true, data: suppliers };
      }

      case 'getStoreSettings': {
        const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
        return { success: true, data: res.data?.data || res.data };
      }

      case 'getFinancialReport': {
        const res = await reportService.getFinancialReport({
          dateFrom: payload.params?.dateFrom,
          dateTo: payload.params?.dateTo,
        });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'getInventoryReport': {
        const res = await reportService.getInventoryReport();
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      // ==================== AKSI BERBAHAYA (SUPER ADMIN + KONFIRMASI) ====================
      case 'deleteConfirmation': {
        const roleCheck = requireSuperAdmin();
        if (!roleCheck.allowed) return { error: roleCheck.error };
        return {
          type: 'draft_delete',
          action: 'KONFIRMASI HAPUS',
          data: payload.params,
        };
      }

      case 'editConfirmation': {
        const roleCheck = requireSuperAdmin();
        if (!roleCheck.allowed) return { error: roleCheck.error };
        return {
          type: 'draft_edit',
          action: 'KONFIRMASI EDIT',
          data: payload.params,
        };
      }

      default:
        return { error: `Tool "${payload.tool}" tidak dikenali. Pastikan nama tool sesuai daftar.` };
    }
  } catch (error: any) {
    const msg = error?.response?.data?.error || error?.message || 'Terjadi kesalahan saat mengeksekusi tool.';
    return { error: msg };
  }
};
