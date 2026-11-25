import { BLEPrinter, USBPrinter, NetPrinter } from 'react-native-thermal-receipt-printer-image-qr';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Error bertipe supaya layar bisa membedakan "Bluetooth mati" dari error lain.
 * PENTING: getBlePrinters() dulu menelan SEMUA error dan mengembalikan [],
 * sehingga kotak "Bluetooth Tidak Aktif" tidak pernah muncul. Sekarang error
 * "not enabled" dilempar kembali sebagai BleNotEnabledError.
 */
export class BleNotEnabledError extends Error {
  constructor(message = 'Bluetooth is not enabled') {
    super(message);
    this.name = 'BleNotEnabledError';
  }
}

/** Dilempar kalau pemindaian diminta tanpa izin Bluetooth (Android 12+). */
export class BlePermissionError extends Error {
  constructor(message = 'Izin Bluetooth belum diberikan') {
    super(message);
    this.name = 'BlePermissionError';
  }
}

/** Pesan error native yang artinya Bluetooth mati / adapter tidak aktif. */
const BLE_NOT_ENABLED_RE = /not enabled|bluetooth is off|adapter is not enabled|bluetooth.{0,10}disabled/i;

/** Izin Bluetooth yang dibutuhkan untuk membaca daftar perangkat yang sudah di-pairing. */
function requiredBlePermissions(): Permission[] {
  if (Platform.OS !== 'android') return [];
  if ((Platform.Version as number) >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
  }
  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

export type PrinterType = 'BLE' | 'USB' | 'NET' | 'SYSTEM';

const hasRNBLEPrinter = !!(NativeModules && NativeModules.RNBLEPrinter);
const hasRNUSBPrinter = !!(NativeModules && NativeModules.RNUSBPrinter);
const hasRNNetPrinter = !!(NativeModules && NativeModules.RNNetPrinter);

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
   * Kesiapan per modul native — true HANYA kalau native init() modul itu
   * benar-benar sukses. Alasan: kode native library (v0.1.12) mengakses
   * field `adapter` tanpa null-check di getDeviceList / connectPrinter /
   * printRawData (hanya closeConn yang mengecek null). Kalau JS memanggil
   * salah satu method itu padahal native init() belum pernah sukses,
   * `adapter` masih null → NullPointerException di thread native →
   * crash yang tidak bisa ditangkap JS → layar abu-abu lalu blank.
   * Dulu satu flag `isInitialized` diset true apa pun hasilnya, sehingga
   * init yang gagal tetap dianggap "sudah init" dan pemanggilan berikutnya
   * langsung menembak native tanpa perlindungan.
   */
  private bleReady = false;
  private usbReady = false;
  private netReady = false;

  /** Inisialisasi modul BLE saja (idempotent, aman dipanggil ulang). */
  private async initBle(): Promise<void> {
    if (this.bleReady || !hasRNBLEPrinter) return;
    // Gerbang izin DI DALAM service: native BLEPrinter.init() memanggil
    // BluetoothAdapter.isEnabled() yang di Android 12+ (API 31+) melempar
    // SecurityException tanpa BLUETOOTH_CONNECT — exception native yang
    // tidak bisa ditangkap JS dan mematikan runtime. Jangan pernah sentuh
    // modul BLE native tanpa izin, dari pemanggil mana pun.
    if (!(await this.hasBlePermission())) return;
    try {
      await withTimeout(BLEPrinter.init(), 3000, 'BLEPrinter.init');
      this.bleReady = true;
    } catch (e: any) {
      console.warn('[PrinterService] BLE init gagal/timeout:', e?.message);
      this.bleReady = false;
    }
  }

  /** Inisialisasi modul USB saja (idempotent, aman dipanggil ulang). */
  private async initUsb(): Promise<void> {
    if (this.usbReady || !hasRNUSBPrinter) return;
    try {
      await withTimeout(USBPrinter.init(), 3000, 'USBPrinter.init');
      this.usbReady = true;
    } catch (e: any) {
      console.warn('[PrinterService] USB init gagal/timeout:', e?.message);
      this.usbReady = false;
    }
  }

  /** Inisialisasi modul NET saja (idempotent, aman dipanggil ulang). */
  private async initNet(): Promise<void> {
    if (this.netReady || !hasRNNetPrinter) return;
    try {
      await withTimeout(NetPrinter.init(), 2000, 'NetPrinter.init');
      this.netReady = true;
    } catch (e: any) {
      console.warn('[PrinterService] NET init gagal/timeout:', e?.message);
      this.netReady = false;
    }
  }

  /** Pastikan init() sudah pernah jalan sekali (tanpa melempar). */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  /**
   * init — Inisialisasi semua modul printer dengan timeout per modul.
   * Tidak akan throw atau hang — semua error ditangkap per modul.
   * SENGAJA TIDAK memulihkan printer tersimpan di sini: reconnect BLE
   * memanggil BluetoothSocket.connect() native yang BLOCKING tanpa timeout;
   * kalau printer mati / di luar jangkauan, thread native modul printer
   * tertahan belasan detik dan semua panggilan native berikutnya (termasuk
   * getDeviceList untuk scan) ikut antre — layar tampak diam/blank.
   * Pemulihan printer tersimpan dilakukan lewat restoreSavedPrinter()
   * yang dipanggil layar SETELAH scan, tanpa memblokir apa pun.
   */
  async init() {
    if (this.isInitialized) return;
    this.initError = null;

    await this.initBle();
    await this.initUsb();
    await this.initNet();

    this.isInitialized = true;
  }

  /**
   * restoreSavedPrinter — Pulihkan printer tersimpan (AsyncStorage
   * 'saved_printer'). Tidak pernah throw; mengembalikan false kalau tidak
   * ada printer tersimpan / tidak bisa terhubung. Aman dipanggil dari
   * latar belakang: JANGAN di-await sebelum scan selesai.
   */
  async restoreSavedPrinter(): Promise<boolean> {
    try {
      const saved = await AsyncStorage.getItem('saved_printer');
      if (!saved) return false;
      const printer: ConnectedPrinter = JSON.parse(saved);
      if (printer.type === 'SYSTEM') {
        this.activePrinter = printer;
        return true;
      }
      await this.ensureInitialized();
      return await this.connect(printer);
    } catch (e) {
      console.warn('[PrinterService] Gagal pulihkan printer tersimpan:', e);
      return false;
    }
  }

  /**
   * getInitError — Kembalikan pesan error inisialisasi jika ada.
   */
  getInitError(): string | null {
    return this.initError;
  }

  isBleSupported(): boolean {
    return hasRNBLEPrinter;
  }

  isUsbSupported(): boolean {
    return hasRNUSBPrinter;
  }

  /**
   * Cek izin Bluetooth tanpa meminta. Di Android 12+ (API 31+) membaca daftar
   * perangkat yang sudah di-pairing (getBondedDevices) WAJIB izin
   * BLUETOOTH_CONNECT — tanpanya Android melempar SecurityException yang
   * tidak bisa ditangkap JavaScript dan runtime mati (layar abu-abu).
   */
  async hasBlePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const perms = requiredBlePermissions();
      for (const p of perms) {
        const granted = await PermissionsAndroid.check(p);
        if (!granted) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Minta izin Bluetooth ke pengguna; true kalau semua diberikan. */
  async requestBlePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const perms = requiredBlePermissions();
      if (perms.length === 1) {
        return (await PermissionsAndroid.request(perms[0])) === PermissionsAndroid.RESULTS.GRANTED;
      }
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return perms.every((p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      return false;
    }
  }

  async getBlePrinters() {
    if (!hasRNBLEPrinter) {
      return [];
    }
    // JANGAN PERNAH panggil getDeviceList tanpa izin: di Android 12+ itu
    // memicu SecurityException native yang mematikan runtime (layar abu-abu).
    if (!(await this.hasBlePermission())) {
      throw new BlePermissionError();
    }
    // Coba (ulang) inisialisasi kalau modul belum siap — mis. init pertama
    // gagal karena Bluetooth sedang mati, lalu pengguna menyalakannya dan
    // menekan scan ulang. Tanpa ini daftar tetap kosong selamanya karena
    // isInitialized sudah true. Kalau modul tetap belum siap, kembalikan []
    // — JANGAN tembak native getDeviceList dengan adapter null (NPE crash).
    await this.initBle();
    if (!this.bleReady) {
      return [];
    }
    try {
      const result = await withTimeout(BLEPrinter.getDeviceList(), 5000, 'getDeviceList');
      return result || [];
    } catch (e: any) {
      // Bluetooth mati harus terlihat oleh layar (kotak BLUETOOTH_OFF),
      // jangan ditelan jadi daftar kosong.
      if (e && BLE_NOT_ENABLED_RE.test(String(e?.message || ''))) {
        throw new BleNotEnabledError(e.message);
      }
      console.warn('[PrinterService] Get BLE devices gagal/timeout:', e?.message);
      return [];
    }
  }

  async getUsbPrinters() {
    if (!hasRNUSBPrinter) {
      return [];
    }
    // Sama seperti BLE: jangan tembak native getDeviceList kalau modul USB
    // belum berhasil init (adapter null → NPE crash di thread native).
    await this.initUsb();
    if (!this.usbReady) {
      return [];
    }
    try {
      const result = await withTimeout(USBPrinter.getDeviceList(), 3000, 'getUsbDeviceList');
      return result || [];
    } catch (e: any) {
      console.warn('[PrinterService] Get USB devices gagal/timeout:', e?.message);
      return [];
    }
  }

  async connect(printer: ConnectedPrinter): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (printer.type === 'BLE' && printer.inner_mac_address) {
        // Gerbang izin + kesiapan modul: tanpa ini, connectPrinter native
        // memanggil getBondedDevices() tanpa BLUETOOTH_CONNECT
        // (SecurityException) atau dengan adapter null (NPE).
        if (!(await this.hasBlePermission())) return false;
        await this.initBle();
        if (!this.bleReady) return false;
        await withTimeout(
          BLEPrinter.connectPrinter(printer.inner_mac_address),
          10000,
          'BLE connect'
        );
      } else if (printer.type === 'USB' && printer.vendor_id && printer.product_id) {
        await this.initUsb();
        if (!this.usbReady) return false;
        await withTimeout(
          USBPrinter.connectPrinter(printer.vendor_id, printer.product_id),
          8000,
          'USB connect'
        );
      } else if (printer.type === 'NET' && printer.host && printer.port) {
        await this.initNet();
        if (!this.netReady) return false;
        await withTimeout(
          NetPrinter.connectPrinter(printer.host, printer.port),
          8000,
          'NET connect'
        );
      } else if (printer.type === 'SYSTEM') {
        // System (expo-print) tidak perlu native pairing
      } else {
        // Tipe tidak dikenal / data perangkat tidak lengkap — jangan pernah
        // menandai printer seperti ini sebagai "aktif". (Dulu: jatuh ke
        // sini lalu tetap diset aktif + return true.)
        console.warn('[PrinterService] Connect ditolak: data printer tidak lengkap', printer?.type);
        return false;
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
    // Cetak otomatis dari POS/invoice bisa terjadi tanpa pengguna pernah
    // membuka Pengaturan Perangkat — dulu path ini langsung menembak native
    // print dengan adapter null (init belum jalan) → NPE crash native.
    // Pulihkan dulu printer tersimpan (sekali, tidak pernah throw), lalu
    // pastikan modul sudah init sebelum menyentuh native.
    if (!this.activePrinter) {
      await this.restoreSavedPrinter();
    }
    if (!this.activePrinter) {
      throw new Error('No printer connected');
    }

    await this.ensureInitialized();

    try {
      if (this.activePrinter.type === 'BLE') {
        if (!this.bleReady) throw new Error('Modul printer Bluetooth belum siap');
        await BLEPrinter.printText(text);
      } else if (this.activePrinter.type === 'USB') {
        if (!this.usbReady) throw new Error('Modul printer USB belum siap');
        await USBPrinter.printText(text);
      } else if (this.activePrinter.type === 'NET') {
        if (!this.netReady) throw new Error('Modul printer jaringan belum siap');
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
