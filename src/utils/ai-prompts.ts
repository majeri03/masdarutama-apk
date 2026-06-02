/**
 * ai-prompts.ts — MIDA System Prompts (ReAct Agent Edition)
 *
 * Arsitektur: Hybrid ReAct Loop
 * - Dynamic Context Injection  → untuk produk (akurasi 99%, zero hallucination)
 * - ReAct Loop (multi-turn)    → untuk Cross-Document (invoice → surat jalan, dst.)
 */

// ==================== TOOL CATALOG ====================
// Sumber kebenaran tunggal untuk semua tool yang tersedia.
const TOOL_CATALOG = `
====== DAFTAR TOOL (WAJIB DIPAKAI SECARA EKSPLISIT) ======

--- PILAR A: PESANAN WHATSAPP ---
1. getPendingWaOrders   → Ambil semua pesanan WA pending.       params: {}
2. confirmWaOrder       → Konfirmasi pesanan WA (buat draf).   params: {"orderId":"ID","parsedItems":[{"productCode":"XXX","qty":2,"unit":"SAK"}]}
3. rejectWaOrder        → Tolak pesanan WA.                    params: {"orderId":"ID","reason":"alasan"}
4. createAutoOrderan    → Buat orderan WA otomatis dari chat.  params: {"customerName":"nama","items":[{"keyword":"semen","quantity":2,"unit":"SAK"}]}

--- PILAR B: TRANSAKSI PENJUALAN (POS) ---
5. searchProduct        → Cari produk di database.             params: {"keyword":"semen tonasa"}
6. getProductDetail     → Detail lengkap 1 produk.             params: {"productId":"ID_ASLI"}
7. createDraftTransaction → Buat draf transaksi kasir.         params: {"customerName":"Budi","paymentMethod":"CASH","items":[{"productCode":"SMN001","qty":2,"unitName":"SAK"}],"notes":""}
8. getSaleDetail        → Detail invoice/transaksi.            params: {"invoiceNumber":"INV-xxx"}

--- PILAR C: HUTANG & PIUTANG ---
9.  getCustomerDebts    → Lihat piutang pelanggan.             params: {"search":"nama"} atau {}
10. getSupplierDebts    → Lihat utang ke supplier.             params: {"search":"nama"} atau {}
11. createDraftDebtPayment → Buat draf pembayaran hutang.      params: {"debtType":"customer|supplier","debtId":"ID","amount":500000,"paymentMethod":"TRANSFER","notes":""}

--- PILAR D: PEMBELIAN (PO) & SURAT JALAN ---
12. getPurchases        → Lihat daftar Purchase Order.         params: {"search":"keyword"} atau {}
13. createDraftPurchase → Buat draf PO baru.                   params: {"supplierName":"nama","items":[{"productCode":"SMN001","qty":10,"unitName":"SAK","unitPrice":80000}],"notes":""}
14. getDeliveryOrders   → Lihat daftar Surat Jalan.            params: {"search":"keyword"} atau {}
15. createDraftDelivery → Buat draf Surat Jalan dari invoice.  params: {"invoiceNumber":"INV-xxx","driver":"Ahmad","vehicle":"Pickup L300","notes":""}

--- PILAR E: INVENTARIS & STOK ---
16. getLowStockProducts → Produk di bawah stok minimum.        params: {}
17. getStockMovements   → Riwayat pergerakan stok.             params: {"search":"keyword"} atau {}
18. createDraftStockAdjustment → Draf penyesuaian stok.        params: {"productName":"semen","type":"IN|OUT|ADJUSTMENT","qty":10,"notes":""}

--- PILAR F: DATA MASTER & LAPORAN ---
19. searchCustomer      → Cari data pelanggan.                 params: {"keyword":"nama/kode"}
20. searchSupplier      → Cari data supplier.                  params: {"keyword":"nama/kode"}
21. getStoreSettings    → Profil toko (nama, alamat, rekening). params: {}
22. getFinancialReport  → Laporan keuangan (omzet, profit).    params: {"dateFrom":"2026-01-01","dateTo":"2026-01-31"} atau {}
23. getInventoryReport  → Ringkasan inventaris.                params: {}

--- AKSI BERBAHAYA (SUPER ADMIN) ---
24. deleteConfirmation  → Draf penghapusan data.               params: {"target":"product|customer|supplier","id":"ID","name":"Nama"}
25. editConfirmation    → Draf perubahan data.                 params: {"target":"product|customer|supplier","id":"ID","name":"Nama","changes":{"field":"value"}}
`;

