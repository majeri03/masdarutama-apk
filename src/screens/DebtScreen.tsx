import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { DatePickerInput } from '../components/ui/DatePickerInput';
import { debtService, DebtPaymentPayload } from '../services/debt.service';
import { masterService } from '../services/master.service';
import { useSidebarStore } from '../stores/sidebar.store';
import { useAuthStore } from '../stores/auth.store';
import { useDebouncedValue } from '../utils/debounce';
import { AppToast } from '../utils/toast';

// Helper WITA Timezone formatting
const formatWitaDate = (dateString: string | null) => {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  UNPAID: { color: Colors.error, bg: Colors.errorLight, label: 'Belum Lunas', icon: 'close-circle-outline' },
  PARTIAL: { color: Colors.warning, bg: Colors.warningLight, label: 'Dicicil', icon: 'hourglass-outline' },
  PAID: { color: Colors.success, bg: Colors.successLight, label: 'Lunas', icon: 'checkmark-circle-outline' },
  OVERDUE: { color: '#7F1D1D', bg: '#FEE2E2', label: 'Terlambat', icon: 'alert-circle-outline' },
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  DEBIT_CARD: 'Kartu Debit',
  QRIS: 'QRIS',
};

export const DebtScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { openSidebar } = useSidebarStore();
  const { isAdmin } = useAuthStore();

  // Deep link (tbmasdarutama://utang?jenis=supplier|customer) bisa membawa
  // tab awal lewat route.params.tab.
  const tabParam = (t: unknown): 'customer' | 'supplier' | undefined =>
    t === 'customer' || t === 'supplier' ? t : undefined;
  const [activeTab, setActiveTab] = useState<'customer' | 'supplier'>(() => tabParam(route.params?.tab) ?? 'customer');

  // Kalau layar sudah terbuka lalu deep link lain masuk, params berubah —
  // pindah tab mengikuti param terbaru.
  useEffect(() => {
    const t = tabParam(route.params?.tab);
    if (t) setActiveTab(t);
  }, [route.params?.tab]);
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // QA fix m-24: pencarian di-debounce 300ms supaya tidak memanggil API
  // di setiap ketikan.
  const debouncedSearch = useDebouncedValue(search, 300);

  // Auto-filter berdasarkan ref nama / customer dari notifikasi
  useEffect(() => {
    const searchParam = route.params?.search || route.params?.customerName;
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [route.params?.search, route.params?.customerName]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Repayment Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'DEBIT_CARD' | 'QRIS'>('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Detail Modal (pola tabel TransactionHistoryScreen, Nov 2026): baris
  // tabel hanya menampilkan info paling penting; semua info lengkap ada
  // di modal detail per baris. State ini terpisah dari selectedDebt yang
  // dipakai modal bayar, supaya modal bayar tidak terganggu.
  const [detailDebt, setDetailDebt] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Stats summaries
  const [totalDebtSummary, setTotalDebtSummary] = useState(0);
  const [totalPaidSummary, setTotalPaidSummary] = useState(0);
  const [totalRemainingSummary, setTotalRemainingSummary] = useState(0);

  // ── Paging daftar hutang (Nov 2026) ───────────────────────────────────
  // Sama seperti daftar DO: backend saat ini MENGABAIKAN page/limit, jadi
  // hybrid — kirim page+limit; kalau halaman 1 mengembalikan LEBIH dari
  // limit, berarti backend mengabaikan paging: simpan semua di ref dan iris
  // client-side lewat onEndReached.
  const DEBT_PAGE_SIZE = 30;
  const [debtHasMore, setDebtHasMore] = useState(false);
  const [debtLoadingMore, setDebtLoadingMore] = useState(false);
  const debtPageRef = useRef(1);
  const debtServerPagedRef = useRef<boolean | null>(null);
  const debtAllRef = useRef<any[]>([]);

  /** Filter tanggal (client-side, seperti sebelumnya) + hitung total ringkasan. */
  const applyDebtFilterAndTotals = (list: any[]) => {
    let finalData = list;
    if (startDate || endDate) {
      finalData = finalData.filter((d: any) => {
        const txDate = new Date(d.createdAt);
        if (startDate && txDate < startDate) return false;
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (txDate > end) return false;
        }
        return true;
      });
    }
    let totalDebt = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    finalData.forEach((d: any) => {
      totalDebt += Number(d.totalDebt || 0);
      totalPaid += Number(d.paidAmount || 0);
      totalRemaining += Number(d.remainingDebt || 0);
    });
    setTotalDebtSummary(totalDebt);
    setTotalPaidSummary(totalPaid);
    setTotalRemainingSummary(totalRemaining);
    return finalData;
  };

  /** Terapkan hasil fetch halaman 1 ke state paging. */
  const applyDebtFirstPage = (items: any[]) => {
    debtPageRef.current = 1;
    if (items.length > DEBT_PAGE_SIZE) {
      // Backend mengabaikan page/limit — mode client-side.
      debtServerPagedRef.current = false;
      debtAllRef.current = items;
      const filtered = applyDebtFilterAndTotals(items);
      setDebts(filtered.slice(0, DEBT_PAGE_SIZE));
      setDebtHasMore(filtered.length > DEBT_PAGE_SIZE);
    } else {
      debtServerPagedRef.current = true;
      debtAllRef.current = [];
      const filtered = applyDebtFilterAndTotals(items);
      setDebts(filtered);
      setDebtHasMore(filtered.length === DEBT_PAGE_SIZE);
    }
  };

  /** Muat halaman berikut (dipanggil FlatList onEndReached). */
  const loadMoreDebts = async () => {
    if (loading || debtLoadingMore || !debtHasMore) return;
    if (debtServerPagedRef.current === false) {
      // Mode client-side: iris dari data yang sudah di-fetch semua.
      const nextPage = debtPageRef.current + 1;
      const filtered = applyDebtFilterAndTotals(debtAllRef.current);
      setDebts(filtered.slice(0, nextPage * DEBT_PAGE_SIZE));
      debtPageRef.current = nextPage;
      setDebtHasMore(filtered.length > nextPage * DEBT_PAGE_SIZE);
      return;
    }
    setDebtLoadingMore(true);
    try {
      const fetcher = activeTab === 'customer'
        ? debtService.getCustomerDebts
        : debtService.getSupplierDebts;
      const res = await fetcher({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        page: debtPageRef.current + 1,
        limit: DEBT_PAGE_SIZE,
      });
      if (res.success && res.data) {
        const items = res.data as any[];
        const accumulated = [...debts, ...items];
        setDebts(applyDebtFilterAndTotals(accumulated));
        debtPageRef.current += 1;
        setDebtHasMore(items.length === DEBT_PAGE_SIZE);
      }
    } catch (e) {
      console.warn('[DEBT] Error loading more debts:', e);
    } finally {
      setDebtLoadingMore(false);
    }
  };

  const fetchDebts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      let res;
      if (activeTab === 'customer') {
        res = await debtService.getCustomerDebts({
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          page: 1,
          limit: DEBT_PAGE_SIZE,
        });
      } else {
        res = await debtService.getSupplierDebts({
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          page: 1,
          limit: DEBT_PAGE_SIZE,
        });
      }

      if (res.success && res.data) {
        // Paging hybrid (Nov 2026): applyDebtFirstPage mendeteksi apakah
        // backend mem-page server-side atau mengabaikan page/limit.
        applyDebtFirstPage(res.data as any[]);
      }
    } catch (e) {
      console.warn('[DEBT] Error loading debts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, debouncedSearch, statusFilter, startDate, endDate]);

  // QA fix m-23: sebelumnya ada useEffect kedua yang juga memanggil
  // fetchDebts() dengan dependensi hampir sama, sehingga layar ini
  // memanggil API 2x setiap kali dibuka / filter berubah. useFocusEffect
  // di bawah ini sudah mencakup mount + kembali fokus, jadi cukup satu.
  useFocusEffect(
    useCallback(() => {
      fetchDebts();
    }, [fetchDebts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDebts(true);
  };

  const handleOpenPayModal = (debt: any) => {
    setSelectedDebt(debt);
    setPayAmount(String(debt.remainingDebt));
    setPayMethod('CASH');
    setPayNotes('');
    setShowPayModal(true);
  };

  const handlePaySubmit = async () => {
    const amountNum = Number(payAmount || 0);
    if (!payAmount || amountNum <= 0) {
      AppToast.info('Perhatian', 'Masukkan jumlah pembayaran yang valid.');
      return;
    }

    if (amountNum > Number(selectedDebt.remainingDebt)) {
      Alert.alert(
        'Perhatian',
        `Pembayaran melebihi sisa tagihan (Maksimal Rp ${selectedDebt.remainingDebt.toLocaleString('id-ID')}).`
      );
      return;
    }

    setSubmittingPayment(true);
    try {
      const payload: DebtPaymentPayload = {
        type: activeTab,
        debtId: selectedDebt.id,
        amount: amountNum,
        paymentMethod: payMethod,
        paymentDate: new Date().toISOString(), // Standard UTC, backend will format WITA or use directly
        notes: payNotes || `Cicilan via Mobile App: ${PAYMENT_LABEL[payMethod]}`,
      };

      const res = await debtService.payDebt(payload);
      if (res.success) {
        Alert.alert('Sukses', `Pembayaran sebesar Rp ${amountNum.toLocaleString('id-ID')} berhasil dicatat!`);
        setShowPayModal(false);
        fetchDebts();
      } else {
        AppToast.error('Gagal', res.error || 'Terjadi kesalahan saat mencatat cicilan.');
      }
    } catch (e) {
      AppToast.error('Error', 'Gagal memproses pembayaran utang.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const openDetail = (debt: any) => {
    setDetailDebt(debt);
    setShowDetail(true);
  };

  // Dari modal detail: tutup detail dulu, lalu buka modal bayar yang sama
  // seperti sebelumnya (tidak ada perubahan logika pembayaran).
  const handlePayFromDetail = (debt: any) => {
    setShowDetail(false);
    handleOpenPayModal(debt);
  };

  // Pola tabel TransactionHistoryScreen: satu baris = info paling penting
  // saja (tanggal, no. tagihan, nama, sisa, status), zebra striping,
  // ketuk baris untuk membuka modal detail lengkap.
  const renderDebtRow = ({ item, index }: { item: any; index: number }) => {
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.UNPAID;
    const name = activeTab === 'customer' ? item.customer?.name : item.supplier?.name;
    const isEven = index % 2 === 0;

    return (
      <TouchableOpacity
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
        style={[styles.tableRow, isEven && styles.tableRowEven]}
      >
        <Text style={[styles.tableCell, { flex: 1.2 }]} numberOfLines={1}>
          {new Date(item.createdAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })}
        </Text>
        <Text style={[styles.tableCell, { flex: 2.2, fontWeight: 'bold' }]} numberOfLines={1}>
          {item.debtNumber}
        </Text>
        <Text style={[styles.tableCell, { flex: 2.6 }]} numberOfLines={1}>
          {name || 'Umum'}
        </Text>
        <Text
          style={[styles.tableCell, { flex: 2.5, textAlign: 'right', fontWeight: 'bold', color: Colors.error }]}
          numberOfLines={1}
        >
          {Number(item.remainingDebt || 0).toLocaleString('id-ID')}
        </Text>
        <View style={{ flex: 1.5, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[styles.statusBadgeSm, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusTextSm, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={openSidebar} style={styles.menuButton}>
          <Ionicons name="menu-outline" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>UTANG & PIUTANG</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'customer' && styles.tabActive]}
          onPress={() => {
            setActiveTab('customer');
            setStatusFilter('');
          }}
        >
          <Ionicons
            name="people-outline"
            size={18}
            color={activeTab === 'customer' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[styles.tabLabel, activeTab === 'customer' && styles.tabLabelActive]}>
            Piutang Pelanggan
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'supplier' && styles.tabActive]}
          onPress={() => {
            setActiveTab('supplier');
            setStatusFilter('');
          }}
        >
          <Ionicons
            name="business-outline"
            size={18}
            color={activeTab === 'supplier' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[styles.tabLabel, activeTab === 'supplier' && styles.tabLabelActive]}>
            Utang Supplier
          </Text>
        </TouchableOpacity>
      </View>

      {/* Top Stats Cards */}
      <View style={styles.summaryContainer}>
        <GlassCard padding={12} style={styles.summaryCard} tinted>
          <Text style={styles.summaryTitle}>Total Tagihan</Text>
          <Text style={styles.summaryAmount}>Rp {totalDebtSummary.toLocaleString('id-ID')}</Text>
        </GlassCard>
        <GlassCard padding={12} style={StyleSheet.flatten([styles.summaryCard, { flex: 1.1 }])}>
          <Text style={[styles.summaryTitle, { color: Colors.error }]}>Sisa {activeTab === 'customer' ? 'Piutang' : 'Utang'}</Text>
          <Text style={[styles.summaryAmount, { color: Colors.error }]}>
            Rp {totalRemainingSummary.toLocaleString('id-ID')}
          </Text>
        </GlassCard>
      </View>

      {/* Search and Filters */}
      <View style={styles.filterBar}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm }}>
          <View style={[styles.searchWrapper, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}>
            <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Cari nama / nomor...`}
              placeholderTextColor={Colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => fetchDebts()}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <DatePickerInput 
              value={startDate} 
              onChange={setStartDate} 
              placeholder="Dari Tgl" 
              compact={true} 
            />
          </View>
          <View style={{ flex: 1 }}>
            <DatePickerInput 
              value={endDate} 
              onChange={setEndDate} 
              placeholder="Sp Tgl" 
              compact={true} 
            />
          </View>
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll} contentContainerStyle={styles.statusContent}>
          {[
            { value: '', label: 'Semua' },
            { value: 'UNPAID', label: 'Belum Lunas' },
            { value: 'PARTIAL', label: 'Dicicil' },
            { value: 'PAID', label: 'Lunas' },
            // QA fix m-22: chip filter OVERDUE (Jatuh Tempo) — status ini
            // ada di backend (DebtStatus.OVERDUE) tapi tidak bisa dipilih.
            { value: 'OVERDUE', label: 'Jatuh Tempo' },
          ].map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.filterChip, statusFilter === item.value && styles.filterChipActive]}
              onPress={() => setStatusFilter(item.value)}
            >
              <Text style={[styles.filterChipText, statusFilter === item.value && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
          <Text style={styles.loadingText}>Memuat data utang piutang...</Text>
        </View>
      ) : (
        <View style={styles.tableContainer}>
          {/* Header Tabel — pola TransactionHistoryScreen */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Tgl</Text>
            <Text style={[styles.tableHeaderText, { flex: 2.2 }]}>No. Tagihan</Text>
            <Text style={[styles.tableHeaderText, { flex: 2.6 }]}>
              {activeTab === 'customer' ? 'Pelanggan' : 'Supplier'}
            </Text>
            <Text style={[styles.tableHeaderText, { flex: 2.5, textAlign: 'right' }]}>Sisa (Rp)</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'center' }]}>Status</Text>
          </View>

          <FlatList
            data={debts}
            keyExtractor={(item) => item.id}
            renderItem={renderDebtRow}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMoreDebts}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              debtLoadingMore ? (
                <View style={{ paddingVertical: Spacing.md, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.primaryStart} />
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.primaryStart}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="journal-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>Tidak ada tagihan</Text>
                <Text style={styles.emptyDesc}>
                  Semua transaksi kredit lunas atau tidak ditemukan data yang sesuai.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── DETAIL TAGIHAN MODAL (pola TransactionHistoryScreen) ── */}
      {/* Semua info yang dulu tampil di kartu kini tampil lengkap di sini,
          supaya baris tabel tetap lega. Tidak ada info yang dihapus. */}
      <Modal visible={showDetail} animationType="slide">
        <SafeAreaView style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>Detail Tagihan</Text>
            <View style={{ width: 24 }} />
          </View>

          {detailDebt ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              {/* Nomor tagihan + tanggal + status + no. dokumen */}
              <GlassCard padding={20} style={styles.detailDebtCard} tinted>
                <Text style={styles.detailDebtNo}>{detailDebt.debtNumber}</Text>
                <Text style={styles.detailDateBig}>{formatWitaDate(detailDebt.createdAt)}</Text>
                <View style={styles.detailStatusRow}>
                  {(() => {
                    const s = STATUS_CONFIG[detailDebt.status] || STATUS_CONFIG.UNPAID;
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                        <Ionicons name={s.icon as any} size={12} color={s.color} />
                        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    );
                  })()}
                  <Text style={styles.detailDocRef}>
                    {activeTab === 'customer' ? 'No. Invoice' : 'No. PO'}: {activeTab === 'customer'
                      ? detailDebt.sale?.invoiceNumber || '-'
                      : detailDebt.purchase?.poNumber || '-'}
                  </Text>
                </View>
              </GlassCard>

              {/* Pelanggan / Supplier */}
              <GlassCard padding={16} style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {activeTab === 'customer' ? 'Pelanggan' : 'Supplier'}
                  </Text>
                  <Text style={styles.detailValue}>
                    {activeTab === 'customer'
                      ? detailDebt.customer?.name || 'Umum'
                      : detailDebt.supplier?.name || 'Umum'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kode</Text>
                  <Text style={styles.detailValue}>
                    {activeTab === 'customer'
                      ? detailDebt.customer?.code || '-'
                      : detailDebt.supplier?.code || '-'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Telepon</Text>
                  <Text style={styles.detailValue}>
                    {activeTab === 'customer'
                      ? detailDebt.customer?.phone || '-'
                      : detailDebt.supplier?.phone || '-'}
                  </Text>
                </View>
              </GlassCard>

              {/* Tanggal */}
              <GlassCard padding={16} style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tanggal Transaksi</Text>
                  <Text style={styles.detailValue}>{formatWitaDate(detailDebt.createdAt)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Jatuh Tempo</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      detailDebt.status === 'OVERDUE' && { color: Colors.error, fontWeight: 'bold' },
                    ]}
                  >
                    {formatWitaDate(detailDebt.dueDate)}
                  </Text>
                </View>
              </GlassCard>

              {/* Ringkasan angka — sama persis seperti di kartu lama */}
              <GlassCard padding={16} style={styles.detailSummaryCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Total Tagihan</Text>
                  <Text style={styles.detailValue}>
                    Rp {Number(detailDebt.totalDebt || 0).toLocaleString('id-ID')}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Sudah Dibayar</Text>
                  <Text style={[styles.detailValue, { color: Colors.success }]}>
                    Rp {Number(detailDebt.paidAmount || 0).toLocaleString('id-ID')}
                  </Text>
                </View>
                <View style={[styles.detailRow, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>Sisa Tagihan</Text>
                  <Text style={[styles.grandTotalVal, { color: Colors.error }]}>
                    Rp {Number(detailDebt.remainingDebt || 0).toLocaleString('id-ID')}
                  </Text>
                </View>
              </GlassCard>

              {/* Riwayat pembayaran / cicilan */}
              <Text style={styles.itemsLabel}>Riwayat Pembayaran</Text>
              {(detailDebt.payments || []).length > 0 ? (
                (detailDebt.payments || []).map((p: any) => (
                  <GlassCard key={p.id || `${p.paymentDate}-${p.amount}`} padding={12} style={styles.paymentCard}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailValue}>{formatWitaDate(p.paymentDate)}</Text>
                      <Text style={styles.detailValue}>
                        Rp {Number(p.amount || 0).toLocaleString('id-ID')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>
                        {PAYMENT_LABEL[p.paymentMethod] || p.paymentMethod}
                        {p.admin?.name ? ` • ${p.admin.name}` : ''}
                      </Text>
                    </View>
                    {p.notes ? (
                      <Text style={styles.paymentNotes}>{p.notes}</Text>
                    ) : null}
                  </GlassCard>
                ))
              ) : (
                <GlassCard padding={12} style={styles.paymentCard}>
                  <Text style={styles.detailLabel}>Belum ada pembayaran.</Text>
                </GlassCard>
              )}

              {/* Catatan tagihan (utang supplier) */}
              {detailDebt.notes ? (
                <GlassCard padding={12} style={styles.notesCard}>
                  <Text style={styles.notesLabel}>Catatan:</Text>
                  <Text style={styles.notesText}>{detailDebt.notes}</Text>
                </GlassCard>
              ) : null}

              {/* QA fix M-39: tombol Bayar Cicilan hanya untuk ADMIN/SUPER_ADMIN.
                  Backend selalu menolak (403) kalau kasir yang membayar, jadi
                  tombolnya disembunyikan dari kasir supaya tidak menyesatkan.
                  Pindah dari kartu ke modal detail; syarat & aksi sama. */}
              {isAdmin() && detailDebt.remainingDebt > 0 && (
                <View style={{ marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
                  <GradientButton
                    title="Bayar Cicilan / Pelunasan"
                    onPress={() => handlePayFromDetail(detailDebt)}
                    variant="success"
                    fullWidth
                  />
                </View>
              )}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Repayment Payment Modal */}
      <Modal visible={showPayModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <GlassCard padding={24} style={styles.paySheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catat Pembayaran</Text>
              <TouchableOpacity onPress={() => setShowPayModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedDebt && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalSummary}>
                  <Text style={styles.modalSumLabel}>Sisa Tagihan Saat Ini</Text>
                  <Text style={styles.modalSumVal}>
                    Rp {selectedDebt.remainingDebt.toLocaleString('id-ID')}
                  </Text>
                </View>

                {/* Amount input */}
                <Text style={styles.inputLabel}>Jumlah Bayar / Cicilan (Rp)</Text>
                <TextInput
                  style={styles.payInput}
                  keyboardType="numeric"
                  placeholder="Masukkan nominal bayar"
                  placeholderTextColor={Colors.textTertiary}
                  value={payAmount}
                  onChangeText={setPayAmount}
                />

                {/* Method selector */}
                <Text style={styles.inputLabel}>Metode Pembayaran</Text>
                <View style={styles.methodGrid}>
                  {(['CASH', 'TRANSFER', 'DEBIT_CARD', 'QRIS'] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.methodBtn, payMethod === m && styles.methodBtnActive]}
                      onPress={() => setPayMethod(m)}
                    >
                      <Text style={[styles.methodBtnText, payMethod === m && styles.methodBtnTextActive]}>
                        {PAYMENT_LABEL[m]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text style={styles.inputLabel}>Catatan Pembayaran (Opsional)</Text>
                <TextInput
                  style={[styles.payInput, { height: 60, textAlignVertical: 'top', paddingVertical: 8 }]}
                  multiline
                  numberOfLines={3}
                  placeholder="Contoh: Cicilan ke-2 transfer lunas"
                  placeholderTextColor={Colors.textTertiary}
                  value={payNotes}
                  onChangeText={setPayNotes}
                />

                {/* Confirm Pay Button */}
                <View style={{ marginTop: 20 }}>
                  {submittingPayment ? (
                    <ActivityIndicator size="small" color={Colors.primaryStart} />
                  ) : (
                    <GradientButton
                      title="Proses Bayar & Update Laporan"
                      onPress={handlePaySubmit}
                      variant="success"
                      fullWidth
                    />
                  )}
                </View>
              </ScrollView>
            )}
          </GlassCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: { flex: 1, backgroundColor: 'transparent' },
  // Header
  header: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderColor: Colors.primaryStart,
    backgroundColor: Colors.primaryStart + '10',
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.primaryStart,
    fontWeight: FontWeight.extrabold,
  },
  // Summaries
  summaryContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 70,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
  },
  // Search & filters
  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 40,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  statusScroll: {
    paddingBottom: Spacing.sm,
  },
  statusContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  // Tabel — pola TransactionHistoryScreen: header kolom + baris zebra,
  // teks singkat satu baris, detail lengkap di modal per baris.
  tableContainer: { flex: 1 },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderColor: Colors.border + '80',
  },
  tableRowEven: {
    backgroundColor: Colors.surface,
  },
  tableCell: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  statusBadgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextSm: { fontSize: 9, fontWeight: 'bold' },
  // Modal detail — pola TransactionHistoryScreen
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
  detailDebtCard: { alignItems: 'flex-start', gap: 4 },
  detailDebtNo: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.primaryStart },
  detailDateBig: { fontSize: FontSize.sm, color: Colors.textSecondary },
  detailStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 4 },
  detailDocRef: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  detailSection: { gap: 8 },
  detailSummaryCard: { gap: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textTertiary },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  grandTotalRow: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  grandTotalVal: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.primaryStart },
  itemsLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  paymentCard: {},
  paymentNotes: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  notesCard: {},
  notesLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.bold },
  notesText: { fontSize: FontSize.sm, color: Colors.textPrimary, marginTop: 4 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  // Empty
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    gap: 12,
    marginTop: 20,
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
  // Modal pay sheet
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  paySheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
  },
  modalScroll: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  modalSummary: {
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    padding: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error + '15',
  },
  modalSumLabel: {
    fontSize: FontSize.xs,
    color: Colors.error,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
  },
  modalSumVal: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.error,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  payInput: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 46,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  methodBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBtnActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  methodBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  methodBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.extrabold,
  },
});
