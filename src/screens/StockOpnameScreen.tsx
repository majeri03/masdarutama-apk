import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton, StatusBadge } from '../components/ui';
import { stockService, StockMovement } from '../services/stock.service';
import { productService } from '../services/product.service';
import { useAuthStore } from '../stores/auth.store';
import type { Product } from '../types';
import { CameraView, useCameraPermissions } from 'expo-camera';

const MOVEMENT_LABEL: Record<string, string> = {
  IN: 'Stok Masuk',
  OUT: 'Stok Keluar',
  ADJUSTMENT: 'Penyesuaian',
  RETURN: 'Barang Return',
};

const MOVEMENT_COLOR: Record<string, string> = {
  IN: Colors.success,
  OUT: Colors.error,
  ADJUSTMENT: Colors.warning,
  RETURN: Colors.info,
};

export const StockOpnameScreen: React.FC = () => {
  const { isAdmin } = useAuthStore();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');

  // Adjustment Modal
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form adjustment states
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [quantityStr, setQuantityStr] = useState('');
  const [notes, setNotes] = useState('');
  
  // Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const fetchMovements = useCallback(async (pageNum = 1, reset = true) => {
    if (pageNum === 1) {
      reset ? setLoading(true) : setRefreshing(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await stockService.getStockMovements({
        search: searchQuery || undefined,
        type: selectedType || undefined,
        page: pageNum,
        limit: 15,
      });

      if (res.success && res.data) {
        const rawData = res.data;
        const list = Array.isArray(rawData) ? rawData : (rawData as any).movements || [];
        const pagination = (rawData as any).pagination;

        if (reset || pageNum === 1) {
          setMovements(list);
        } else {
          setMovements((prev) => [...prev, ...list]);
        }

        if (pagination) {
          setTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (e) {
      console.warn('[STOCK OPNAME] Error fetching movements:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [searchQuery, selectedType]);

  useEffect(() => {
    setPage(1);
    fetchMovements(1, true);
  }, [searchQuery, selectedType]);

  const onRefresh = () => {
    setPage(1);
    fetchMovements(1, true);
  };

  const loadMore = () => {
    if (!loadingMore && page < totalPages) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMovements(nextPage, false);
    }
  };

  const loadProducts = async (search = '') => {
    setLoadingProducts(true);
    try {
      const res = await productService.getProducts({
        search,
        isActive: true,
        limit: 10,
      });
      if (res.success && res.data) {
        setProducts(res.data.products);
      }
    } catch (e) {
      console.warn('[STOCK OPNAME] Error fetching products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleOpenAdjustment = () => {
    if (!isAdmin()) {
      Alert.alert('Akses Ditolak', 'Hanya administrator yang dapat melakukan stock opname.');
      return;
    }
    setSelectedProduct(null);
    setAdjType('ADJUSTMENT');
    setQuantityStr('');
    setNotes('');
    setSearchProductQuery('');
    setProducts([]);
    setShowAdjModal(true);
  };

  // Scanner handler
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setShowScanner(false);
    setLoadingProducts(true);
    try {
      const res = await productService.getProducts({ search: data, limit: 2 });
      if (res.success && res.data?.products && res.data.products.length > 0) {
        setSelectedProduct(res.data.products[0]);
        setSearchProductQuery(res.data.products[0].name);
      } else {
        Alert.alert('Tidak Ditemukan', `Produk dengan barcode "${data}" tidak ditemukan.`);
      }
    } catch (e) {
      Alert.alert('Error', 'Gagal memproses barcode.');
    } finally {
      setLoadingProducts(false);
    }
  };

  const openScanner = () => {
    if (!permission) {
      requestPermission();
    } else if (!permission.granted) {
      Alert.alert('Izin Kamera', 'Aplikasi membutuhkan izin untuk menggunakan kamera.');
      requestPermission();
      return;
    }
    setShowScanner(true);
  };

  // Submit Adjustment
  const handleAdjustmentSubmit = async () => {
    if (!selectedProduct) {
      Alert.alert('Peringatan', 'Silakan pilih produk terlebih dahulu.');
      return;
    }
    const qty = Number(quantityStr);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Peringatan', 'Masukkan jumlah stok valid (minimal 0).');
      return;
    }
    if (!notes.trim()) {
      Alert.alert('Peringatan', 'Catatan penyesuaian wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await stockService.createAdjustment({
        productId: selectedProduct.id,
        type: adjType,
        quantity: qty,
        notes: notes.trim(),
      });

      if (res.success) {
        Alert.alert('Sukses', `Stock Opname produk "${selectedProduct.name}" berhasil disimpan.`);
        setShowAdjModal(false);
        fetchMovements(1, true);
      } else {
        Alert.alert('Gagal', res.error || 'Gagal menyimpan penyesuaian stok.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate physical stock adjustment difference
  const renderDifference = () => {
    if (!selectedProduct || adjType !== 'ADJUSTMENT' || !quantityStr) return null;
    const current = selectedProduct.currentStock;
    const physical = Number(quantityStr);
    if (isNaN(physical)) return null;
    const diff = physical - current;
    const diffText = diff >= 0 ? `+${diff}` : `${diff}`;
    const diffColor = diff >= 0 ? Colors.success : Colors.error;
    return (
      <Text style={[styles.diffText, { color: diffColor }]}>
        Selisih: {diffText} unit dari stok saat ini ({current} unit)
      </Text>
    );
  };

  const renderMovementCard = ({ item }: { item: StockMovement }) => {
    const primaryUnit = item.product?.productUnits?.find((pu: any) => pu.isPrimary) || item.product?.productUnits?.[0];
    const unitSymbol = primaryUnit?.unit?.name || 'unit';
    const color = MOVEMENT_COLOR[item.type] || Colors.textPrimary;
    const sign = item.type === 'IN' ? '+' : item.type === 'OUT' ? '-' : '';

    return (
      <GlassCard padding={14} style={styles.movementCard}>
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.productName} numberOfLines={1}>{item.product?.name}</Text>
            <Text style={styles.productCode}>{item.product?.code}</Text>
            {item.notes && <Text style={styles.notesText}>"{item.notes}"</Text>}
            <Text style={styles.dateText}>
              {new Date(item.createdAt).toLocaleDateString('id-ID', {
                timeZone: 'Asia/Makassar',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.qtyText, { color }]}>
              {sign}{item.quantity} {unitSymbol}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
              <Text style={[styles.typeBadgeText, { color }]}>
                {MOVEMENT_LABEL[item.type] || item.type}
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.header}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari riwayat per produk / kode..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              style={[styles.typeFilterChip, selectedType === '' && styles.typeFilterChipActive]}
              onPress={() => setSelectedType('')}
            >
              <Text style={[styles.typeFilterText, selectedType === '' && styles.typeFilterTextActive]}>Semua</Text>
            </TouchableOpacity>
            {Object.entries(MOVEMENT_LABEL).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeFilterChip, selectedType === key && styles.typeFilterChipActive]}
                onPress={() => setSelectedType(key)}
              >
                <Text style={[styles.typeFilterText, selectedType === key && styles.typeFilterTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Movements list */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
          <Text style={styles.loadingLabel}>Memuat data pergerakan stok...</Text>
        </View>
      ) : (
        <FlatList
          data={movements}
          keyExtractor={(item) => item.id}
          renderItem={renderMovementCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={Colors.primaryStart} style={{ padding: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="swap-horizontal-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>Belum ada pergerakan stok</Text>
              <Text style={styles.emptyDesc}>Riwayat keluar/masuk/penyesuaian stok akan tercatat di sini.</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button for Stock Opname */}
      {isAdmin() && (
        <TouchableOpacity style={styles.fab} onPress={handleOpenAdjustment} activeOpacity={0.8}>
          <Ionicons name="clipboard-outline" size={24} color="#fff" />
          <Text style={styles.fabText}>Stock Opname</Text>
        </TouchableOpacity>
      )}

      {/* ── STOCK OPNAME ADJUSTMENT MODAL ── */}
      <Modal visible={showAdjModal} animationType="slide">
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <TouchableOpacity onPress={() => setShowAdjModal(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.formHeaderTitle}>Form Stock Opname</Text>
            <TouchableOpacity onPress={openScanner}>
              <Ionicons name="barcode-outline" size={24} color={Colors.primaryStart} />
            </TouchableOpacity>
          </View>

          {showScanner ? (
            <View style={styles.scannerWrapper}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'upc_a'],
                }}
              />
              <View style={styles.scannerOverlay}>
                <Text style={styles.scannerOverlayText}>Arahkan kamera ke barcode produk</Text>
                <GradientButton
                  title="Tutup Kamera"
                  onPress={() => setShowScanner(false)}
                  variant="outline"
                  style={{ width: 200, borderColor: '#fff' }}
                  textStyle={{ color: '#fff' }}
                />
              </View>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.formContent}>
              {/* Product selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cari Produk *</Text>
                <View style={styles.productSearchRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    placeholder="Ketik nama atau kode produk..."
                    placeholderTextColor={Colors.textTertiary}
                    value={searchProductQuery}
                    onChangeText={(text) => {
                      setSearchProductQuery(text);
                      if (text.length > 1) {
                        loadProducts(text);
                      }
                    }}
                  />
                  {searchProductQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSearchProductQuery('');
                        setSelectedProduct(null);
                        setProducts([]);
                      }}
                      style={styles.clearProductBtn}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dropdown list for products search */}
                {loadingProducts ? (
                  <ActivityIndicator size="small" color={Colors.primaryStart} style={{ marginVertical: 8 }} />
                ) : products.length > 0 && !selectedProduct ? (
                  <View style={styles.productDropdown}>
                    {products.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.productDropdownItem}
                        onPress={() => {
                          setSelectedProduct(p);
                          setSearchProductQuery(p.name);
                          setProducts([]);
                        }}
                      >
                        <Text style={styles.dropdownName}>{p.name}</Text>
                        <Text style={styles.dropdownCode}>{p.code} (Stok: {p.currentStock})</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* Selected Product info card */}
                {selectedProduct && (
                  <GlassCard padding={12} style={styles.selectedProductCard} tinted>
                    <View style={styles.selectedProductRow}>
                      <Ionicons name="cube-outline" size={20} color={Colors.primaryStart} />
                      <View>
                        <Text style={styles.selectedName}>{selectedProduct.name}</Text>
                        <Text style={styles.selectedStock}>Stok Tercatat: {selectedProduct.currentStock} unit</Text>
                      </View>
                    </View>
                  </GlassCard>
                )}
              </View>

              {/* Adjustment Type Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tipe Penyesuaian *</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeSelectBtn, adjType === 'ADJUSTMENT' && styles.typeSelectBtnActive]}
                    onPress={() => setAdjType('ADJUSTMENT')}
                  >
                    <Text style={[styles.typeSelectText, adjType === 'ADJUSTMENT' && styles.typeSelectTextActive]}>
                      Fisik Aktual
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeSelectBtn, adjType === 'IN' && styles.typeSelectBtnActive]}
                    onPress={() => setAdjType('IN')}
                  >
                    <Text style={[styles.typeSelectText, adjType === 'IN' && styles.typeSelectTextActive]}>
                      Stok Masuk
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeSelectBtn, adjType === 'OUT' && styles.typeSelectBtnActive]}
                    onPress={() => setAdjType('OUT')}
                  >
                    <Text style={[styles.typeSelectText, adjType === 'OUT' && styles.typeSelectTextActive]}>
                      Stok Keluar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quantity Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {adjType === 'ADJUSTMENT'
                    ? 'Stok Fisik Sebenarnya (Aktual) *'
                    : adjType === 'IN'
                    ? 'Jumlah Stok Tambahan (Masuk) *'
                    : 'Jumlah Stok Dikurangi (Keluar) *'}
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={adjType === 'ADJUSTMENT' ? 'Contoh: 15' : 'Contoh: 5'}
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                  value={quantityStr}
                  onChangeText={setQuantityStr}
                />
                {renderDifference()}
              </View>

              {/* Adjustment Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Catatan Alasan Penyesuaian *</Text>
                <TextInput
                  style={[styles.textInput, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                  placeholder="Contoh: Selisih opname akhir bulan, barang rusak, retur supplier, dll."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}

          {!showScanner && (
            <View style={styles.formFooter}>
              <GradientButton
                title="Simpan Penyesuaian Stok"
                onPress={handleAdjustmentSubmit}
                loading={submitting}
                variant="primary"
                fullWidth
              />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  filterRow: {
    flexDirection: 'row',
  },
  typeFilterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  typeFilterChipActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  typeFilterText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  typeFilterTextActive: {
    color: '#fff',
    fontWeight: FontWeight.bold,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.md,
  },
  loadingLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  listContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: 100, // padding for FAB space
  },
  movementCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    gap: 4,
  },
  productName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  productCode: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  notesText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  dateText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  qtyText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['3xl'],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing['2xl'],
    right: Spacing.lg,
    height: 52,
    backgroundColor: Colors.primaryStart,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 8,
    // iOS shadow
    shadowColor: Colors.primaryStart,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // Android shadow
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  
  // ── Form Modal Styles ──
  formContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  formHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  formContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  productSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  clearProductBtn: {
    position: 'absolute',
    right: 12,
  },
  productDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    maxHeight: 180,
    overflow: 'hidden',
  },
  productDropdownItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  dropdownName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  dropdownCode: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  selectedProductCard: {
    marginTop: 4,
  },
  selectedProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  selectedName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  selectedStock: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeSelectBtn: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSelectBtnActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  typeSelectText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  typeSelectTextActive: {
    color: '#fff',
    fontWeight: FontWeight.bold,
  },
  diffText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  formFooter: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  
  // ── Scanner Styles ──
  scannerWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 16,
  },
  scannerOverlayText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
