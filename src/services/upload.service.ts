import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import api from './api';
import type { ApiResponse } from '../types';

export interface UploadResult {
  url: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
}

export const uploadService = {
  /**
   * Upload gambar bukti (kiriman / transfer) atau foto produk ke Cloudflare R2
   * Otomatis mengompresi gambar, membatasi resolusi & ukuran file (maks 3MB),
   * dan mendukung pelacakan progres.
   *
   * @param imageUri URI lokal gambar
   * @param folder Folder tujuan di R2 ('proofs_delivery' | 'proofs_payment' | 'products')
   * @param onProgress Callback persentase unggah (0 - 100)
   */
  async uploadImage(
    imageUri: string,
    folder: 'proofs_delivery' | 'proofs_payment' | 'products' = 'products',
    onProgress?: (percent: number) => void
  ): Promise<ApiResponse<UploadResult>> {
    try {
      if (onProgress) onProgress(10);

      // 1. Kompresi gambar (Maksimal lebar 1600px, kualitas 0.75 JPEG)
      let processedUri = imageUri;
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 1600 } }], // skala proporsional otomatis
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
        );
        processedUri = manipResult.uri;
      } catch (manipErr) {
        console.warn('[UPLOAD] Kompresi gagal, menggunakan gambar asli:', manipErr);
      }

      if (onProgress) onProgress(30);

      // 2. Cek ukuran file fisik setelah kompresi
      const fileInfo = await FileSystem.getInfoAsync(processedUri);
      const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB limit

      if (fileInfo.exists && typeof fileInfo.size === 'number') {
        if (fileInfo.size > MAX_SIZE_BYTES) {
          const mbSize = (fileInfo.size / (1024 * 1024)).toFixed(2);
          return {
            success: false,
            error: `Ukuran foto (${mbSize} MB) melebihi batas maksimal 3 MB.`,
          };
        }
      }

      if (onProgress) onProgress(50);

      // 3. Siapkan FormData untuk diunggah
      const formData = new FormData();
      const rawName = processedUri.split('/').pop() || 'photo.jpg';
      const cleanName = rawName.split('?')[0];

      // @ts-ignore
      formData.append('file', {
        uri: processedUri,
        name: cleanName.endsWith('.jpg') ? cleanName : `${cleanName}.jpg`,
        type: 'image/jpeg',
      });

      formData.append('folder', folder);

      // 4. Unggah via API
      const response = await api.post<any>('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const current = Math.round((progressEvent.loaded * 50) / progressEvent.total);
            onProgress(50 + current);
          }
        },
      });

      if (onProgress) onProgress(100);

      if (response.data?.success) {
        return {
          success: true,
          data: {
            url: response.data.url,
            filename: response.data.filename,
            sizeBytes: response.data.sizeBytes || (fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : 0),
            mimeType: response.data.mimeType || 'image/jpeg',
          },
        };
      }

      return {
        success: false,
        error: response.data?.error || 'Gagal mengupload gambar',
      };
    } catch (error: any) {
      console.error('[UPLOAD_SERVICE_ERROR]', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal terhubung ke server upload',
      };
    }
  },

  /**
   * Hapus gambar tertentu dari Cloudflare R2
   */
  async deleteImage(filename: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete<any>(`/api/upload?filename=${encodeURIComponent(filename)}`);
      if (response.data?.success) {
        return { success: true };
      }
      return { success: false, error: response.data?.error || 'Gagal menghapus gambar' };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal menghapus gambar' };
    }
  },
};
