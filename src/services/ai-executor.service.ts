/**
 * ai-executor.service.ts — MIDA Real Agent Execution Engine v5
 *
 * ARSITEKTUR BARU:
 * ─────────────────────────────────────────────────────────────────
 * Setiap tool yang menerima input teks mentah dari user/AI WAJIB:
 *   1. Parse teks → ekstrak qty, nama produk, satuan, nama customer
 *   2. Resolve produk ke DB (search by keyword → ambil productId riil)
 *   3. Baru eksekusi dengan data valid
 *
 * KENAPA:
 * - Bug 1: LLM 0.5B kirim items:[] → executor sekarang parse dari `rawText`
 * - Bug 2: createAutoOrderan sebelumnya terima productId fiktif → sekarang 
 *          selalu resolve via searchProduct sebelum post ke backend
 * - Bug 3: createDraftDelivery terima invoiceNumber kosong → sekarang wajib
 *          ada invoice riil atau ambil dari getSaleDetail dulu
 *
 * resultType:
 * - DATA_RESPONSE  → data dari DB → inject ke LLM context (ReAct loop)
 * - DRAFT_RESPONSE → draf butuh konfirmasi user → tampil DraftCard di UI
 * - ERROR_RESPONSE → error backend atau validasi → tampil ⚠️ di UI
 * ─────────────────────────────────────────────────────────────────
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

// ==================== HELPERS ====================

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

// ==================== PRICE GUARD: VERIFIKASI HARGA DARI DB ====================
/**
 * verifyItemPricesFromDB — Ambil harga asli dari database untuk setiap item.
 *
 * ALASAN: AI terkadang mengirim unitPrice = 0 atau angka yang dikarang.
 * Fungsi ini mengambil harga riil dari DB dan mengganti harga yang salah.
 * Jika DB query gagal, harga AI tetap digunakan (tidak block transaksi).
 */
