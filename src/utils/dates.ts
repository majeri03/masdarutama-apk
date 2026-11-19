/**
 * Date helpers — QA fix M-31.
 *
 * Masalah: layar-layar mengirim filter tanggal sebagai string "YYYY-MM-DD"
 * yang diambil dari `date.toISOString().split('T')[0]`. Itu tanggal UTC,
 * bukan tanggal lokal (WITA = UTC+8, jadi tanggal bisa mundur 1 hari),
 * dan `dateTo` yang hanya tanggal berarti tengah malam — backend
 * `new Date("2026-11-19")` = 00:00, sehingga transaksi di hari itu
 * hampir semuanya terlewat.
 *
 * Perbaikan: normalisasi di service sebelum dikirim —
 * dateFrom  -> awal hari lokal (00:00:00.000) sebagai ISO (UTC),
 * dateTo   -> akhir hari lokal (23:59:59.999) sebagai ISO (UTC).
 * Nilai yang sudah berupa timestamp ISO lengkap tidak diubah.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-19" -> ISO awal hari lokal. Nilai lain dikembalikan apa adanya. */
export function toDayStartISO(value: string): string {
  if (!DATE_ONLY_RE.test(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** "2026-11-19" -> ISO akhir hari lokal. Nilai lain dikembalikan apa adanya. */
export function toDayEndISO(value: string): string {
  if (!DATE_ONLY_RE.test(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Date -> "YYYY-MM-DD" memakai kalender LOKAL (bukan UTC). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
