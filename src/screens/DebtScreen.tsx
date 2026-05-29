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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { debtService, DebtPaymentPayload } from '../services/debt.service';
import { masterService } from '../services/master.service';
import { useSidebarStore } from '../stores/sidebar.store';
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
  const { openSidebar } = useSidebarStore();

  const [activeTab, setActiveTab] = useState<'customer' | 'supplier'>('customer');
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Repayment Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'DEBIT_CARD' | 'QRIS'>('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Stats summaries
  const [totalDebtSummary, setTotalDebtSummary] = useState(0);
  const [totalPaidSummary, setTotalPaidSummary] = useState(0);
  const [totalRemainingSummary, setTotalRemainingSummary] = useState(0);

  const fetchDebts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      let res;
      if (activeTab === 'customer') {
        res = await debtService.getCustomerDebts({
          search: search || undefined,
          status: statusFilter || undefined,
        });
      } else {
        res = await debtService.getSupplierDebts({
          search: search || undefined,
          status: statusFilter || undefined,
        });
      }

      if (res.success && res.data) {
        setDebts(res.data);
        
        // Calculate totals
        let totalDebt = 0;
        let totalPaid = 0;
        let totalRemaining = 0;
        
        res.data.forEach((d) => {
          totalDebt += Number(d.totalDebt || 0);
          totalPaid += Number(d.paidAmount || 0);
          totalRemaining += Number(d.remainingDebt || 0);
        });

        setTotalDebtSummary(totalDebt);
        setTotalPaidSummary(totalPaid);
        setTotalRemainingSummary(totalRemaining);
      }
    } catch (e) {
      console.warn('[DEBT] Error loading debts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, search, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchDebts();
    }, [fetchDebts])
  );

  useEffect(() => {
    fetchDebts();
  }, [activeTab, statusFilter]);

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

  const renderDebtCard = ({ item }: { item: any }) => {
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.UNPAID;
    const name = activeTab === 'customer' ? item.customer?.name : item.supplier?.name;
    const code = activeTab === 'customer' ? item.customer?.code : item.supplier?.code;
    const docNo = activeTab === 'customer' ? item.sale?.invoiceNumber : item.purchase?.poNumber;
    const phone = activeTab === 'customer' ? item.customer?.phone : item.supplier?.phone;

    return (
      <GlassCard padding={16} style={styles.debtCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.debtNumber}>{item.debtNumber}</Text>
            <Text style={styles.refNumber}>
              {activeTab === 'customer' ? 'No. Invoice' : 'No. PO'}: <Text style={{ fontWeight: 'bold', color: Colors.primaryStart }}>{docNo || '-'}</Text>
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon as any} size={11} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.entityRow}>
          <Ionicons name={activeTab === 'customer' ? 'person-outline' : 'business-outline'} size={16} color={Colors.textSecondary} />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.entityName}>{name || 'Umum'}</Text>
            <Text style={styles.entityCode}>
              {code || '-'} {phone ? `• ${phone}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.dateGrid}>
          <View>
            <Text style={styles.dateLabel}>Tanggal Transaksi</Text>
            <Text style={styles.dateVal}>{formatWitaDate(item.createdAt)}</Text>
          </View>
          <View>
            <Text style={styles.dateLabel}>Jatuh Tempo</Text>
            <Text style={[styles.dateVal, item.status === 'OVERDUE' && { color: Colors.error, fontWeight: 'bold' }]}>
              {formatWitaDate(item.dueDate)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Total Tagihan</Text>
            <Text style={styles.priceVal}>Rp {Number(item.totalDebt || 0).toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Sudah Dibayar</Text>
            <Text style={[styles.priceVal, { color: Colors.success }]}>
              Rp {Number(item.paidAmount || 0).toLocaleString('id-ID')}
            </Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Sisa Tagihan</Text>
            <Text style={[styles.priceVal, { color: Colors.error, fontWeight: 'bold' }]}>
              Rp {Number(item.remainingDebt || 0).toLocaleString('id-ID')}
            </Text>
          </View>
        </View>

        {item.remainingDebt > 0 && (
          <View style={{ marginTop: 12 }}>
            <GradientButton
              title="Bayar Cicilan / Pelunasan"
              onPress={() => handleOpenPayModal(item)}
              variant="success"
              fullWidth
              style={{ height: 38 }}
            />
          </View>
        )}
      </GlassCard>
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
        <View style={styles.searchWrapper}>
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
            <TouchableOpacity onPress={() => { setSearch(''); setTimeout(() => fetchDebts(), 50); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll} contentContainerStyle={styles.statusContent}>
          {[
            { value: '', label: 'Semua' },
            { value: 'UNPAID', label: 'Belum Lunas' },
            { value: 'PARTIAL', label: 'Dicicil' },
            { value: 'PAID', label: 'Lunas' },
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
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          renderItem={renderDebtCard}
          contentContainerStyle={styles.listContent}
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
      )}

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
  container: { flex: 1, backgroundColor: Colors.background },
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
  // List
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  debtCard: {},
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  debtNumber: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.primaryStart,
  },
  refNumber: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 9,
    fontWeight: FontWeight.extrabold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entityName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  entityCode: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  dateGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: Colors.surfaceLight,
    padding: 10,
    borderRadius: BorderRadius.md,
  },
  dateLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  dateVal: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceCol: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  priceVal: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
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