const verifyItemPricesFromDB = async (
  items: any[],
  priceType: 'sell' | 'buy' = 'sell',
): Promise<any[]> => {
  const verified: any[] = [];

  for (const item of items) {
    try {
      // Ambil data produk dari DB berdasarkan productId
      const res = await productService.getProductById(item.productId);
      if (res.success && res.data) {
        const product = res.data as any;
        const productUnit = product.productUnits?.find(
          (pu: any) => pu.unitId === item.unitId
        ) || product.productUnits?.[0];

        if (productUnit) {
          const dbPrice = priceType === 'sell'
            ? Number(productUnit.sellPrice)
            : Number(productUnit.buyPrice);

          const aiPrice = Number(item.unitPrice) || 0;

          // Gunakan harga DB jika:
          // - AI tidak menyertakan harga (0 atau undefined)
          // - Harga AI berbeda >20% dari harga DB (kemungkinan ngawur)
          const priceDiff = dbPrice > 0 ? Math.abs(aiPrice - dbPrice) / dbPrice : 1;
          const useDbPrice = aiPrice === 0 || priceDiff > 0.2;

          verified.push({
            ...item,
            productName: product.name || item.productName,
            productCode: product.code || item.productCode,
            unitName: productUnit.unit?.name || item.unitName,
            unitPrice: useDbPrice ? dbPrice : aiPrice,
            subtotal: (useDbPrice ? dbPrice : aiPrice) * (Number(item.quantity) || 1),
          });
          continue;
        }
      }
    } catch {
      // DB query gagal → tetap pakai data dari AI, tidak block
    }
    // Fallback: pakai data AI apa adanya
    verified.push(item);
  }

  return verified;
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
        /**
         * PURE REACT LOGIC:
         * AI harus menyediakan productId dan unitId riil.
         * Jika AI tidak punya ID-nya (hanya mengarang "semen", dll), berikan ERROR
         * agar AI memanggil searchProduct dulu di loop selanjutnya.
         */
        const items = payload.params.items || [];
        if (items.length === 0) {
          return errorResponse('Error: items array kosong. Jika Anda tidak tahu ID produk, panggil tool "searchProduct" terlebih dahulu.');
        }

        const validItems = [];
        for (const item of items) {
          const pid = item.productId;
          if (!pid || typeof pid !== 'string' || pid === 'ID_ASLI' || pid === 'ID_RIIL' || pid.trim().includes(' ')) {
            return errorResponse(
              `Error: productId tidak valid untuk item "${item.productName || item.keyword || pid}".\n` +
              `Anda WAJIB memanggil tool "searchProduct" terlebih dahulu untuk mendapatkan ID asli dari sistem.`
            );
          }
          validItems.push(item);
        }

        // VERIFIKASI HARGA DARI DB — pastikan harga tidak ngawur
        const verifiedOrderItems = await verifyItemPricesFromDB(validItems, 'sell');

        const customerName = payload.params.customerName || 'UMUM';

        const user = useAuthStore.getState().user as AuthUser | null;
        const orderPayload = {
          rawMessage: `Orderan ${customerName} via MIDA AI Chat`,
          senderPhone: 'MIDA-AI-CHAT',
          senderName: user?.name || 'MIDA AI',
          customerName,
          parsedItems: verifiedOrderItems,
          status: 'PENDING',
        };

        const executeRes = await api.post(API_ENDPOINTS.WA_ORDERS, orderPayload);
        return dataResponse(executeRes.data, `✅ Orderan **${customerName}** berhasil dibuat (${verifiedOrderItems.length} barang).`);
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
        /**
         * PURE REACT LOGIC:
         * AI harus menyediakan items dengan productId dan unitId riil.
         */
        const items = payload.params.items || [];
        if (items.length === 0) {
          return errorResponse(
            'Error: items array kosong. Kamu harus menyertakan array items yang berisi productId dan unitId riil.\n' +
            'Panggil tool "searchProduct" terlebih dahulu untuk mendapatkan ID produk dari sistem.'
          );
        }

        for (const item of items) {
          const pid = item.productId;
          const uid = item.unitId;
          if (!pid || typeof pid !== 'string' || pid === 'ID_ASLI' || pid === 'ID_RIIL' || pid.trim().includes(' ')) {
            return errorResponse(
              `Error: productId tidak valid untuk "${item.productName || pid}".\n` +
              `Kamu BELUM memanggil searchProduct untuk barang ini.\n` +
              `Langkah yang benar: 1) Panggil searchProduct dengan keyword nama barang. 2) Ambil field "id" dari hasilnya. 3) Ulangi pembuatan transaksi.`
            );
          }
          if (!uid || typeof uid !== 'string') {
            return errorResponse(
              `Error: unitId tidak ada untuk "${item.productName || pid}".\n` +
              `Ambil unitId dari field "units[0].unitId" pada hasil searchProduct.`
            );
          }
        }

        // VERIFIKASI HARGA DARI DB — pastikan harga tidak ngawur
        const verifiedItems = await verifyItemPricesFromDB(items, 'sell');

        return draftResponse('draft_transaction', 'BUAT TRANSAKSI PENJUALAN', {
          customerName: payload.params.customerName || 'UMUM',
          paymentMethod: payload.params.paymentMethod || 'CASH',
          items: verifiedItems,
          notes: payload.params.notes || 'Transaksi via MIDA AI',
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
        const items = payload.params.items || [];
        if (items.length === 0) {
          return errorResponse(
            'Error: items array kosong. Panggil "searchProduct" untuk mendapatkan ID barang yang akan di-PO.'
          );
        }

        for (const item of items) {
          const pid = item.productId;
          if (!pid || typeof pid !== 'string' || pid === 'ID_ASLI' || pid === 'ID_RIIL' || pid.trim().includes(' ')) {
            return errorResponse(
              `Error: productId tidak valid untuk "${item.productName || pid}".\n` +
              `Panggil searchProduct terlebih dahulu untuk mendapatkan ID aslinya.`
            );
          }
        }

        // VERIFIKASI HARGA BELI DARI DB — pastikan harga tidak ngawur
        const verifiedPoItems = await verifyItemPricesFromDB(items, 'buy');

        return draftResponse('draft_purchase', 'BUAT PURCHASE ORDER (PO)', {
          supplierName: payload.params.supplierName || 'UMUM',
          purchaseDate: new Date().toISOString().split('T')[0],
          items: verifiedPoItems,
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
        const rawInvNum = payload.params.invoiceNumber;

        // PURE REACT: Validate missing invoice
        if (!rawInvNum || rawInvNum === '' || rawInvNum === 'INV-xxx' || rawInvNum.toLowerCase().includes('placeholder')) {
          return errorResponse(
            `Error: invoiceNumber diperlukan. Panggil tool "getSaleDetail" atau cari di data riwayat jika Anda tidak mengetahui nomor invoice aslinya.`
          );
        }

        // Normalize format invoice: handle "INV 123", "inv-123", dll.
        const invNum = rawInvNum
          .toUpperCase()
          .replace(/\s+/g, '-')
          .replace(/^(?!INV)/, 'INV-')
          .trim();

        // Cari invoice di DB
        const saleRes = await salesService.getSales({ search: invNum, limit: 1 });
        const saleData = (saleRes.data as any)?.sales?.[0];

        if (!saleData) {
          // Coba cari dengan nomor asli (tanpa normalisasi)
          const saleRes2 = await salesService.getSales({ search: rawInvNum, limit: 1 });
          const saleData2 = (saleRes2.data as any)?.sales?.[0];

          if (!saleData2) {
            return errorResponse(
              `Invoice **${rawInvNum}** tidak ditemukan di sistem.\n\n` +
              `Pastikan nomor invoice benar. Cek di menu [Riwayat Transaksi](/transaction-history).`,
            );
          }

          // Gunakan hasil pencarian kedua
          return buildDeliveryDraft(saleData2, payload.params);
        }

        return buildDeliveryDraft(saleData, payload.params);
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
        const { productId, type, quantity } = payload.params;
        const pid = productId as string | undefined;
        if (!pid || typeof pid !== 'string' || pid === 'ID_ASLI' || pid === 'ID_RIIL' || pid.trim().includes(' ')) {
          return errorResponse(
            'Error: productId tidak valid atau kosong.\n' +
            'Panggil "searchProduct" untuk mencari produk dan ambil field "id" dari hasilnya.'
          );
        }

        return draftResponse('draft_stock', 'PENYESUAIAN STOK', {
          productId,
          type,
          quantity,
          notes: payload.params.notes || 'Penyesuaian stok via MIDA',
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

// ==================== HELPER: BUILD DELIVERY DRAFT ====================
/**
 * buildDeliveryDraft — Bangun draf Surat Jalan dari data sale yang sudah valid.
 * Dipisah agar bisa dipanggil dari dua branch di createDraftDelivery.
 */
function buildDeliveryDraft(saleData: any, params: any): ToolResult {
  const deliveryItems =
    saleData.saleItems?.map((item: any) => ({
      productId: item.product?.id || item.productId,
      productName: item.product?.name || item.productName,
      productCode: item.product?.code || item.productCode,
      unitId: item.unitId,
      unitName: item.unit?.name || item.unitName,
      quantity: item.quantity,
      notes: '-',
    })) || [];

  return {
    resultType: 'DRAFT_RESPONSE',
    draft: {
      type: 'draft_delivery',
      action: 'BUAT SURAT JALAN',
      data: {
        invoiceNumber: saleData.invoiceNumber,
        invoiceId: saleData.id,
        customerId: saleData.customerId,
        customerName: saleData.customer?.name || params.customerName || 'UMUM',
        driver: params.driver || '',
        vehicle: params.vehicle || '',
        deliveryDate: new Date().toISOString().split('T')[0],
        items: deliveryItems,
        notes: params.notes || `Surat jalan dari invoice ${saleData.invoiceNumber}`,
      },
    },
  };
}
