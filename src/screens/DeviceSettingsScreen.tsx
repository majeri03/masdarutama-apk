import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { GlassCard } from '../components/ui';
import { printerService, PrinterType } from '../services/printer.service';
import { AppToast } from '../utils/toast';
import * as IntentLauncher from 'expo-intent-launcher';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class DeviceSettingsErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Terjadi kesalahan tidak terduga' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[DeviceSettingsErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, padding: 20, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={{ fontSize: FontSize.md, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 12, textAlign: 'center' }}>
            Gagal Memuat Pengaturan Perangkat
          </Text>
          <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', marginHorizontal: 20 }}>
            {this.state.errorMessage}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: Colors.primaryStart, paddingHorizontal: 20, paddingVertical: 10, borderRadius: BorderRadius.md }}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Coba Lagi</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const DeviceSettingsContent: React.FC = () => {
  const navigation = useNavigation<any>();
  const isMounted = useRef(true);
  const [scanning, setScanning] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [activePrinter, setActivePrinter] = useState<any>(null);
  const [bleDevices, setBleDevices] = useState<any[]>([]);
  const [usbDevices, setUsbDevices] = useState<any[]>([]);
  const [bleError, setBleError] = useState<string | null>(null);
  const [permGranted, setPermGranted] = useState(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean | null>(null); // null = unknown

  // Cleanup isMounted on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Request permissions and scan on mount - screen always renders, no blank
  useEffect(() => {
    requestPermissionsAndInit();
  }, []);

  const requestPermissionsAndInit = async () => {
    if (Platform.OS === 'android') {
      try {
        if ((Platform.Version as number) >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);
          const allGranted =
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

          if (!allGranted) {
            if (isMounted.current) {
              setPermGranted(false);
            }
          } else {
            if (isMounted.current) setPermGranted(true);
          }
        } else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (isMounted.current) {
              setPermGranted(false);
            }
          } else {
            if (isMounted.current) setPermGranted(true);
          }
        }
      } catch (err) {
        console.warn('[DeviceSettings] Permission error (non-blocking):', err);
      }
    }

    // Selalu lanjutkan init meski izin ditolak — screen tidak boleh blank
    await initAndScan();
  };

  // Buka pengaturan Bluetooth Android
  const openBluetoothSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS
        );
      } else {
        await Linking.openURL('App-Prefs:Bluetooth');
      }
    } catch (e) {
      // Fallback ke Settings umum
      try {
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync(
            'android.settings.SETTINGS'
          );
        }
      } catch {}
    }
  };

  const initAndScan = async () => {
    if (!isMounted.current) return;
    setInitializing(true);
    setBleError(null);
    try {
      await printerService.init();
      if (isMounted.current) setActivePrinter(printerService.getActivePrinter());
    } catch (e: any) {
      console.warn('[DeviceSettings] Init error (non-blocking):', e?.message);
    } finally {
      if (isMounted.current) setInitializing(false);
    }
    // Scan terpisah — tidak blokir render screen
    await scanDevices();
  };

  const scanDevices = async () => {
    if (!isMounted.current) return;
    setScanning(true);
    setBleError(null);
    setBluetoothEnabled(null); // reset saat scan ulang
    try {
      const [bles, usbs] = await Promise.allSettled([
        printerService.getBlePrinters(),
        printerService.getUsbPrinters(),
      ]);

      if (!isMounted.current) return;

      if (bles.status === 'fulfilled') {
        setBleDevices(bles.value || []);
        setBluetoothEnabled(true);
        if (!printerService.isBleSupported()) {
          setBleError('Modul Bluetooth printer memerlukan build APK native (Standalone build). Anda dapat menggunakan opsi Printer Sistem (Wi-Fi / Simpan PDF) di bawah untuk mencetak struk.');
        }
      } else {
        const errMsg = String(bles.reason?.message || '');
        // Deteksi Bluetooth mati
        const isBtOff = errMsg.toLowerCase().includes('disabled') ||
          errMsg.toLowerCase().includes('off') ||
          errMsg.toLowerCase().includes('not enabled') ||
          errMsg.toLowerCase().includes('bluetooth is off');

        setBleDevices([]);
        setBluetoothEnabled(false);

        if (isBtOff || !permGranted) {
          setBleError('BLUETOOTH_OFF');
        } else {
          setBleError('Bluetooth tidak tersedia atau gagal diakses di perangkat ini.');
        }
      }

      if (usbs.status === 'fulfilled') {
        setUsbDevices(usbs.value || []);
      } else {
        setUsbDevices([]);
      }
    } catch (e) {
      console.warn('[DeviceSettings] Scan error:', e);
    } finally {
      if (isMounted.current) setScanning(false);
    }
  };

  const handleConnect = async (type: PrinterType, device: any) => {
    setScanning(true);
    try {
      const printerToConnect = {
        type,
        device_name: device.device_name,
        inner_mac_address: device.inner_mac_address,
        vendor_id: device.vendor_id,
        product_id: device.product_id,
      };
      const success = await printerService.connect(printerToConnect);
      if (success) {
        AppToast.success('Terhubung', `Berhasil terhubung ke ${device.device_name}`);
        setActivePrinter(printerToConnect);
      } else {
        AppToast.error('Gagal', 'Tidak dapat terhubung ke printer');
      }
    } catch (e) {
      AppToast.error('Gagal', 'Terjadi kesalahan saat menghubungkan');
    } finally {
      setScanning(false);
    }
  };

  const handleDisconnect = async () => {
    await printerService.disconnect();
    setActivePrinter(null);
    AppToast.success('Terputus', 'Printer berhasil diputuskan');
  };

  const setSystemPrinter = async () => {
    await printerService.connect({ type: 'SYSTEM', device_name: 'Printer Sistem (Wi-Fi/PDF)' });
    setActivePrinter(printerService.getActivePrinter());
    AppToast.success('Disimpan', 'Aplikasi akan menggunakan printer sistem bawaan HP.');
  };

  const handleTestPrint = async () => {
    if (!activePrinter) {
      return AppToast.error('Error', 'Hubungkan printer terlebih dahulu');
    }
    if (activePrinter.type === 'SYSTEM') {
      return AppToast.info('Info', 'Test print untuk Printer Sistem dilakukan saat transaksi.');
    }
    try {
      await printerService.printText('TES PRINT BERHASIL!\nTB MASDAR UTAMA\n-----------------\n\n\n');
      AppToast.success('Berhasil', 'Mencetak halaman tes...');
    } catch (e) {
      AppToast.error('Gagal Cetak', 'Pastikan printer menyala dan terkoneksi.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header - always visible, no blank */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PENGATURAN PERANGKAT</Text>
        <TouchableOpacity
          onPress={scanDevices}
          style={styles.scanBtn}
          disabled={scanning || initializing}
        >
          <Ionicons
            name="refresh"
            size={24}
            color={scanning || initializing ? Colors.textTertiary : Colors.primaryStart}
          />
        </TouchableOpacity>
      </View>

      {/* Initializing banner - NOT blocking, just an info bar */}
      {initializing && (
        <View style={styles.initBanner}>
          <ActivityIndicator size="small" color={Colors.primaryStart} />
          <Text style={styles.initBannerText}>Menginisialisasi modul printer...</Text>
        </View>
      )}

      {/* Permission denied warning */}
      {!permGranted && (
        <View style={styles.permWarning}>
          <Ionicons name="warning-outline" size={18} color={Colors.warning} />
          <Text style={styles.permWarningText}>
            Izin Bluetooth ditolak. Fitur pencarian printer tidak tersedia.
          </Text>
        </View>
      )}

      {/* Main Content - always visible after header */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        {/* Active Printer Status */}
        <GlassCard padding={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Status Printer Aktif</Text>
            {scanning && <ActivityIndicator size="small" color={Colors.primaryStart} />}
          </View>

          {activePrinter ? (
            <View style={styles.activeBox}>
              <View style={styles.activeIcon}>
                <Ionicons
                  name={
                    activePrinter.type === 'BLE'
                      ? 'bluetooth'
                      : activePrinter.type === 'USB'
                      ? 'hardware-chip-outline'
                      : 'print'
                  }
                  size={32}
                  color={Colors.success}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeName}>{activePrinter.device_name}</Text>
                <Text style={styles.activeType}>Tipe: {activePrinter.type}</Text>
              </View>
              <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
                <Text style={styles.disconnectTxt}>Putus</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noDeviceBox}>
              <Ionicons name="print-outline" size={28} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>Belum ada printer yang terhubung.</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.testBtn, !activePrinter && { opacity: 0.5 }]}
            onPress={handleTestPrint}
            disabled={!activePrinter}
          >
            <Ionicons name="print-outline" size={16} color={Colors.textPrimary} />
            <Text style={styles.testBtnTxt}>Test Print</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* System Printer Option */}
        <GlassCard padding={16} style={styles.card}>
          <Text style={styles.sectionTitle}>Printer Jaringan / PDF</Text>
          <Text style={styles.descText}>
            Gunakan opsi ini jika Anda menggunakan printer Wi-Fi (AirPrint / Cloud Print) atau ingin menyimpan invoice sebagai PDF bawaan sistem.
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={setSystemPrinter}>
            <Ionicons name="print-outline" size={16} color={Colors.primaryStart} />
            <Text style={styles.connectBtnTxt}>Pilih Printer Sistem</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Bluetooth Printers */}
        <GlassCard padding={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Printer Bluetooth (Thermal)</Text>
            <Ionicons name="bluetooth" size={20} color={Colors.info} />
          </View>
          <Text style={styles.descText}>
            Pastikan Anda sudah melakukan pairing dengan printer melalui pengaturan Bluetooth HP terlebih dahulu.
          </Text>

          {bleError === 'BLUETOOTH_OFF' ? (
            // Bluetooth mati / izin ditolak — tampilkan tombol aktifkan
            <View style={styles.bleOffBox}>
              <Ionicons name="bluetooth-outline" size={32} color={Colors.warning} />
              <Text style={styles.bleOffTitle}>Bluetooth Tidak Aktif</Text>
              <Text style={styles.bleOffDesc}>
                Hidupkan Bluetooth di HP Anda agar printer dapat terdeteksi. Pastikan juga printer sudah di-pairing melalui Pengaturan Bluetooth HP.
              </Text>
              <TouchableOpacity style={styles.openSettingsBtn} onPress={openBluetoothSettings}>
                <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
                <Text style={styles.openSettingsBtnText}>Buka Pengaturan Bluetooth</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.openSettingsBtn, { backgroundColor: Colors.primaryStart, marginTop: 8 }]}
                onPress={() => {
                  setPermGranted(true);
                  scanDevices();
                }}
              >
                <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                <Text style={styles.openSettingsBtnText}>Coba Scan Ulang</Text>
              </TouchableOpacity>
            </View>
          ) : bleError ? (
            <View style={styles.bleErrorBox}>
              <Ionicons name="bluetooth-outline" size={20} color={Colors.warning} />
              <Text style={styles.bleErrorText}>{bleError}</Text>
            </View>
          ) : scanning ? (
            <View style={styles.scanningBox}>
              <ActivityIndicator size="small" color={Colors.primaryStart} />
              <Text style={styles.scanningText}>Sedang mencari perangkat Bluetooth...</Text>
            </View>
          ) : bleDevices.length === 0 ? (
            <Text style={styles.emptyText}>
              Tidak ada perangkat Bluetooth printer terdeteksi. Pastikan printer sudah di-pairing dan dinyalakan.
            </Text>
          ) : (
            bleDevices.map((dev, i) => (
              <View key={dev?.inner_mac_address || i} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Ionicons name="bluetooth" size={16} color={Colors.info} />
                  <View>
                    <Text style={styles.deviceName}>{dev?.device_name || 'Printer Bluetooth'}</Text>
                    <Text style={styles.deviceMac}>{dev?.inner_mac_address || '-'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.connectBtnSm}
                  onPress={() => handleConnect('BLE', dev)}
                >
                  <Text style={styles.connectBtnTxtSm}>Hubungkan</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </GlassCard>

        {/* USB Printers */}
        <GlassCard padding={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Printer USB (OTG)</Text>
            <Ionicons name="hardware-chip-outline" size={20} color={Colors.textSecondary} />
          </View>

          {scanning ? (
            <View style={styles.scanningBox}>
              <ActivityIndicator size="small" color={Colors.primaryStart} />
              <Text style={styles.scanningText}>Sedang mencari perangkat USB...</Text>
            </View>
          ) : usbDevices.length === 0 ? (
            <Text style={styles.emptyText}>
              Tidak ada perangkat USB terdeteksi. Pastikan printer terhubung via OTG.
            </Text>
          ) : (
            usbDevices.map((dev, i) => (
              <View key={dev?.vendor_id || i} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Ionicons name="hardware-chip-outline" size={16} color={Colors.textSecondary} />
                  <View>
                    <Text style={styles.deviceName}>{dev?.device_name || 'Printer USB'}</Text>
                    <Text style={styles.deviceMac}>VID: {dev?.vendor_id || '-'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.connectBtnSm}
                  onPress={() => handleConnect('USB', dev)}
                >
                  <Text style={styles.connectBtnTxtSm}>Hubungkan</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </GlassCard>

        {/* Barcode Scanner Guide */}
        <GlassCard padding={16} style={StyleSheet.flatten([styles.card, { marginBottom: Spacing['3xl'] }])}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Barcode Scanner</Text>
            <Ionicons name="barcode-outline" size={20} color={Colors.textSecondary} />
          </View>
          <Text style={styles.descText}>
            Scanner Barcode (Bluetooth / USB) umumnya terdeteksi sebagai Keyboard eksternal oleh HP. Anda cukup menghubungkan scanner ke HP Anda dan mengarahkannya pada kolom pencarian saat melakukan transaksi. Tidak perlu pengaturan khusus di sini.
          </Text>
        </GlassCard>

      </ScrollView>
    </SafeAreaView>
  );
};

export const DeviceSettingsScreen: React.FC = () => {
  return (
    <DeviceSettingsErrorBoundary>
      <DeviceSettingsContent />
    </DeviceSettingsErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  backBtn: { padding: 4 },
  scanBtn: { padding: 4 },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  initBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryStart + '12',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.primaryStart + '20',
  },
  initBannerText: {
    fontSize: FontSize.xs,
    color: Colors.primaryStart,
    fontWeight: FontWeight.medium,
  },
  permWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '12',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.warning + '20',
  },
  permWarningText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
  },
  content: { padding: Spacing.lg },
  card: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  descText: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  noDeviceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  activeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    borderWidth: 1,
    borderColor: Colors.success + '40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  activeIcon: {},
  activeName: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  activeType: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: 'bold',
    marginTop: 2,
  },
  disconnectBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  disconnectTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    borderRadius: BorderRadius.md,
  },
  testBtnTxt: {
    color: Colors.textPrimary,
    fontWeight: 'bold',
    fontSize: FontSize.sm,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: Spacing.md,
    lineHeight: 18,
  },
  bleErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  bleErrorText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.warning,
    lineHeight: 17,
  },
  // Bluetooth OFF state
  bleOffBox: {
    alignItems: 'center',
    backgroundColor: Colors.warning + '08',
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    marginVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  bleOffTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  bleOffDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  openSettingsBtnText: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  scanningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.xl,
  },
  scanningText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: FontSize.sm,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  deviceMac: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  connectBtnSm: {
    backgroundColor: Colors.primaryStart,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  connectBtnTxtSm: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primaryStart,
    padding: 12,
    borderRadius: BorderRadius.md,
    alignSelf: 'stretch',
  },
  connectBtnTxt: {
    color: Colors.primaryStart,
    fontWeight: 'bold',
    fontSize: FontSize.sm,
  },
});
