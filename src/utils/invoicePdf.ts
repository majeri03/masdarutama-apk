import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import api from '../services/api';
import { API_ENDPOINTS, API_BASE_URL } from '../constants/api';
import { useInvoiceLayoutStore } from '../stores/invoice-layout.store';
import type { Sale } from '../types';
import { acquirePrintLock, releasePrintLock } from './printLock';
import { printerService } from '../services/printer.service';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  CREDIT: 'Piutang',
  DEBIT_CARD: 'Kartu Debit',
  QRIS: 'QRIS',
};

// WS-6: teks dari database (nama toko/produk/pelanggan) tidak boleh ditempel
// mentah ke HTML invoice — sama seperti web (src/lib/utils/invoice-printer.ts).
const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export const getStoreSettings = async () => {
  try {
    const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
    if (res.data?.success && res.data?.data) {
      // WS-6: sekali ambil pengaturan toko, sekalian sinkronkan layout +
      // rekening dari server (sumber yang sama dengan web) supaya invoice
      // APK sama dengan web. Tanpa internet, layout lokal terakhir tetap dipakai.
      useInvoiceLayoutStore.getState().syncFromServer(res.data.data);
      return res.data.data;
    }
  } catch (e) {
    console.warn('[INVOICE_PDF] Error getting store settings:', e);
  }
  // WS-6: kalau server tidak bisa dihubungi / belum ada data toko, JANGAN
  // isi data toko rekaan (nama/alamat/telp/tagline palsu). Generator di bawah
  // menampilkan "Data toko belum diisi" seperti web, dan blok rekening
  // disembunyikan bila nomor rekening kosong.
  return {
    name: '',
    phone: '',
    address: '',
    tagline: '',
    logoUrl: null,
    bankName: '',
    bankAccount: '',
    bankHolder: '',
  };
};

// Helper terbilang rupiah
export const numberToTerbilang = (num: number): string => {
  const units = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  if (num < 12) return units[num];
  if (num < 20) return numberToTerbilang(num - 10) + ' Belas';
  if (num < 100) return numberToTerbilang(Math.floor(num / 10)) + ' Puluh ' + numberToTerbilang(num % 10);
  if (num < 200) return 'Seratus ' + numberToTerbilang(num - 100);
  if (num < 1000) return numberToTerbilang(Math.floor(num / 100)) + ' Ratus ' + numberToTerbilang(num % 100);
  if (num < 2000) return 'Seribu ' + numberToTerbilang(num - 1000);
  if (num < 1000000) return numberToTerbilang(Math.floor(num / 1000)) + ' Ribu ' + numberToTerbilang(num % 1000);
  if (num < 1000000000) return numberToTerbilang(Math.floor(num / 1000000)) + ' Juta ' + numberToTerbilang(num % 1000000);
  return num.toString();
};

export const getTerbilangRupiah = (num: number): string => {
  try {
    const raw = numberToTerbilang(Math.floor(num));
    if (!raw) return 'Nol Rupiah';
    return (raw + ' Rupiah').replace(/\s+/g, ' ').trim();
  } catch {
    return '-';
  }
};

/**
 * WS-6: `overrides` hanya menimpa layout untuk SATU render ini (mis. Surat
 * Jalan dari DeliveryScreen) TANPA mengubah store tersimpan — sebelumnya
 * DeliveryScreen memanggil updateLayout({ layoutType: 'SURAT_JALAN' }) yang
 * mengubah layout permanen, sehingga semua invoice berikutnya ikut menjadi
 * Surat Jalan sampai diubah manual.
 */
// WS-6: info toko siap tampil — dipakai generateInvoiceHtml DAN
// generateThermalReceiptString. Nama kosong = "Data toko belum diisi"
// (seperti web), bukan nama rekaan.
const getStoreDisplay = (store: any) => ({
  storeName: (store.name || '').trim() || 'Data toko belum diisi',
  storeAddress: (store.address || '').trim(),
  storePhone: (store.phone || '').trim(),
  storeTagline: (store.tagline || '').trim(),
});

// WS-4 (perbaikan ke-4, 27 Nov 2026): watermark DIHAPUS TOTAL dari semua
// format invoice/faktur/struk/surat jalan APK — user tidak mau pakai
// watermark sama sekali. Variabel isPaid/watermarkText/showWatermark dan
// keempat blok <div> watermark (struk, surat jalan, faktur NCR, invoice A4)
// sudah dibuang; yang tersisa hanya baris jumlah "Bayar/Paid" (angka, bukan
// watermark) dan label status di layar riwayat (bukan di dokumen).

// WS-4: ukuran halaman PDF/cetak (pt, 1 pt = 1/72 inci) untuk expo-print.
// Sebelumnya printToFileAsync/printAsync dipanggil tanpa width/height,
// sehingga expo-print memakai default US Letter 612x792 — struk thermal
// jadi halaman selebar A4/Letter dengan isi sempit di tengah, dan invoice
// A4 tidak sama persis dengan ukuran @page di template.
const MM_TO_PT = 72 / 25.4;
const parsePaperMm = (paperSize: string | undefined, fallbackMm: number): number => {
  const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(paperSize || '');
  const mm = m ? parseFloat(m[1].replace(',', '.')) : NaN;
  return Number.isFinite(mm) && mm > 0 ? mm : fallbackMm;
};
const DOC_PAPER_PT: Record<string, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  A5: { width: 420, height: 595 },
  LETTER: { width: 612, height: 792 },
  LEGAL: { width: 612, height: 1008 },
  // F4/Folio 215x330mm; HVS bukan ukuran — samakan A4.
  F4: { width: 609, height: 935 },
  HVS: { width: 595, height: 842 },
};

