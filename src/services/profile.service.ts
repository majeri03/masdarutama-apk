/**
 * Profile Service — foto profil + ubah password (layar Profil).
 * WS-9 (26 Nov 2026).
 *
 * Foto profil memakai infrastruktur upload yang sudah ada (R2 via
 * POST /api/upload dipakai logo toko), tapi lewat endpoint KHUSUS
 * /api/profile/avatar — bukan /api/upload umum — supaya aturan avatar
 * (maks 2 MB, folder "avatars", ikat ke User.avatarUrl, hapus avatar
 * lama) tidak bercampur dengan jalur logo toko.
 */
import * as FileSystem from 'expo-file-system';
import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import { pickAndCompressImage } from '../utils/imageCompressor';
import type { ApiResponse } from '../types';

/** Batas foto profil: maks 2 MB, hanya JPG/PNG/WebP.
 *  Angka yang sama ditegakkan server (route /api/profile/avatar) dan
 *  ditampilkan ke user di layar Profil ("Maks. 2 MB • JPG, PNG, WebP"). */
export const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_SIZE_LABEL = '2 MB';

/** Kebijakan password — SAMA PERSIS dengan server (24 Nov 2026):
 *  min 8, maks 128, minimal 1 huruf besar, 1 angka, 1 simbol.
 *  Cek client ini hanya untuk pesan cepat; server tetap menolak
 *  password yang tidak lolos (route /api/auth/change-password). */
export function validateNewPassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return 'Password harus minimal 8 karakter dan maksimal 128 karakter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password harus mengandung minimal 1 huruf besar (A-Z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password harus mengandung minimal 1 angka (0-9).';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password harus mengandung minimal 1 simbol (mis. ! @ # $ %).';
  }
  return null;
}

export const profileService = {
  /**
   * Pilih foto dari galeri (crop 1:1, dikompresi maks 512px JPEG),
   * cek ukuran ≤ 2 MB, lalu upload ke POST /api/profile/avatar.
   * Mengembalikan avatarUrl baru kalau sukses.
   */
  async uploadAvatar(): Promise<ApiResponse<{ avatarUrl: string }>> {
    try {
      const picked = await pickAndCompressImage('gallery', {
        maxWidth: 512,
        quality: 0.8,
        aspect: [1, 1],
      });
      if (!picked) {
        return { success: false, error: 'Tidak ada foto yang dipilih.' };
      }

      // Batas ukuran ditegakkan di client SEBELUM upload (server di
      // route avatar menegakkan angka yang sama).
      const fileInfo = await FileSystem.getInfoAsync(picked.uri);
      if (fileInfo.exists && typeof fileInfo.size === 'number') {
        if (fileInfo.size > AVATAR_MAX_SIZE_BYTES) {
          const mbSize = (fileInfo.size / (1024 * 1024)).toFixed(2);
          return {
            success: false,
            error: `Ukuran foto (${mbSize} MB) melebihi batas maksimal ${AVATAR_MAX_SIZE_LABEL}.`,
          };
        }
      }

      const formData = new FormData();
      // @ts-ignore — React Native FormData memakai { uri, name, type }.
      formData.append('file', {
        uri: picked.uri,
        name: picked.filename,
        type: 'image/jpeg',
      });

      const response = await api.post<any>(API_ENDPOINTS.PROFILE_AVATAR, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data?.success && response.data?.data?.avatarUrl) {
        return { success: true, data: { avatarUrl: response.data.data.avatarUrl } };
      }
      return {
        success: false,
        error: response.data?.error || 'Gagal mengunggah foto profil.',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal terhubung ke server.',
      };
    }
  },

  /**
   * Hapus foto profil (DELETE /api/profile/avatar).
   */
  async deleteAvatar(): Promise<ApiResponse<{ avatarUrl: null }>> {
    try {
      const response = await api.delete<any>(API_ENDPOINTS.PROFILE_AVATAR);
      if (response.data?.success) {
        return { success: true, data: { avatarUrl: null } };
      }
      return {
        success: false,
        error: response.data?.error || 'Gagal menghapus foto profil.',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal terhubung ke server.',
      };
    }
  },

  /**
   * Ubah password lewat POST /api/auth/change-password (endpoint yang
   * sudah ada — sebelumnya dipanggil dari modal di SettingsScreen).
   * Server menaikkan tokenVersion, jadi semua sesi lama mati dan user
   * harus login ulang setelah sukses (ProfileScreen yang menangani).
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse<void>> {
    try {
      const response = await api.post<any>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      if (response.data?.success) {
        return { success: true };
      }
      return {
        success: false,
        error: response.data?.error || 'Gagal mengubah password.',
      };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.response?.data?.error ||
          'Terjadi kesalahan sistem. Coba lagi.',
      };
    }
  },
};
