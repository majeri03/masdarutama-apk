import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { storageService, StorageStatsData, StorageCleanupTarget } from '../services/storage.service';
import { AppToast } from '../utils/toast';

export const StorageManagerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StorageStatsData | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await storageService.getStorageStats();
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        AppToast.error('Gagal', res.error || 'Gagal memuat statistik penyimpanan');
      }
    } catch {
      AppToast.error('Error', 'Gagal menghubungi server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCleanup = (
    title: string,
    message: string,
    target: StorageCleanupTarget,
    categoryId?: string,
    olderThanDays?: number,
    keyIdentifier?: string
  ) => {
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Hapus Gambar',
        style: 'destructive',
        onPress: async () => {
          setDeletingKey(keyIdentifier || target);
          try {
            const res = await storageService.cleanupStorage({
              target,
              categoryId,
              olderThanDays,
            });

            if (res.success) {
              Alert.alert('Pembersihan Berhasil', res.data?.message || 'Gambar berhasil dihapus.');
              loadData();
            } else {
              Alert.alert('Gagal', res.error || 'Terjadi kesalahan saat menghapus gambar.');
            }
          } catch (e: any) {
            Alert.alert('Error', 'Gagal memproses pembersihan.');
          } finally {
            setDeletingKey(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
          <Text style={styles.loadingText}>Memeriksa penyimpanan Cloudflare R2...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const quota = stats?.quota || {
    maxGB: 10,
    maxMB: 10240,
    estimatedUsedMB: 0,
    usedPercent: 0,
    totalImages: 0,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Manajemen Penyimpanan R2</Text>
          <Text style={styles.headerSubtitle}>Pantau & bersihkan kuota 10 GB Cloudflare</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={Colors.primaryStart} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
        }
      >
        {/* QUOTA CARD */}
        <GlassCard padding={20} style={styles.quotaCard}>
          <View style={styles.quotaHeader}>
            <View style={styles.quotaIconBox}>
              <Ionicons name="cloud-outline" size={26} color={Colors.primaryStart} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quotaLabel}>Kapasitas Cloudflare R2</Text>
              <Text style={styles.quotaVal}>
                {quota.estimatedUsedMB} MB / {quota.maxGB} GB
              </Text>
            </View>
            <View style={styles.quotaPercentBadge}>
              <Text style={styles.quotaPercentText}>{quota.usedPercent}%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(Math.max(quota.usedPercent, 2), 100)}%` },
              ]}
            />
          </View>

          <View style={styles.quotaFooter}>
            <Text style={styles.quotaFootText}>
              Total Gambar Terdeteksi: <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{quota.totalImages}</Text>
            </Text>
            <Text style={styles.quotaSafeText}>Status: Aman (Free Tier 10GB)</Text>
          </View>
        </GlassCard>

        {/* SECTION 1: GAMBAR PRODUK PER KATEGORI */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cube-outline" size={20} color={Colors.primaryStart} />
            <Text style={styles.sectionTitle}>Foto Produk per Kategori</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Hapus foto produk berdasarkan kategori untuk menghemat penyimpanan R2. Data produk tetap aman, hanya gambar yang dibersihkan.
          </Text>

          {stats?.productCategories && stats.productCategories.length > 0 ? (
            stats.productCategories.map((cat) => {
              const isDeleting = deletingKey === `cat_${cat.id}`;
              return (
                <GlassCard key={cat.id} padding={16} style={styles.catCard}>
                  <View style={styles.catHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <Text style={styles.catMeta}>
                        {cat.productCount} Produk • {cat.imageCount} Foto (~{cat.estimatedSizeKB} KB)
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.deleteBtn,
                        cat.imageCount === 0 && styles.deleteBtnDisabled,
                      ]}
                      disabled={cat.imageCount === 0 || isDeleting}
                      onPress={() =>
                        handleCleanup(
                          `Hapus Foto Kategori "${cat.name}"`,
                          `Apakah Anda yakin ingin menghapus ${cat.imageCount} foto pada kategori "${cat.name}" dari Cloudflare R2? Data produk tidak akan terhapus.`,
                          'PRODUCT_CATEGORY',
                          cat.id,
                          undefined,
                          `cat_${cat.id}`
                        )
                      }
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons
                            name="trash-outline"
                            size={14}
                            color={cat.imageCount === 0 ? Colors.textTertiary : '#FFFFFF'}
                          />
                          <Text
                            style={[
                              styles.deleteBtnText,
                              cat.imageCount === 0 && styles.deleteBtnTextDisabled,
                            ]}
                          >
                            Hapus Foto
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Tidak ada kategori produk.</Text>
          )}

          {/* Tombol Hapus SEMUA Foto Produk */}
          {stats?.totals.productImages ? (
            <TouchableOpacity
              style={styles.dangerAllBtn}
              disabled={deletingKey === 'ALL_PRODUCTS'}
              onPress={() =>
                handleCleanup(
                  'Hapus SEMUA Foto Produk',
                  `Peringatan: Tindakan ini akan menghapus semua (${stats.totals.productImages}) foto produk dari Cloudflare R2. Anda yakin?`,
                  'ALL_PRODUCTS',
                  undefined,
                  undefined,
                  'ALL_PRODUCTS'
                )
              }
            >
              <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
              <Text style={styles.dangerAllBtnText}>
                Hapus Semua ({stats.totals.productImages}) Foto Produk
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* SECTION 2: BUKTI PENGIRIMAN */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="car-outline" size={20} color={Colors.warning} />
            <Text style={styles.sectionTitle}>Foto Bukti Pengiriman (Surat Jalan)</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Bukti kiriman lama yang sudah selesai dapat dibersihkan untuk menjaga kuota tetap lapang.
          </Text>

          <GlassCard padding={16} style={styles.proofCard}>
            <View style={styles.proofStatRow}>
              <View>
                <Text style={styles.proofStatLabel}>Total Bukti Kiriman</Text>
                <Text style={styles.proofStatVal}>{stats?.totals.deliveryProofs.total || 0} Foto</Text>
              </View>
              <View>
                <Text style={styles.proofStatLabel}>Lebih dari 30 Hari</Text>
                <Text style={[styles.proofStatVal, { color: Colors.warning }]}>
                  {stats?.totals.deliveryProofs.olderThan30Days || 0} Foto
                </Text>
              </View>
            </View>

            <View style={styles.proofActionRow}>
              <TouchableOpacity
                style={styles.cleanOldBtn}
                disabled={
                  !stats?.totals.deliveryProofs.olderThan30Days ||
                  deletingKey === 'do_30'
                }
                onPress={() =>
                  handleCleanup(
                    'Bersihkan Bukti Kiriman Lama',
                    `Hapus ${stats?.totals.deliveryProofs.olderThan30Days} foto bukti kiriman yang berusia lebih dari 30 hari dari Cloudflare R2?`,
                    'DELIVERY_PROOFS',
                    undefined,
                    30,
                    'do_30'
                  )
                }
              >
                <Ionicons name="time-outline" size={16} color={Colors.warning} />
                <Text style={styles.cleanOldBtnText}>Hapus yang &gt; 30 Hari</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cleanAllBtn}
                disabled={!stats?.totals.deliveryProofs.total || deletingKey === 'do_all'}
                onPress={() =>
                  handleCleanup(
                    'Hapus Semua Bukti Kiriman',
                    `Hapus seluruh (${stats?.totals.deliveryProofs.total}) foto bukti kiriman dari Cloudflare R2?`,
                    'DELIVERY_PROOFS',
                    undefined,
                    undefined,
                    'do_all'
                  )
                }
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.cleanAllBtnText}>Hapus Semua Bukti</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>

        {/* SECTION 3: BUKTI TRANSFER & PEMBAYARAN */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card-outline" size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>Foto Bukti Transfer & Pembayaran</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Struk transfer bank & QRIS dari kasir atau pelunasan hutang.
          </Text>

          <GlassCard padding={16} style={styles.proofCard}>
            <View style={styles.proofStatRow}>
              <View>
                <Text style={styles.proofStatLabel}>Total Bukti Transfer</Text>
                <Text style={styles.proofStatVal}>{stats?.totals.paymentProofs.total || 0} Foto</Text>
              </View>
              <View>
                <Text style={styles.proofStatLabel}>Lebih dari 30 Hari</Text>
                <Text style={[styles.proofStatVal, { color: Colors.success }]}>
                  {stats?.totals.paymentProofs.olderThan30Days || 0} Foto
                </Text>
              </View>
            </View>

            <View style={styles.proofActionRow}>
              <TouchableOpacity
                style={styles.cleanOldBtn}
                disabled={
                  !stats?.totals.paymentProofs.olderThan30Days ||
                  deletingKey === 'pay_30'
                }
                onPress={() =>
                  handleCleanup(
                    'Bersihkan Bukti Transfer Lama',
                    `Hapus ${stats?.totals.paymentProofs.olderThan30Days} foto bukti transfer yang berusia lebih dari 30 hari dari Cloudflare R2?`,
                    'PAYMENT_PROOFS',
                    undefined,
                    30,
                    'pay_30'
                  )
                }
              >
                <Ionicons name="time-outline" size={16} color={Colors.success} />
                <Text style={[styles.cleanOldBtnText, { color: Colors.success }]}>
                  Hapus yang &gt; 30 Hari
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cleanAllBtn}
                disabled={!stats?.totals.paymentProofs.total || deletingKey === 'pay_all'}
                onPress={() =>
                  handleCleanup(
                    'Hapus Semua Bukti Transfer',
                    `Hapus seluruh (${stats?.totals.paymentProofs.total}) foto bukti transfer dari Cloudflare R2?`,
                    'PAYMENT_PROOFS',
                    undefined,
                    undefined,
                    'pay_all'
                  )
                }
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.cleanAllBtnText}>Hapus Semua Bukti</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  backBtn: {
    padding: 6,
    borderRadius: BorderRadius.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  refreshBtn: {
    marginLeft: 'auto',
    padding: 6,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  quotaCard: {
    borderRadius: BorderRadius.xl,
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  quotaIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  quotaVal: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  quotaPercentBadge: {
    backgroundColor: Colors.primaryStart + '25',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  quotaPercentText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primaryStart,
    borderRadius: 4,
  },
  quotaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  quotaFootText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  quotaSafeText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sectionDesc: {
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 18,
    marginBottom: 4,
  },
  catCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: 8,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  catName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  catMeta: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  deleteBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  deleteBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginVertical: Spacing.md,
  },
  dangerAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error + '15',
    borderWidth: 1,
    borderColor: Colors.error + '40',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: 8,
  },
  dangerAllBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  proofCard: {
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  proofStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  proofStatLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  proofStatVal: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
  },
  proofActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cleanOldBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning + '18',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  cleanOldBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  cleanAllBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error + '18',
    borderWidth: 1,
    borderColor: Colors.error + '40',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  cleanAllBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
});