/**
 * Ukuran halaman (pt) untuk Print.printAsync / Print.printToFileAsync
 * sesuai layout yang sedang dipakai. Struk: lebar = lebar kertas thermal
 * yang dipilih (default 58mm); tinggi dibiarkan 792 agar struk panjang
 * mengalir ke halaman berikut, bukan terpotong oleh tinggi yang dipatok.
 * Dokumen (A4/NCR/Surat Jalan): dari invoicePaperSize, dukung preset
 * maupun custom "210mm x 297mm".
 */
export const getInvoicePdfPageSize = (
  layoutType: string,
  paperSize: string,
  invoicePaperSize: string,
): { width: number; height: number } => {
  if (layoutType === 'STRUK_KECIL') {
    return { width: Math.round(parsePaperMm(paperSize, 58) * MM_TO_PT * 10) / 10, height: 792 };
  }
  const preset = DOC_PAPER_PT[(invoicePaperSize || '').trim().toUpperCase()];
  if (preset) return preset;
  const dims = (invoicePaperSize || '').split('x').map((p) => parsePaperMm(p, NaN));
  if (dims.length === 2 && Number.isFinite(dims[0]) && Number.isFinite(dims[1])) {
    return { width: Math.round(dims[0] * MM_TO_PT), height: Math.round(dims[1] * MM_TO_PT) };
  }
  return DOC_PAPER_PT.A4;
};

/** Lebar kontainer struk (CSS px @96dpi) mengikuti kertas yang dipilih
 *  (58mm default) dikurangi padding body — sebelumnya selalu 300px
 *  (≈80mm) walau kertas diset 58mm, sehingga isi bisa meluber/terpotong
 *  di tepi saat dicetak ke PDF sempit. */
const strukContainerPx = (paperSize: string): number =>
  Math.max(150, Math.round(parsePaperMm(paperSize, 58) * (96 / 25.4)) - 20);

