import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../../constants/theme';
import { pickAndCompressImage } from '../../utils/imageCompressor';
import { uploadService } from '../../services/upload.service';

interface ProofImageUploaderProps {
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
  onImageUploaded: (url: string | null) => void;
  folder?: 'proofs_delivery' | 'proofs_payment' | 'products';
  required?: boolean;
}

export const ProofImageUploader: React.FC<ProofImageUploaderProps> = ({
  label,
  sublabel = 'Kamera otomatis kompresi hemat kuota R2',
  imageUrl,
  onImageUploaded,
  folder = 'proofs_delivery',
  required = false,
}) => {
  const [processing, setProcessing] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [fileSizeKB, setFileSizeKB] = useState<number | null>(null);

  const handlePick = async (source: 'camera' | 'gallery') => {
    setProcessing(true);
    try {
      const result = await pickAndCompressImage(source, {
        maxWidth: 900,
        quality: 0.55,
      });

      if (!result) {
        setProcessing(false);
        return;
      }

      setFileSizeKB(result.fileSizeKB);

      // Upload langsung ke backend R2 dengan tracking progres & kompresi
      const uploadRes = await uploadService.uploadImage(result.uri, folder);
      if (uploadRes.success && uploadRes.data?.url) {
        onImageUploaded(uploadRes.data.url);
      } else {
        Alert.alert('Gagal Upload', uploadRes.error || 'Gagal mengunggah foto ke server.');
      }
    } catch (e: any) {
      console.error('[PROOF_PICK_ERROR]', e);
      Alert.alert('Error', 'Gagal memproses gambar');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    Alert.alert('Hapus Foto', 'Apakah Anda yakin ingin menghapus foto bukti ini dari database & storage?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          if (imageUrl) {
            // Hapus file fisik dari Cloudflare R2 secara asinkron
            uploadService.deleteImage(imageUrl).catch((err) => {
              console.warn('[PROOF_REMOVE_WARN] Gagal hapus dari R2:', err);
            });
          }
          onImageUploaded(null);
          setFileSizeKB(null);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label} {required && <Text style={{ color: Colors.error }}>*</Text>}
        </Text>
        {fileSizeKB !== null && (
          <View style={styles.sizeBadge}>
            <Ionicons name="sparkles" size={11} color={Colors.success} />
            <Text style={styles.sizeBadgeText}>Hemat R2: {fileSizeKB} KB</Text>
          </View>
        )}
      </View>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}

      {/* JIKA SUDAH ADA FOTO */}
      {imageUrl ? (
        <View style={styles.previewContainer}>
          <TouchableOpacity
            style={styles.imageWrapper}
            onPress={() => setPreviewModalVisible(true)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: imageUrl }} style={styles.previewImage} resizeMode="cover" />
            <View style={styles.zoomIconOverlay}>
              <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => setPreviewModalVisible(true)}
            >
              <Ionicons name="eye-outline" size={16} color={Colors.primaryStart} />
              <Text style={styles.actionBtnTextSecondary}>Lihat Full</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnDanger} onPress={handleRemove}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={styles.actionBtnTextDanger}>Hapus</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnRetake}
              onPress={() => handlePick('camera')}
              disabled={processing}
            >
              <Ionicons name="camera-reverse-outline" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnTextRetake}>Foto Ulang</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* JIKA BELUM ADA FOTO */
        <View style={styles.uploadBox}>
          {processing ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Colors.primaryStart} />
              <Text style={styles.loadingText}>Mengompresi & mengupload...</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              {/* TOMBOL BUKA KAMERA LANGSUNG */}
              <TouchableOpacity
                style={styles.cameraBtn}
                onPress={() => handlePick('camera')}
                activeOpacity={0.8}
              >
                <View style={styles.iconCirclePrimary}>
                  <Ionicons name="camera" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.cameraBtnTitle}>Foto Kamera Langsung</Text>
                <Text style={styles.cameraBtnSubtitle}>Ambil foto sekarang</Text>
              </TouchableOpacity>

              {/* TOMBOL DARI GALERI */}
              <TouchableOpacity
                style={styles.galleryBtn}
                onPress={() => handlePick('gallery')}
                activeOpacity={0.8}
              >
                <View style={styles.iconCircleSecondary}>
                  <Ionicons name="images-outline" size={22} color={Colors.textPrimary} />
                </View>
                <Text style={styles.galleryBtnTitle}>Pilih Galeri</Text>
                <Text style={styles.galleryBtnSubtitle}>Dari album foto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* FULLSCREEN PREVIEW MODAL */}
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.fullModalOverlay}>
          <View style={styles.fullModalHeader}>
            <Text style={styles.fullModalTitle}>{label}</Text>
            <TouchableOpacity
              onPress={() => setPreviewModalVisible(false)}
              style={styles.fullModalCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {imageUrl ? (
            <View style={styles.fullImageWrapper}>
              <Image source={{ uri: imageUrl }} style={styles.fullImage} resizeMode="contain" />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sublabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  sizeBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.success,
  },
  uploadBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: Spacing.md,
  },
  loadingBox: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: Colors.primary + '18',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePrimary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cameraBtnTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  cameraBtnSubtitle: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  galleryBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSecondary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  galleryBtnTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  galleryBtnSubtitle: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  previewContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  imageWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  zoomIconOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 3,
  },
  previewActions: {
    flex: 1,
    gap: 6,
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryStart + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  actionBtnTextSecondary: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryStart,
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  actionBtnTextDanger: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
  actionBtnRetake: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnTextRetake: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  fullModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  fullModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.md,
  },
  fullModalTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  fullModalCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  fullImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
});
