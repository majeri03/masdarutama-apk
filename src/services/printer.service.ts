import { BLEPrinter, USBPrinter, NetPrinter } from 'react-native-thermal-receipt-printer-image-qr';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PrinterType = 'BLE' | 'USB' | 'NET' | 'SYSTEM';

interface ConnectedPrinter {
  type: PrinterType;
  device_name: string;
  inner_mac_address?: string; // For BLE
  vendor_id?: string;         // For USB
  product_id?: string;        // For USB
  host?: string;              // For Net
  port?: number;              // For Net
}

/**
 * withTimeout — Bungkus Promise dengan timeout.
 * Jika Promise tidak selesai dalam batas waktu, throw TimeoutError.
 * Mencegah BLE/USB init hang selamanya.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[PrinterService] ${label} timeout setelah ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

class PrinterService {
  private activePrinter: ConnectedPrinter | null = null;
  private isInitialized = false;
  private initError: string | null = null;

  /**
   * init — Inisialisasi semua modul printer dengan timeout per modul.
   * Tidak akan throw atau hang — semua error ditangkap per modul.
   * Timeout 5 detik per modul untuk mencegah blank screen.
   */
  async init() {
    if (this.isInitialized) return;
    this.initError = null;

    // BLE init dengan timeout 5 detik
    try {
      await withTimeout(BLEPrinter.init(), 5000, 'BLEPrinter.init');
    } catch (e: any) {
      console.warn('[PrinterService] BLE init gagal/timeout:', e?.message);
    }

    // USB init dengan timeout 5 detik
    try {
      await withTimeout(USBPrinter.init(), 5000, 'USBPrinter.init');
    } catch (e: any) {
      console.warn('[PrinterService] USB init gagal/timeout:', e?.message);
    }

    // NET init dengan timeout 3 detik
    try {
      await withTimeout(NetPrinter.init(), 3000, 'NetPrinter.init');
    } catch (e: any) {
      console.warn('[PrinterService] NET init gagal/timeout:', e?.message);
    }

    // Tandai sudah diinisialisasi meskipun ada error (mencegah infinite loading)
    this.isInitialized = true;

    // Load saved printer (dengan error handling)
    try {
      const saved = await AsyncStorage.getItem('saved_printer');
      if (saved) {
        const printer: ConnectedPrinter = JSON.parse(saved);
        // Koneksi ulang dengan timeout
        await this.connect(printer).catch(() => {
          console.warn('[PrinterService] Gagal reconnect ke printer tersimpan');
        });
      }
    } catch (e) {
      console.warn('[PrinterService] Gagal load saved printer:', e);
    }
  }

  /**
   * getInitError — Kembalikan pesan error inisialisasi jika ada.
   */
  getInitError(): string | null {
    return this.initError;
  }

  async getBlePrinters() {
    try {
      const result = await withTimeout(BLEPrinter.getDeviceList(), 8000, 'getDeviceList');
      return result || [];
    } catch (e: any) {
      console.warn('[PrinterService] Get BLE devices gagal/timeout:', e?.message);
      return [];
    }
  }

  async getUsbPrinters() {
    try {
      const result = await withTimeout(USBPrinter.getDeviceList(), 5000, 'getUsbDeviceList');
      return result || [];
    } catch (e: any) {
      console.warn('[PrinterService] Get USB devices gagal/timeout:', e?.message);
      return [];
    }
  }

  async connect(printer: ConnectedPrinter): Promise<boolean> {
    try {
      if (printer.type === 'BLE' && printer.inner_mac_address) {
        await withTimeout(
          BLEPrinter.connectPrinter(printer.inner_mac_address),
          10000,
          'BLE connect'
        );
      } else if (printer.type === 'USB' && printer.vendor_id && printer.product_id) {
        await withTimeout(
          USBPrinter.connectPrinter(printer.vendor_id, printer.product_id),
          8000,
          'USB connect'
        );
      } else if (printer.type === 'NET' && printer.host && printer.port) {
        await withTimeout(
          NetPrinter.connectPrinter(printer.host, printer.port),
          8000,
          'NET connect'
        );
      } else if (printer.type === 'SYSTEM') {
        // System (expo-print) tidak perlu native pairing
      }

      this.activePrinter = printer;
      await AsyncStorage.setItem('saved_printer', JSON.stringify(printer));
      return true;
    } catch (e: any) {
      console.warn('[PrinterService] Connect Error:', e?.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.activePrinter?.type === 'BLE') {
        await BLEPrinter.closeConn().catch(() => {});
      } else if (this.activePrinter?.type === 'USB') {
        await USBPrinter.closeConn().catch(() => {});
      } else if (this.activePrinter?.type === 'NET') {
        await NetPrinter.closeConn().catch(() => {});
      }
    } catch (e) {
      console.warn('[PrinterService] Disconnect Error:', e);
    } finally {
      this.activePrinter = null;
      await AsyncStorage.removeItem('saved_printer').catch(() => {});
    }
  }

  getActivePrinter() {
    return this.activePrinter;
  }

  async printText(text: string) {
    if (!this.activePrinter) {
      throw new Error('No printer connected');
    }

    try {
      if (this.activePrinter.type === 'BLE') {
        await BLEPrinter.printText(text);
      } else if (this.activePrinter.type === 'USB') {
        await USBPrinter.printText(text);
      } else if (this.activePrinter.type === 'NET') {
        await NetPrinter.printText(text);
      }
    } catch (e) {
      console.warn('[PrinterService] Print Error:', e);
      throw e;
    }
  }

  async printReceipt(rawEscPos: string) {
    await this.printText(rawEscPos + '\n\n\n');
  }
}

export const printerService = new PrinterService();
