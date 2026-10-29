import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { GlassCard } from '../components/ui';
import { AppToast } from '../utils/toast';
import {
  checkForUpdate,
  downloadApk,
  installApk,
  formatBytes,
  CURRENT_VERSION,
  CURRENT_VERSION_CODE,
  UPDATE_MANIFEST_URL,
  UpdateManifest,
  DownloadProgress,
} from '../services/update.service';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'no_update' }
  | { status: 'update_available'; manifest: UpdateManifest }
  | { status: 'downloading'; progress: DownloadProgress }
  | { status: 'downloaded'; apkPath: string; manifest: UpdateManifest }
  | { status: 'error'; message: string };

export const AppUpdateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  const isManifestConfigured = !UPDATE_MANIFEST_URL.includes('GANTI_DENGAN_FILE_ID');

  const handleCheckUpdate = useCallback(async () => {
    if (!isManifestConfigured) {
      Alert.alert(
        'Belum Dikonfigurasi',
        'URL manifest belum diatur. Hubungi developer untuk mengkonfigurasi pembaruan otomatis.',
        [{ text: 'OK' }],
      );
      return;
    }

    setState({ status: 'checking' });
    try {
      const manifest = await checkForUpdate();
      if (manifest) {
        setState({ status: 'update_available', manifest });
      } else {
        setState({ status: 'no_update' });
      }
    } catch (e: any) {
      setState({ status: 'error', message: e?.message || 'Gagal menghubungi server.' });
    }
  }, [isManifestConfigured]);

  const handleDownload = useCallback(async (manifest: UpdateManifest) => {
    setState({ status: 'downloading', progress: { bytesWritten: 0, totalBytesExpected: 0, fraction: 0 } });

    const apkPath = await downloadApk(manifest.apkUrl, (progress) => {
      setState({ status: 'downloading', progress });
    });

    if (apkPath) {
      setState({ status: 'downloaded', apkPath, manifest });
      AppToast.success('Download Selesai', 'APK berhasil diunduh. Klik "Install Sekarang" untuk memperbarui.');
    } else {
      setState({ status: 'error', message: 'Gagal mengunduh APK. Cek koneksi internet Anda.' });
    }
  }, []);

  const handleInstall = useCallback(async (apkPath: string) => {
    Alert.alert(
      'Konfirmasi Install',
      'Aplikasi akan ditutup dan installer akan dibuka. Pastikan Anda mengizinkan "Install dari sumber tidak dikenal" jika diminta. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Install Sekarang',
          onPress: async () => {
            await installApk(apkPath);
          },
        },
      ],
    );
  }, []);

  const renderContent = () => {
    switch (state.status) {
      case 'idle':
        return (
          <View style={styles.idleContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download-outline" size={48} color={Colors.primaryStart} />
            </View>
            <Text style={styles.idleTitle}>Cek Pembaruan Aplikasi</Text>
            <Text style={styles.idleDesc}>
              Tekan tombol di bawah untuk memeriksa apakah ada versi terbaru yang tersedia.
              Download dan install langsung dari sini.
            </Text>
            <TouchableOpacity style={styles.checkBtn} onPress={handleCheckUpdate}>
              <Ionicons name="search-outline" size={18} color="#fff" />
              <Text style={styles.checkBtnText}>Cek Pembaruan</Text>
            </TouchableOpacity>
          </View>
        );

      case 'checking':
        return (
          <View style={styles.centeredBox}>
            <ActivityIndicator size="large" color={Colors.primaryStart} />
            <Text style={styles.statusText}>Memeriksa versi terbaru...</Text>
          </View>
        );

      case 'no_update':
        return (
          <View style={styles.centeredBox}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.success + '18' }]}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            </View>
            <Text style={[styles.idleTitle, { color: Colors.success }]}>Aplikasi Sudah Terbaru!</Text>
            <Text style={styles.idleDesc}>Anda menggunakan versi terbaru dari aplikasi ini.</Text>
            <TouchableOpacity style={[styles.checkBtn, { backgroundColor: Colors.textTertiary }]} onPress={handleCheckUpdate}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.checkBtnText}>Cek Ulang</Text>
            </TouchableOpacity>
          </View>
        );

      case 'update_available': {
        const { manifest } = state;
        return (
          <View style={styles.updateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.warning + '18' }]}>
              <Ionicons name="arrow-up-circle-outline" size={48} color={Colors.warning} />
            </View>
            <Text style={[styles.idleTitle, { color: Colors.warning }]}>
              Pembaruan Tersedia!
            </Text>

            <GlassCard padding={16} style={styles.manifestCard}>
              <View style={styles.versionRow}>
                <View style={styles.versionBox}>
                  <Text style={styles.versionLabel}>Versi Saat Ini</Text>
                  <Text style={styles.versionValue}>v{CURRENT_VERSION}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={Colors.textTertiary} />
                <View style={styles.versionBox}>
                  <Text style={styles.versionLabel}>Versi Terbaru</Text>
                  <Text style={[styles.versionValue, { color: Colors.success }]}>v{manifest.version}</Text>
                </View>
              </View>

              {manifest.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Ionicons name="warning-outline" size={14} color={Colors.error} />
                  <Text style={styles.mandatoryText}>Pembaruan Wajib</Text>
                </View>
              )}

              {!!manifest.releaseNotes && (
                <View style={styles.releaseNotesBox}>
                  <Text style={styles.releaseNotesLabel}>Catatan Pembaruan:</Text>
                  <Text style={styles.releaseNotes}>{manifest.releaseNotes}</Text>
                </View>
              )}
            </GlassCard>

            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: Colors.success }]}
              onPress={() => handleDownload(manifest)}
            >
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.checkBtnText}>Download & Update Sekarang</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: Colors.textTertiary, marginTop: 8 }]}
              onPress={() => setState({ status: 'idle' })}
            >
              <Text style={styles.checkBtnText}>Lewati</Text>
            </TouchableOpacity>
          </View>
        );
      }

      case 'downloading': {
        const { progress } = state;
        const pct = Math.round(progress.fraction * 100);
        return (
          <View style={styles.centeredBox}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.primaryStart + '18' }]}>
              <Ionicons name="cloud-download-outline" size={48} color={Colors.primaryStart} />
            </View>
            <Text style={styles.idleTitle}>Mengunduh Pembaruan...</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${pct}%` as any }]} />
            </View>

            <Text style={styles.progressText}>
              {pct}% —{' '}
              {progress.totalBytesExpected > 0
                ? `${formatBytes(progress.bytesWritten)} / ${formatBytes(progress.totalBytesExpected)}`
                : formatBytes(progress.bytesWritten)}
            </Text>
            <Text style={styles.statusText}>Jangan tutup aplikasi selama proses ini...</Text>
          </View>
        );
      }

      case 'downloaded': {
        const { apkPath, manifest } = state;
        return (
          <View style={styles.centeredBox}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.success + '18' }]}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.success} />
            </View>
            <Text style={[styles.idleTitle, { color: Colors.success }]}>Download Selesai!</Text>
            <Text style={styles.idleDesc}>
              APK versi {manifest.version} berhasil diunduh. Klik tombol di bawah untuk memulai instalasi.
            </Text>
            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: Colors.success }]}
              onPress={() => handleInstall(apkPath)}
            >
              <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
              <Text style={styles.checkBtnText}>Install Sekarang</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: Colors.textTertiary, marginTop: 8 }]}
              onPress={() => setState({ status: 'idle' })}
            >
              <Text style={styles.checkBtnText}>Install Nanti</Text>
            </TouchableOpacity>
          </View>
        );
      }

      case 'error':
        return (
          <View style={styles.centeredBox}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.error + '18' }]}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
            </View>
            <Text style={[styles.idleTitle, { color: Colors.error }]}>Gagal Memperbarui</Text>
            <Text style={styles.idleDesc}>{state.message}</Text>
            <TouchableOpacity style={styles.checkBtn} onPress={handleCheckUpdate}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.checkBtnText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PEMBARUAN APLIKASI</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Version Info */}
        <GlassCard padding={16} style={styles.versionInfoCard}>
          <View style={styles.versionInfoRow}>
            <View style={[styles.appIconBox, { backgroundColor: Colors.primaryStart + '15' }]}>
              <Ionicons name="phone-portrait-outline" size={28} color={Colors.primaryStart} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>TB Masdar Utama Mobile</Text>
              <Text style={styles.currentVersionText}>
                Versi {CURRENT_VERSION} (Build {CURRENT_VERSION_CODE})
              </Text>
              <Text style={styles.platformText}>
                Platform: {Platform.OS === 'android' ? 'Android' : Platform.OS}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Main Content */}
        {renderContent()}

        {/* Info Box */}
        <GlassCard padding={16} style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
            <Text style={styles.infoText}>
              Pembaruan diunduh langsung dari Google Drive resmi tim developer.
              Pastikan koneksi internet stabil saat mengunduh.
              Proses install mungkin meminta izin "Install dari sumber tidak dikenal".
            </Text>
          </View>
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
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: Spacing.lg,
  },
  versionInfoCard: { marginBottom: 0 },
  versionInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  appIconBox: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  currentVersionText: {
    fontSize: FontSize.sm,
    color: Colors.primaryStart,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  platformText: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  idleContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
  },
  centeredBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
  },
  updateContainer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryStart + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  idleDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  statusText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primaryStart,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.lg,
    minWidth: 220,
    alignSelf: 'center',
  },
  checkBtnText: {
    color: '#fff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  manifestCard: {
    width: '100%',
    marginVertical: Spacing.sm,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  versionBox: {
    alignItems: 'center',
    gap: 4,
  },
  versionLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  versionValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  mandatoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.error + '12',
    borderRadius: BorderRadius.sm,
    padding: 8,
    marginBottom: Spacing.sm,
  },
  mandatoryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  releaseNotesBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  releaseNotesLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  releaseNotes: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  progressBarContainer: {
    width: '80%',
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primaryStart,
    borderRadius: 5,
  },
  progressText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  infoCard: { marginTop: 0 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textTertiary,
    lineHeight: 17,
  },
  // re-use from DeviceSettings
  border: {
    borderColor: (Colors as any).border,
  },
});

export default AppUpdateScreen;
