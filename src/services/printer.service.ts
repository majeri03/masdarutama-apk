import { BLEPrinter, USBPrinter, NetPrinter } from 'react-native-thermal-receipt-printer-image-qr';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PrinterType = 'BLE' | 'USB' | 'NET' | 'SYSTEM';

interface ConnectedPrinter {
  type: PrinterType;
  device_name: string;
  inner_mac_address?: string; // For BLE
  vendor_id?: string; // For USB
  product_id?: string; // For USB
  host?: string; // For Net
  port?: number; // For Net
}

class PrinterService {
  private activePrinter: ConnectedPrinter | null = null;
  private isInitialized = false;

  async init() {
    if (this.isInitialized) return;
    try {
      try { await BLEPrinter.init(); } catch (e) { console.warn('BLE init error', e); }
      try { await USBPrinter.init(); } catch (e) { console.warn('USB init error', e); }
      try { await NetPrinter.init(); } catch (e) { console.warn('NET init error', e); }
      this.isInitialized = true;
      
      // Load saved printer
      const saved = await AsyncStorage.getItem('saved_printer');
      if (saved) {
        const printer: ConnectedPrinter = JSON.parse(saved);
        await this.connect(printer);
      }
    } catch (e) {
      console.warn('[PrinterService] Init Error:', e);
    }
  }

  async getBlePrinters() {
    try {
      return await BLEPrinter.getDeviceList();
    } catch (e) {
      console.warn('Get BLE error', e);
      return [];
    }
  }

  async getUsbPrinters() {
    try {
      return await USBPrinter.getDeviceList();
    } catch (e) {
      console.warn('Get USB error', e);
      return [];
    }
  }

  async connect(printer: ConnectedPrinter): Promise<boolean> {
    try {
      if (printer.type === 'BLE' && printer.inner_mac_address) {
        await BLEPrinter.connectPrinter(printer.inner_mac_address);
      } else if (printer.type === 'USB' && printer.vendor_id && printer.product_id) {
        await USBPrinter.connectPrinter(printer.vendor_id, printer.product_id);
      } else if (printer.type === 'NET' && printer.host && printer.port) {
        await NetPrinter.connectPrinter(printer.host, printer.port);
      } else if (printer.type === 'SYSTEM') {
        // System (expo-print) doesn't need native pairing here
      }

      this.activePrinter = printer;
      await AsyncStorage.setItem('saved_printer', JSON.stringify(printer));
      return true;
    } catch (e) {
      console.warn('[PrinterService] Connect Error:', e);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.activePrinter?.type === 'BLE') {
        await BLEPrinter.closeConn();
      } else if (this.activePrinter?.type === 'USB') {
        await USBPrinter.closeConn();
      } else if (this.activePrinter?.type === 'NET') {
        await NetPrinter.closeConn();
      }
      this.activePrinter = null;
      await AsyncStorage.removeItem('saved_printer');
    } catch (e) {
      console.warn('[PrinterService] Disconnect Error:', e);
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

  // Common thermal ESC/POS commands
  async printReceipt(rawEscPos: string) {
    // rawEscPos usually contains text formatted for thermal
    // including \n for new lines. Some printers require specific byte commands.
    await this.printText(rawEscPos + '\n\n\n');
  }
}

export const printerService = new PrinterService();