// ==================== ATURAN INTI ====================
const CORE_RULES = `
====== ATURAN MUTLAK ======
1. READ   → Bebas untuk semua role (KASIR, ADMIN, SUPER_ADMIN).
2. CREATE → WAJIB via DRAF. Jangan pernah langsung eksekusi tanpa user konfirmasi.
3. EDIT   → Hanya SUPER_ADMIN. Wajib via draf editConfirmation.
4. DELETE → Hanya SUPER_ADMIN. Wajib via draf deleteConfirmation.
5. DILARANG mengarang productId, debtId, atau invoiceNumber. WAJIB ambil dari hasil tool.
6. Jika user bukan SUPER_ADMIN dan minta edit/hapus, tolak dengan sopan.

====== GAYA BICARA ======
- Bahasa Indonesia ramah, profesional, langsung to the point.
- Jika memberi link navigasi: [Teks Link](/route/param). Contoh: [Lihat Invoice](/transaction-history/INV-123)
- Jika data kosong/error, sampaikan jelas dan usulkan solusi.
`;

// ==================== REACT THINKING RULES ====================
const REACT_RULES = `
====== CARA BERPIKIR (ReAct: Thought → Action → Observation) ======

Kamu adalah agent otonom. Kamu boleh memanggil tool secara berurutan.
Format WAJIB saat memanggil tool:
{"type":"tool_call","tool":"NAMA_TOOL","params":{...}}

ATURAN BERPIKIR:
- Jika kamu butuh data dari database sebelum eksekusi → panggil tool pencarian DAHULU.
- Jika kamu sudah punya semua data yang dibutuhkan → langsung eksekusi tool final.
- Jangan PERNAH menebak productId, debtId, atau invoiceNumber. Ambil dari hasil pencarian.
- Satu respons = satu tool_call JSON SAJA. Jangan campur teks biasa dengan JSON tool_call.

CONTOH ALUR MULTI-STEP:
User: "Buat PO semen tonasa 10 sak ke supplier Bosowa"
→ Kamu pikir: "Saya perlu productCode/productName yang valid."
→ Action: {"type":"tool_call","tool":"searchProduct","params":{"keyword":"semen tonasa"}}
→ [Sistem inject Observation: data produk dari DB]
→ Kamu pikir: "Saya sudah punya nama produk valid. Sekarang buat PO."
→ Action: {"type":"tool_call","tool":"createDraftPurchase","params":{"supplierName":"Bosowa","items":[{"productName":"Semen Tonasa","qty":10,"unitName":"SAK"}]}}

CONTOH ALUR SINGLE-STEP (jika data sudah ada di Quick Reference):
User: "Buat nota 5 sak semen merah atas nama Pak Hasan, bayar cash"
→ Kamu sudah lihat Quick Reference: Semen Merah ada dengan code SMR001
→ Langsung Action: {"type":"tool_call","tool":"createDraftTransaction","params":{"customerName":"Pak Hasan","paymentMethod":"CASH","items":[{"productCode":"SMR001","qty":5,"unitName":"SAK"}]}}
`;

// ==================== DYNAMIC CONTEXT BUILDER ====================

export interface ContextProduct {
  code: string;
  name: string;
  currentStock: number;
  category?: string;
  units?: Array<{
    unitName: string;
    sellPrice: number;
    buyPrice: number;
    isPrimary: boolean;
  }>;
}

/**
 * Builds a complete system prompt with injected product context.
 * Products are injected as a "Quick Reference" table so the AI can recognize
 * product names WITHOUT needing to call searchProduct for common requests.
 *
 * @param contextProducts - Top relevant products fetched from DB based on user keyword
 */
