/**
 * Update Service — Pembaruan APK via Google Drive
 * ─────────────────────────────────────────────────────────────────────────
 * Cara kerja:
 * 1. Simpan file JSON "manifest" di Google Drive (share publik / "Anyone with link").
 * 2. Ubah link share menjadi link direct download:
 *    - Share link:  https://drive.google.com/file/d/<FILE_ID>/view
 *    - Direct link: https://drive.google.com/uc?export=download&id=<FILE_ID>
 * 3. Isi UPDATE_MANIFEST_URL dengan direct link ke file JSON manifest.
 * 4. File JSON manifest harus berformat:
 *    {
 *      "version": "1.2.0",
 *      "versionCode": 2,
 *      "releaseNotes": "- Perbaikan bug printer\n- Tambah fitur laporan",
 *      "apkUrl": "https://drive.google.com/uc?export=download&id=<APK_FILE_ID>",
 *      "minAndroidSdk": 26,
 *      "mandatory": false
 *    }
 * ─────────────────────────────────────────────────────────────────────────
 * PENTING: Ganti UPDATE_MANIFEST_URL dan CURRENT_VERSION sesuai project Anda.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform, Alert, PermissionsAndroid } from 'react-native';

// ── Konfigurasi — GANTI SESUAI KEBUTUHAN ──────────────────────────────────
export const CURRENT_VERSION = '1.0.0';       // Versi app saat ini
export const CURRENT_VERSION_CODE = 1;        // Build number saat ini

/**
 * URL ke file JSON manifest yang ada di Google Drive.
 * Gunakan format: https://drive.google.com/uc?export=download&id=<FILE_ID>
 * Contoh: https://drive.google.com/uc?export=download&id=1abc123XYZ
 *
 * Ganti URL ini dengan URL manifest Anda sendiri setelah upload ke Google Drive.
 */
export const UPDATE_MANIFEST_URL =
  'https://drive.google.com/uc?export=download&id=15dZHNf5cy6ZOeicCZEFsQgm1UaLZTcrq';
// ──────────────────────────────────────────────────────────────────────────

export interface UpdateManifest {
  version: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
  minAndroidSdk?: number;
  mandatory?: boolean;
}

export type DownloadProgress = {
  bytesWritten: number;
  totalBytesExpected: number;
  fraction: number;
};

/**
 * Mengambil manifest versi terbaru dari Google Drive.
 * Mengembalikan null jika gagal atau tidak ada pembaruan.
 */
export async function checkForUpdate(): Promise<UpdateManifest | null> {
  try {
    // Tambahkan timestamp untuk hindari caching
    const url = `${UPDATE_MANIFEST_URL}&t=${Date.now()}`;
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest: UpdateManifest = await response.json();

    // Validasi minimal field yang wajib ada
    if (!manifest.version || !manifest.apkUrl) {
      throw new Error('Manifest tidak valid: field version atau apkUrl tidak ada.');
    }

    // Bandingkan versionCode (lebih reliable daripada string comparison)
    if (manifest.versionCode > CURRENT_VERSION_CODE) {
      return manifest;
    }

    return null; // Tidak ada pembaruan
  } catch (e: any) {
    console.warn('[UpdateService] Gagal cek update:', e?.message);
    return null;
  }
}

/**
 * Download APK dari URL Google Drive ke storage lokal.
 * Mengembalikan path file APK jika berhasil, null jika gagal.
 *
 * @param apkUrl - URL direct download APK dari Google Drive
 * @param onProgress - callback progress download (0.0 - 1.0)
 */
export async function downloadApk(
  apkUrl: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string | null> {
  if (Platform.OS !== 'android') {
    Alert.alert('Tidak Didukung', 'Pembaruan manual APK hanya tersedia di Android.');
    return null;
  }

  const apkPath = `${FileSystem.cacheDirectory}masdarutama_update.apk`;

  // Hapus file lama jika ada
  try {
    const existing = await FileSystem.getInfoAsync(apkPath);
    if (existing.exists) await FileSystem.deleteAsync(apkPath, { idempotent: true });
  } catch {}

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      apkUrl,
      apkPath,
      {
        headers: { 'User-Agent': 'MasdarUtamaApp/1.0' },
      },
      (downloadProgress) => {
        if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
          onProgress({
            bytesWritten: downloadProgress.totalBytesWritten,
            totalBytesExpected: downloadProgress.totalBytesExpectedToWrite,
            fraction: downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite,
          });
        }
      },
    );

    const result = await downloadResumable.downloadAsync();
    if (result?.uri) {
      return result.uri;
    }
    return null;
  } catch (e: any) {
    console.error('[UpdateService] Download APK gagal:', e?.message);
    return null;
  }
}

/**
 * Buka installer APK Android untuk menginstall file yang sudah didownload.
 * Memerlukan permission INSTALL_PACKAGES atau user harus mengizinkan
 * "Install from unknown sources" di Settings.
 *
 * @param apkLocalPath - path lokal file APK yang sudah didownload
 */
export async function installApk(apkLocalPath: string): Promise<void> {
  if (Platform.OS !== 'android') {
    Alert.alert('Tidak Didukung', 'Instalasi APK hanya tersedia di Android.');
    return;
  }

  // Cek apakah file ada
  try {
    const info = await FileSystem.getInfoAsync(apkLocalPath);
    if (!info.exists) {
      Alert.alert('File Tidak Ditemukan', 'File APK tidak ditemukan. Silakan download ulang.');
      return;
    }
  } catch {
    Alert.alert('Error', 'Gagal memeriksa file APK.');
    return;
  }

  // Metode 1: Coba via IntentLauncher dengan content URI (cara yang benar untuk Android 7+)
  try {
    const contentUri = await FileSystem.getContentUriAsync(apkLocalPath);
    console.log('[UpdateService] Mencoba install via IntentLauncher, contentUri:', contentUri);

    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
    return;
  } catch (e1: any) {
    console.warn('[UpdateService] Metode 1 (IntentLauncher VIEW) gagal:', e1?.message);
  }

  // Metode 2: Coba via INSTALL_PACKAGE action
  try {
    const contentUri = await FileSystem.getContentUriAsync(apkLocalPath);
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    return;
  } catch (e2: any) {
    console.warn('[UpdateService] Metode 2 (INSTALL_PACKAGE) gagal:', e2?.message);
  }

  // Metode 3: Fallback - Share file APK (user bisa pilih installer dari share sheet)
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      Alert.alert(
        'Buka File APK',
        'Installer tidak bisa dibuka otomatis. Aplikasi akan membagikan file APK, silakan pilih installer/file manager untuk menginstall.',
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Buka / Bagikan',
            onPress: async () => {
              try {
                await Sharing.shareAsync(apkLocalPath, {
                  mimeType: 'application/vnd.android.package-archive',
                  UTI: 'com.android.package-archive',
                });
              } catch (shareErr) {
                Alert.alert('Gagal', 'Tidak dapat membuka file APK. Pastikan Anda mengizinkan "Install dari sumber tidak dikenal" di Pengaturan > Keamanan.');
              }
            },
          },
        ]
      );
      return;
    }
  } catch (e3: any) {
    console.warn('[UpdateService] Metode 3 (Sharing) gagal:', e3?.message);
  }

  // Semua metode gagal
  Alert.alert(
    'Gagal Membuka Installer',
    'Pastikan Anda mengizinkan "Install dari sumber tidak dikenal" di Pengaturan > Keamanan Android, lalu coba lagi.',
    [{ text: 'OK' }]
  );
}

/**
 * Helper: format bytes ke string yang mudah dibaca (KB/MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
