/**
 * ProfileScreen — layar Profil Akun (WS-9, 26 Nov 2026).
 *
 * Dibuka dari kartu "Profil Akun" di SettingsScreen. Isinya:
 * - Foto profil: tampilkan, upload/ganti (galeri, crop 1:1), hapus.
 *   Batas: maks 2 MB, JPG/PNG/WebP (ditegakkan client di profileService
 *   DAN server di /api/profile/avatar).
 * - Info user: nama, email, peran (dari auth store — diisi backend
 *   lewat login / session-check).
 * - Ubah password: PINDAHAN dari modal di SettingsScreen — modal dan
 *   seksi "Keamanan" di Settings sudah dihapus, jadi hanya ada SATU
 *   tempat ganti password: di sini. Kebijakan sama seperti web/server:
 *   min 8, maks 128, 1 huruf besar, 1 angka, 1 simbol. Sukses ganti
 *   password = login ulang (server menaikkan tokenVersion).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { useAuthStore } from '../stores/auth.store';
import { authService } from '../services/auth.service';
import {
  profileService,
  validateNewPassword,
  AVATAR_MAX_SIZE_LABEL,
} from '../services/profile.service';
import { GlassCard, GradientButton } from '../components/ui';
import { AppToast } from '../utils/toast';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, setUser, logout } = useAuthStore();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleUploadAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await profileService.uploadAvatar();
      if (res.success && res.data?.avatarUrl && user) {
        const updated = { ...user, avatarUrl: res.data.avatarUrl };
        setUser(updated);
        await authService.updateStoredUser(updated);
        AppToast.success('Sukses', 'Foto profil berhasil diunggah.');
      } else if (!res.success && res.error !== 'Tidak ada foto yang dipilih.') {
        AppToast.error('Gagal', res.error || 'Gagal mengunggah foto profil.');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteAvatar = () => {
    if (!user?.avatarUrl) return;
    Alert.alert('Hapus Foto Profil', 'Apakah Anda yakin ingin menghapus foto profil?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setDeletingAvatar(true);
          try {
            const res = await profileService.deleteAvatar();
            if (res.success && user) {
              const updated = { ...user, avatarUrl: null };
              setUser(updated);
              await authService.updateStoredUser(updated);
              AppToast.success('Sukses', 'Foto profil berhasil dihapus.');
            } else {
              AppToast.error('Gagal', res.error || 'Gagal menghapus foto profil.');
            }
          } finally {
            setDeletingAvatar(false);
          }
        },
      },
    ]);
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
    // Kebijakan password (sama seperti server): min 8, maks 128,
    // 1 huruf besar, 1 angka, 1 simbol.
    const policyError = validateNewPassword(newPassword);
    if (policyError) {
      AppToast.error('Peringatan', policyError);
      return;
    }
    if (newPassword === currentPassword) {
      AppToast.error('Peringatan', 'Password baru tidak boleh sama dengan password lama.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await profileService.changePassword(currentPassword, newPassword);
      if (res.success) {
        Alert.alert('Sukses', 'Password berhasil diubah. Silakan login ulang.', [
          {
            text: 'OK',
            onPress: () => {
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              logout();
            },
          },
        ]);
      } else {
        AppToast.error('Gagal', res.error || 'Gagal mengubah password.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Profil Akun</Text>
          <Text style={styles.headerSubtitle}>Foto, info akun & ubah password</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* FOTO PROFIL */}
        <View style={styles.section}>
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
                <Text style={styles.profileName}>{user?.name || '—'}</Text>
                <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{user?.role || 'KASIR'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.avatarActions}>
              <TouchableOpacity
                style={styles.avatarButton}
                onPress={handleUploadAvatar}
                disabled={uploadingAvatar || deletingAvatar}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={Colors.primaryStart} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={Colors.primaryStart} />
                )}
                <Text style={styles.avatarButtonText}>
                  {user?.avatarUrl ? 'Ganti Foto' : 'Upload Foto'}
                </Text>
              </TouchableOpacity>
              {user?.avatarUrl ? (
                <TouchableOpacity
                  style={[styles.avatarButton, styles.avatarButtonDanger]}
                  onPress={handleDeleteAvatar}
                  disabled={uploadingAvatar || deletingAvatar}
                >
                  {deletingAvatar ? (
                    <ActivityIndicator size="small" color={Colors.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  )}
                  <Text style={[styles.avatarButtonText, { color: Colors.error }]}>
                    Hapus Foto
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.avatarHint}>
              Maks. {AVATAR_MAX_SIZE_LABEL} • JPG, PNG, atau WebP
            </Text>
          </GlassCard>
        </View>

        {/* UBAH PASSWORD */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ubah Password</Text>
          <GlassCard padding={20}>
            <Text style={styles.policyText}>
              Password baru minimal 8 karakter, maksimal 128 karakter, dan
              mengandung minimal 1 huruf besar, 1 angka, dan 1 simbol.
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
            {confirmPassword !== '' && newPassword !== confirmPassword ? (
              <Text style={styles.mismatchText}>Password tidak cocok</Text>
            ) : null}

            <View style={{ marginTop: Spacing.md }}>
              <GradientButton
                title="Simpan Password"
                onPress={handleChangePassword}
                loading={changingPassword}
                variant="primary"
                fullWidth
              />
            </View>
          </GlassCard>
        </View>

        <Text style={styles.footnote}>
          Untuk mengubah nama atau email, hubungi admin toko.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
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
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
  avatarActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  avatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primaryStart + '40',
    backgroundColor: Colors.primaryStart + '10',
  },
  avatarButtonDanger: {
    borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '10',
  },
  avatarButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryStart,
  },
  avatarHint: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: Spacing.md,
  },
  policyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
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
  mismatchText: {
    fontSize: 11,
    color: Colors.error,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
  },
  footnote: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

export default ProfileScreen;
