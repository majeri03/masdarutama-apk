/**
 * TransactionHistoryScreen — Riwayat transaksi lengkap dengan filter,
 * detail per invoice, status pembayaran, dan cetak invoice.
 */
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
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { DatePickerInput } from '../components/ui/DatePickerInput';
import { salesService } from '../services/sales.service';
import type { Sale, PaymentMethod, SaleStatus } from '../types';
import { printInvoice, shareInvoicePdf } from '../utils/invoicePdf';
import { useRoute } from '@react-navigation/native';
import { AppToast } from '../utils/toast';

// Badge warna untuk status pembayaran
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  COMPLETED: { color: Colors.success, bg: Colors.successLight, label: 'Lunas', icon: 'checkmark-circle' },
  PENDING: { color: Colors.warning, bg: Colors.warningLight, label: 'Menunggu', icon: 'time' },
  CANCELLED: { color: Colors.error, bg: Colors.errorLight, label: 'Dibatalkan', icon: 'close-circle' },
  RETURN: { color: Colors.info, bg: Colors.infoLight, label: 'Return', icon: 'return-up-back' },
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  CREDIT: 'Piutang',
  DEBIT_CARD: 'Kartu Debit',
  QRIS: 'QRIS',
};

interface FilterState {
  search: string;
  status: SaleStatus | '';
  paymentMethod: PaymentMethod | '';
  dateFrom: Date | null;
  dateTo: Date | null;
  sortOrder: 'asc' | 'desc';
}

