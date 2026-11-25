/**
 * notificationText.ts — WS-2 (Notifikasi), 25 Nov 2026.
 *
 * Masalah yang diperbaiki di sini:
 * 1. Ada notifikasi "Pesanan Baru Masuk!" yang badannya berisi string JSON
 *    mentah — persis objek `data` payload push Expo dari
 *    NotificationService.send() backend:
 *    {"id":"...","type":"NEW_ORDER","screen":"History",
 *     "params":{"saleId":"...","invoiceNumber":"..."}}.
 *    Di kode HEAD (APK 016212c + backend e005dfc9) TIDAK ADA jalur yang
 *    menulis objek itu ke field body — semua penulis body membangun teks
 *    bersih. Record JSON itu jadi hampir pasti berasal dari build/deploy
 *    yang lebih lama dari HEAD dan bertahan di DB / AsyncStorage. Karena
 *    penulis pastinya tidak bisa dibuktikan dari kode HEAD, perbaikan di
 *    sini bersifat pertahanan berlapis: JANGAN PERNAH render JSON mentah
 *    sebagai pesan — di titik masuk (ingest), di pemetaan server, dan di
 *    render layar.
 * 2. Dedup lintas jalur tidak jalan untuk baris server: kolom `dedupKey`
 *    belum ada di tabel Notification backend, jadi baris server hasil
 *    fetch tidak punya dedupKey dan salinan lokal (push/polling) dari
 *    kejadian yang sama tidak bisa dikenali — kecuali lewat judul+isi,
 *    yang GAGAL kalau salah satu salinan badannya JSON mentah. Maka
 *    dedupKey diturunkan dari params (saleId / doId / productId) di sini.
 */

/** Coba parse string JSON; gagal -> null (tidak pernah throw). */
export function tryParseJsonObject(text: unknown): Record<string, any> | null {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    const parsed: unknown = JSON.parse(t);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Apakah teks ini terlihat seperti objek JSON (bukan pesan manusia)? */
export function looksLikeJson(text: unknown): boolean {
  return tryParseJsonObject(text) !== null;
}

/**
 * Normalisasi `data` notifikasi: lewat FCM, nilai `params` (dan kadang
 * seluruh `data`) bisa sampai sebagai STRING JSON, bukan objek. Kembalikan
 * objek datar yang aman dipakai layar (screen/type/params selalu objek).
 */
export function normalizeNotificationData(raw: unknown): Record<string, any> {
  if (typeof raw === 'string') {
    return tryParseJsonObject(raw) ?? {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const data = { ...(raw as Record<string, any>) };
  if (typeof data.params === 'string') {
    data.params = tryParseJsonObject(data.params) ?? {};
  }
  if (data.params && typeof data.params !== 'object') data.params = {};
  return data;
}

/**
 * Turunkan dedupKey dari payload kalau tidak ada: dua record (satu bersih,
 * satu JSON mentah) yang merujuk saleId yang sama adalah SATU kejadian.
 */
export function deriveDedupKey(
  data: Record<string, any> | undefined,
  explicit?: string,
): string | undefined {
  if (explicit && typeof explicit === 'string' && explicit.trim() !== '') return explicit;
  const params = (data?.params ?? {}) as Record<string, any>;
  const type = String(data?.type ?? '').toUpperCase();
  if (typeof params.saleId === 'string' && params.saleId) return `sale-${params.saleId}`;
  if (typeof params.doId === 'string' && params.doId) {
    return `do-${params.doId}-${String(data?.type ?? '')}`;
  }
  if (typeof params.productId === 'string' && params.productId) {
    return `low-stock-${params.productId}`;
  }
  if (type === 'LOW_STOCK' && typeof params.productName === 'string' && params.productName) {
    return `low-stock-name-${params.productName}`;
  }
  return undefined;
}

/**
 * Ubah body JSON mentah menjadi pesan manusiawi. Kalau body bukan JSON,
 * dikembalikan apa adanya. Kalau JSON tapi tidak bisa dipahami, kembalikan
 * '' supaya layar menampilkan judul saja — TIDAK PERNAH JSON mentah.
 */
export function humanizeNotificationBody(
  body: unknown,
  data?: Record<string, any>,
): string {
  if (typeof body !== 'string') return '';
  const trimmed = body.trim();
  if (trimmed === '') return '';
  const parsed = tryParseJsonObject(trimmed);
  if (!parsed) return body;
  // Body adalah objek JSON — hampir pasti payload push Expo
  // {id, type, screen, params:{...}} atau params yang ter-stringify.
  const merged: Record<string, any> = { ...(data ?? {}), ...parsed };
  // params bisa berupa objek, atau string JSON (jalur FCM lama).
  const rawParams = merged.params ?? parsed.params ?? {};
  const p = normalizeNotificationData(rawParams) as Record<string, any>;
  // normalizeNotificationData mengembalikan objek data itu sendiri kalau
  // inputnya sudah objek — jadi kalau rawParams adalah {saleId,...},
  // p === rawParams. Kalau rawParams adalah string JSON, p adalah hasil
  // parse-nya. Kalau rawParams adalah {params:{...}} (data push utuh),
  // pakai p.params.
  const params = (p.params && typeof p.params === 'object' ? p.params : p) as Record<string, any>;
  const type = String(merged.type ?? parsed.type ?? '').toUpperCase();
  if (type === 'NEW_ORDER' || p.saleId || p.invoiceNumber) {
    if (p.invoiceNumber) return `Pesanan baru — Invoice #${p.invoiceNumber}. Ketuk untuk melihat detail penjualan.`;
    if (p.saleId) return 'Pesanan baru masuk. Ketuk untuk melihat detail penjualan.';
  }
  if (type === 'DELIVERY_UPDATE' || p.doId || p.doNumber) {
    if (p.doNumber) return `Surat Jalan #${p.doNumber} diperbarui. Ketuk untuk melihat detail pengiriman.`;
    return 'Status pengiriman diperbarui. Ketuk untuk melihat detail.';
  }
  if (type === 'LOW_STOCK' || p.productId || p.productName) {
    if (p.productName) return `${p.productName} stoknya rendah. Ketuk untuk melihat produk.`;
    return 'Ada produk yang stoknya rendah. Ketuk untuk melihat produk.';
  }
  if (type === 'DEBT_DUE' || p.customerName) {
    if (p.customerName) return `${p.customerName} — ada piutang jatuh tempo. Ketuk untuk melihat.`;
  }
  if (type === 'PAYMENT_RECEIVED' || p.customerName || p.supplierName) {
    const name = p.customerName ?? p.supplierName;
    if (name) return `${name} — ada pembayaran masuk. Ketuk untuk melihat.`;
  }
  // JSON tidak dikenal: sembunyikan isinya, tampilkan judul saja.
  return '';
}
