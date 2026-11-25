/**
 * Update Service — Pembaruan APK via Google Drive
 * ─────────────────────────────────────────────────────────────────────────
 * DI MANA MANIFEST DI-HOST (terbukti 25 Nov 2026, bukan di repo):
 * Manifest TIDAK ada di repo APK maupun repo backend — manifest adalah file
 * JSON di Google Drive (file ID 15dZHNf5cy6ZOeicCZEFsQgm1UaLZTcrq, share
 * publik "Anyone with the link"), diambil lewat UPDATE_MANIFEST_URL di bawah.
 * File APK-nya juga di Drive (file ID 1GOTYnk6regrKvIQTatRkmIVJtbcnpNXq).
 * Backend punya endpoint GET /api/mobile/update-check, tapi APK TIDAK
 * PERNAH memanggilnya — jalur update yang aktif hanya manifest Drive ini.
 *
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
 *      "sha256": "<hash SHA-256 file APK, 64 huruf hex>",
 *      "minAndroidSdk": 26,
 *      "mandatory": false
 *    }
 *    CARA MENGISI sha256 (di Windows, setelah EAS build selesai):
 *      certutil -hashfile masdar-utama-v1.2.0.apk SHA256
 *    atau di PowerShell:
 *      (Get-FileHash masdar-utama-v1.2.0.apk -Algorithm SHA256).Hash
 *    Salin hasilnya (64 karakter hex) ke field "sha256" di manifest.
 * 5. Setiap rilis baru: naikkan version + versionCode lewat
 *    `npm run bump:patch` (script itu mengupdate app.json, package.json DAN
 *    CURRENT_VERSION / CURRENT_VERSION_CODE di file ini sekaligus), lalu
 *    upload APK baru sebagai VERSI BARU file Drive yang sama (supaya file
 *    ID apkUrl tidak berubah), isi sha256 APK baru ke manifest, lalu upload
 *    manifest baru sebagai VERSI BARU file manifest (supaya URL manifest
 *    tidak berubah). Jangan buat file Drive baru — ID-nya akan berubah dan
 *    apkUrl / UPDATE_MANIFEST_URL di kode harus ikut diubah.
 * ─────────────────────────────────────────────────────────────────────────
 * PENTING: Ganti UPDATE_MANIFEST_URL dan CURRENT_VERSION sesuai project Anda.
 * PERINGATAN: Sejak Nov 2026, update DITOLAK kalau manifest tidak punya
 * sha256 yang valid (REQUIRE_MANIFEST_HASH di bawah). Jadi SETELAH patch ini
 * rilis, JANGAN LUPA menambahkan sha256 ke manifest — kalau tidak, tombol
 * "Cek Pembaruan" akan selalu gagal sampai hash-nya diisi.
 * PERINGATAN 2: eas.json production TIDAK BOLEH pakai "autoIncrement": true
 * (sudah dihapus di patch ini). Kalau autoIncrement aktif, EAS menaikkan
 * versionCode binary sendiri dan nilainya tidak lagi sama dengan
 * CURRENT_VERSION_CODE di file ini — akibatnya aplikasi yang sudah terbaru
 * tetap mengira ada pembaruan (perbandingan versionCode jadi salah).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import { sha256FileAsync } from '../utils/sha256';

/**
 * Pengaman update (Nov 2026): kalau true, manifest WAJIB membawa field
 * "sha256" yang valid dan hash APK hasil download HARUS cocok — kalau tidak,
 * update ditolak dan APK tidak dipasang. Ini mencegah file Drive yang
 * diganti/diutak-atik orang lain terpasang sebagai update.
 * Ubah ke false HANYA sementara (mis. darurat saat manifest lama belum sempat
 * diisi hash-nya) — dan kembalikan ke true segera setelahnya.
 */
export const REQUIRE_MANIFEST_HASH = true;

export const CURRENT_VERSION = '1.1.1';       // HARUS sama dengan expo.version di app.json
export const CURRENT_VERSION_CODE = 3;        // HARUS sama dengan expo.android.versionCode di app.json
// Keduanya diupdate otomatis oleh `npm run bump:patch|minor|major`
// (scripts/bump-version.js). JANGAN ubah manual di satu tempat saja.

/**
 * URL ke file JSON manifest yang ada di Google Drive.
 * Gunakan format: https://drive.google.com/uc?export=download&id=<FILE_ID>
 * Contoh: https://drive.google.com/uc?export=download&id=1abc123XYZ
 *
 * Ganti URL ini dengan URL manifest Anda sendiri setelah upload ke Google Drive.
 */
export const UPDATE_MANIFEST_URL =
  'https://drive.google.com/uc?export=download&id=15dZHNf5cy6ZOeicCZEFsQgm1UaLZTcrq';

export interface UpdateManifest {
  version: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
  /** Hash SHA-256 file APK (64 huruf hex, huruf kecil/besar bebas). Wajib sejak Nov 2026. */
  sha256?: string;
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
 * - Mengembalikan manifest kalau ada pembaruan (versionCode manifest LEBIH
 *   BESAR dari CURRENT_VERSION_CODE, dibandingkan sebagai ANGKA).
 * - Mengembalikan null kalau versi manifest sama atau lebih lama (tidak ada
 *   pembaruan) — tanpa peduli ada/tidaknya sha256 di manifest.
 * - MELEMPAR Error kalau cek update-nya sendiri gagal (tidak ada internet,
 *   HTTP error, atau balasan bukan JSON — mis. halaman peringatan virus-scan
 *   Google Drive) atau manifest tidak valid. Error ini DITAMPILKAN di layar
 *   sebagai "Gagal Memperbarui", dan TIDAK BOLEH disamarkan jadi "tidak ada
 *   pembaruan" (bug lama: gagal fetch return null sehingga layar menampilkan
 *   "Aplikasi Sudah Terbaru!" padahal cek-nya gagal).
 */
