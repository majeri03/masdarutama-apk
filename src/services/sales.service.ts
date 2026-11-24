/**
 * Sales Service - POS checkout and sales history
 */
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import { toDayStartISO, toDayEndISO } from '../utils/dates';
import type { ApiResponse, Sale, PaymentMethod, Salesman, SalesmanDetail, SalesmanFeeSetting } from '../types';

export interface CheckoutPayload {
  customerId: string; // wajib, tidak boleh null/undefined untuk schema backend
  // Salesman yang menangani transaksi ini (PKG-D, perbaikan 7 item #5) —
  // opsional; kalau tidak dipilih, backend menyimpan null. Dicatat
  // internal saja, TIDAK PERNAH dicetak di invoice/struk/surat jalan.
  salesmanId?: string;
  items: {
    productId: string;
    productUnitId: string; // ← KRITIS: ID dari tabel ProductUnit (bukan unitId)
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;    // ← KRITIS: qty * unitPrice - itemDiscount
  }[];
  totalAmount: number;   // ← KRITIS: sum of all item subtotals
  discount: number;      // diskon keseluruhan (bukan per item)
  tax: number;
  grandTotal: number;    // ← KRITIS: totalAmount - discount + tax
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;  // ← KRITIS: paidAmount - grandTotal (min 0)
  notes?: string;
}

export interface SaleListResponse {
  sales: Sale[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const salesService = {
  async checkout(payload: CheckoutPayload): Promise<ApiResponse<Sale>> {
    try {
      const response = await api.post<ApiResponse<Sale>>(API_ENDPOINTS.SALES, payload);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal checkout transaksi' };
    }
  },

  async getSales(filters: {
    search?: string;
    customerId?: string;
    page?: number;
    limit?: number;
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<ApiResponse<SaleListResponse>> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (!value) return;
        // QA fix M-31: tanggal "YYYY-MM-DD" dinormalisasi ke batas hari
        // lokal (awal hari untuk dateFrom, akhir hari untuk dateTo),
        // supaya filter satu hari benar-benar mencakup hari itu penuh
        // dan tidak bergeser karena UTC. Timestamp ISO lengkap tidak diubah.
        if (key === 'dateFrom') params.append(key, toDayStartISO(String(value)));
        else if (key === 'dateTo') params.append(key, toDayEndISO(String(value)));
        else params.append(key, String(value));
      });
      const response = await api.get<ApiResponse<SaleListResponse>>(
        `${API_ENDPOINTS.SALES}?${params.toString()}`
      );
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat riwayat penjualan' };
    }
  },

  async getSaleById(id: string): Promise<ApiResponse<Sale>> {
    try {
      const response = await api.get<ApiResponse<Sale>>(API_ENDPOINTS.SALE_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail penjualan' };
    }
  },

  // Daftar salesman aktif untuk pemilih Sales di POS (PKG-D, perbaikan
  // 7 item #5). Endpoint disediakan backend setelah PKG-A di-deploy
  // (GET /api/salesmen). Kalau backend belum di-deploy, kembalikan gagal
  // secara aman supaya POS tetap jalan dengan pilihan "Tanpa Sales".
  async getSalesmen(activeOnly = true): Promise<ApiResponse<Salesman[]>> {
    try {
      const response = await api.get<any>(
        `/api/salesmen${activeOnly ? '?activeOnly=true' : ''}`
      );
      const body = response.data;
      if (body && body.success === false) {
        return { success: false, error: body.error || 'Gagal memuat daftar salesman' };
      }
      const list = Array.isArray(body) ? body : body?.data;
      return { success: true, data: Array.isArray(list) ? list : [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat daftar salesman' };
    }
  },

  async updateProof(id: string, proofUrl: string | null, notes?: string): Promise<ApiResponse<Sale>> {
    try {
      const response = await api.patch<ApiResponse<Sale>>(API_ENDPOINTS.SALE_DETAIL(id), {
        proofUrl,
        notes,
      });
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memperbarui bukti pembayaran' };
    }
  },

  // --- Manajemen salesman (24 Nov 2026, pisah Sales & Poin) ---
  // Dipakai layar Salesmen. Baca: KASIR+ (GET /api/salesmen). Tulis:
  // SUPER_ADMIN saja — backend menolak role lain (403). UI juga hanya
  // menampilkan tombol tulis untuk SUPER_ADMIN, tapi server yang memutuskan.
  async createSalesman(data: { name: string; phone?: string | null }): Promise<ApiResponse<Salesman>> {
    try {
      const response = await api.post<ApiResponse<Salesman>>(API_ENDPOINTS.SALESMEN, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menambahkan salesman' };
    }
  },

  async updateSalesman(id: string, data: { name: string; phone?: string | null; isActive?: boolean }): Promise<ApiResponse<Salesman>> {
    try {
      const response = await api.put<ApiResponse<Salesman>>(API_ENDPOINTS.SALESMAN_DETAIL(id), data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memperbarui salesman' };
    }
  },

  // Nonaktifkan/aktifkan: PUT dengan nama + no HP yang sama dan isActive
  // dibalik — backend tidak punya endpoint toggle khusus (toggle di web
  // memakai server action, bukan API), jadi PUT penuh adalah jalurnya.
  async toggleSalesmanStatus(salesman: Salesman): Promise<ApiResponse<Salesman>> {
    return this.updateSalesman(salesman.id, {
      name: salesman.name,
      phone: salesman.phone,
      isActive: !salesman.isActive,
    });
  },

  async deleteSalesman(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<ApiResponse<void>>(API_ENDPOINTS.SALESMAN_DETAIL(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus salesman' };
    }
  },

  // --- Fee salesman (24 Nov 2026, APK fee) ---
  // Route REST tipis di backend (patch backend-apk-routes) di atas server
  // action web yang sama — angka fee dihitung server, APK hanya tampil.
  // Baca detail + pengaturan: KASIR+. Ubah pengaturan global + override
  // per invoice: SUPER_ADMIN saja (backend menolak role lain, 403).
  // Fee TIDAK PERNAH dicetak di invoice/struk/surat jalan (internal saja).
  async getSalesmanFeeSetting(): Promise<ApiResponse<SalesmanFeeSetting>> {
    try {
      const response = await api.get<ApiResponse<SalesmanFeeSetting>>(API_ENDPOINTS.SALESMAN_FEE_SETTING);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat pengaturan fee' };
    }
  },

  async updateSalesmanFeeSetting(data: { enabled: boolean; percent: number }): Promise<ApiResponse<SalesmanFeeSetting>> {
    try {
      const response = await api.put<ApiResponse<SalesmanFeeSetting>>(API_ENDPOINTS.SALESMAN_FEE_SETTING, data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menyimpan pengaturan fee' };
    }
  },

  async getSalesmanDetail(id: string): Promise<ApiResponse<SalesmanDetail>> {
    try {
      const response = await api.get<ApiResponse<SalesmanDetail>>(API_ENDPOINTS.SALESMAN_DETAIL_VIEW(id));
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memuat detail salesman' };
    }
  },

  // Override fee satu invoice. enabled null = ikut global (hapus
  // override), percent null = ikut persen global. Field yang tidak
  // dikirim = tidak diubah. Hanya SUPER_ADMIN (backend menolak yang lain).
  async updateSaleFeeOverride(
    saleId: string,
    data: { enabled?: boolean | null; percent?: number | null }
  ): Promise<ApiResponse<void>> {
    try {
      const response = await api.post<ApiResponse<void>>(API_ENDPOINTS.SALE_FEE(saleId), data);
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menyimpan pengaturan fee invoice' };
    }
  },
};

