/**
 * ai-executor.service.ts — MIDA Tool Execution Engine (ReAct Agent Edition)
 *
 * Semua tool dikategorikan dengan `resultType`:
 * - DATA_RESPONSE  → hasil pencarian data → akan di-inject kembali ke LLM context (ReAct loop)
 * - DRAFT_RESPONSE → draf yang butuh konfirmasi user → tampil ke UI sebagai DraftCard
 * - ERROR_RESPONSE → error dari backend atau validasi
 *
 * Tidak ada kode duplikat. matchProductFromDb dihapus (tugasnya di-handle
 * oleh ReAct loop: AI akan call searchProduct lebih dulu).
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

// ==================== TYPES ====================

export type ToolResultType = 'DATA_RESPONSE' | 'DRAFT_RESPONSE' | 'ERROR_RESPONSE';

export interface ToolCallPayload {
  type: 'tool_call';
  tool: string;
  params: any;
}

export interface ToolResult {
  resultType: ToolResultType;
  /** Untuk DATA_RESPONSE: data mentah dari backend (akan di-inject ke LLM) */
  data?: any;
  /** Untuk DRAFT_RESPONSE: objek draf lengkap (akan ditampilkan ke UI) */
  draft?: {
    type: string;
    action: string;
    data: any;
    executeEndpoint?: string;
  };
  /** Pesan ringkas untuk ditampilkan user (opsional) */
  message?: string;
  /** Pesan error */
  error?: string;
}

// ==================== AUTH GUARD ====================

const requireSuperAdmin = (): { allowed: boolean; error?: string } => {
  const user = useAuthStore.getState().user as AuthUser | null;
  if (!user) return { allowed: false, error: 'Anda belum login.' };
  if (user.role !== 'SUPER_ADMIN') {
    return {
      allowed: false,
      error: `Akses ditolak. Hanya SUPER ADMIN yang bisa melakukan aksi ini. Anda login sebagai ${user.role}.`,
    };
  }
  return { allowed: true };
};

// ==================== HELPER ====================

const dataResponse = (data: any, message?: string): ToolResult => ({
  resultType: 'DATA_RESPONSE',
  data,
  message,
});

const draftResponse = (
  type: string,
  action: string,
  data: any,
  executeEndpoint?: string,
): ToolResult => ({
  resultType: 'DRAFT_RESPONSE',
  draft: { type, action, data, executeEndpoint },
});

const errorResponse = (error: string): ToolResult => ({
  resultType: 'ERROR_RESPONSE',
  error,
});

/**
 * Resolve product unit from a product object.
 * Prefers unit matching `unitName`, falls back to primary, then first.
 */
const resolveUnit = (product: any, unitName?: string) => {
  if (unitName) {
    const match = product.productUnits?.find(
      (pu: any) => pu.unit?.name?.toLowerCase() === unitName.toLowerCase(),
    );
    if (match) return match;
  }
  return (
    product.productUnits?.find((pu: any) => pu.isPrimary) ||
    product.productUnits?.[0] ||
    null
  );
};

// ==================== MAIN EXECUTOR ====================

