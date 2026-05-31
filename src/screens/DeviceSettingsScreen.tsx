import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { GlassCard } from '../components/ui';
import { printerService, PrinterType } from '../services/printer.service';
import { AppToast } from '../utils/toast';

export const DeviceSettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [activePrinter, setActivePrinter] = useState<any>(null);
  
  const [bleDevices, setBleDevices] = useState<any[]>([]);
  const [usbDevices, setUsbDevices] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'android' && (Platform.Version as number) >= 31) {
        try {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);
        } catch (err) {
          console.warn(err);
        }
      }
      initService();
    };
    init();
  }, []);

  const initService = async () => {
    await printerService.init();
    setActivePrinter(printerService.getActivePrinter());
    scanDevices();
  };

  const scanDevices = async () => {
    setLoading(true);
    try {
      const bles = await printerService.getBlePrinters();
      setBleDevices(bles || []);

      const usbs = await printerService.getUsbPrinters();
      setUsbDevices(usbs || []);
    } catch (e) {
      console.warn('Scan Error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (type: PrinterType, device: any) => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await printerService.disconnect();
    setActivePrinter(null);
    AppToast.success('Terputus', 'Printer berhasil diputuskan');
    setLoading(false);
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PENGATURAN PERANGKAT</Text>
        <TouchableOpacity onPress={scanDevices} style={styles.scanBtn}>
          <Ionicons name="refresh" size={24} color={Colors.primaryStart} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active Printer Status */}
        <GlassCard padding={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Status Printer Aktif</Text>
            {loading && <ActivityIndicator size="small" color={Colors.primaryStart} />}
          </View>
          
          {activePrinter ? (
            <View style={styles.activeBox}>
              <View style={styles.activeIcon}>
                <Ionicons 
                  name={activePrinter.type === 'BLE' ? 'bluetooth' : activePrinter.type === 'USB' ? 'hardware-chip-outline' : 'print'} 
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
            <Text style={styles.emptyText}>Belum ada printer yang terhubung.</Text>
          )}

          <TouchableOpacity 
            style={[styles.testBtn, !activePrinter && { opacity: 0.5 }]} 
            onPress={handleTestPrint}
            disabled={!activePrinter}
          >
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
            Pastikan Anda sudah melakukan pairing/sanding dengan printer melalui pengaturan Bluetooth HP Anda terlebih dahulu.
          </Text>
          
          {bleDevices.length === 0 ? (
            <Text style={styles.emptyText}>Tidak ada perangkat Bluetooth printer terdeteksi.</Text>
          ) : (
            bleDevices.map((dev, i) => (
              <View key={i} style={styles.deviceRow}>
                <View>
                  <Text style={styles.deviceName}>{dev.device_name}</Text>
                  <Text style={styles.deviceMac}>{dev.inner_mac_address}</Text>
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
          
          {usbDevices.length === 0 ? (
            <Text style={styles.emptyText}>Tidak ada perangkat USB terdeteksi.</Text>
          ) : (
            usbDevices.map((dev, i) => (
              <View key={i} style={styles.deviceRow}>
                <View>
                  <Text style={styles.deviceName}>{dev.device_name}</Text>
                  <Text style={styles.deviceMac}>VID: {dev.vendor_id}</Text>
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
  },
  activeIcon: { marginRight: Spacing.md },
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
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
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primaryStart,
    padding: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  connectBtnTxt: {
    color: Colors.primaryStart,
    fontWeight: 'bold',
    fontSize: FontSize.sm,
  },
});
