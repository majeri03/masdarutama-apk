import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { useAuthStore } from '../stores/auth.store';
import { GlassCard, GradientButton } from '../components/ui';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import type { StoreSetting } from '../types';
import { CURRENT_VERSION, CURRENT_VERSION_CODE } from '../services/update.service';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [usePrinter, setUsePrinter] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSetting | null>(null);

  // Fetch store settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
      if (res.data?.success && res.data?.data) {
        setStoreSettings(res.data.data);
      }
    } catch (e) {
      console.warn('[SETTINGS] Error fetching settings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSettings();
  };

  const handleSupport = () => {
    Linking.openURL('mailto:support@masdarutama.com');
  };

  const handleSync = () => {
    Alert.alert(
      'Sinkronisasi Data',
      'Data akan disinkronkan dengan server. Proses ini membutuhkan koneksi internet.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Sinkronkan',
          onPress: () => {
            Alert.alert('Sinkronisasi', 'Data sedang disinkronisasi dengan server...', [{ text: 'OK' }]);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primaryStart} />
        <Text style={styles.loadingText}>Memuat pengaturan...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
        }
      >
        {/* STORE INFO BANNER — WS-7: tanpa tinted, kaca putih bersih sama
            seperti kartu lain di Settings. Varian tinted (merah 0.08 di atas
            BlurView) terbaca abu di Android dan diduga penyebab kartu ini
            terlihat abu-ungu di screenshot user. */}
        {storeSettings && (
          <GlassCard padding={20} style={styles.storeBanner}>
            <View style={styles.storeInfoRow}>
              <View style={[styles.storeIconBg, { backgroundColor: 'transparent', padding: 0, width: 52, height: 52 }]}>
                <Image
                  source={require('../../assets/logomasdarutama.png')}
                  style={{ width: 52, height: 52, borderRadius: 10 }}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.storeInfoText}>
                <Text style={styles.storeName}>{storeSettings.name}</Text>
                {storeSettings.tagline && (
                  <Text style={styles.storeTagline}>{storeSettings.tagline}</Text>
                )}
                {storeSettings.address && (
                  <Text style={styles.storeAddress} numberOfLines={1}>
                    <Ionicons name="location-outline" size={11} color={Colors.textTertiary} /> {storeSettings.address}
                  </Text>
                )}
                {storeSettings.phone && (
                  <Text style={styles.storeAddress}>
                    <Ionicons name="call-outline" size={11} color={Colors.textTertiary} /> {storeSettings.phone}
                  </Text>
                )}
              </View>
            </View>
          </GlassCard>
        )}

        {/* PROFILE SECTION */}
        {/* WS-9 (26 Nov 2026): kartu ini sekarang BISA DIKETUK — membuka
            layar Profil baru (foto, info user, ubah password). Foto profil
            tampil di sini kalau sudah ada (user.avatarUrl dari sesi). */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil Akun</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Profile')}
          >
            <GlassCard padding={20}>
              <View style={styles.profileHeader}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
                  </View>
                )}
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{user?.name || 'Kasir 1'}</Text>
                  <Text style={styles.profileEmail}>{user?.email || 'kasir1@example.com'}</Text>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{user?.role || 'KASIR'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        </View>

        {/* APP PREFERENCES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pengaturan Aplikasi</Text>
          <GlassCard padding={0}>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.primaryStart + '18' }]}>
                  <Ionicons name="print-outline" size={20} color={Colors.primaryStart} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Koneksi Printer Bluetooth</Text>
                  <Text style={styles.settingDesc}>Gunakan printer thermal untuk struk</Text>
                </View>
              </View>
              <Switch
                value={usePrinter}
                onValueChange={setUsePrinter}
                trackColor={{ false: Colors.border, true: Colors.primaryStart }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.success + '18' }]}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Cetak Struk Otomatis</Text>
                  <Text style={styles.settingDesc}>Langsung cetak setelah pembayaran</Text>
                </View>
              </View>
              <Switch
                value={printReceipt}
                onValueChange={setPrintReceipt}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={handleSync}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.warning + '18' }]}>
                  <Ionicons name="sync-outline" size={20} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Sinkronisasi Data</Text>
                  <Text style={styles.settingDesc}>Perbarui data produk dan kategori</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('DeviceSettings')}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.info + '18' }]}>
                  <Ionicons name="hardware-chip-outline" size={20} color={Colors.info} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Pengaturan Perangkat</Text>
                  <Text style={styles.settingDesc}>Printer Bluetooth, USB, & Scanner</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('InvoiceLayout')}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.primaryStart + '18' }]}>
                  <Ionicons name="color-palette-outline" size={20} color={Colors.primaryStart} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Desain & Layout Invoice</Text>
                  <Text style={styles.settingDesc}>Atur ukuran struk thermal, A4, & surat jalan</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('Delivery')}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.info + '18' }]}>
                  <Ionicons name="paper-plane-outline" size={20} color={Colors.info} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Surat Jalan & Pengiriman</Text>
                  <Text style={styles.settingDesc}>Kirim pesanan dan kelola status kurir</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('Purchase')}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.warning + '18' }]}>
                  <Ionicons name="cart-outline" size={20} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Purchase Order (PO) Barang</Text>
                  <Text style={styles.settingDesc}>Pesan barang dari supplier & tambah stok</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('FleetTracking')}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.success + '18' }]}>
                  <Ionicons name="car-outline" size={20} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Tracking Armada</Text>
                  <Text style={styles.settingDesc}>Pantau lokasi armada & sopir real-time</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* STORE SETTINGS (hanya Admin/SuperAdmin) */}
        {storeSettings && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informasi Toko</Text>
            <GlassCard padding={0}>
              <View style={styles.settingItem}>
                <View style={styles.settingItemLeft}>
                  <View style={[styles.iconBox, { backgroundColor: Colors.info + '18' }]}>
                    <Ionicons name="storefront-outline" size={20} color={Colors.info} />
                  </View>
                  <View>
                    <Text style={styles.settingLabel}>Nama Toko</Text>
                    <Text style={styles.settingDesc}>{storeSettings.name}</Text>
                  </View>
                </View>
              </View>

              {storeSettings.phone && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.settingItem}>
                    <View style={styles.settingItemLeft}>
                      <View style={[styles.iconBox, { backgroundColor: Colors.success + '18' }]}>
                        <Ionicons name="call-outline" size={20} color={Colors.success} />
                      </View>
                      <View>
                        <Text style={styles.settingLabel}>Telepon</Text>
                        <Text style={styles.settingDesc}>{storeSettings.phone}</Text>
                      </View>
                    </View>
                  </View>
                </>
              )}

              {storeSettings.bankName && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.settingItem}>
                    <View style={styles.settingItemLeft}>
                      <View style={[styles.iconBox, { backgroundColor: Colors.warning + '18' }]}>
                        <Ionicons name="card-outline" size={20} color={Colors.warning} />
                      </View>
                      <View>
                        <Text style={styles.settingLabel}>Rekening Bank</Text>
                        <Text style={styles.settingDesc}>
                          {storeSettings.bankName} — {storeSettings.bankAccount}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </GlassCard>
          </View>
        )}

        {/* WS-9 (26 Nov 2026): seksi "Keamanan" (Ubah Password) DIHAPUS
            dari sini — ubah password pindah ke layar Profil baru
            (ProfileScreen), dibuka dari kartu "Profil Akun" di atas. */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lainnya</Text>
          <GlassCard padding={0}>
            <TouchableOpacity style={styles.settingItem} onPress={handleSupport}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.primary + '18' }]}>
                  <Ionicons name="help-buoy-outline" size={20} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Bantuan & Dukungan</Text>
                  <Text style={styles.settingDesc}>Hubungi tim teknis kami</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => navigation.navigate('AppUpdate')}
            >
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.success + '18' }]}>
                  <Ionicons name="cloud-download-outline" size={20} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Pembaruan Aplikasi</Text>
                  <Text style={styles.settingDesc}>Cek & download versi terbaru</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => navigation.navigate('StorageManager')}
            >
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.primary + '18' }]}>
                  <Ionicons name="cloud-outline" size={20} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Penyimpanan Cloudflare R2</Text>
                  <Text style={styles.settingDesc}>Pantau kuota 10 GB & bersihkan foto per kategori</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.textTertiary + '18' }]}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Versi Aplikasi</Text>
                  <Text style={styles.settingDesc}>v{CURRENT_VERSION} (Build {CURRENT_VERSION_CODE})</Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* LOGOUT */}
        <View style={{ marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
          <GradientButton
            title="Keluar (Logout)"
            onPress={() =>
              Alert.alert('Konfirmasi', 'Apakah Anda yakin ingin keluar?', [
                { text: 'Batal', style: 'cancel' },
                { text: 'Keluar', style: 'destructive', onPress: logout },
              ])
            }
            variant="outline"
            fullWidth
            style={{ borderColor: Colors.error }}
            textStyle={{ color: Colors.error }}
          />
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  storeBanner: {
    marginBottom: Spacing.lg,
  },
  storeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  storeIconBg: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primaryStart + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfoText: {
    flex: 1,
    gap: 2,
  },
  storeName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  storeTagline: {
    fontSize: FontSize.xs,
    color: Colors.primaryStart,
    fontWeight: FontWeight.medium,
  },
  storeAddress: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
    marginLeft: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    color: '#fff',
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  profileEmail: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryStart + '18',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.primaryStart + '30',
  },
  roleText: {
    color: Colors.primaryStart,
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 72,
  },
});

export default SettingsScreen;