export const TransactionHistoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const [activeCustomerId, setActiveCustomerId] = useState<string | undefined>(route.params?.customerId);

  useEffect(() => {
    if (route.params?.customerId) {
      setActiveCustomerId(route.params.customerId);
    }
  }, [route.params?.customerId]);

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter states
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    paymentMethod: '',
    dateFrom: null,
    dateTo: null,
    sortOrder: 'desc',
  });
  const [showFilter, setShowFilter] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(filters);

  // Detail modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchSales = useCallback(
    async (pageNum = 1, resetList = true) => {
      if (pageNum === 1) {
        resetList ? setLoading(true) : setRefreshing(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await salesService.getSales({
          search: filters.search || undefined,
          status: filters.status || undefined,
          paymentMethod: filters.paymentMethod || undefined,
          dateFrom: filters.dateFrom ? filters.dateFrom.toISOString().split('T')[0] : undefined,
          dateTo: filters.dateTo ? filters.dateTo.toISOString().split('T')[0] : undefined,
          sortOrder: filters.sortOrder,
          customerId: activeCustomerId || undefined,
          page: pageNum,
          limit: 15,
        });

        if (res.success && res.data) {
          const newSales = (res.data as any).sales || res.data;
          if (resetList || pageNum === 1) {
            setSales(Array.isArray(newSales) ? newSales : []);
          } else {
            setSales((prev) => [...prev, ...(Array.isArray(newSales) ? newSales : [])]);
          }
          const pagination = (res as any).pagination || (res.data as any).pagination;
          if (pagination) {
            setTotalPages(pagination.totalPages || 1);
          }
        }
      } catch (e) {
        console.warn('[TRANSACTIONS] Error:', e);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filters, activeCustomerId]
  );

  useEffect(() => {
    setPage(1);
    fetchSales(1, true);
  }, [filters, activeCustomerId]);

  const onRefresh = () => {
    setPage(1);
    fetchSales(1, true);
  };

  const loadMore = () => {
    if (!loadingMore && page < totalPages) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchSales(nextPage, false);
    }
  };

  const applyFilters = () => {
    setFilters(pendingFilters);
    setShowFilter(false);
  };

  const resetFilters = () => {
    const empty: FilterState = {
      search: '',
      status: '',
      paymentMethod: '',
      dateFrom: null,
      dateTo: null,
      sortOrder: 'desc',
    };
    setPendingFilters(empty);
    setFilters(empty);
    setShowFilter(false);
  };

  const openDetail = async (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetail(true);
    setLoadingDetail(true);
    try {
      const res = await salesService.getSaleById(sale.id);
      if (res.success && res.data) {
        setSelectedSale(res.data);
      }
    } catch (e) {
      console.warn('[DETAIL] Error:', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const shareInvoice = async (sale: Sale) => {
    try {
      const lines: string[] = [
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  TB MASDAR UTAMA`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Invoice : ${sale.invoiceNumber}`,
        `Tanggal : ${new Date(sale.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' })}`,
        `Kasir   : ${sale.cashier?.name || '-'}`,
        `Pembeli : ${sale.customer?.name || 'Umum'}`,
        `─────────────────────────`,
      ];

      if (sale.saleItems) {
        sale.saleItems.forEach((item) => {
          lines.push(`${item.product.name}`);
          lines.push(`  ${item.quantity} x Rp ${item.unitPrice.toLocaleString('id-ID')} = Rp ${item.subtotal.toLocaleString('id-ID')}`);
        });
      }

      lines.push(`─────────────────────────`);
      lines.push(`Total    : Rp ${sale.totalAmount.toLocaleString('id-ID')}`);
      if (sale.discount > 0) {
        lines.push(`Diskon   : Rp ${sale.discount.toLocaleString('id-ID')}`);
      }
      lines.push(`Grand Total: Rp ${sale.grandTotal.toLocaleString('id-ID')}`);
      lines.push(`Bayar    : Rp ${sale.paidAmount.toLocaleString('id-ID')}`);
      lines.push(`Kembalian: Rp ${sale.changeAmount.toLocaleString('id-ID')}`);
      lines.push(`Metode   : ${PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod}`);
      lines.push(`Status   : ${STATUS_CONFIG[sale.status]?.label || sale.status}`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`Terima kasih atas kepercayaan Anda!`);

      await Share.share({
        message: lines.join('\n'),
        title: `Invoice ${sale.invoiceNumber}`,
      });
    } catch (e) {
      AppToast.error('Error', 'Gagal membagikan invoice.');
    }
  };

  const hasActiveFilters =
    filters.search || filters.status || filters.paymentMethod || filters.dateFrom || filters.dateTo;

  const renderSaleCard = ({ item }: { item: Sale }) => {
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
    return (
      <TouchableOpacity onPress={() => openDetail(item)} activeOpacity={0.7}>
        <GlassCard padding={16} style={styles.saleCard}>
          <View style={styles.saleCardTop}>
            <View style={styles.saleCardLeft}>
              <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
              <Text style={styles.saleDate}>
                {new Date(item.createdAt || item.saleDate).toLocaleDateString('id-ID', {
                  timeZone: 'Asia/Makassar',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.customerName}>
                <Ionicons name="person-outline" size={11} color={Colors.textTertiary} />{' '}
                {item.customer?.name || 'Umum'}
              </Text>
            </View>
            <View style={styles.saleCardRight}>
              <Text style={styles.grandTotal}>
                Rp {item.grandTotal.toLocaleString('id-ID')}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon as any} size={10} color={status.color} />
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
              <Text style={styles.paymentMethod}>
                {PAYMENT_LABEL[item.paymentMethod] || item.paymentMethod}
              </Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search + Filter Bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari invoice / pelanggan..."
            placeholderTextColor={Colors.textTertiary}
            value={filters.search}
            onChangeText={(t) => setFilters((f) => ({ ...f, search: t }))}
          />
          {filters.search ? (
            <TouchableOpacity onPress={() => setFilters((f) => ({ ...f, search: '' }))}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => {
            setPendingFilters(filters);
            setShowFilter(true);
          }}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={hasActiveFilters ? '#fff' : Colors.primaryStart}
          />
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <View style={styles.activeFilters}>
          <Text style={styles.activeFiltersLabel}>Filter aktif:</Text>
          {filters.status ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{STATUS_CONFIG[filters.status]?.label}</Text>
            </View>
          ) : null}
          {filters.paymentMethod ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{PAYMENT_LABEL[filters.paymentMethod]}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={resetFilters}>
            <Text style={styles.clearFilter}>Hapus semua</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Customer Filter */}
      {activeCustomerId && (
        <View style={styles.activeFilters}>
          <Text style={styles.activeFiltersLabel}>Pelanggan Terpilih:</Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Satu Pelanggan</Text>
          </View>
          <TouchableOpacity onPress={() => setActiveCustomerId(undefined)}>
            <Text style={styles.clearFilter}>Lihat Semua Pelanggan</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
          <Text style={styles.loadingText}>Memuat transaksi...</Text>
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={renderSaleCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primaryStart}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          
          // Optimasi FlatList
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}

          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={Colors.primaryStart} style={{ padding: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>Belum ada transaksi</Text>
              <Text style={styles.emptyDesc}>
                {hasActiveFilters
                  ? 'Tidak ada transaksi sesuai filter yang dipilih.'
                  : 'Transaksi yang sudah dilakukan akan tampil di sini.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── FILTER MODAL ── */}
      <Modal visible={showFilter} animationType="slide" transparent>
        <View style={styles.filterOverlay}>
          <GlassCard padding={0} style={styles.filterSheet}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter Transaksi</Text>
              <TouchableOpacity onPress={() => setShowFilter(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.filterContent}>
              {/* Status */}
              <Text style={styles.filterLabel}>Status Transaksi</Text>
              <View style={styles.filterChips}>
                {(['', 'COMPLETED', 'PENDING', 'CANCELLED'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.filterChip,
                      pendingFilters.status === s && styles.filterChipActive,
                    ]}
                    onPress={() => setPendingFilters((f) => ({ ...f, status: s }))}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        pendingFilters.status === s && styles.filterChipTextActive,
                      ]}
                    >
                      {s === '' ? 'Semua' : STATUS_CONFIG[s]?.label || s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Metode Pembayaran */}
              <Text style={styles.filterLabel}>Metode Pembayaran</Text>
              <View style={styles.filterChips}>
                {(['', 'CASH', 'TRANSFER', 'CREDIT', 'QRIS'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.filterChip,
                      pendingFilters.paymentMethod === m && styles.filterChipActive,
                    ]}
                    onPress={() => setPendingFilters((f) => ({ ...f, paymentMethod: m }))}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        pendingFilters.paymentMethod === m && styles.filterChipTextActive,
                      ]}
                    >
                      {m === '' ? 'Semua' : PAYMENT_LABEL[m]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Filter Tanggal dengan DatePickerInput */}
              <Text style={styles.filterLabel}>Rentang Waktu</Text>
              <View style={{flexDirection: 'row', gap: 12}}>
                <DatePickerInput 
                  value={pendingFilters.dateFrom} 
                  onChange={(d) => setPendingFilters((f) => ({ ...f, dateFrom: d }))} 
                  placeholder="Dari Tanggal" 
                  style={{flex: 1}} 
                />
                <DatePickerInput 
                  value={pendingFilters.dateTo} 
                  onChange={(d) => setPendingFilters((f) => ({ ...f, dateTo: d }))} 
                  placeholder="Sampai Tanggal" 
                  style={{flex: 1}} 
                />
              </View>

              {/* Urutan Waktu */}
              <Text style={styles.filterLabel}>Urutan Waktu</Text>
              <View style={styles.filterChips}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    pendingFilters.sortOrder === 'desc' && styles.filterChipActive,
                  ]}
                  onPress={() => setPendingFilters((f) => ({ ...f, sortOrder: 'desc' }))}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      pendingFilters.sortOrder === 'desc' && styles.filterChipTextActive,
                    ]}
                  >
                    Terbaru
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    pendingFilters.sortOrder === 'asc' && styles.filterChipActive,
                  ]}
                  onPress={() => setPendingFilters((f) => ({ ...f, sortOrder: 'asc' }))}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      pendingFilters.sortOrder === 'asc' && styles.filterChipTextActive,
                    ]}
                  >
                    Terlama
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.filterFooter}>
              <GradientButton title="Reset" onPress={resetFilters} variant="outline" fullWidth />
              <View style={{ height: 8 }} />
              <GradientButton title="Terapkan Filter" onPress={applyFilters} variant="primary" fullWidth />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* ── DETAIL / INVOICE MODAL ── */}
      <Modal visible={showDetail} animationType="slide">
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>Detail Transaksi</Text>
            {selectedSale && (
              <TouchableOpacity onPress={() => shareInvoicePdf(selectedSale)}>
                <Ionicons name="share-social-outline" size={24} color={Colors.primaryStart} />
              </TouchableOpacity>
            )}
          </View>

          {loadingDetail ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primaryStart} />
            </View>
          ) : selectedSale ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              {/* Invoice Info */}
              <GlassCard padding={20} style={styles.invoiceCard} tinted>
                <Text style={styles.invoiceNo}>{selectedSale.invoiceNumber}</Text>
                <Text style={styles.invoiceDateBig}>
                  {new Date(selectedSale.createdAt || selectedSale.saleDate).toLocaleDateString('id-ID', {
                    timeZone: 'Asia/Makassar',
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <View style={styles.invoiceStatusRow}>
                  {(() => {
                    const s = STATUS_CONFIG[selectedSale.status] || STATUS_CONFIG.PENDING;
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                        <Ionicons name={s.icon as any} size={12} color={s.color} />
                        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    );
                  })()}
                  <Text style={styles.detailPayMethod}>
                    {PAYMENT_LABEL[selectedSale.paymentMethod] || selectedSale.paymentMethod}
                  </Text>
                </View>
              </GlassCard>

              {/* Customer & Cashier */}
              <GlassCard padding={16} style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pelanggan</Text>
                  <Text style={styles.detailValue}>{selectedSale.customer?.name || 'Umum'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kasir</Text>
                  <Text style={styles.detailValue}>{selectedSale.cashier?.name || '-'}</Text>
                </View>
              </GlassCard>

              {/* Items */}
              <Text style={styles.itemsLabel}>Daftar Produk</Text>
              {selectedSale.saleItems?.map((item, idx) => (
                <GlassCard key={item.id || idx} padding={12} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.product.name}</Text>
                      <Text style={styles.itemCode}>{item.product.code}</Text>
                      <Text style={styles.itemQty}>
                        {item.quantity} × Rp {item.unitPrice.toLocaleString('id-ID')}
                        {item.unit ? ` / ${item.unit.name}` : ''}
                      </Text>
                      {item.discount > 0 && (
                        <Text style={styles.itemDiscount}>
                          Diskon: Rp {item.discount.toLocaleString('id-ID')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.itemSubtotal}>
                      Rp {item.subtotal.toLocaleString('id-ID')}
                    </Text>
                  </View>
                </GlassCard>
              ))}

              {/* Summary */}
              <GlassCard padding={16} style={styles.summaryCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Subtotal</Text>
                  <Text style={styles.detailValue}>
                    Rp {selectedSale.totalAmount.toLocaleString('id-ID')}
                  </Text>
                </View>
                {selectedSale.discount > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Diskon</Text>
                    <Text style={[styles.detailValue, { color: Colors.error }]}>
                      - Rp {selectedSale.discount.toLocaleString('id-ID')}
                    </Text>
                  </View>
                )}
                {selectedSale.tax > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Pajak</Text>
                    <Text style={styles.detailValue}>
                      Rp {selectedSale.tax.toLocaleString('id-ID')}
                    </Text>
                  </View>
                )}
                <View style={[styles.detailRow, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalVal}>
                    Rp {selectedSale.grandTotal.toLocaleString('id-ID')}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bayar</Text>
                  <Text style={styles.detailValue}>
                    Rp {selectedSale.paidAmount.toLocaleString('id-ID')}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kembalian</Text>
                  <Text style={[styles.detailValue, { color: Colors.success }]}>
                    Rp {selectedSale.changeAmount.toLocaleString('id-ID')}
                  </Text>
                </View>
              </GlassCard>

              {selectedSale.notes && (
                <GlassCard padding={12} style={styles.notesCard}>
                  <Text style={styles.notesLabel}>Catatan:</Text>
                  <Text style={styles.notesText}>{selectedSale.notes}</Text>
                </GlassCard>
              )}

              {/* Share & Print Buttons */}
              <View style={{ marginTop: Spacing.xl, marginBottom: Spacing['3xl'], gap: Spacing.md }}>
                <GradientButton
                  title="Cetak Struk / PDF"
                  onPress={() => printInvoice(selectedSale)}
                  variant="success"
                  fullWidth
                  icon={<Ionicons name="print-outline" size={18} color="#fff" />}
                />
                <GradientButton
                  title="Bagikan PDF Invoice"
                  onPress={() => shareInvoicePdf(selectedSale)}
                  variant="primary"
                  fullWidth
                  icon={<Ionicons name="share-social-outline" size={18} color="#fff" />}
                />
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // ── Search ──
  searchBar: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  // ── Active Filters ──
  activeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  activeFiltersLabel: { fontSize: FontSize.xs, color: Colors.textTertiary },
  chip: {
    backgroundColor: Colors.primaryStart + '18',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primaryStart + '30',
  },
  chipText: { fontSize: 11, color: Colors.primaryStart, fontWeight: FontWeight.semibold },
  clearFilter: { fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.semibold },
  // ── List ──
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  saleCard: { marginBottom: 0 },
  saleCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  saleCardLeft: { flex: 1 },
  invoiceNumber: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primaryStart },
  saleDate: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  customerName: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  saleCardRight: { alignItems: 'flex-end', gap: 4 },
  grandTotal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 10, fontWeight: FontWeight.bold },
  paymentMethod: { fontSize: 11, color: Colors.textTertiary },
  // ── Empty ──
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  // ── Filter Sheet ──
  filterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  filterSheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    maxHeight: '80%',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  filterTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  filterContent: { padding: Spacing.lg },
  filterLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  filterChipTextActive: { color: '#fff', fontWeight: FontWeight.bold },
  filterFooter: { padding: Spacing.lg, borderTopWidth: 1, borderColor: Colors.border },
  // ── Detail ──
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  detailHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  detailContent: { padding: Spacing.lg, gap: Spacing.md },
  invoiceCard: { alignItems: 'flex-start', gap: 4 },
  invoiceNo: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.primaryStart },
  invoiceDateBig: { fontSize: FontSize.sm, color: Colors.textSecondary },
  invoiceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 4 },
  detailPayMethod: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  detailSection: { gap: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textTertiary },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  itemsLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  itemCard: {},
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  itemCode: { fontSize: 10, color: Colors.textTertiary, marginTop: 2 },
  itemQty: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  itemDiscount: { fontSize: FontSize.xs, color: Colors.error, marginTop: 2 },
  itemSubtotal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success },
  summaryCard: { gap: 4 },
  grandTotalRow: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  grandTotalVal: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.primaryStart },
  notesCard: {},
  notesLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.bold },
  notesText: { fontSize: FontSize.sm, color: Colors.textPrimary, marginTop: 4 },
});
