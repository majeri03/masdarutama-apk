/**
 * FleetTrackingScreen — Tracking Armada Real-Time
 * Menampilkan peta, daftar armada terdaftar, sopir, dan status lokasi.
 * Background location berjalan otomatis saat screen aktif.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  TextInput,
  Platform,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard } from '../components/ui';
import api from '../services/api';
import { AppToast } from '../utils/toast';
import { useAuthStore } from '../stores/auth.store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const BACKGROUND_FLEET_LOCATION_TASK = 'BACKGROUND_FLEET_LOCATION_TASK';

try {
  if (TaskManager && typeof TaskManager.defineTask === 'function') {
    TaskManager.defineTask(BACKGROUND_FLEET_LOCATION_TASK, async ({ data, error }: any) => {
      if (error) {
        console.warn('[BACKGROUND_LOCATION] Task error:', error);
        return;
      }
      if (data) {
        const { locations } = data;
        if (locations && locations.length > 0) {
          const loc = locations[locations.length - 1];
          const { latitude, longitude, accuracy } = loc.coords;

          try {
            const vehicleId = await AsyncStorage.getItem('active_tracking_vehicle_id');
            if (vehicleId) {
              await api.post('/api/fleet/location', {
                vehicleId,
                latitude,
                longitude,
                accuracy,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[BACKGROUND_LOCATION] Gagal sinkronisasi lokasi background:', err);
          }
        }
      }
    });
  }
} catch (err) {
  console.warn('[BACKGROUND_LOCATION] TaskManager.defineTask skipped (native binary needs rebuild):', err);
}

interface FleetVehicle {
  id: string;
  plateNumber: string;
  vehicleType: string;
  brand?: string;
  year?: number;
  driverName: string;
  driverPhone?: string;
  status: 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'OFF';
  lastLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
    updatedAt: string;
  };
  registeredAt: string;
}

interface LocationUpdate {
  vehicleId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ACTIVE: { label: 'Aktif', color: '#059669', bg: 'rgba(5,150,105,0.12)', icon: 'radio-button-on' },
  IDLE: { label: 'Standby', color: '#D97706', bg: 'rgba(217,119,6,0.12)', icon: 'pause-circle' },
  MAINTENANCE: { label: 'Servis', color: '#2563EB', bg: 'rgba(37,99,235,0.12)', icon: 'construct' },
  OFF: { label: 'Nonaktif', color: '#6B7280', bg: 'rgba(107,114,128,0.12)', icon: 'power' },
};

const VEHICLE_TYPE_ICONS: Record<string, string> = {
  TRUCK: 'bus-outline',
  PICKUP: 'car-outline',
  MOTOR: 'bicycle-outline',
  VAN: 'car-sport-outline',
  OTHER: 'car-outline',
};

const buildMapHtml = (vehicles: FleetVehicle[], centerLat = -5.134, centerLng = 119.412) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; }
    #map { width: 100vw; height: 100vh; background: #E8F4FD; }
    .custom-marker {
      background: #2563EB;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: white;
      font-weight: bold;
    }
    .marker-active { background: #059669; }
    .marker-idle { background: #D97706; }
    .marker-maintenance { background: #2563EB; }
    .marker-off { background: #6B7280; }
    .leaflet-popup-content-wrapper {
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .popup-title { font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 4px; }
    .popup-driver { font-size: 12px; color: #374151; margin-bottom: 2px; }
    .popup-status { font-size: 11px; color: #6B7280; }
    .popup-time { font-size: 10px; color: #9CA3AF; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${centerLat}, ${centerLng}],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    var vehicles = ${JSON.stringify(vehicles)};
    var markers = {};

    function getStatusColor(status) {
      var colors = { ACTIVE: '#059669', IDLE: '#D97706', MAINTENANCE: '#2563EB', OFF: '#6B7280' };
      return colors[status] || '#6B7280';
    }

    vehicles.forEach(function(v) {
      if (!v.lastLocation) return;
      var lat = v.lastLocation.latitude;
      var lng = v.lastLocation.longitude;
      var color = getStatusColor(v.status);

      var icon = L.divIcon({
        className: '',
        html: '<div style="width:36px;height:36px;background:' + color + ';border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><span style="color:white;font-size:9px;font-weight:bold;text-align:center;line-height:1.1;">' + (v.plateNumber || 'N/A') + '</span></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      var popupTime = '';
      if (v.lastLocation.updatedAt) {
        var d = new Date(v.lastLocation.updatedAt);
        popupTime = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      }

      var popup = '<div style="min-width:160px;padding:4px;">' +
        '<div class="popup-title">🚗 ' + v.plateNumber + '</div>' +
        '<div class="popup-driver">👤 ' + v.driverName + '</div>' +
        '<div class="popup-status">🏷️ ' + v.vehicleType + (v.brand ? ' • ' + v.brand : '') + '</div>' +
        (v.lastLocation.address ? '<div class="popup-status">📍 ' + v.lastLocation.address + '</div>' : '') +
        (popupTime ? '<div class="popup-time">⏱️ Update: ' + popupTime + '</div>' : '') +
        '</div>';

      var marker = L.marker([lat, lng], { icon: icon })
        .addTo(map)
        .bindPopup(popup, { maxWidth: 220 });

      markers[v.id] = marker;
    });

    // Fit map to markers if any
    var validVehicles = vehicles.filter(function(v) { return v.lastLocation; });
    if (validVehicles.length > 0) {
      var bounds = validVehicles.map(function(v) {
        return [v.lastLocation.latitude, v.lastLocation.longitude];
      });
      if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }

    // Listen for updates from React Native
    window.updateVehicleLocation = function(vehicleId, lat, lng) {
      if (markers[vehicleId]) {
        markers[vehicleId].setLatLng([lat, lng]);
      }
    };
  </script>
</body>
</html>
`;

const VehicleFormModal: React.FC<{
  visible: boolean;
  vehicle?: FleetVehicle | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}> = ({ visible, vehicle, onClose, onSave, saving }) => {
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('PICKUP');
  const [brand, setBrand] = useState('');
  const [year, setYear] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [status, setStatus] = useState<string>('ACTIVE');

  const TYPES = ['TRUCK', 'PICKUP', 'MOTOR', 'VAN', 'OTHER'];
  const STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE', 'OFF'];

  useEffect(() => {
    if (vehicle) {
      setPlateNumber(vehicle.plateNumber || '');
      setVehicleType(vehicle.vehicleType || 'PICKUP');
      setBrand(vehicle.brand || '');
      setYear(vehicle.year ? String(vehicle.year) : '');
      setDriverName(vehicle.driverName || '');
      setDriverPhone(vehicle.driverPhone || '');
      setStatus(vehicle.status || 'ACTIVE');
    } else {
      setPlateNumber('');
      setVehicleType('PICKUP');
      setBrand('');
      setYear('');
      setDriverName('');
      setDriverPhone('');
      setStatus('ACTIVE');
    }
  }, [vehicle, visible]);

  const handleSubmit = () => {
    if (!plateNumber.trim()) {
      AppToast.error('Peringatan', 'Nomor plat wajib diisi.');
      return;
    }
    if (!driverName.trim()) {
      AppToast.error('Peringatan', 'Nama sopir wajib diisi.');
      return;
    }
    onSave({
      plateNumber: plateNumber.trim().toUpperCase(),
      vehicleType,
      brand: brand.trim() || undefined,
      year: year ? parseInt(year) : undefined,
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim() || undefined,
      status,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fmStyles.overlay}>
        <View style={fmStyles.sheet}>
          <View style={fmStyles.sheetHandle} />
          <View style={fmStyles.sheetHeader}>
            <Text style={fmStyles.sheetTitle}>{vehicle ? 'Edit Armada' : 'Tambah Armada Baru'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={fmStyles.form} showsVerticalScrollIndicator={false}>
            {/* Plate Number */}
            <Text style={fmStyles.label}>Nomor Plat *</Text>
            <TextInput
              style={fmStyles.input}
              value={plateNumber}
              onChangeText={setPlateNumber}
              placeholder="Contoh: DD 1234 AB"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />

            {/* Vehicle Type */}
            <Text style={fmStyles.label}>Jenis Kendaraan</Text>
            <View style={fmStyles.chipRow}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[fmStyles.chip, vehicleType === t && fmStyles.chipActive]}
                  onPress={() => setVehicleType(t)}
                >
                  <Text style={[fmStyles.chipText, vehicleType === t && fmStyles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Brand & Year */}
            <View style={fmStyles.row2}>
              <View style={{ flex: 2 }}>
                <Text style={fmStyles.label}>Merek</Text>
                <TextInput
                  style={fmStyles.input}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="Mitsubishi, Isuzu..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={fmStyles.label}>Tahun</Text>
                <TextInput
                  style={fmStyles.input}
                  value={year}
                  onChangeText={setYear}
                  placeholder="2022"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            </View>

            {/* Driver Name */}
            <Text style={fmStyles.label}>Nama Sopir *</Text>
            <TextInput
              style={fmStyles.input}
              value={driverName}
              onChangeText={setDriverName}
              placeholder="Nama lengkap sopir"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Driver Phone */}
            <Text style={fmStyles.label}>No. HP Sopir</Text>
            <TextInput
              style={fmStyles.input}
              value={driverPhone}
              onChangeText={setDriverPhone}
              placeholder="08xx-xxxx-xxxx"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />

            {/* Status */}
            <Text style={fmStyles.label}>Status</Text>
            <View style={fmStyles.chipRow}>
              {STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      fmStyles.chip,
                      status === s && { backgroundColor: cfg.color + '20', borderColor: cfg.color },
                    ]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[fmStyles.chipText, status === s && { color: cfg.color }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[fmStyles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={fmStyles.saveBtnText}>{vehicle ? 'Simpan Perubahan' : 'Tambahkan Armada'}</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const FleetTrackingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  // Location tracking state
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [trackingVehicleId, setTrackingVehicleId] = useState<string | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  const webViewRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (trackingVehicleId) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [trackingVehicleId]);

  useEffect(() => {
    checkAndResumeTracking();
    requestLocationPermission();
    return () => {
      // Jangan matikan background task saat pindah screen, hanya bersihkan listener lokal
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  const checkAndResumeTracking = async () => {
    try {
      const savedVehicleId = await AsyncStorage.getItem('active_tracking_vehicle_id');
      if (savedVehicleId) {
        setTrackingVehicleId(savedVehicleId);
        startForegroundWatch(savedVehicleId);
      }
    } catch (e) {
      console.warn('[FleetTracking] Resume tracking error:', e);
    }
  };

  const requestLocationPermission = async () => {
    try {
      // 1. Minta izin akses lokasi foreground terlebih dahulu
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        setLocationPermission('denied');
        Alert.alert(
          'Izin Lokasi Diperlukan',
          'Aplikasi membutuhkan izin akses GPS untuk menampilkan posisi armada pengiriman secara akurat pada peta.',
          [{ text: 'Mengerti' }]
        );
        return;
      }

      // 2. Minta izin akses lokasi latar belakang (Background)
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        Alert.alert(
          'Izin Lokasi Latar Belakang (Otomatis)',
          'Untuk menghubungkan lokasi otomatis ketika aplikasi ditutup atau di latar belakang, mohon pilih opsi "Izinkan Sepanjang Waktu" (Allow all the time) di pengaturan HP Anda.',
          [
            { text: 'Nanti Saja', style: 'cancel' },
            { text: 'Buka Pengaturan', onPress: () => Location.getForegroundPermissionsAsync() },
          ]
        );
      }

      setLocationPermission('granted');
      fetchCurrentLocation();
    } catch (e) {
      console.warn('[FleetTracking] Location permission error:', e);
      setLocationPermission('denied');
    }
  };

  const fetchCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setMyLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {
      console.warn('[FleetTracking] Get current location failed:', e);
    }
  };

  const loadVehicles = useCallback(async () => {
    try {
      const res = await api.get('/api/fleet/vehicles');
      if (res.data?.success && res.data?.data) {
        setVehicles(res.data.data);
      } else if (res.data?.data?.vehicles) {
        setVehicles(res.data.data.vehicles);
      }
    } catch (e: any) {
      console.warn('[FleetTracking] Load vehicles error:', e?.message);
      // Use Makassar mock data as reliable fallback
      setVehicles(getMockVehicles());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadVehicles();
  };

  const startTracking = async (vehicleId: string) => {
    if (locationPermission !== 'granted') {
      await requestLocationPermission();
      return;
    }

    try {
      // 1. Simpan ID armada ke AsyncStorage
      await AsyncStorage.setItem('active_tracking_vehicle_id', vehicleId);
      setTrackingVehicleId(vehicleId);

      // 2. Daftarkan background location updates agar tetap aktif saat aplikasi di-close
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FLEET_LOCATION_TASK);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(BACKGROUND_FLEET_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 30,
          foregroundService: {
            notificationTitle: 'Tracking Armada TB Masdar Utama',
            notificationBody: 'GPS armada aktif mengirim lokasi di latar belakang',
            notificationColor: '#2563EB',
          },
        });
      }

      // 3. Jalankan foreground watcher untuk sinkronisasi peta live
      startForegroundWatch(vehicleId);

      AppToast.success('Tracking Aktif', 'Lokasi armada berjalan di latar belakang otomatis meski aplikasi ditutup.');
    } catch (err: any) {
      console.warn('[FleetTracking] Start tracking background error:', err);
      startForegroundWatch(vehicleId);
      AppToast.info('Tracking Aktif', 'Lokasi armada aktif sinkronisasi saat aplikasi dibuka.');
    }
  };

  const startForegroundWatch = async (vehicleId: string) => {
    if (locationWatchRef.current) {
      locationWatchRef.current.remove();
    }
    try {
      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 30,
        },
        async (location) => {
          const { latitude, longitude, accuracy } = location.coords;
          setMyLocation({ latitude, longitude });

          // Update marker di peta WebView
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(
              `window.updateVehicleLocation && window.updateVehicleLocation('${vehicleId}', ${latitude}, ${longitude}); true;`
            );
          }

          // Kirim ke backend API
          try {
            await api.post('/api/fleet/location', {
              vehicleId,
              latitude,
              longitude,
              accuracy,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('[FleetTracking] Send location error:', e);
          }
        }
      );
    } catch (e) {
      console.warn('[FleetTracking] watchPositionAsync error:', e);
    }
  };

  const stopTracking = async () => {
    try {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FLEET_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_FLEET_LOCATION_TASK);
      }
      await AsyncStorage.removeItem('active_tracking_vehicle_id');
      setTrackingVehicleId(null);
      AppToast.info('Tracking Berhenti', 'Sinkronisasi lokasi armada telah dinonaktifkan.');
    } catch (e) {
      console.warn('[FleetTracking] Stop tracking error:', e);
      setTrackingVehicleId(null);
    }
  };

  const handleSaveVehicle = async (data: any) => {
    setSaving(true);
    try {
      if (editingVehicle) {
        const res = await api.put(`/api/fleet/vehicles/${editingVehicle.id}`, data);
        if (res.data?.success) {
          AppToast.success('Sukses', 'Data armada berhasil diperbarui!');
          setShowForm(false);
          setEditingVehicle(null);
          loadVehicles();
        } else {
          AppToast.error('Gagal', res.data?.error || 'Gagal memperbarui data armada.');
        }
      } else {
        const res = await api.post('/api/fleet/vehicles', data);
        if (res.data?.success) {
          AppToast.success('Sukses', 'Armada berhasil ditambahkan!');
          setShowForm(false);
          loadVehicles();
        } else {
          AppToast.error('Gagal', res.data?.error || 'Gagal menambahkan armada.');
        }
      }
    } catch (e: any) {
      AppToast.error('Error', 'Terjadi kesalahan sistem. Pastikan server mendukung endpoint /api/fleet/vehicles');
      console.warn('[FleetTracking] Save vehicle error:', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVehicle = (vehicle: FleetVehicle) => {
    Alert.alert(
      'Konfirmasi Hapus',
      `Hapus armada "${vehicle.plateNumber}" dari daftar?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/api/fleet/vehicles/${vehicle.id}`);
              if (res.data?.success) {
                AppToast.success('Dihapus', 'Armada berhasil dihapus.');
                loadVehicles();
              } else {
                AppToast.error('Gagal', 'Gagal menghapus armada.');
              }
            } catch (e) {
              AppToast.error('Error', 'Terjadi kesalahan sistem.');
            }
          },
        },
      ]
    );
  };

  const stats = {
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === 'ACTIVE').length,
    idle: vehicles.filter((v) => v.status === 'IDLE').length,
    maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
  };

  const mapHtml = buildMapHtml(vehicles, myLocation?.latitude, myLocation?.longitude);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TRACKING ARMADA</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="car-outline" size={48} color={Colors.primaryStart + '50'} />
          <ActivityIndicator size="large" color={Colors.primaryStart} style={{ marginTop: 16 }} />
          <Text style={styles.loadingText}>Memuat data armada...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>TRACKING ARMADA</Text>
          {trackingVehicleId && (
            <View style={styles.liveIndicator}>
              <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.liveText}>LIVE GPS AKTIF</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {trackingVehicleId && (
            <TouchableOpacity onPress={stopTracking} style={styles.stopTrackingBtn}>
              <Ionicons name="stop-circle-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              onPress={() => { setEditingVehicle(null); setShowForm(true); }}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Location permission warning */}
      {locationPermission === 'denied' && (
        <TouchableOpacity style={styles.permBanner} onPress={requestLocationPermission}>
          <Ionicons name="location-outline" size={16} color={Colors.warning} />
          <Text style={styles.permBannerText}>Izin lokasi diperlukan — Ketuk untuk mengizinkan</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.warning} />
        </TouchableOpacity>
      )}

      {/* Stats Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={[styles.statNum, { color: Colors.primaryStart }]}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={[styles.statNum, { color: Colors.success }]}>{stats.active}</Text>
            <Text style={styles.statLabel}>Aktif</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={[styles.statNum, { color: Colors.warning }]}>{stats.idle}</Text>
            <Text style={styles.statLabel}>Standby</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={[styles.statNum, { color: Colors.info }]}>{stats.maintenance}</Text>
            <Text style={styles.statLabel}>Servis</Text>
          </View>
        </View>
      </ScrollView>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.tabActive]}
          onPress={() => setActiveTab('map')}
        >
          <Ionicons name="map-outline" size={16} color={activeTab === 'map' ? Colors.primaryStart : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'map' && styles.tabTextActive]}>Peta</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'list' && styles.tabActive]}
          onPress={() => setActiveTab('list')}
        >
          <Ionicons name="list-outline" size={16} color={activeTab === 'list' ? Colors.primaryStart : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'list' && styles.tabTextActive]}>
            Daftar ({vehicles.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Map View */}
      {activeTab === 'map' && (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            onError={(e) => console.warn('[FleetTracking] WebView error:', e.nativeEvent)}
          />
          {/* Floating vehicle quick-select list */}
          {vehicles.filter((v) => v.lastLocation).length > 0 && (
            <View style={styles.mapVehicleList}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                {vehicles
                  .filter((v) => v.lastLocation)
                  .map((v) => {
                    const cfg = STATUS_CONFIG[v.status];
                    const isTracking = trackingVehicleId === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[
                          styles.mapVehicleChip,
                          isTracking && { borderColor: cfg.color, backgroundColor: cfg.bg },
                        ]}
                        onPress={() => {
                          if (isTracking) {
                            stopTracking();
                          } else {
                            setSelectedVehicle(v);
                            setActiveTab('list');
                          }
                        }}
                      >
                        <View style={[styles.mapChipDot, { backgroundColor: cfg.color }]} />
                        <Text style={styles.mapChipText}>{v.plateNumber}</Text>
                        {isTracking && (
                          <Ionicons name="radio-button-on" size={10} color={cfg.color} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* List View */}
      {activeTab === 'list' && (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="car-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Belum Ada Armada</Text>
              <Text style={styles.emptyDesc}>
                {isAdmin
                  ? 'Tambahkan armada pertama Anda dengan menekan tombol + di atas.'
                  : 'Belum ada armada yang terdaftar.'}
              </Text>
            </View>
          }
          renderItem={({ item: vehicle }) => {
            const cfg = STATUS_CONFIG[vehicle.status];
            const isTracking = trackingVehicleId === vehicle.id;
            const typeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicleType] || 'car-outline';

            return (
              <GlassCard
                padding={0}
                style={StyleSheet.flatten([
                  styles.vehicleCard,
                  isTracking ? { borderColor: Colors.success, borderWidth: 2 } : {},
                ])}
              >
                <TouchableOpacity
                  style={styles.vehicleCardInner}
                  onPress={() => setSelectedVehicle(selectedVehicle?.id === vehicle.id ? null : vehicle)}
                  activeOpacity={0.8}
                >
                  {/* Left: Icon + Plate */}
                  <View style={styles.vehicleLeft}>
                    <View style={[styles.vehicleIconBg, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={typeIcon as any} size={22} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.vehiclePlate}>{vehicle.plateNumber}</Text>
                        {isTracking && (
                          <Animated.View style={[styles.trackingDot, { transform: [{ scale: pulseAnim }] }]} />
                        )}
                      </View>
                      <Text style={styles.vehicleType}>
                        {vehicle.vehicleType}
                        {vehicle.brand ? ` • ${vehicle.brand}` : ''}
                        {vehicle.year ? ` ${vehicle.year}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Right: Status */}
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded Detail */}
                {selectedVehicle?.id === vehicle.id && (
                  <View style={styles.vehicleDetail}>
                    {/* Driver Info */}
                    <View style={styles.detailRow}>
                      <Ionicons name="person-outline" size={14} color={Colors.textTertiary} />
                      <Text style={styles.detailLabel}>Sopir:</Text>
                      <Text style={styles.detailValue}>{vehicle.driverName}</Text>
                    </View>
                    {vehicle.driverPhone && (
                      <View style={styles.detailRow}>
                        <Ionicons name="call-outline" size={14} color={Colors.textTertiary} />
                        <Text style={styles.detailLabel}>HP:</Text>
                        <Text style={styles.detailValue}>{vehicle.driverPhone}</Text>
                      </View>
                    )}

                    {/* Last Location */}
                    {vehicle.lastLocation ? (
                      <>
                        <View style={styles.detailRow}>
                          <Ionicons name="location-outline" size={14} color={Colors.textTertiary} />
                          <Text style={styles.detailLabel}>Lokasi:</Text>
                          <Text style={[styles.detailValue, { flex: 1 }]} numberOfLines={1}>
                            {vehicle.lastLocation.address ||
                              `${vehicle.lastLocation.latitude.toFixed(5)}, ${vehicle.lastLocation.longitude.toFixed(5)}`}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Ionicons name="time-outline" size={14} color={Colors.textTertiary} />
                          <Text style={styles.detailLabel}>Update:</Text>
                          <Text style={styles.detailValue}>
                            {new Date(vehicle.lastLocation.updatedAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.noLocText}>Belum ada data lokasi</Text>
                    )}

                    {/* Registered */}
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.textTertiary} />
                      <Text style={styles.detailLabel}>Terdaftar:</Text>
                      <Text style={styles.detailValue}>
                        {new Date(vehicle.registeredAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.success + '15', borderColor: Colors.success + '40' }]}
                        onPress={() => {
                          if (isTracking) {
                            stopTracking();
                          } else {
                            startTracking(vehicle.id);
                          }
                        }}
                      >
                        <Ionicons
                          name={isTracking ? 'stop-circle-outline' : 'navigate-outline'}
                          size={16}
                          color={isTracking ? Colors.error : Colors.success}
                        />
                        <Text style={[styles.actionBtnText, { color: isTracking ? Colors.error : Colors.success }]}>
                          {isTracking ? 'Stop GPS' : 'Mulai GPS'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '40' }]}
                        onPress={() => {
                          setActiveTab('map');
                        }}
                      >
                        <Ionicons name="map-outline" size={16} color={Colors.info} />
                        <Text style={[styles.actionBtnText, { color: Colors.info }]}>Lihat Peta</Text>
                      </TouchableOpacity>

                      {isAdmin && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '40' }]}
                          onPress={() => {
                            setEditingVehicle(vehicle);
                            setShowForm(true);
                          }}
                        >
                          <Ionicons name="pencil-outline" size={16} color={Colors.warning} />
                          <Text style={[styles.actionBtnText, { color: Colors.warning }]}>Edit</Text>
                        </TouchableOpacity>
                      )}

                      {isAdmin && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}
                          onPress={() => handleDeleteVehicle(vehicle)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.error} />
                          <Text style={[styles.actionBtnText, { color: Colors.error }]}>Hapus</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </GlassCard>
            );
          }}
        />
      )}

      {/* Add/Edit Vehicle Form */}
      <VehicleFormModal
        visible={showForm}
        vehicle={editingVehicle}
        onClose={() => { setShowForm(false); setEditingVehicle(null); }}
        onSave={handleSaveVehicle}
        saving={saving}
      />
    </SafeAreaView>
  );
};

function getMockVehicles(): FleetVehicle[] {
  return [
    {
      id: 'mock-1',
      plateNumber: 'DD 1234 AB',
      vehicleType: 'TRUCK',
      brand: 'Mitsubishi',
      year: 2021,
      driverName: 'Budi Santoso',
      driverPhone: '08123456789',
      status: 'ACTIVE',
      lastLocation: {
        latitude: -5.134,
        longitude: 119.412,
        address: 'Jl. Sultan Alauddin, Makassar',
        updatedAt: new Date().toISOString(),
      },
      registeredAt: '2024-01-15T00:00:00Z',
    },
    {
      id: 'mock-2',
      plateNumber: 'DD 5678 CD',
      vehicleType: 'PICKUP',
      brand: 'Isuzu',
      year: 2020,
      driverName: 'Ahmad Rahman',
      driverPhone: '08234567890',
      status: 'IDLE',
      lastLocation: {
        latitude: -5.147,
        longitude: 119.430,
        address: 'Jl. Urip Sumoharjo, Makassar',
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
      },
      registeredAt: '2024-03-10T00:00:00Z',
    },
    {
      id: 'mock-3',
      plateNumber: 'DD 9999 EF',
      vehicleType: 'MOTOR',
      brand: 'Honda',
      year: 2022,
      driverName: 'Siti Rahma',
      driverPhone: '08345678901',
      status: 'MAINTENANCE',
      lastLocation: undefined,
      registeredAt: '2024-06-20T00:00:00Z',
    },
  ];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    gap: 4,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    letterSpacing: 0.5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  stopTrackingBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.warning + '30',
  },
  permBannerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
  },
  statsScroll: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    maxHeight: 60,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    alignItems: 'center',
  },
  statChip: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 64,
  },
  statNum: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  statLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    fontWeight: FontWeight.semibold,
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primaryStart,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: Colors.primaryStart,
  },
  map: {
    flex: 1,
  },
  mapVehicleList: {
    position: 'absolute',
    bottom: 16,
    left: 8,
    right: 8,
  },
  mapVehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  mapChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mapChipText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  vehicleCard: {
    overflow: 'hidden',
  },
  vehicleCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  vehicleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  vehicleIconBg: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePlate: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  vehicleType: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  vehicleDetail: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    minWidth: 60,
  },
  detailValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  noLocText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['4xl'],
    gap: Spacing.md,
    marginTop: Spacing['3xl'],
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});

const fmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    ...Shadow.lg,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  form: {
    padding: Spacing.xl,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryStart + '15',
    borderColor: Colors.primaryStart,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
  },
  chipTextActive: {
    color: Colors.primaryStart,
  },
  row2: {
    flexDirection: 'row',
  },
  saveBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primaryStart,
    borderRadius: BorderRadius.md,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