export const buildDynamicSystemPrompt = (contextProducts: ContextProduct[] = []): string => {
  const identity = `Kamu adalah "MIDA" (Masdar Intelligent Digital Assistant), agent AI otonom untuk Toko Bangunan TB Masdar Utama.
Kamu memiliki akses penuh ke semua fitur toko dan WAJIB mengeksekusi perintah user dengan akurat.\n`;

  let quickRef = '';
  if (contextProducts.length > 0) {
    const rows = contextProducts
      .slice(0, 20)
      .map(p => {
        const primaryUnit = p.units?.find(u => u.isPrimary) || p.units?.[0];
        const price = primaryUnit ? `Rp${primaryUnit.sellPrice?.toLocaleString('id-ID')}/${primaryUnit.unitName}` : '-';
        return `• [${p.code}] ${p.name} | Stok: ${p.currentStock} | ${price}`;
      })
      .join('\n');

    quickRef = `
====== QUICK REFERENCE PRODUK (data real dari database) ======
Gunakan data ini langsung — JANGAN hallusinasi nama atau kode produk.
${rows}
(Jika produk tidak ada di sini, gunakan tool searchProduct untuk mencari.)
`;
  }

  return identity + quickRef + '\n' + REACT_RULES + '\n' + TOOL_CATALOG + '\n' + CORE_RULES;
};

// ==================== FALLBACK INTENT CLASSIFIER ====================
// Digunakan saat model LLM offline tidak tersedia (mode pattern matching).
// Lebih deterministik: deteksi intent → pre-fetch data → eksekusi langsung.

export interface FallbackIntent {
  tool: string;
  params: Record<string, any>;
  needsPreFetch?: {
    tool: string;
    params: Record<string, any>;
    mapResult: (result: any, originalParams: Record<string, any>) => Record<string, any>;
  };
}

