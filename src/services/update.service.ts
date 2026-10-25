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
/**
 * Google Drive large file direct download resolver.
 * Files > 25MB trigger a virus scan confirmation page with a form.
 * This resolver parses the confirmation form/UUID and returns the true direct binary URL.
 */
export async function resolveDirectDownloadUrl(url: string): Promise<string> {
  if (!url) return url;

  if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      const contentType = resp.headers.get('content-type') || '';

      // Jika langsung mengembalikan binary APK stream
      if (!contentType.includes('text/html')) {
        return resp.url || url;
      }

      // Jika Google Drive menampilkan halaman peringatan virus scan
      const htmlText = await resp.text();
      if (
        htmlText.includes('Google Drive - Download warning') ||
        htmlText.includes('drive.usercontent.google.com') ||
        htmlText.includes('uc-download-link')
      ) {
        const actionMatch = htmlText.match(/<form[^>]+action="([^"]+)"/i);
        const action = actionMatch ? actionMatch[1] : 'https://drive.usercontent.google.com/download';

        const params = new URLSearchParams();
        const inputRegex = /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi;
        let match;
        while ((match = inputRegex.exec(htmlText)) !== null) {
          params.set(match[1], match[2]);
        }

        if (!params.has('confirm')) {
          params.set('confirm', 't');
        }

        const directResolved = `${action}?${params.toString()}`;
        console.log('[UpdateService] Resolved Google Drive direct link:', directResolved);
        return directResolved;
      }
    } catch (e: any) {
      console.warn('[UpdateService] Error resolving direct link, fallback to original:', e?.message);
    }
  }

  return url;
}

/**
 * Download APK dari URL ke storage lokal.
 * Otomatis menangani bypass virus scan Google Drive untuk file besar.
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
    const finalUrl = await resolveDirectDownloadUrl(apkUrl);
    console.log('[UpdateService] Memulai download APK dari:', finalUrl);

    const downloadResumable = FileSystem.createDownloadResumable(
      finalUrl,
      apkPath,
      {
        headers: {
          Accept: 'application/vnd.android.package-archive,application/octet-stream,*/*',
        },
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
      // Validasi integritas: pastikan file terunduh bukan halaman HTML
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || (info.exists && info.size < 500000)) {
        console.error('[UpdateService] File APK tidak valid atau ukuran terlalu kecil:', info.exists ? info.size : 0);
        Alert.alert(
          'Download Tidak Lengkap',
          'File APK yang diunduh tidak valid. Pastikan link Google Drive diset publik dan coba lagi.',
        );
        return null;
      }
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
 */
export async function installApk(apkLocalPath: string): Promise<void> {
  if (Platform.OS !== 'android') {
    Alert.alert('Tidak Didukung', 'Instalasi APK hanya tersedia di Android.');
    return;
  }

  // Cek apakah file ada dan ukurannya valid
  try {
    const info = await FileSystem.getInfoAsync(apkLocalPath);
    if (!info.exists || (info.exists && info.size < 500000)) {
      Alert.alert('File Tidak Valid', 'File APK tidak ditemukan atau rusak. Silakan download ulang.');
      return;
    }
  } catch {
    Alert.alert('Error', 'Gagal memeriksa file APK.');
    return;
  }

  // Flags gabungan: FLAG_ACTIVITY_NEW_TASK (0x10000000) | FLAG_GRANT_READ_URI_PERMISSION (0x00000001) = 268435457
  const INTENT_FLAGS = 268435457;

  // Metode 1: IntentLauncher dengan content URI
  try {
    const contentUri = await FileSystem.getContentUriAsync(apkLocalPath);
    console.log('[UpdateService] Install via IntentLauncher contentUri:', contentUri);

    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: INTENT_FLAGS,
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
      flags: INTENT_FLAGS,
    });
    return;
  } catch (e2: any) {
    console.warn('[UpdateService] Metode 2 (INSTALL_PACKAGE) gagal:', e2?.message);
  }

  // Metode 3: Fallback - Share file APK
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      Alert.alert(
        'Buka File APK',
        'Installer tidak terbuka otomatis. Silakan pilih package installer/file manager dari menu berikut untuk menginstall.',
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Buka / Bagikan',
            onPress: async () => {
              try {
                await Sharing.shareAsync(apkLocalPath, {
                  mimeType: 'application/vnd.android.package-archive',
                  dialogTitle: 'Install Pembaruan TB Masdar Utama',
                });
              } catch (shareErr) {
                Alert.alert(
                  'Gagal',
                  'Pastikan Anda mengizinkan "Install dari sumber tidak dikenal" di Pengaturan > Keamanan Android.',
                );
              }
            },
          },
        ],
      );
      return;
    }
  } catch (e3: any) {
    console.warn('[UpdateService] Metode 3 (Sharing) gagal:', e3?.message);
  }

  // Semua metode gagal
  Alert.alert(
    'Gagal Membuka Installer',
    'Pastikan Anda telah mengizinkan "Install dari sumber tidak dikenal" di Pengaturan > Keamanan Android, lalu coba lagi.',
    [{ text: 'OK' }],
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
