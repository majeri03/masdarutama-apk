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

const matchProductFromDb = async (aiKeyword: string) => {
  if (!aiKeyword) return null;
  try {
    const res = await productService.getProducts({ search: aiKeyword, limit: 1 });
    const products = (res.data as any)?.products || [];
    return products.length > 0 ? products[0] : null;
  } catch {
    return null;
  }
};
export const executeAiToolCall = async (payload: ToolCallPayload): Promise<any> => {
  try {
    switch (payload.tool) {

      // ==================== PILAR A: WA ORDERS ====================
      case 'getPendingWaOrders': {
        const res = await api.get(API_ENDPOINTS.WA_ORDERS + '?status=PENDING');
        return { success: true, data: res.data?.data || res.data };
      }
      case 'createAutoOrderan': {
        const itemsFromAi = payload.params.items || [];
        const validItems = [];

        // Proses pencocokan barang sama seperti di atas
        for (const item of itemsFromAi) {
          const searchKeyword = item.productid || item.keyword || item.productName || item.product || '';
          if (!searchKeyword) continue;

          const res = await productService.getProducts({ search: searchKeyword, limit: 1 });
          const products = (res.data as any)?.products || [];

          if (products.length > 0) {
            const realProduct = products[0];
            let selectedUnit = realProduct.productUnits?.find((pu: any) => pu.unit?.name?.toLowerCase() === (item.unit || '').toLowerCase());
            if (!selectedUnit) selectedUnit = realProduct.productUnits?.find((pu: any) => pu.isPrimary) || realProduct.productUnits?.[0];

            validItems.push({
              productId: realProduct.id,
              productName: realProduct.name,
              quantity: Number(item.quantity) || 1,
              unitId: selectedUnit?.unitId,
              unit: selectedUnit?.unit?.name
            });
          }
        }

        if (validItems.length === 0) {
          return { error: 'Ekstrak gagal. Tidak ada satupun barang yang cocok di sistem.' };
        }

        // EKSEKUSI API LANGSUNG KE BACKEND (TANPA BUKA LAYAR UI)
        const orderPayload = {
          customerName: payload.params.customerName || 'UMUM',
          rawMessage: `Diinput otomatis oleh MIDA dari AI Chat`,
          parsedItems: validItems,
          status: 'PENDING'
        };

        const executeRes = await api.post(API_ENDPOINTS.WA_ORDERS, orderPayload);

        return {
          success: true,
          message: `✅ Siap Bos! Orderan atas nama ${orderPayload.customerName} berhasil diekstrak dan masuk ke antrean list orderan. (${validItems.length} barang berhasil dikenali).`,
          data: executeRes.data
        };
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
        const itemsFromAi = payload.params.items || [];
        const validItems = [];

        // Kita lakukan auto-matching teks buatan AI ke ID asli database sebelum draf dikirim ke UI!
        for (const item of itemsFromAi) {
          const searchKeyword = item.productCode || item.productName || item.keyword || '';
          if (!searchKeyword) continue;

          // Gunakan service bawaan Anda untuk cek database secara real-time!
          const res = await productService.getProducts({ search: searchKeyword, limit: 1 });
          const products = (res.data as any)?.products || [];

          if (products.length > 0) {
            const realProduct = products[0];

            // Cari unit harga yang diketik (misal user minta SAK atau PCS)
            let selectedUnit = realProduct.productUnits?.find((pu: any) =>
              pu.unit?.name?.toLowerCase() === (item.unitName || item.unit || '').toLowerCase()
            );

            if (!selectedUnit) {
              selectedUnit = realProduct.productUnits?.find((pu: any) => pu.isPrimary) || realProduct.productUnits?.[0];
            }

            // Masukkan data asli & sah dari PostgreSQL
            validItems.push({
              productId: realProduct.id,
              productCode: realProduct.code,
              productName: realProduct.name,
              unitId: selectedUnit?.unitId,
              unitName: selectedUnit?.unit?.name || 'SAK',
              quantity: Number(item.qty || item.quantity) || 1,
              unitPrice: Number(selectedUnit?.sellPrice) || 0,
              subtotal: (Number(selectedUnit?.sellPrice) || 0) * (Number(item.qty || item.quantity) || 1)
            });
          }
        }

        if (validItems.length === 0) {
          return { error: 'Gagal membuat draf, barang tidak terdeteksi di database.' };
        }

        // Sekarang draf dikembalikan ke UI dengan data super komplit berisi ID asli database.
        // Klik "Konfirmasi" di UI Anda dijamin akan langsung tersimpan sukses ke database!
        return {
          type: 'draft_transaction',
          action: 'BUAT TRANSAKSI PENJUALAN',
          data: {
            customerName: payload.params.customerName || 'UMUM',
            paymentMethod: payload.params.paymentMethod || 'CASH',
            items: validItems,
            notes: payload.params.notes || 'Diinput otomatis via MIDA AI Assistant'
          },
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
        const itemsFromAi = payload.params.items || [];
        const validItems = [];

        // Pencocokan otomatis untuk pembelian barang ke Supplier (PO)
        for (const item of itemsFromAi) {
          const kw = item.productCode || item.productName || item.keyword || '';
          const realProduct = await matchProductFromDb(kw);

          if (realProduct) {
            let selectedUnit = realProduct.productUnits?.find((pu: any) => 
              pu.unit?.name?.toLowerCase() === (item.unitName || item.unit || '').toLowerCase()
            );
            if (!selectedUnit) selectedUnit = realProduct.productUnits?.find((pu: any) => pu.isPrimary) || realProduct.productUnits?.[0];

            validItems.push({
              productId: realProduct.id,
              productName: realProduct.name,
              unitId: selectedUnit?.unitId,
              quantity: Number(item.qty || item.quantity) || 1,
              unitPrice: Number(item.unitPrice) || Number(selectedUnit?.buyPrice) || 0, // Menggunakan harga modal terdaftar
              discount: Number(item.discount) || 0,
              subtotal: (Number(item.unitPrice) || Number(selectedUnit?.buyPrice) || 0) * (Number(item.qty || item.quantity) || 1)
            });
          }
        }

        if (validItems.length === 0) return { error: 'Produk tidak valid atau tidak ditemukan untuk membuat PO.' };

        return {
          type: 'draft_purchase',
          action: 'BUAT PURCHASE ORDER (PO)',
          data: {
            supplierName: payload.params.supplierName || 'UMUM',
            purchaseDate: new Date().toISOString().split('T')[0],
            items: validItems,
            discount: 0,
            tax: 0,
            paidAmount: 0,
            notes: payload.params.notes || 'Draf PO otomatis via MIDA'
          },
        };
      }

      case 'getDeliveryOrders': {
        const res = await deliveryService.getDeliveryOrders({ search: payload.params?.search });
        if (!res.success) return { error: res.error };
        return { success: true, data: res.data };
      }

      case 'createDraftDelivery': {
        const invNum = payload.params.invoiceNumber;
        if (!invNum) return { error: 'Nomor invoice diperlukan untuk membuat Surat Jalan.' };

        // Tarik data riil langsung dari database penjualan untuk dicopas ke logistik kiriman!
        const saleRes = await salesService.getSales({ search: invNum, limit: 1 });
        const saleData = (saleRes.data as any)?.sales?.[0];

        if (!saleData) return { error: `Invoice #${invNum} tidak terdaftar di sistem toko.` };

        const deliveryItems = saleData.saleItems?.map((item: any) => ({
          productId: item.product.id,
          productName: item.product.name,
          productCode: item.product.code,
          unitId: item.unitId,
          unitName: item.unit?.name,
          quantity: item.quantity,
          notes: '-'
        })) || [];

        return {
          type: 'draft_delivery',
          action: 'BUAT SURAT JALAN',
          data: {
            invoiceNumber: invNum,
            customerId: saleData.customerId,
            customerName: saleData.customer?.name || 'UMUM',
            driver: payload.params.driver || '',
            vehicle: payload.params.vehicle || '',
            deliveryDate: new Date().toISOString().split('T')[0],
            items: deliveryItems,
            notes: payload.params.notes || 'Diisi otomatis dari invoice penjualan'
          }
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
        const kw = payload.params.productCode || payload.params.productName || payload.params.keyword || '';
        const realProduct = await matchProductFromDb(kw);

        if (!realProduct) return { error: `Produk "${kw}" tidak ditemukan untuk penyesuaian stok.` };

        return {
          type: 'draft_stock_adjustment',
          action: 'PENYESUAIAN STOK (STOCK OPNAME)',
          data: {
            productId: realProduct.id,
            productCode: realProduct.code,
            productName: realProduct.name,
            type: payload.params.type || 'ADJUSTMENT', // IN, OUT, atau ADJUSTMENT
            qty: Number(payload.params.qty || payload.params.quantity) || 0,
            notes: payload.params.notes || 'Stock opname via asisten MIDA'
          },
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
