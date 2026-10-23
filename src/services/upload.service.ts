import api from './api';
import type { ApiResponse } from '../types';

export const uploadService = {
  /**
   * Upload gambar bukti (kiriman / transfer) atau foto produk ke Cloudflare R2
   * @param imageUri URI lokal gambar dari ImageManipulator / ImagePicker
   * @param folder Folder tujuan di R2 (misal: 'proofs_delivery', 'proofs_payment', 'products')
   */
  async uploadImage(
    imageUri: string,
    folder: 'proofs_delivery' | 'proofs_payment' | 'products' = 'products'
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    try {
      const formData = new FormData();
      const rawName = imageUri.split('/').pop() || 'photo.jpg';
      const cleanName = rawName.split('?')[0];
      const match = /\.(\w+)$/.exec(cleanName);
      const ext = match ? match[1].toLowerCase() : 'jpg';
      const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // @ts-ignore
      formData.append('file', {
        uri: imageUri,
        name: cleanName.endsWith('.jpg') ? cleanName : `${cleanName}.jpg`,
        type,
      });

      formData.append('folder', folder);

      const response = await api.post<any>('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.success) {
        return {
          success: true,
          data: {
            url: response.data.url,
            filename: response.data.filename,
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
