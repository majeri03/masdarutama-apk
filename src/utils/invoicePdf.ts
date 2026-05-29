import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import api from '../services/api';
import { API_ENDPOINTS, API_BASE_URL } from '../constants/api';
import { useInvoiceLayoutStore } from '../stores/invoice-layout.store';
import type { Sale } from '../types';
import { acquirePrintLock, releasePrintLock } from './printLock';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  CREDIT: 'Piutang',
  DEBIT_CARD: 'Kartu Debit',
  QRIS: 'QRIS',
};

export const getStoreSettings = async () => {
  try {
    const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
    if (res.data?.success && res.data?.data) {
      return res.data.data;
    }
  } catch (e) {
    console.warn('[INVOICE_PDF] Error getting store settings:', e);
  }
  return {
    name: 'TB Masdar Utama',
    phone: '6285398346677',
    address: 'Jl. Poros Maros - Pangkep, Maccini Baji, Kec. Lau, Kabupaten Maros, Sulawesi Selatan',
    tagline: 'Distributor Bahan Bangunan Terpercaya',
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

export const generateInvoiceHtml = (sale: Sale, store: any) => {
  const layout = useInvoiceLayoutStore.getState();
  const scale = layout.fontSizeScale || 1.0;
  const logoUrl = store.logoUrl
    ? (store.logoUrl.startsWith('http') ? store.logoUrl : `${API_BASE_URL}${store.logoUrl}`)
    : null;

  const dateStr = new Date(sale.createdAt || sale.saleDate).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const fullDateStr = new Date(sale.createdAt || sale.saleDate).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isPaid = sale.paymentMethod !== 'CREDIT' || Number(sale.paidAmount) >= Number(sale.grandTotal);
  const watermarkText = isPaid ? 'PAID' : 'UNPAID';
  const watermarkColor = '#9CA3AF';
  // Hapus watermark khusus di PO dan Surat Jalan
  const showWatermark = layout.layoutType !== 'SURAT_JALAN' && 
                        !sale.invoiceNumber?.startsWith('PO-') && 
                        !sale.invoiceNumber?.startsWith('DO-');

  const items = sale.saleItems || [];

  if (layout.layoutType === 'STRUK_KECIL') {
    // 1. TEMPLATE STRUK KECIL (THERMAL 58mm/80mm)
    const itemsHtml = items.map((item) => `
      <div style="margin-bottom: 8px; font-size: ${12 * scale}px;">
        <div style="font-weight: bold;">${item.product.name}</div>
        <div style="display: flex; justify-content: space-between; font-size: ${11 * scale}px; color: #4B5563; margin-top: 2px;">
          <div>${item.quantity} ${item.unit?.name || 'Unit'} x Rp ${item.unitPrice.toLocaleString('id-ID')}</div>
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
            line-height: 1.3;
          }
          .container {
            max-width: 300px;
            margin: 0 auto;
            position: relative;
            overflow: hidden;
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
          ${showWatermark ? `
          <div style="position: absolute; top: 40%; left: 0; right: 0; text-align: center; opacity: 0.08; transform: rotate(-25deg); font-size: 44px; font-weight: 900; z-index: 1000; color: ${watermarkColor}; pointer-events: none; white-space: nowrap; font-family: sans-serif; letter-spacing: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${watermarkText}
          </div>
          ` : ''}
          ${layout.showHeader ? `
            <div class="center">
              <div style="font-size: ${16 * scale}px; font-weight: bold;">${store.name}</div>
              ${store.tagline ? `<div style="font-size: ${10 * scale}px; font-style: italic;">${store.tagline}</div>` : ''}
              <div style="font-size: ${10 * scale}px; color: #4B5563; margin-top: 4px;">
                ${store.address || ''}<br>
                Telp: ${store.phone || ''}
              </div>
            </div>
            <div class="divider"></div>
          ` : ''}

          <div style="font-size: ${11 * scale}px; color: #374151;">
            <div class="row"><div>No. Invoice</div><div class="bold">#${sale.invoiceNumber}</div></div>
            <div class="row"><div>Tanggal</div><div>${dateStr}</div></div>
            <div class="row"><div>Kasir</div><div>${sale.cashier?.name || '-'}</div></div>
            ${layout.showCustomerInfo && sale.customer ? `
              <div class="row"><div>Pelanggan</div><div class="bold">${sale.customer.name}</div></div>
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
            <div class="row"><div>Metode Bayar</div><div class="bold">${PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod}</div></div>
            <div class="row"><div>Bayar</div><div>Rp ${sale.paidAmount.toLocaleString('id-ID')}</div></div>
            <div class="row" style="color: #059669; font-weight: bold;"><div>Kembalian</div><div>Rp ${sale.changeAmount.toLocaleString('id-ID')}</div></div>
          </div>

          ${layout.showPaymentInfo && sale.paymentMethod === 'TRANSFER' ? `
            <div class="divider"></div>
            <div style="font-size: ${10 * scale}px; background: #F3F4F6; padding: 6px; border-radius: 4px; text-align: center;">
              <div style="font-weight: bold;">TRANSFER KE:</div>
              <div>${layout.bankName} - ${layout.bankAccount}</div>
              <div style="font-weight: bold;">a/n ${layout.bankHolder}</div>
            </div>
          ` : ''}

          ${layout.showFooter ? `
            <div class="divider"></div>
            <div class="center" style="font-size: ${9 * scale}px; color: #6B7280;">
              <div style="font-weight: bold; margin-bottom: 4px;">TERIMA KASIH</div>
              <div>${layout.footerTerms}</div>
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
          <div style="font-weight: bold;">${item.product.name}</div>
          <div style="font-size: 10px; color: #4B5563;">${item.product.code}</div>
        </td>
        <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center; font-weight: bold;">
          ${item.quantity} ${item.unit?.name || 'Unit'}
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
        <title>Surat Jalan ${sale.invoiceNumber}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 30px;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            position: relative;
            overflow: hidden;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            border: 2px solid #000000;
            padding: 15px;
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
            padding: 10px;
            margin-bottom: 20px;
          }
          .info-card-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 4px;
            margin-bottom: 6px;
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
          ${showWatermark ? `
          <div style="position: absolute; top: 35%; left: 0; right: 0; text-align: center; opacity: 0.08; transform: rotate(-30deg); font-size: 110px; font-weight: 900; z-index: 1000; color: ${watermarkColor}; pointer-events: none; white-space: nowrap; font-family: sans-serif; letter-spacing: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${watermarkText}
          </div>
          ` : ''}
          <div class="header-box">
            <div>
              <div class="store-title">${store.name}</div>
              <div style="font-size: 11px;">
                ${store.address}<br>
                No. Telp: ${store.phone}
              </div>
            </div>
            <div>
              <div class="do-title">SURAT JALAN</div>
              <table style="font-size: 11px; margin-top: 5px;">
                <tr><td>No. Dokumen</td><td>: <b>DO-${sale.invoiceNumber}</b></td></tr>
                <tr><td>No. Ref POS</td><td>: #${sale.invoiceNumber}</td></tr>
                <tr><td>Tanggal</td><td>: ${dateStr}</td></tr>
              </table>
            </div>
          </div>

          <div class="info-card">
            <div class="info-card-title">Tujuan Pengiriman</div>
            <table style="width: 100%;">
              <tr>
                <td style="width: 15%; font-weight: bold;">Nama Penerima</td>
                <td style="width: 85%;">: ${sale.customer?.name || 'Umum'}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; vertical-align: top;">Alamat Kirim</td>
                <td>: ${sale.customer?.address || '-'}</td>
              </tr>
              ${sale.customer?.phone ? `
                <tr>
                  <td style="font-weight: bold;">No. Telepon</td>
                  <td>: ${sale.customer.phone}</td>
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
              <div class="signature-line">( ${sale.cashier?.name || 'Authorized'} )</div>
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
          <td style="padding: 10px 8px; text-align: center;">${index + 1}</td>
          <td style="padding: 10px 8px;">
            <div style="font-weight: bold; color: #000000;">${item.product.name}</div>
            <div style="font-size: 10px; color: #4B5563; font-family: monospace;">${item.product.code}</div>
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            ${item.quantity} ${item.unit?.name || 'Unit'}
          </td>
          <td style="padding: 10px 8px; text-align: right;">
            Rp ${item.unitPrice.toLocaleString('id-ID')}
          </td>
          <td style="padding: 10px 8px; text-align: right;">
            Rp ${gross.toLocaleString('id-ID')}
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            ${discountPercent}%
          </td>
          <td style="padding: 10px 8px; text-align: right; color: #DC2626;">
            ${item.discount > 0 ? `Rp ${item.discount.toLocaleString('id-ID')}` : 'Rp 0'}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: bold;">
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
        <title>Faktur NCR ${sale.invoiceNumber}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 30px;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            position: relative;
            overflow: hidden;
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
          }
          .meta-label {
            font-weight: bold;
            color: #000000;
          }
          .card-box {
            border: 1px solid #000000;
            padding: 12px;
            margin-bottom: 20px;
          }
          .card-box-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 4px;
            margin-bottom: 8px;
            font-size: ${11 * scale}px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .data-table th {
            border-bottom: 2px solid #000000;
            border-top: 2px solid #000000;
            padding: 8px;
            background: transparent;
            font-weight: bold;
            text-transform: uppercase;
            font-size: ${11 * scale}px;
          }
          .bottom-container {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
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
            background: transparent;
          }
          .transfer-box {
            border: 1px solid #000000;
            padding: 10px;
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
            border: 1px solid #000000;
          }
          .totals-table td {
            padding: 8px;
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
            margin-top: 30px;
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
          ${showWatermark ? `
          <div style="position: absolute; top: 35%; left: 0; right: 0; text-align: center; opacity: 0.08; transform: rotate(-30deg); font-size: 110px; font-weight: 900; z-index: 1000; color: ${watermarkColor}; pointer-events: none; white-space: nowrap; font-family: sans-serif; letter-spacing: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${watermarkText}
          </div>
          ` : ''}
          <!-- ─── HEADER ─── -->
          ${layout.showHeader ? `
          <div class="header-box" style="align-items: center;">
            <div class="store-info">
              <div class="store-name" style="margin: 0; font-size: ${18 * scale}px; font-weight: bold; text-transform: uppercase;">${store.name}</div>
              <div style="font-size: 11px; margin-top: 4px;">
                ${store.address}<br>
                Phone: ${store.phone}
              </div>
            </div>
            <div class="invoice-title-col">
              <div class="invoice-title">FAKTUR</div>
              <table class="meta-table">
                <tr>
                  <td class="meta-label">Number</td>
                  <td>: ${sale.invoiceNumber}</td>
                </tr>
                <tr>
                  <td class="meta-label">Date</td>
                  <td>: ${dateStr}</td>
                </tr>
                <tr>
                  <td class="meta-label">Payment</td>
                  <td>: ${PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod}</td>
                </tr>
                <tr>
                  <td class="meta-label">Cashier</td>
                  <td>: ${sale.cashier?.name || '-'}</td>
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
                  <td>: <b>${sale.customer?.name || 'Umum'}</b></td>
                </tr>
                ${sale.customer?.phone ? `<tr><td style="font-weight: bold;">Phone</td><td>: ${sale.customer.phone}</td></tr>` : ''}
                ${sale.customer?.address ? `<tr><td style="font-weight: bold;">Address</td><td>: ${sale.customer.address}</td></tr>` : ''}
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

                ${layout.showPaymentInfo && sale.paymentMethod === 'TRANSFER' ? `
                  <div class="transfer-box">
                    <b>TRANSFER VIA:</b><br>
                    ${layout.bankName}<br>
                    A/C: <b>${layout.bankAccount}</b><br>
                    A/N: <b>${layout.bankHolder}</b>
                  </div>
                ` : ''}
              </div>

              ${layout.showSignature ? `
                <div class="signature-box">
                  <div style="font-weight: bold; text-decoration: underline;">${sale.cashier?.name || 'Authorized'}</div>
                  <div style="font-size: 9px; color: #4B5563; margin-top: 2px;">Authorized Signature</div>
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
              ${layout.footerTerms}
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
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center;">${index + 1}</td>
          <td style="padding: 10px 8px; border: 1px solid #000000;">
            <div style="font-weight: bold; color: #000000;">${item.product.name}</div>
            <div style="font-size: 10px; color: #4B5563; font-family: monospace;">${item.product.code}</div>
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center;">
            ${item.quantity} ${item.unit?.name || 'Unit'}
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: right;">
            Rp ${item.unitPrice.toLocaleString('id-ID')}
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: right;">
            Rp ${gross.toLocaleString('id-ID')}
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: center;">
            ${discountPercent}%
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: right; color: #DC2626;">
            ${item.discount > 0 ? `Rp ${item.discount.toLocaleString('id-ID')}` : 'Rp 0'}
          </td>
          <td style="padding: 10px 8px; border: 1px solid #000000; text-align: right; font-weight: bold;">
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
        <title>Invoice A4 ${sale.invoiceNumber}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 30px;
            font-size: ${12 * scale}px;
            line-height: 1.4;
          }
          .container {
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            position: relative;
            overflow: hidden;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            border: 2px solid #000000;
            padding: 15px;
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
          }
          .meta-label {
            font-weight: bold;
            color: #000000;
          }
          .card-box {
            border: 1px solid #000000;
            padding: 12px;
            margin-bottom: 20px;
          }
          .card-box-title {
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 4px;
            margin-bottom: 8px;
            font-size: ${11 * scale}px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .data-table th {
            border: 1px solid #000000;
            padding: 8px;
            background: #E5E7EB;
            font-weight: bold;
            text-transform: uppercase;
            font-size: ${11 * scale}px;
          }
          .bottom-container {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
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
            padding: 8px;
            border: 1px solid #000000;
          }
          .totals-label {
            font-weight: bold;
          }
          .grand-total-row {
            background: #E5E7EB;
            font-weight: bold;
            font-size: ${13 * scale}px;
          }
          .footer-terms {
            text-align: center;
            margin-top: 30px;
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
          ${showWatermark ? `
          <div style="position: absolute; top: 35%; left: 0; right: 0; text-align: center; opacity: 0.08; transform: rotate(-30deg); font-size: 110px; font-weight: 900; z-index: 1000; color: ${watermarkColor}; pointer-events: none; white-space: nowrap; font-family: sans-serif; letter-spacing: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${watermarkText}
          </div>
          ` : ''}
          <!-- ─── HEADER ─── -->
          <div class="header-box" style="align-items: center;">
            <div class="store-info" style="display: flex; align-items: center; gap: 15px;">
              ${layout.showLogo && logoUrl ? `
                <img src="${logoUrl}" style="width: 64px; height: 64px; object-fit: contain;" />
              ` : layout.showLogo ? `
                <div style="width: 48px; height: 48px; background-color: #DC2626; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); display: flex; align-items: center; justify-content: center; position: relative; border-radius: 4px; overflow: hidden;">
                  <div style="width: 20px; height: 20px; background-color: #FFFFFF; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); position: absolute; bottom: 0; left: 14px; margin-bottom: 2px;"></div>
                </div>
              ` : ''}
              <div>
                <div class="store-name" style="margin: 0; font-size: ${18 * scale}px; font-weight: bold; text-transform: uppercase;">${store.name}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  ${store.address}<br>
                  Phone: ${store.phone}
                </div>
              </div>
            </div>
            <div class="invoice-title-col">
              <div class="invoice-title">INVOICE</div>
              <table class="meta-table">
                <tr>
                  <td class="meta-label">Number</td>
                  <td>: ${sale.invoiceNumber}</td>
                </tr>
                <tr>
                  <td class="meta-label">Date</td>
                  <td>: ${dateStr}</td>
                </tr>
                <tr>
                  <td class="meta-label">Payment</td>
                  <td>: ${PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod}</td>
                </tr>
                <tr>
                  <td class="meta-label">Cashier</td>
                  <td>: ${sale.cashier?.name || '-'}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- ─── CUSTOMER INFO ─── -->
          ${layout.showCustomerInfo ? `
            <div class="card-box">
              <div class="card-box-title">Customer Info</div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 12%; font-weight: bold;">Customer</td>
                  <td>: <b>${sale.customer?.name || 'Umum'}</b></td>
                </tr>
                ${sale.customer?.phone ? `<tr><td style="font-weight: bold;">Phone</td><td>: ${sale.customer.phone}</td></tr>` : ''}
                ${sale.customer?.address ? `<tr><td style="font-weight: bold;">Address</td><td>: ${sale.customer.address}</td></tr>` : ''}
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

                ${layout.showPaymentInfo && sale.paymentMethod === 'TRANSFER' ? `
                  <div class="transfer-box">
                    <b>TRANSFER VIA:</b><br>
                    ${layout.bankName}<br>
                    A/C: <b>${layout.bankAccount}</b><br>
                    A/N: <b>${layout.bankHolder}</b>
                  </div>
                ` : ''}
              </div>

              ${layout.showSignature ? `
                <div class="signature-box">
                  <div style="font-weight: bold; text-decoration: underline;">${sale.cashier?.name || 'Authorized'}</div>
                  <div style="font-size: 9px; color: #4B5563; margin-top: 2px;">Authorized Signature</div>
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
              ${layout.footerTerms}
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }
};

export const printInvoice = async (sale: Sale) => {
  if (!acquirePrintLock()) return;
  try {
    const store = await getStoreSettings();
    const html = generateInvoiceHtml(sale, store);
    await Print.printAsync({ html });
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
    const { uri } = await Print.printToFileAsync({ html });
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
