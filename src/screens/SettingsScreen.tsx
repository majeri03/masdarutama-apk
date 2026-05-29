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
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { useAuthStore } from '../stores/auth.store';
import { GlassCard, GradientButton } from '../components/ui';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import type { StoreSetting } from '../types';
import { AppToast } from '../utils/toast';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [usePrinter, setUsePrinter] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSetting | null>(null);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      AppToast.error('Peringatan', 'Semua field password wajib diisi.');
      return;
    }
    if (newPassword !== confirmPassword) {
      AppToast.error('Peringatan', 'Password baru dan konfirmasi tidak cocok.');
      return;
    }
    if (newPassword.length < 8) {
      AppToast.error('Peringatan', 'Password baru minimal 8 karakter.');
      return;
    }

    setChangingPassword(true);
    try {
      // Endpoint ganti password
      const res = await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      if (res.data?.success) {
        Alert.alert('Sukses', 'Password berhasil diubah. Silakan login ulang.', [
          {
            text: 'OK',
            onPress: () => {
              setShowPasswordModal(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              logout();
            },
          },
        ]);
      } else {
        AppToast.error('Gagal', res.data?.error || 'Gagal mengubah password.');
      }
    } catch (e: any) {
      AppToast.error('Gagal', e?.response?.data?.error || 'Terjadi kesalahan sistem.');
    } finally {
      setChangingPassword(false);
    }
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
        {/* STORE INFO BANNER */}
        {storeSettings && (
          <GlassCard padding={20} style={styles.storeBanner} tinted>
            <View style={styles.storeInfoRow}>
              <View style={styles.storeIconBg}>
                <Ionicons name="storefront-outline" size={28} color={Colors.primaryStart} />
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil Akun</Text>
          <GlassCard padding={20}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.name || 'Kasir 1'}</Text>
                <Text style={styles.profileEmail}>{user?.email || 'kasir1@example.com'}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{user?.role || 'KASIR'}</Text>
                </View>
              </View>
            </View>
          </GlassCard>
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

        {/* ACCOUNT SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Keamanan</Text>
          <GlassCard padding={0}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setShowPasswordModal(true)}
            >
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: Colors.error + '18' }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.error} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Ubah Password</Text>
                  <Text style={styles.settingDesc}>Perbarui kata sandi akun Anda</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* INFO & SUPPORT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lainnya</Text>
          <GlassCard padding={0}>
            <TouchableOpacity style={styles.settingItem} onPress={handleSupport}>
              <View style={styles.settingItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: '#8B5CF618' }]}>
                  <Ionicons name="help-buoy-outline" size={20} color="#8B5CF6" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Bantuan & Dukungan</Text>
                  <Text style={styles.settingDesc}>Hubungi tim teknis kami</Text>
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
                  <Text style={styles.settingDesc}>v1.0.0 (Build 12)</Text>
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

      {/* ── CHANGE PASSWORD MODAL ── */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <GlassCard padding={24} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ubah Password</Text>
            <Text style={styles.modalSubtitle}>
              Masukkan password lama dan password baru Anda
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password Saat Ini</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Masukkan password lama"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password Baru</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Minimal 8 karakter"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Konfirmasi Password Baru</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ulangi password baru"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
              <GradientButton
                title="Simpan Password"
                onPress={handleChangePassword}
                loading={changingPassword}
                variant="primary"
                fullWidth
              />
              <GradientButton
                title="Batal"
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                variant="outline"
                fullWidth
              />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  // ── Store Banner ──
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
  // ── Sections ──
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
  // ── Profile ──
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
  // ── Setting Row ──
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
  // ── Password Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
});

export default SettingsScreen;