export const executeAiToolCall = async (payload: ToolCallPayload): Promise<ToolResult> => {
  try {
    switch (payload.tool) {

      // ========== PILAR A: PESANAN WHATSAPP ==========

      case 'getPendingWaOrders': {
        const res = await api.get(API_ENDPOINTS.WA_ORDERS + '?status=PENDING');
        return dataResponse(res.data?.data || res.data);
      }

      case 'createAutoOrderan': {
        const itemsFromAi: any[] = payload.params.items || [];
        const validItems: any[] = [];

        for (const item of itemsFromAi) {
          const keyword = item.productid || item.keyword || item.productName || item.product || '';
          if (!keyword) continue;
          const res = await productService.getProducts({ search: keyword, limit: 1 });
          const products = (res.data as any)?.products || [];
          if (products.length > 0) {
            const p = products[0];
            const unit = resolveUnit(p, item.unit);
            validItems.push({
              productId: p.id,
              productName: p.name,
              quantity: Number(item.quantity) || 1,
              unitId: unit?.unitId,
              unit: unit?.unit?.name,
            });
          }
        }

        if (validItems.length === 0)
          return errorResponse('Tidak ada satupun barang yang cocok di sistem.');

        const orderPayload = {
          customerName: payload.params.customerName || 'UMUM',
          rawMessage: 'Diinput otomatis oleh MIDA dari AI Chat',
          parsedItems: validItems,
          status: 'PENDING',
        };

        const executeRes = await api.post(API_ENDPOINTS.WA_ORDERS, orderPayload);
        return dataResponse(executeRes.data, `✅ Orderan ${orderPayload.customerName} berhasil diekstrak (${validItems.length} barang).`);
      }

      case 'confirmWaOrder': {
        const { orderId, parsedItems } = payload.params;
        return draftResponse(
          'draft_wa_confirm',
          'KONFIRMASI ORDER WA',
          { orderId, parsedItems },
          API_ENDPOINTS.WA_ORDER_CONFIRM(orderId),
        );
      }

      case 'rejectWaOrder': {
        const { orderId, reason } = payload.params;
        const res = await api.post(API_ENDPOINTS.WA_ORDER_REJECT(orderId), { reason });
        return dataResponse(res.data?.data || res.data, `Order ${orderId} berhasil ditolak.`);
      }

      // ========== PILAR B: TRANSAKSI PENJUALAN ==========

      case 'searchProduct': {
        const res = await productService.getProducts({
          search: payload.params.keyword,
          limit: 10,
        });
        if (!res.success) return errorResponse(res.error || 'Gagal mencari produk.');

        const products = (res.data as any)?.products || [];
        const mapped = products.map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
          category: p.category?.name || '-',
          units: p.productUnits?.map((pu: any) => ({
            unitName: pu.unit?.name,
            unitId: pu.unitId,
            sellPrice: pu.sellPrice,
            buyPrice: pu.buyPrice,
            isPrimary: pu.isPrimary,
          })) || [],
        }));

        return dataResponse(mapped, products.length === 0 ? 'Produk tidak ditemukan.' : undefined);
      }

      case 'getProductDetail': {
        const res = await productService.getProductById(payload.params.productId);
        if (!res.success) return errorResponse(res.error || 'Produk tidak ditemukan.');
        return dataResponse(res.data);
      }

      case 'createDraftTransaction': {
        const itemsFromAi: any[] = payload.params.items || [];
        const validItems: any[] = [];

        for (const item of itemsFromAi) {
          const keyword = item.productCode || item.productName || item.keyword || '';
          if (!keyword) continue;

          const res = await productService.getProducts({ search: keyword, limit: 1 });
          const products = (res.data as any)?.products || [];

          if (products.length > 0) {
            const p = products[0];
            const unit = resolveUnit(p, item.unitName || item.unit);
            validItems.push({
              productId: p.id,
              productCode: p.code,
              productName: p.name,
              unitId: unit?.unitId,
              unitName: unit?.unit?.name || 'SAK',
              quantity: Number(item.qty || item.quantity) || 1,
              unitPrice: Number(unit?.sellPrice) || 0,
              subtotal: (Number(unit?.sellPrice) || 0) * (Number(item.qty || item.quantity) || 1),
            });
          }
        }

        if (validItems.length === 0)
          return errorResponse('Gagal membuat draf — barang tidak terdeteksi di database. Coba sebutkan nama produk lebih spesifik.');

        return draftResponse('draft_transaction', 'BUAT TRANSAKSI PENJUALAN', {
          customerName: payload.params.customerName || 'UMUM',
          paymentMethod: payload.params.paymentMethod || 'CASH',
          items: validItems,
          notes: payload.params.notes || 'Diinput via MIDA AI',
        });
      }

      case 'getSaleDetail': {
        const res = await salesService.getSales({
          search: payload.params.invoiceNumber,
          limit: 1,
        });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data invoice.');
        const sales = (res.data as any)?.sales || [];
        if (sales.length === 0)
          return errorResponse(`Invoice ${payload.params.invoiceNumber} tidak ditemukan di sistem.`);
        return dataResponse(sales[0]);
      }

      // ========== PILAR C: HUTANG & PIUTANG ==========

      case 'getCustomerDebts': {
        const res = await debtService.getCustomerDebts({ search: payload.params?.search });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data piutang.');
        return dataResponse(res.data);
      }

      case 'getSupplierDebts': {
        const res = await debtService.getSupplierDebts({ search: payload.params?.search });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data utang supplier.');
        return dataResponse(res.data);
      }

      case 'createDraftDebtPayment': {
        return draftResponse('draft_debt_payment', 'BAYAR HUTANG/PIUTANG', payload.params);
      }

      // ========== PILAR D: PEMBELIAN (PO) & SURAT JALAN ==========

      case 'getPurchases': {
        const res = await purchaseService.getPurchases({ search: payload.params?.search });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data PO.');
        return dataResponse(res.data);
      }

      case 'createDraftPurchase': {
        const itemsFromAi: any[] = payload.params.items || [];
        const validItems: any[] = [];

        for (const item of itemsFromAi) {
          const keyword = item.productCode || item.productName || item.keyword || '';
          if (!keyword) continue;

          const res = await productService.getProducts({ search: keyword, limit: 1 });
          const products = (res.data as any)?.products || [];

          if (products.length > 0) {
            const p = products[0];
            const unit = resolveUnit(p, item.unitName || item.unit);
            validItems.push({
              productId: p.id,
              productName: p.name,
              unitId: unit?.unitId,
              unitName: unit?.unit?.name || 'SAK',
              quantity: Number(item.qty || item.quantity) || 1,
              unitPrice: Number(item.unitPrice) || Number(unit?.buyPrice) || 0,
              discount: Number(item.discount) || 0,
              subtotal:
                (Number(item.unitPrice) || Number(unit?.buyPrice) || 0) *
                (Number(item.qty || item.quantity) || 1),
            });
          }
        }

        if (validItems.length === 0)
          return errorResponse('Produk tidak valid atau tidak ditemukan untuk membuat PO. Pastikan nama produk benar.');

        return draftResponse('draft_purchase', 'BUAT PURCHASE ORDER (PO)', {
          supplierName: payload.params.supplierName || 'UMUM',
          purchaseDate: new Date().toISOString().split('T')[0],
          items: validItems,
          discount: 0,
          tax: 0,
          paidAmount: 0,
          notes: payload.params.notes || 'Draf PO otomatis via MIDA',
        });
      }

      case 'getDeliveryOrders': {
        const res = await deliveryService.getDeliveryOrders({ search: payload.params?.search });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data surat jalan.');
        return dataResponse(res.data);
      }

      case 'createDraftDelivery': {
        const invNum = payload.params.invoiceNumber;
        if (!invNum) return errorResponse('Nomor invoice diperlukan untuk membuat Surat Jalan.');

        const saleRes = await salesService.getSales({ search: invNum, limit: 1 });
        const saleData = (saleRes.data as any)?.sales?.[0];

        if (!saleData) return errorResponse(`Invoice #${invNum} tidak ditemukan di sistem toko.`);

        const deliveryItems = saleData.saleItems?.map((item: any) => ({
          productId: item.product.id,
          productName: item.product.name,
          productCode: item.product.code,
          unitId: item.unitId,
          unitName: item.unit?.name,
          quantity: item.quantity,
          notes: '-',
        })) || [];

        return draftResponse('draft_delivery', 'BUAT SURAT JALAN', {
          invoiceNumber: invNum,
          customerId: saleData.customerId,
          customerName: saleData.customer?.name || 'UMUM',
          driver: payload.params.driver || '',
          vehicle: payload.params.vehicle || '',
          deliveryDate: new Date().toISOString().split('T')[0],
          items: deliveryItems,
          notes: payload.params.notes || 'Diisi otomatis dari invoice penjualan',
        });
      }

      // ========== PILAR E: INVENTARIS & STOK ==========

      case 'getLowStockProducts': {
        const res = await productService.getProducts({ lowStock: true, limit: 50 });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil data stok rendah.');
        const products = (res.data as any)?.products || [];
        return dataResponse(
          products.map((p: any) => ({
            code: p.code,
            name: p.name,
            currentStock: p.currentStock,
            minStock: p.minStock,
            category: p.category?.name || '-',
          })),
          products.length === 0 ? 'Semua stok aman ✅' : undefined,
        );
      }

      case 'getStockMovements': {
        const res = await stockService.getStockMovements({
          search: payload.params?.search,
          limit: 20,
        });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil riwayat stok.');
        return dataResponse(res.data);
      }

      case 'createDraftStockAdjustment': {
        // Cari produk dulu berdasarkan keyword
        const keyword = payload.params.productCode || payload.params.productName || payload.params.keyword || '';
        if (!keyword) return errorResponse('Nama atau kode produk diperlukan untuk penyesuaian stok.');

        const res = await productService.getProducts({ search: keyword, limit: 1 });
        const products = (res.data as any)?.products || [];
        if (products.length === 0)
          return errorResponse(`Produk "${keyword}" tidak ditemukan untuk penyesuaian stok.`);

        const p = products[0];
        return draftResponse('draft_stock_adjustment', 'PENYESUAIAN STOK (STOCK OPNAME)', {
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          type: payload.params.type || 'ADJUSTMENT',
          qty: Number(payload.params.qty || payload.params.quantity) || 0,
          notes: payload.params.notes || 'Stock opname via MIDA',
        });
      }

      // ========== PILAR F: DATA MASTER & LAPORAN ==========

      case 'searchCustomer': {
        const res = await masterService.getCustomers(payload.params?.keyword);
        if (!res.success) return errorResponse(res.error || 'Gagal mencari pelanggan.');
        return dataResponse((res.data as any)?.customers || []);
      }

      case 'searchSupplier': {
        const res = await masterService.getSuppliers(payload.params?.keyword);
        if (!res.success) return errorResponse(res.error || 'Gagal mencari supplier.');
        return dataResponse((res.data as any)?.suppliers || []);
      }

      case 'getStoreSettings': {
        const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
        return dataResponse(res.data?.data || res.data);
      }

      case 'getFinancialReport': {
        const res = await reportService.getFinancialReport({
          dateFrom: payload.params?.dateFrom,
          dateTo: payload.params?.dateTo,
        });
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil laporan keuangan.');
        return dataResponse(res.data);
      }

      case 'getInventoryReport': {
        const res = await reportService.getInventoryReport();
        if (!res.success) return errorResponse(res.error || 'Gagal mengambil laporan inventaris.');
        return dataResponse(res.data);
      }

      // ========== AKSI BERBAHAYA (SUPER ADMIN) ==========

      case 'deleteConfirmation': {
        const roleCheck = requireSuperAdmin();
        if (!roleCheck.allowed) return errorResponse(roleCheck.error!);
        return draftResponse('draft_delete', 'KONFIRMASI HAPUS', payload.params);
      }

      case 'editConfirmation': {
        const roleCheck = requireSuperAdmin();
        if (!roleCheck.allowed) return errorResponse(roleCheck.error!);
        return draftResponse('draft_edit', 'KONFIRMASI EDIT', payload.params);
      }

      default:
        return errorResponse(`Tool "${payload.tool}" tidak dikenali. Pastikan nama tool sesuai daftar.`);
    }
  } catch (error: any) {
    const msg =
      error?.response?.data?.error ||
      error?.message ||
      'Terjadi kesalahan saat mengeksekusi tool.';
    return errorResponse(msg);
  }
};