export const generateInvoiceHtml = (
  sale: Sale,
  store: any,
  overrides?: Partial<Pick<ReturnType<typeof useInvoiceLayoutStore.getState>, 'layoutType' | 'showHeader' | 'showLogo' | 'showCustomerInfo' | 'showPaymentInfo' | 'showSignature' | 'showFooter' | 'bankName' | 'bankAccount' | 'bankHolder' | 'footerTerms' | 'fontSizeScale' | 'paperSize' | 'invoicePaperSize'>>
) => {
  const layout = { ...useInvoiceLayoutStore.getState(), ...(overrides || {}) };
  const scale = layout.fontSizeScale || 1.0;
  const { storeName, storeAddress, storePhone, storeTagline } = getStoreDisplay(store);
  const logoUrl = store.logoUrl
    ? (store.logoUrl.startsWith('http') ? store.logoUrl : `${API_BASE_URL}${store.logoUrl}`)
    : null;

  const dateStr = new Date(sale.createdAt || sale.saleDate).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const items = sale.saleItems || [];

  if (layout.layoutType === 'STRUK_KECIL') {
    // 1. TEMPLATE STRUK KECIL (THERMAL 58mm/80mm)
    const itemsHtml = items.map((item) => `
      <div style="margin-bottom: 8px; font-size: ${12 * scale}px;">
        <div style="font-weight: bold;">${escapeHtml(item.product.name)}</div>
        <div style="display: flex; justify-content: space-between; font-size: ${11 * scale}px; color: #4B5563; margin-top: 2px;">
          <div>${item.quantity} ${escapeHtml(item.unit?.symbol || item.unit?.name) || 'Unit'} x Rp ${item.unitPrice.toLocaleString('id-ID')}</div>
          <div style="font-weight: bold; color: #111827;">Rp ${item.subtotal.toLocaleString('id-ID')}</div>
        </div>
        ${item.discount > 0 ? `
          <div style="font-size: ${10 * scale}px; color: #DC2626; text-align: right;">
            Diskon Item: -Rp ${item.discount.toLocaleString('id-ID')}
          </div>
        ` : ''}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Struk POS</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            color: #111827;
            margin: 0;
            padding: 10px;
            background: #ffffff;
            color-scheme: light;
            line-height: 1.3;
          }
          .container {
            /* WS-4: lebar mengikuti kertas thermal yang dipilih (58mm
               default ≈ 199px), bukan selalu 300px (≈80mm). */
            max-width: ${strukContainerPx(layout.paperSize)}px;
            margin: 0 auto;
            position: relative;
          }
          .divider {
            border-top: 1px dashed #000000;
            margin: 8px 0;
          }
          .double-divider {
            border-top: 2px dashed #000000;
            margin: 8px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: ${11 * scale}px;
            margin: 3px 0;
          }
          .bold {
            font-weight: bold;
          }
          .center {
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${layout.showHeader ? `
            <div class="center">
              <div style="font-size: ${16 * scale}px; font-weight: bold;">${escapeHtml(storeName)}</div>
              ${storeTagline ? `<div style="font-size: ${10 * scale}px; font-style: italic;">${escapeHtml(storeTagline)}</div>` : ''}
              <div style="font-size: ${10 * scale}px; color: #4B5563; margin-top: 4px;">
                ${storeAddress ? `${escapeHtml(storeAddress)}<br>` : ''}${storePhone ? `Telp: ${escapeHtml(storePhone)}` : ''}
              </div>
            </div>
            <div class="divider"></div>
          ` : ''}

          <div style="font-size: ${11 * scale}px; color: #374151;">
            <div class="row"><div>No. Invoice</div><div class="bold">#${escapeHtml(sale.invoiceNumber)}</div></div>
            <div class="row"><div>Tanggal</div><div>${dateStr}</div></div>
            <div class="row"><div>Kasir</div><div>${escapeHtml(sale.cashier?.name) || '-'}</div></div>
            ${layout.showCustomerInfo && sale.customer ? `
              <div class="row"><div>Pelanggan</div><div class="bold">${escapeHtml(sale.customer.name)}</div></div>
            ` : ''}
          </div>

          <div class="double-divider"></div>
          
          <div style="font-size: ${11 * scale}px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">Daftar Barang</div>
          <div>${itemsHtml}</div>
          
          <div class="double-divider"></div>

          <div style="font-size: ${12 * scale}px;">
            <div class="row"><div>Total Qty</div><div class="bold">${items.reduce((sum, item) => sum + item.quantity, 0)} Pcs</div></div>
            <div class="row"><div>Subtotal</div><div>Rp ${sale.totalAmount.toLocaleString('id-ID')}</div></div>
            ${sale.discount > 0 ? `<div class="row" style="color: #DC2626;"><div>Diskon Global</div><div>-Rp ${sale.discount.toLocaleString('id-ID')}</div></div>` : ''}
            ${sale.tax > 0 ? `<div class="row"><div>Pajak</div><div>Rp ${sale.tax.toLocaleString('id-ID')}</div></div>` : ''}
            <div class="divider"></div>
            <div class="row bold" style="font-size: ${14 * scale}px;">
              <div>GRAND TOTAL</div>
              <div>Rp ${sale.grandTotal.toLocaleString('id-ID')}</div>
            </div>
            <div class="divider"></div>
            <div class="row"><div>Metode Bayar</div><div class="bold">${PAYMENT_LABEL[sale.paymentMethod] || escapeHtml(sale.paymentMethod)}</div></div>
            <div class="row"><div>Bayar</div><div>Rp ${sale.paidAmount.toLocaleString('id-ID')}</div></div>
            <div class="row" style="color: #059669; font-weight: bold;"><div>Kembalian</div><div>Rp ${sale.changeAmount.toLocaleString('id-ID')}</div></div>
          </div>

          ${layout.showPaymentInfo && layout.bankAccount ? `
            <div class="divider"></div>
            <div style="font-size: ${10 * scale}px; background: #F3F4F6; padding: 6px; border-radius: 4px; text-align: center;">
              <div style="font-weight: bold;">REKENING BANK:</div>
              <div>${escapeHtml(layout.bankName)} - ${escapeHtml(layout.bankAccount)}</div>
              <div style="font-weight: bold;">a/n ${escapeHtml(layout.bankHolder)}</div>
            </div>
          ` : ''}

          ${layout.showFooter ? `
            <div class="divider"></div>
            <div class="center" style="font-size: ${9 * scale}px; color: #6B7280;">
              <div style="font-weight: bold; margin-bottom: 4px;">TERIMA KASIH</div>
              <div>${escapeHtml(layout.footerTerms)}</div>
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  } else if (layout.layoutType === 'SURAT_JALAN') {
    // 2. TEMPLATE SURAT JALAN (DO - NO PRICE DETAILS)
    const itemsHtml = items.map((item, index) => `
      <tr style="font-size: ${12 * scale}px;">
        <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center;">${index + 1}</td>
        <td style="padding: 10px 8px; border: 1px solid #000000;">
          <div style="font-weight: bold;">${escapeHtml(item.product.name)}</div>
          <div style="font-size: 10px; color: #4B5563;">${escapeHtml(item.product.code)}</div>
        </td>
        <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center; font-weight: bold;">
          ${item.quantity} ${escapeHtml(item.unit?.symbol || item.unit?.name) || 'Unit'}
        </td>
        <td style="padding: 10px 8px; border: 1px solid #000000; font-style: italic; color: #4B5563;">
          -
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Surat Jalan ${escapeHtml(sale.invoiceNumber)}</title>
        <style>
          @page { size: ${layout.invoicePaperSize || 'A4'}; margin: 10mm; }
          body {
            font-family: Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 30px;
            background: #ffffff;
            color-scheme: light;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            position: relative;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #000000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .store-title {
            font-size: ${18 * scale}px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .do-title {
            font-size: ${22 * scale}px;
            font-weight: bold;
            text-align: right;
            letter-spacing: 1px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .info-table td {
            padding: 4px;
            vertical-align: top;
          }
          .info-card {
            border: 1px solid #000000;
            padding: 8px 10px;
            margin-bottom: 12px;
          }
          .info-card-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 2px;
            margin-bottom: 4px;
            font-size: ${11 * scale}px;
          }
          .product-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .product-table th {
            border: 1px solid #000000;
            padding: 10px 8px;
            background: #E5E7EB;
            font-weight: bold;
            text-transform: uppercase;
            font-size: ${11 * scale}px;
          }
          .signature-section {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
          }
          .signature-box {
            width: 28%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000000;
            margin-top: 70px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header-box">
            <div>
              <div class="store-title">${escapeHtml(storeName)}</div>
              <div style="font-size: 11px;">
                ${storeAddress ? `${escapeHtml(storeAddress)}<br>` : ''}${storePhone ? `No. Telp: ${escapeHtml(storePhone)}` : ''}
              </div>
            </div>
            <div>
              <div class="do-title">SURAT JALAN</div>
              <table style="font-size: 11px; margin-top: 5px; white-space: nowrap;">
                <tr><td>No. Dokumen</td><td>: <b>DO-${escapeHtml(sale.invoiceNumber)}</b></td></tr>
                <tr><td>No. Ref POS</td><td>: #${escapeHtml(sale.invoiceNumber)}</td></tr>
                <tr><td>Tanggal</td><td>: ${dateStr}</td></tr>
              </table>
            </div>
          </div>

          <div class="info-card">
            <div class="info-card-title">Tujuan Pengiriman</div>
            <table style="width: 100%;">
              <tr>
                <td style="width: 15%; font-weight: bold;">Nama Penerima</td>
                <td style="width: 85%;">: ${escapeHtml(sale.customer?.name) || 'Umum'}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; vertical-align: top;">Alamat Kirim</td>
                <td>: ${escapeHtml(sale.customer?.address) || '-'}</td>
              </tr>
              ${sale.customer?.phone ? `
                <tr>
                  <td style="font-weight: bold;">No. Telepon</td>
                  <td>: ${escapeHtml(sale.customer.phone)}</td>
                </tr>
              ` : ''}
            </table>
          </div>

          <table class="product-table">
            <thead>
              <tr>
                <th style="width: 8%; text-align: center;">No</th>
                <th style="width: 52%; text-align: left;">Nama Barang / Deskripsi</th>
                <th style="width: 20%; text-align: center;">Kuantitas</th>
                <th style="width: 20%; text-align: left;">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="font-size: 11px; font-style: italic; color: #4B5563; margin-top: -10px;">
            * Harap periksa barang kiriman dengan seksama sebelum menandatangani surat jalan ini.
          </div>

          <div class="signature-section">
            <div class="signature-box">
              <div>Diterima Oleh,</div>
              <div class="signature-line">( Pelanggan )</div>
            </div>
            <div class="signature-box">
              <div>Pengirim / Sopir,</div>
              <div class="signature-line">( Sopir )</div>
            </div>
            <div class="signature-box">
              <div>Hormat Kami,</div>
              <div class="signature-line">( ${escapeHtml(sale.cashier?.name) || 'Authorized'} )</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (layout.layoutType === 'FAKTUR_NCR') {
    // 3. FAKTUR NCR (SIMILAR TO A4 BUT NO LOGO, NO GRIDS)
    const itemsHtml = items.map((item, index) => {
      const gross = item.quantity * item.unitPrice;
      const discountPercent = item.discount > 0 ? Math.round((item.discount / gross) * 100) : 0;
      return `
        <tr style="font-size: ${12 * scale}px;">
          <td style="padding: 2px 8px; text-align: center;">${index + 1}</td>
          <td style="padding: 2px 8px;">
            <div style="font-weight: bold; color: #000000;">${escapeHtml(item.product.name)}</div>
            <div style="font-size: 10px; color: #4B5563; font-family: monospace;">${escapeHtml(item.product.code)}</div>
          </td>
          <td style="padding: 2px 8px; text-align: center;">
            ${item.quantity} ${escapeHtml(item.unit?.symbol || item.unit?.name) || 'Unit'}
          </td>
          <td style="padding: 2px 8px; text-align: right;">
            Rp ${item.unitPrice.toLocaleString('id-ID')}
          </td>
          <td style="padding: 2px 8px; text-align: right;">
            Rp ${gross.toLocaleString('id-ID')}
          </td>
          <td style="padding: 2px 8px; text-align: center;">
            ${discountPercent}%
          </td>
          <td style="padding: 2px 8px; text-align: right; color: #DC2626;">
            ${item.discount > 0 ? `Rp ${item.discount.toLocaleString('id-ID')}` : '-'}
          </td>
          <td style="padding: 2px 8px; text-align: right; font-weight: bold;">
            Rp ${item.subtotal.toLocaleString('id-ID')}
          </td>
        </tr>
      `;
    }).join('') || '';

    const terbilangStr = getTerbilangRupiah(sale.grandTotal);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Faktur NCR ${escapeHtml(sale.invoiceNumber)}</title>
        <style>
          @page { size: ${layout.invoicePaperSize || 'A4'}; margin: 10mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            color-scheme: light;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            width: 100%;
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            position: relative;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #000000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .store-info {
            flex: 1.5;
          }
          .store-name {
            font-size: ${18 * scale}px;
            font-weight: bold;
            color: #000000;
            margin: 0 0 4px 0;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .invoice-title-col {
            flex: 1;
            text-align: right;
          }
          .invoice-title {
            font-size: ${24 * scale}px;
            font-weight: bold;
            color: #000000;
            margin: 0 0 10px 0;
            letter-spacing: 1px;
          }
          .meta-table {
            float: right;
            border-collapse: collapse;
            font-size: ${11 * scale}px;
          }
          .meta-table td {
            padding: 3px 6px;
            /* WS-4: nomor invoice tidak boleh patah di tengah (mis. setelah "/"). */
            white-space: nowrap;
          }
          .meta-label {
            font-weight: bold;
            color: #000000;
          }
          .card-box {
            /* WS-6 Faktur NCR web: tanpa kotak/border, lebar 50% */
            /* WS-4: blok info customer dirapatkan (hemat kertas). */
            border: none;
            padding: 0;
            margin-bottom: 8px;
            width: 50%;
          }
          .card-box-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: none;
            padding-bottom: 2px;
            margin-bottom: 4px;
            font-size: ${11 * scale}px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .data-table th {
            border-bottom: 1.5px solid #000000;
            padding: 3px 8px;
            background: transparent;
            font-weight: bold;
            text-transform: uppercase;
            font-size: ${11 * scale}px;
          }
          .bottom-container {
            display: flex;
            justify-content: space-between;
            margin-top: 14px;
            gap: 20px;
          }
          .bottom-left {
            flex: 1.4;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .terbilang-box {
            border: none;
            padding: 0;
            font-size: ${11 * scale}px;
            margin-bottom: 12px;
            background: transparent;
          }
          .transfer-box {
            border: none;
            padding: 0;
            display: inline-block;
            font-size: ${11 * scale}px;
            background: transparent;
          }
          .signature-box {
            text-align: center;
            margin-top: auto;
            align-self: flex-end;
            padding-right: 30px;
            font-size: ${11 * scale}px;
          }
          .signature-line {
            width: 120px;
            border-top: 1px solid #000000;
            margin-top: 60px;
            font-weight: bold;
          }
          .bottom-right {
            flex: 1;
          }
          .totals-table {
            width: 100%;
            border-collapse: collapse;
            border: none;
          }
          .totals-table td {
            padding: 5px 8px;
            border: none;
          }
          .totals-label {
            font-weight: bold;
          }
          .grand-total-row {
            border-top: 1px solid #000000;
            font-weight: bold;
            font-size: ${13 * scale}px;
          }
          .footer-terms {
            text-align: center;
            margin-top: 20px;
            border-top: 2px solid #000000;
            padding-top: 8px;
            font-size: ${9 * scale}px;
            font-weight: bold;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- ─── HEADER ─── -->
          ${layout.showHeader ? `
          <div class="header-box" style="align-items: center;">
            <div class="store-info">
              <div class="store-name" style="margin: 0; font-size: ${18 * scale}px; font-weight: bold; text-transform: uppercase;">${escapeHtml(storeName)}</div>
              <div style="font-size: 11px; margin-top: 4px;">
                ${storeAddress ? `${escapeHtml(storeAddress)}<br>` : ''}${storePhone ? `Phone: ${escapeHtml(storePhone)}` : ''}
              </div>
            </div>
            <div class="invoice-title-col">
              <div class="invoice-title">FAKTUR</div>
              <table class="meta-table">
                <tr>
                  <td class="meta-label">Number</td>
                  <td>: ${escapeHtml(sale.invoiceNumber)}</td>
                </tr>
                <tr>
                  <td class="meta-label">Date</td>
                  <td>: ${dateStr}</td>
                </tr>
                <tr>
                  <td class="meta-label">Payment</td>
                  <td>: ${PAYMENT_LABEL[sale.paymentMethod] || escapeHtml(sale.paymentMethod)}</td>
                </tr>
                <tr>
                  <td class="meta-label">Cashier</td>
                  <td>: ${escapeHtml(sale.cashier?.name) || '-'}</td>
                </tr>
              </table>
            </div>
          </div>
          ` : ''}

          <!-- ─── CUSTOMER INFO ─── -->
          ${layout.showCustomerInfo ? `
            <div class="card-box">
              <div class="card-box-title">Customer Info</div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 12%; font-weight: bold;">Customer</td>
                  <td>: <b>${escapeHtml(sale.customer?.name) || 'Umum'}</b></td>
                </tr>
                ${sale.customer?.phone ? `<tr><td style="font-weight: bold;">Phone</td><td>: ${escapeHtml(sale.customer.phone)}</td></tr>` : ''}
                ${sale.customer?.address ? `<tr><td style="font-weight: bold;">Address</td><td>: ${escapeHtml(sale.customer.address)}</td></tr>` : ''}
              </table>
            </div>
          ` : ''}

          <!-- ─── PRODUCTS TABLE ─── -->
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">No</th>
                <th style="width: 40%; text-align: left;">Description</th>
                <th style="width: 12%; text-align: center;">Qty</th>
                <th style="width: 12%; text-align: right;">Price</th>
                <th style="width: 12%; text-align: right;">Gross</th>
                <th style="width: 5%; text-align: center;">%</th>
                <th style="width: 12%; text-align: right;">Disc</th>
                <th style="width: 12%; text-align: right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- ─── BOTTOM BLOCK ─── -->
          <div class="bottom-container">
            <div class="bottom-left">
              <div>
                <div class="terbilang-box">
                  <b>Terbilang:</b> <i>${terbilangStr}</i>
                </div>

                ${layout.showPaymentInfo && layout.bankAccount ? `
                  <div class="transfer-box">
                    <b>REKENING BANK:</b><br>
                    ${escapeHtml(layout.bankName)}<br>
                    A/C: <b>${escapeHtml(layout.bankAccount)}</b><br>
                    A/N: <b>${escapeHtml(layout.bankHolder)}</b>
                  </div>
                ` : ''}
              </div>

              ${layout.showSignature ? `
                <div style="display: flex; justify-content: space-between; margin-top: 30px; text-align: center;">
                  <div style="width: 30%;">
                    <p>Penerima,</p>
                    <br><br><br>
                    <p style="border-top: 1px solid #000000; display: inline-block; width: 80%;">(${escapeHtml(sale.customer?.name) || 'Customer'})</p>
                  </div>
                  <div style="width: 30%;">
                    <p>Hormat Kami,</p>
                    <br><br><br>
                    <p style="border-top: 1px solid #000000; display: inline-block; width: 80%;">(${escapeHtml(sale.cashier?.name) || 'Admin'})</p>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="bottom-right">
              <table class="totals-table">
                <tr>
                  <td class="totals-label">Gross Total</td>
                  <td style="text-align: right; font-weight: bold;">Rp ${sale.totalAmount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Discount</td>
                  <td style="text-align: right; color: #DC2626;">(Rp ${sale.discount.toLocaleString('id-ID')})</td>
                </tr>
                <tr>
                  <td class="totals-label">Tax</td>
                  <td style="text-align: right;">Rp ${sale.tax.toLocaleString('id-ID')}</td>
                </tr>
                <tr class="grand-total-row">
                  <td>Grand Total</td>
                  <td style="text-align: right; font-weight: bold;">Rp ${sale.grandTotal.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Paid</td>
                  <td style="text-align: right;">Rp ${sale.paidAmount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Change</td>
                  <td style="text-align: right; font-weight: bold; color: #059669;">Rp ${sale.changeAmount.toLocaleString('id-ID')}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- ─── TERMS / FOOTER ─── -->
          ${layout.showFooter ? `
            <div class="footer-terms">
              ${escapeHtml(layout.footerTerms)}
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  } else {
    // 4. TEMPLATE INVOICE BESAR (A4 STYLE - EXACTLY LIKE INVOICE PICTURE!)
    const itemsHtml = items.map((item, index) => {
      const gross = item.quantity * item.unitPrice;
      const discountPercent = item.discount > 0 ? Math.round((item.discount / gross) * 100) : 0;
      return `
        <tr style="font-size: ${12 * scale}px;">
          <td style="padding: 5px 8px; text-align: center;">${index + 1}</td>
          <td style="padding: 5px 8px;">
            <div style="font-weight: bold; color: #000000;">${escapeHtml(item.product.name)}</div>
            <div style="font-size: 10px; color: #4B5563; font-family: monospace;">${escapeHtml(item.product.code)}</div>
          </td>
          <td style="padding: 5px 8px; text-align: center;">
            ${item.quantity} ${escapeHtml(item.unit?.symbol || item.unit?.name) || 'Unit'}
          </td>
          <td style="padding: 5px 8px; text-align: right;">
            Rp ${item.unitPrice.toLocaleString('id-ID')}
          </td>
          <td style="padding: 5px 8px; text-align: right;">
            Rp ${gross.toLocaleString('id-ID')}
          </td>
          <td style="padding: 5px 8px; text-align: center;">
            ${discountPercent}%
          </td>
          <td style="padding: 5px 8px; text-align: right; color: #DC2626;">
            ${item.discount > 0 ? `Rp ${item.discount.toLocaleString('id-ID')}` : '-'}
          </td>
          <td style="padding: 5px 8px; text-align: right; font-weight: bold;">
            Rp ${item.subtotal.toLocaleString('id-ID')}
          </td>
        </tr>
      `;
    }).join('') || '';

    const terbilangStr = getTerbilangRupiah(sale.grandTotal);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice A4 ${escapeHtml(sale.invoiceNumber)}</title>
        <style>
          @page { size: ${layout.invoicePaperSize || 'A4'}; margin: 10mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            color-scheme: light;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            width: 100%;
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            position: relative;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #000000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .store-info {
            flex: 1.5;
          }
          .store-name {
            font-size: ${18 * scale}px;
            font-weight: bold;
            color: #000000;
            margin: 0 0 4px 0;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .invoice-title-col {
            flex: 1;
            text-align: right;
          }
          .invoice-title {
            font-size: ${24 * scale}px;
            font-weight: bold;
            color: #000000;
            margin: 0 0 10px 0;
            letter-spacing: 1px;
          }
          .meta-table {
            float: right;
            border-collapse: collapse;
            font-size: ${11 * scale}px;
          }
          .meta-table td {
            padding: 3px 6px;
            /* WS-4: nomor invoice tidak boleh patah di tengah (mis. setelah "/"). */
            white-space: nowrap;
          }
          .meta-label {
            font-weight: bold;
            color: #000000;
          }
          .card-box {
            /* WS-4: blok info customer dirapatkan (hemat kertas). */
            border: 1px solid #000000;
            padding: 6px 10px;
            margin-bottom: 8px;
            width: 50%;
          }
          .card-box-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 2px;
            margin-bottom: 4px;
            font-size: ${11 * scale}px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .data-table th {
            border-bottom: 1.5px solid #000000;
            padding: 5px 8px;
            background: transparent;
            font-weight: bold;
            text-transform: uppercase;
            font-size: ${11 * scale}px;
          }
          .bottom-container {
            display: flex;
            justify-content: space-between;
            margin-top: 14px;
            gap: 20px;
          }
          .bottom-left {
            flex: 1.4;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .terbilang-box {
            border: 1px solid #000000;
            padding: 10px;
            font-size: ${11 * scale}px;
            margin-bottom: 12px;
            background: #F9FAFB;
          }
          .transfer-box {
            border: 1px dashed #000000;
            padding: 10px;
            font-size: ${11 * scale}px;
            background: #F3F4F6;
          }
          .signature-box {
            text-align: center;
            margin-top: auto;
            align-self: flex-end;
            padding-right: 30px;
            font-size: ${11 * scale}px;
          }
          .signature-line {
            width: 120px;
            border-top: 1px solid #000000;
            margin-top: 60px;
            font-weight: bold;
          }
          .bottom-right {
            flex: 1;
          }
          .totals-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #000000;
          }
          .totals-table td {
            padding: 5px 8px;
            border: none;
          }
          .totals-label {
            font-weight: bold;
          }
          .grand-total-row {
            border-top: 1.5px solid #000000;
            background: transparent;
            font-weight: bold;
            font-size: ${13 * scale}px;
          }
          .footer-terms {
            text-align: center;
            margin-top: 20px;
            border-top: 2px solid #000000;
            padding-top: 8px;
            font-size: ${9 * scale}px;
            font-weight: bold;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- ─── HEADER ─── -->
          ${layout.showHeader ? `
          <div class="header-box" style="align-items: center;">
            <div class="store-info" style="display: flex; align-items: center; gap: 15px;">
              ${layout.showLogo && logoUrl ? `
                <img src="${logoUrl}" style="width: 64px; height: 64px; object-fit: contain;" />
              ` : layout.showLogo ? `
                <div style="width: 36px; height: 36px; background-color: #DC2626; display: flex; align-items: center; justify-content: center; margin-right: 10px; color: white; font-weight: bold;">MU</div>
              ` : ''}
              <div>
                <div class="store-name" style="margin: 0; font-size: ${18 * scale}px; font-weight: bold; text-transform: uppercase;">${escapeHtml(storeName)}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  ${storeAddress ? `${escapeHtml(storeAddress)}<br>` : ''}${storePhone ? `Phone: ${escapeHtml(storePhone)}` : ''}
                </div>
              </div>
            </div>
            <div class="invoice-title-col">
              <div class="invoice-title">INVOICE</div>
              <table class="meta-table">
                <tr>
                  <td class="meta-label">Number</td>
                  <td>: ${escapeHtml(sale.invoiceNumber)}</td>
                </tr>
                <tr>
                  <td class="meta-label">Date</td>
                  <td>: ${dateStr}</td>
                </tr>
                <tr>
                  <td class="meta-label">Payment</td>
                  <td>: ${PAYMENT_LABEL[sale.paymentMethod] || escapeHtml(sale.paymentMethod)}</td>
                </tr>
                <tr>
                  <td class="meta-label">Cashier</td>
                  <td>: ${escapeHtml(sale.cashier?.name) || '-'}</td>
                </tr>
              </table>
            </div>
          </div>
          ` : ''}

          <!-- ─── CUSTOMER INFO ─── -->
          ${layout.showCustomerInfo ? `
            <div class="card-box">
              <div class="card-box-title">Customer Info</div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 12%; font-weight: bold;">Customer</td>
                  <td>: <b>${escapeHtml(sale.customer?.name) || 'Umum'}</b></td>
                </tr>
                ${sale.customer?.phone ? `<tr><td style="font-weight: bold;">Phone</td><td>: ${escapeHtml(sale.customer.phone)}</td></tr>` : ''}
                ${sale.customer?.address ? `<tr><td style="font-weight: bold;">Address</td><td>: ${escapeHtml(sale.customer.address)}</td></tr>` : ''}
              </table>
            </div>
          ` : ''}

          <!-- ─── PRODUCTS TABLE ─── -->
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">No</th>
                <th style="width: 40%; text-align: left;">Description</th>
                <th style="width: 12%; text-align: center;">Qty</th>
                <th style="width: 12%; text-align: right;">Price</th>
                <th style="width: 12%; text-align: right;">Gross</th>
                <th style="width: 5%; text-align: center;">%</th>
                <th style="width: 12%; text-align: right;">Disc</th>
                <th style="width: 12%; text-align: right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- ─── BOTTOM BLOCK ─── -->
          <div class="bottom-container">
            <div class="bottom-left">
              <div>
                <div class="terbilang-box">
                  <b>Terbilang:</b> <i>${terbilangStr}</i>
                </div>

                ${layout.showPaymentInfo && layout.bankAccount ? `
                  <div class="transfer-box">
                    <b>REKENING BANK:</b><br>
                    ${escapeHtml(layout.bankName)}<br>
                    A/C: <b>${escapeHtml(layout.bankAccount)}</b><br>
                    A/N: <b>${escapeHtml(layout.bankHolder)}</b>
                  </div>
                ` : ''}
              </div>

              ${layout.showSignature ? `
                <div style="display: flex; justify-content: space-between; margin-top: 30px; text-align: center;">
                  <div style="width: 30%;">
                    <p>Penerima,</p>
                    <br><br><br>
                    <p style="border-top: 1px solid #000000; display: inline-block; width: 80%;">(${escapeHtml(sale.customer?.name) || 'Customer'})</p>
                  </div>
                  <div style="width: 30%;">
                    <p>Hormat Kami,</p>
                    <br><br><br>
                    <p style="border-top: 1px solid #000000; display: inline-block; width: 80%;">(${escapeHtml(sale.cashier?.name) || 'Admin'})</p>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="bottom-right">
              <table class="totals-table">
                <tr>
                  <td class="totals-label">Gross Total</td>
                  <td style="text-align: right; font-weight: bold;">Rp ${sale.totalAmount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Discount</td>
                  <td style="text-align: right; color: #DC2626;">(Rp ${sale.discount.toLocaleString('id-ID')})</td>
                </tr>
                <tr>
                  <td class="totals-label">Tax</td>
                  <td style="text-align: right;">Rp ${sale.tax.toLocaleString('id-ID')}</td>
                </tr>
                <tr class="grand-total-row">
                  <td>Grand Total</td>
                  <td style="text-align: right; font-weight: bold;">Rp ${sale.grandTotal.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Paid</td>
                  <td style="text-align: right;">Rp ${sale.paidAmount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td class="totals-label">Change</td>
                  <td style="text-align: right; font-weight: bold; color: #059669;">Rp ${sale.changeAmount.toLocaleString('id-ID')}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- ─── TERMS / FOOTER ─── -->
          ${layout.showFooter ? `
            <div class="footer-terms">
              ${escapeHtml(layout.footerTerms)}
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }
};

export const generateThermalReceiptString = (sale: Sale, store: any): string => {
  const layout = useInvoiceLayoutStore.getState();
  const { storeName, storeAddress, storePhone, storeTagline } = getStoreDisplay(store);
  const dateStr = new Date(sale.createdAt || sale.saleDate).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  
  let paperWidthChars = 32;
  if (layout.paperSize && layout.paperSize.includes('80')) {
    paperWidthChars = 48;
  } else if (layout.paperSize && parseInt(layout.paperSize) > 80) {
    paperWidthChars = 48; // max typical is 80mm
  }
  const separator = '-'.repeat(paperWidthChars);
  const doubleSeparator = '='.repeat(paperWidthChars);
  
  let receipt = '';
  
  // Header
  if (layout.showHeader) {
    receipt += `[C]<b>${escapeHtml(storeName)}</b>\n`;
    if (storeTagline) receipt += `[C]${escapeHtml(storeTagline)}\n`;
    if (storeAddress) receipt += `[C]${escapeHtml(storeAddress)}\n`;
    if (storePhone) receipt += `[C]Telp: ${escapeHtml(storePhone)}\n`;
    receipt += `[C]${separator}\n`;
  }

  // Meta
  receipt += `[L]No. INV: ${escapeHtml(sale.invoiceNumber)}\n`;
  receipt += `[L]Tanggal: ${dateStr}\n`;
  receipt += `[L]Kasir  : ${escapeHtml(sale.cashier?.name) || '-'}\n`;
  if (layout.showCustomerInfo && sale.customer) {
    receipt += `[L]Plgn   : ${escapeHtml(sale.customer.name)}\n`;
  }
  receipt += `[C]${doubleSeparator}\n`;
  receipt += `[L]<b>DAFTAR BARANG</b>\n`;
  
  // Items
  const items = sale.saleItems || [];
  items.forEach((item) => {
    receipt += `[L]<b>${escapeHtml(item.product.name)}</b>\n`;
    receipt += `[L]${item.quantity} ${escapeHtml(item.unit?.symbol || item.unit?.name) || 'Unit'} x Rp ${item.unitPrice.toLocaleString('id-ID')}\n`;
    if (item.discount > 0) {
      receipt += `[L]Diskon: -Rp ${item.discount.toLocaleString('id-ID')}\n`;
    }
    receipt += `[R]Rp ${item.subtotal.toLocaleString('id-ID')}\n`;
  });
  
  receipt += `[C]${separator}\n`;
  
  // Totals
  receipt += `[L]Subtotal[R]Rp ${sale.totalAmount.toLocaleString('id-ID')}\n`;
  if (sale.discount > 0) receipt += `[L]Diskon[R]-Rp ${sale.discount.toLocaleString('id-ID')}\n`;
  if (sale.tax > 0) receipt += `[L]Pajak[R]Rp ${sale.tax.toLocaleString('id-ID')}\n`;
  receipt += `[L]<b>GRAND TOTAL</b>[R]<b>Rp ${sale.grandTotal.toLocaleString('id-ID')}</b>\n`;
  receipt += `[C]${separator}\n`;
  receipt += `[L]Bayar (${PAYMENT_LABEL[sale.paymentMethod] || escapeHtml(sale.paymentMethod)})[R]Rp ${sale.paidAmount.toLocaleString('id-ID')}\n`;
  receipt += `[L]Kembalian[R]Rp ${sale.changeAmount.toLocaleString('id-ID')}\n`;
  
  // Footer
  if (layout.showFooter) {
    receipt += `[C]${separator}\n`;
    receipt += `[C]<b>TERIMA KASIH</b>\n`;
    receipt += `[C]${escapeHtml(layout.footerTerms) || 'Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan'}\n`;
  }
  
  return receipt;
};

export const printInvoice = async (sale: Sale) => {
  if (!acquirePrintLock()) return;
  try {
    const store = await getStoreSettings();
    const activePrinter = printerService.getActivePrinter();
    const layout = useInvoiceLayoutStore.getState();

    if (activePrinter && activePrinter.type !== 'SYSTEM' && layout.layoutType === 'STRUK_KECIL') {
      // Print via Native ESC/POS Thermal Printer
      const rawReceipt = generateThermalReceiptString(sale, store);
      await printerService.printReceipt(rawReceipt);
    } else {
      // Fallback Print via System (Wi-Fi, A4, PDF)
      const html = generateInvoiceHtml(sale, store);
      // WS-4: ukuran halaman eksplisit — struk sempit sesuai kertas thermal,
      // dokumen A4/NCR sesuai invoicePaperSize (bukan default US Letter).
      const pageSize = getInvoicePdfPageSize(layout.layoutType, layout.paperSize, layout.invoicePaperSize);
      await Print.printAsync({ html, ...pageSize });
    }
  } catch (error) {
    console.error('[PRINT_INVOICE] Error:', error);
    Alert.alert('Gagal Cetak', 'Gagal memproses cetak struk invoice.');
  } finally {
    releasePrintLock();
  }
};

export const shareInvoicePdf = async (sale: Sale) => {
  if (!acquirePrintLock()) return;
  try {
    const store = await getStoreSettings();
    const html = generateInvoiceHtml(sale, store);
    const layout = useInvoiceLayoutStore.getState();
    // WS-4: ukuran halaman eksplisit (lihat getInvoicePdfPageSize) — tanpa
    // ini PDF struk jadi halaman US Letter selebar A4.
    const pageSize = getInvoicePdfPageSize(layout.layoutType, layout.paperSize, layout.invoicePaperSize);
    const { uri } = await Print.printToFileAsync({ html, ...pageSize });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share Invoice ${sale.invoiceNumber}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('[SHARE_INVOICE] Error:', error);
    Alert.alert('Gagal Share', 'Gagal membagikan berkas PDF invoice.');
  } finally {
    releasePrintLock();
  }
};
