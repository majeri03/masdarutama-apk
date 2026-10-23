import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

export interface CompressedImageResult {
  uri: string;
  width: number;
  height: number;
  fileSizeKB: number;
  filename: string;
}

export interface ImagePickerOptions {
  maxWidth?: number;
  quality?: number; // 0.0 - 1.0 (default 0.55 for optimal clarity vs compact size)
  aspect?: [number, number];
}

/**
 * Utility cerdas untuk mengambil foto (Kamera / Galeri) dan otomatis mengompresi
 * ke ukuran file terkecil (~25KB - 60KB) namun teks dan detail tetap tajam dan jelas!
 * Ini sangat menghemat kuota Cloudflare R2 10GB Anda.
 */
export async function pickAndCompressImage(
  source: 'camera' | 'gallery',
  options: ImagePickerOptions = {}
): Promise<CompressedImageResult | null> {
  const { maxWidth = 900, quality = 0.55, aspect } = options;

  try {
    // 1. Cek & Minta Izin
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Izin Kamera Diperlukan',
          'Aplikasi memerlukan izin kamera untuk mengambil foto bukti langsung. Silakan izinkan di Pengaturan HP Anda.'
        );
        return null;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Izin Galeri Diperlukan',
          'Aplikasi memerlukan izin galeri untuk memilih foto bukti.'
        );
        return null;
      }
    }

    // 2. Luncurkan Kamera atau Galeri
    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: aspect || undefined,
      quality: 0.8, // ambil resolusi bagus dulu, kompresi presisi dilakukan oleh ImageManipulator
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const rawAsset = result.assets[0];
    const rawUri = rawAsset.uri;

    // 3. Kompresi & Resize Super Hemat (Optimasi R2)
    // Downscale lebar ke max 900px (rasio proporsional tetap terjaga)
    // Menggunakan JPEG quality 0.55 menghasilkan file sangat ringan (~30-60KB),
    // namun angka transfer bank & nota kirim tetap 100% terbaca dengan jelas!
    const manipulateActions: ImageManipulator.Action[] = [];
    if (rawAsset.width && rawAsset.width > maxWidth) {
      manipulateActions.push({ resize: { width: maxWidth } });
    } else if (!rawAsset.width) {
      manipulateActions.push({ resize: { width: maxWidth } });
    }

    const manipulated = await ImageManipulator.manipulateAsync(
      rawUri,
      manipulateActions,
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // 4. Hitung perkiraan ukuran file akhir
    let fileSizeKB = 40; // estimasi fallback
    try {
      const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
      if (fileInfo.exists && (fileInfo as any).size) {
        fileSizeKB = Math.round((fileInfo as any).size / 1024);
      }
    } catch {
      // ignore
    }

    const filename = `photo_${Date.now()}.jpg`;

    return {
      uri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
      fileSizeKB,
      filename,
    };
  } catch (error) {
    console.error('[IMAGE_COMPRESS_ERROR]', error);
    Alert.alert('Gagal Memproses Gambar', 'Terjadi kesalahan saat memproses gambar.');
    return null;
  }
}