export const classifyFallbackIntent = (text: string): FallbackIntent | null => {
  const lower = text.toLowerCase();
  const tc = (tool: string, params: any, needsPreFetch?: FallbackIntent['needsPreFetch']): FallbackIntent =>
    ({ tool, params, needsPreFetch });

  // ---- Pesanan WA ----
  if (/(lihat|tampil|cek).*(order|pesanan).*(wa|whatsapp|pending)/i.test(lower) || /orderan.*wa/i.test(lower))
    return tc('getPendingWaOrders', {});
  if (/(tolak|reject|batal).*(order|pesanan)/i.test(lower))
    return tc('rejectWaOrder', { orderId: '', reason: 'Ditolak via MIDA' });

  // ---- Stok & Produk ----
  if (/(stok|stock).*(rendah|habis|kosong|minimum|menipis)/i.test(lower))
    return tc('getLowStockProducts', {});
  if (/(riwayat|histori|pergerakan).*(stok|stock)/i.test(lower))
    return tc('getStockMovements', { search: '' });

  // ---- Hutang & Piutang ----
  if (/(utang|hutang|piutang|bon).*(supplier|pabrik|suplier)/i.test(lower))
    return tc('getSupplierDebts', {});
  if (/(utang|hutang|piutang|bon)/i.test(lower)) {
    const nameMatch = text.match(/(?:hutang|utang|piutang|bon)\s+(?:pak|bu|bpk|ibu)?\s*([A-Za-z][\w\s]{1,25})/i);
    return tc('getCustomerDebts', { search: nameMatch ? nameMatch[1].trim() : '' });
  }

  // ---- Surat Jalan ----
  if (/(buat|bikin|buatkan).*(surat jalan|do|delivery)/i.test(lower)) {
    const invMatch = text.match(/INV[-\s]?\d+/i);
    return tc('createDraftDelivery', {
      invoiceNumber: invMatch ? invMatch[0].toUpperCase() : '',
      driver: '',
      vehicle: '',
      notes: 'Dibuat via MIDA AI',
    });
  }
  if (/(surat jalan|delivery|pengiriman)/i.test(lower))
    return tc('getDeliveryOrders', {});

  // ---- Purchase Order ----
  if (/(buat|bikin|buatkan).*(po|purchase order|pesanan ke supplier)/i.test(lower)) {
    const supplierMatch = text.match(/(?:ke|dari|supplier|vendor|pabrik)\s+([A-Za-z][\w\s]{1,30})/i);
    // Extract product keyword for pre-fetch
    const productMatch = text.match(/(?:\d+\s+\w+\s+)?([a-z][\w\s]{1,30})(?:\s+\d+|\s+sak|\s+pcs|\s+dus)?/i);
    const keyword = productMatch ? productMatch[1].trim() : '';
    const qtyMatch = text.match(/(\d+)\s*(?:sak|pcs|dus|ltr|kg|m|roll|lembar|batang|kantong)/i);
    const unitMatch = text.match(/\d+\s*(sak|pcs|dus|ltr|kg|m|roll|lembar|batang|kantong)/i);

    return tc(
      'createDraftPurchase',
      {
        supplierName: supplierMatch ? supplierMatch[1].trim() : 'UMUM',
        items: [{ keyword, qty: qtyMatch ? Number(qtyMatch[1]) : 1, unitName: unitMatch ? unitMatch[1] : 'SAK' }],
        notes: 'Draf PO via MIDA',
      },
      keyword
        ? {
            tool: 'searchProduct',
            params: { keyword },
            mapResult: (result, original) => {
              const products = result?.data || [];
              const found = products[0];
              return {
                ...original,
                items: original.items.map((item: any) => ({
                  ...item,
                  productCode: found?.code || item.keyword,
                  productName: found?.name || item.keyword,
                })),
              };
            },
          }
        : undefined,
    );
  }
  if (/(po|purchase order|pembelian)/i.test(lower))
    return tc('getPurchases', {});

  // ---- Transaksi ----
  if (/(buat|bikin|buatkan).*(nota|transaksi|penjualan)/i.test(lower)) {
    const nameMatch = text.match(/(?:atas nama|a\.n\.|an\.|untuk|ke|kepada)\s+([A-Za-z][\w\s]{1,30})/i);
    const paymentMethod = /(kredit|hutang|piutang|bon)/i.test(lower)
      ? 'CREDIT'
      : /(transfer|tf|bca|bri|mandiri)/i.test(lower)
      ? 'TRANSFER'
      : 'CASH';
    return tc('createDraftTransaction', {
      customerName: nameMatch ? nameMatch[1].trim() : 'UMUM',
      paymentMethod,
      items: [],
      notes: text,
    });
  }

  // ---- Cari Produk ----
  if (/(harga|stok|cari|ada|jual|beli|berapa|cek)\s+/i.test(lower) &&
    !/(nota|transaksi|surat jalan|po|purchase|laporan|setting)/i.test(lower)) {
    const kw = lower
      .replace(/^(berapa|harga|stok|cari|ada|jual|beli|tolong|carikan|produk|cek|info)\s*/gi, '')
      .trim();
    return tc('searchProduct', { keyword: kw || text });
  }

  // ---- Detail Invoice ----
  if (/(detail|info).*(nota|transaksi|invoice|struk)/i.test(lower)) {
    const invMatch = text.match(/INV[-\s]?\d+/i);
    return tc('getSaleDetail', { invoiceNumber: invMatch ? invMatch[0].toUpperCase() : '' });
  }

  // ---- Data Master ----
  if (/(cari|lihat|daftar).*(customer|pelanggan)/i.test(lower)) {
    const kw = lower.replace(/(cari|lihat|daftar|customer|pelanggan)\s*/gi, '').trim();
    return tc('searchCustomer', { keyword: kw });
  }
  if (/(cari|lihat|daftar).*(supplier|pabrik|suplier)/i.test(lower)) {
    const kw = lower.replace(/(cari|lihat|daftar|supplier|pabrik|suplier)\s*/gi, '').trim();
    return tc('searchSupplier', { keyword: kw });
  }

  // ---- Laporan & Settings ----
  if (/(setting|pengaturan|profil|toko)/i.test(lower))
    return tc('getStoreSettings', {});
  if (/(laporan|omzet|profit|pendapatan|revenue|keuntungan)/i.test(lower))
    return tc('getFinancialReport', {});
  if (/(inventaris|inventory|aset|asset)/i.test(lower))
    return tc('getInventoryReport', {});

  // ---- Stock Opname ----
  if (/(sesuaikan|opname|ubah|ganti).*(stok|stock)/i.test(lower)) {
    const kw = lower.replace(/(sesuaikan|opname|ubah|ganti|stok|stock)\s*/gi, '').trim();
    return tc('createDraftStockAdjustment', { productName: kw, type: 'ADJUSTMENT', qty: 0, notes: 'Stock opname via MIDA' });
  }

  return null;
};

// ==================== HELPERS ====================

/** Format timestamp WIB untuk system prompt */
export const getCurrentTimestamp = (): string => {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Format user message with timestamp context */
export const formatUserPrompt = (text: string): string => {
  return text;
};

// Backward compat — dipakai di llama.service.ts sebagai default.
// Akan di-override oleh buildDynamicSystemPrompt() saat runtime.
export const AI_SYSTEM_PROMPT = buildDynamicSystemPrompt([]);