export async function checkForUpdate(): Promise<UpdateManifest | null> {
  let manifest: UpdateManifest;
  try {
    // Tambahkan timestamp untuk hindari caching. Pakai '?' atau '&' sesuai
    // URL — link Drive sudah punya '?', tapi host lain belum tentu.
    const separator = UPDATE_MANIFEST_URL.includes('?') ? '&' : '?';
    const url = `${UPDATE_MANIFEST_URL}${separator}t=${Date.now()}`;
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    manifest = await response.json();

    // Validasi minimal field yang wajib ada
    if (!manifest.version || !manifest.apkUrl) {
      throw new Error('Manifest tidak valid: field version atau apkUrl tidak ada.');
    }

    // versionCode HARUS angka — kalau hilang / bukan angka, jangan diam-diam
    // dianggap "tidak ada pembaruan".
    if (typeof manifest.versionCode !== 'number' || !Number.isFinite(manifest.versionCode)) {
      throw new Error('Manifest tidak valid: field versionCode harus berupa angka.');
    }
  } catch (e: any) {
    console.warn('[UpdateService] Gagal cek update:', e?.message);
    throw new Error(e?.message || 'Gagal menghubungi server pembaruan.');
  }

  // Bandingkan versionCode (angka — lebih reliable daripada string comparison).
  // Versi sama atau lebih lama = tidak ada pembaruan.
  if (manifest.versionCode <= CURRENT_VERSION_CODE) {
    return null;
  }

  // Validasi hash — SENGAJA di sini, HANYA kalau memang ada pembaruan.
  // Dulu pengecekan ini jalan SEBELUM membandingkan versi, sehingga
  // manifest versi sama yang belum sempat diisi sha256-nya membuat
  // "Cek Pembaruan" selalu error padahal tidak ada update yang ditawarkan.
  // Kalau hash tidak ada/tidak valid, lempar error supaya layar update
  // menampilkan pesan yang jelas.
  if (REQUIRE_MANIFEST_HASH) {
    const hash = (manifest.sha256 || '').trim();
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error(
        'Manifest update tidak memiliki hash SHA-256 yang valid. Update ditolak demi keamanan — minta developer menambahkan field "sha256" ke manifest (lihat petunjuk di update.service.ts).',
      );
    }
  }

  return manifest;
}

/**
 * Download APK dari URL Google Drive ke storage lokal.
 * Mengembalikan path file APK jika berhasil, null jika gagal.
 *
 * @param apkUrl - URL direct download APK dari Google Drive
 * @param onProgress - callback progress download (0.0 - 1.0)
 * @param expectedSha256 - hash SHA-256 dari manifest; kalau diisi, file hasil
 *   download DIVERIFIKASI dulu — hash tidak cocok = file dihapus, return null.
 *   Kalau REQUIRE_MANIFEST_HASH true dan hash tidak diisi, download ditolak.
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
  expectedSha256?: string,
): Promise<string | null> {
  if (Platform.OS !== 'android') {
    Alert.alert('Tidak Didukung', 'Pembaruan manual APK hanya tersedia di Android.');
    return null;
  }

  // Kalau hash wajib tapi tidak diberikan, tolak sebelum download — jangan
  // sampai ada APK tanpa verifikasi yang bisa dipasang.
  if (REQUIRE_MANIFEST_HASH && !(expectedSha256 || '').trim()) {
    Alert.alert(
      'Update Ditolak',
      'Manifest tidak menyertakan hash SHA-256. Update tidak bisa diverifikasi keamanannya — minta developer menambahkan hash ke manifest.',
    );
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
      // Verifikasi SHA-256 (Nov 2026): hash tidak cocok = file BUKAN APK yang
      // dimaksud manifest (rusak / diganti orang lain) — hapus dan tolak.
      if ((expectedSha256 || '').trim()) {
        try {
          const actualHash = await sha256FileAsync(result.uri);
          if (actualHash.toLowerCase() !== expectedSha256!.trim().toLowerCase()) {
            console.error('[UpdateService] Hash SHA-256 TIDAK COCOK. Manifest:', expectedSha256, 'File:', actualHash);
            Alert.alert(
              'Update Ditolak',
              'File APK yang diunduh tidak cocok dengan hash di manifest (kemungkinan file rusak atau sudah diganti). File dihapus dan update dibatalkan.',
            );
            await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
            return null;
          }
          console.log('[UpdateService] Hash SHA-256 cocok, APK terverifikasi.');
        } catch (hashErr: any) {
          console.error('[UpdateService] Gagal verifikasi hash:', hashErr?.message);
          Alert.alert(
            'Update Ditolak',
            'Hash APK tidak bisa diverifikasi. Update dibatalkan demi keamanan.',
          );
          await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
          return null;
        }
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
