/**
 * CustomersScreen — halaman Daftar Pelanggan.
 *
 * WS-3 (26 Nov 2026, paket perbaikan APK ke-2) — samakan tampilan
 * dengan TransactionHistoryScreen ("itu bagus dan keren"): baris tabel
 * satu baris per customer (Pelanggan | Tipe | No. HP), teks singkat,
 * zebra striping, dan info lengkap (alamat, poin, 5 transaksi terakhir,
 * tombol Edit & Lihat Riwayat Lengkap) pindah ke modal detail layar
 * penuh seperti detail history. Filter pencarian tetap (server,
 * debounce 300ms); ditambah chip filter tipe (klien saja, seperti chip
 * di Salesman & Poin) supaya bahasa visual ketiga layar sama.
 * LOGIKA TIDAK BERUBAH: endpoint, CRUD, debounce, dan riwayat
 * transaksi di modal sama seperti sebelumnya.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { masterService } from '../services/master.service';
import { salesService } from '../services/sales.service';
import type { Customer, CustomerType, Sale } from '../types';
import { useDebouncedValue } from '../utils/debounce';
import { AppToast } from '../utils/toast';

// Aksen visual WS-3 — merah gelap, sama dengan Salesman & Poin.
const ACCENT = '#7F1D1D';

type TypeFilter = 'ALL' | CustomerType;

export const CustomersScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // QA fix m-24: pencarian di-debounce 300ms supaya tidak memanggil API
  // di setiap ketikan.
  const debouncedSearch = useDebouncedValue(search, 300);
  // WS-3: filter tipe (klien saja — tidak mengubah data/API).
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');

  // Modals state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({ type: 'UMUM' });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await masterService.getCustomers(debouncedSearch || undefined);
      if (res.success && res.data?.customers) {
        setCustomers(res.data.customers);
      }
    } catch (e) {
      console.warn('[CUSTOMERS] Error loading customers:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => loadData(true);

  // Filter tipe di sisi klien (di atas hasil pencarian server).
  const filteredCustomers = useMemo(() => {
    if (typeFilter === 'ALL') return customers;
    return customers.filter((c) => c.type === typeFilter);
  }, [customers, typeFilter]);

  const getCustomerTypeColor = (type: string) => {
    switch (type) {
      case 'REGULER': return Colors.primaryStart;
      case 'GROSIR': return Colors.success;
      case 'PROYEK': return Colors.warning;
      case 'UMUM': return Colors.info;
      default: return Colors.textTertiary;
    }
  };

  const openDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetail(true);
    setLoadingSales(true);
    try {
      const res = await salesService.getSales({ customerId: customer.id, limit: 5 });
      if (res.success && res.data) {
        setRecentSales((res.data as any).sales || res.data);
      } else {
        setRecentSales([]);
      }
    } catch (e) {
      console.warn('[CUSTOMERS] fetch recent sales error', e);
      setRecentSales([]);
    } finally {
      setLoadingSales(false);
    }
  };

  const openAddForm = () => {
    const hasUmum = customers.some(c => c.type === 'UMUM');
    setFormData({ type: hasUmum ? 'REGULER' : 'UMUM', name: '', phone: '', address: '' });
    setShowForm(true);
  };

  const openEditForm = (customer: Customer) => {
    setFormData({ ...customer });
    setShowDetail(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      AppToast.error('Error', 'Nama pelanggan wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name || '',
        phone: formData.phone || '',
        address: formData.address || '',
        type: formData.type || 'UMUM',
      };
      
      let res;
      if (formData.id) {
        res = await masterService.updateCustomer(formData.id, payload);
      } else {
        res = await masterService.createCustomer(payload);
      }
      if (res.success) {
        AppToast.success('Sukses', 'Data pelanggan berhasil disimpan');
        setShowForm(false);
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal menyimpan data');
      }
    } catch (e) {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setSaving(false);
    }
  };

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: 'ALL', label: 'Semua Tipe' },
    { key: 'UMUM', label: 'Umum' },
    { key: 'REGULER', label: 'Reguler' },
    { key: 'GROSIR', label: 'Grosir' },
    { key: 'PROYEK', label: 'Proyek' },
  ];

  // Baris tabel ala History: satu baris, teks singkat, tap = detail.
  // Alamat, poin & riwayat transaksi pindah ke modal detail (WS-3).
  const renderItem = ({ item, index }: { item: Customer; index: number }) => {
    const typeColor = getCustomerTypeColor(item.type);
    const isEven = index % 2 === 0;

    return (
      <TouchableOpacity
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
        style={[styles.tableRow, isEven && styles.tableRowEven]}
      >
        <Text style={[styles.tableCell, styles.colName, styles.nameText]} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.colType, styles.typeCellWrap]}>
          <View style={[styles.typeBadgeSm, { backgroundColor: typeColor + '15' }]}>
            <Text style={[styles.typeTextSm, { color: typeColor }]}>{item.type}</Text>
          </View>
        </View>
        <Text style={[styles.tableCell, styles.colPhone]} numberOfLines={1}>{item.phone || '-'}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Daftar Pelanggan</Text>
      </View>

      {/* Pencarian — pola History (bar pencarian + strip chip) */}
      <View style={styles.searchBar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama atau telepon..."
            placeholderTextColor={Colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => loadData()}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); loadData(); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.chipStrip}>
        <View style={styles.chipRow}>
          {typeChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setTypeFilter(chip.key)}
              style={[styles.chip, typeFilter === chip.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, typeFilter === chip.key && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.resultCount}>
        Menampilkan {filteredCustomers.length} dari {customers.length} pelanggan
      </Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <View style={styles.tableContainer}>
          {/* Kepala tabel — sama seperti History */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colName]}>Pelanggan</Text>
            <Text style={[styles.tableHeaderText, styles.colType, { textAlign: 'center' }]}>Tipe</Text>
            <Text style={[styles.tableHeaderText, styles.colPhone]}>No. HP</Text>
          </View>

          <FlatList
            data={filteredCustomers}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
            removeClippedSubviews={true}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Ionicons name="people-outline" size={48} color={Colors.textTertiary} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>Pelanggan tidak ditemukan</Text>
              </View>
            }
          />
        </View>
      )}

      {/* FAB Add */}
      <TouchableOpacity style={styles.fab} onPress={openAddForm}>
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* ── MODAL DETAIL (WS-3): layar penuh ala detail History.
          Isi sama seperti sebelumnya (data, poin, 5 transaksi
          terakhir, Edit, Lihat Riwayat Lengkap). ── */}
      <Modal visible={showDetail} animationType="slide">
        <SafeAreaView style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>Detail Pelanggan</Text>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {selectedCustomer && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.detailContent, { flexGrow: 1 }]}>
              <GlassCard padding={16} style={styles.detailSection}>
                <Text style={styles.detailName}>{selectedCustomer.name}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kode</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.code}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>No HP</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.phone || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipe</Text>
                  <View style={[styles.typeBadge, { alignSelf: 'flex-start', backgroundColor: getCustomerTypeColor(selectedCustomer.type) + '15', borderColor: getCustomerTypeColor(selectedCustomer.type) }]}>
                    <Text style={[styles.typeText, { color: getCustomerTypeColor(selectedCustomer.type) }]}>{selectedCustomer.type}</Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Alamat</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.address || '-'}</Text>
                </View>
                {/* Poin loyalitas (PKG-D, perbaikan 7 item #6) — dari
                    backend setelah PKG-A di-deploy; customer UMUM tidak
                    pernah dapat poin. */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Poin</Text>
                  <Text style={styles.detailValue}>
                    {selectedCustomer.points ?? 0} poin
                    {selectedCustomer.type === 'UMUM' ? ' (Umum tidak dapat poin)' : ''}
                  </Text>
                </View>
              </GlassCard>

              <TouchableOpacity style={styles.editBtn} onPress={() => openEditForm(selectedCustomer)}>
                <Ionicons name="create-outline" size={16} color={ACCENT} />
                <Text style={styles.editBtnText}>Edit Data Pelanggan</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>5 Transaksi Terakhir</Text>
              {loadingSales ? (
                <ActivityIndicator size="small" color={ACCENT} style={{ margin: 20 }} />
              ) : recentSales.length > 0 ? (
                recentSales.map(sale => (
                  <View key={sale.id} style={styles.recentSaleItem}>
                    <View>
                      <Text style={styles.saleInvoice}>{sale.invoiceNumber}</Text>
                      <Text style={styles.saleDate}>{new Date(sale.createdAt || sale.saleDate).toLocaleDateString('id-ID')}</Text>
                    </View>
                    <Text style={styles.saleTotal}>Rp {sale.grandTotal.toLocaleString('id-ID')}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyTextCenter}>Belum ada riwayat transaksi</Text>
              )}

              <GradientButton
                title="Lihat Riwayat Lengkap"
                onPress={() => {
                  setShowDetail(false);
                  navigation.navigate('History', { customerId: selectedCustomer.id });
                }}
                style={{ marginTop: 24, marginBottom: 40 }}
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Form Modal */}
      <Modal visible={showForm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{formData.id ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
              <Text style={styles.inputLabel}>Nama Pelanggan <Text style={{color: Colors.error}}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.name || ''}
                onChangeText={(t) => setFormData(p => ({ ...p, name: t }))}
                placeholder="Masukkan nama"
                placeholderTextColor={Colors.textTertiary}
              />

              <Text style={styles.inputLabel}>Tipe Pelanggan</Text>
              <View style={styles.typeSelectorRow}>
                {['UMUM', 'REGULER', 'GROSIR', 'PROYEK']
                  .filter(t => t !== 'UMUM' || formData.type === 'UMUM' || !customers.some(c => c.type === 'UMUM'))
                  .map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, formData.type === t && styles.typeBtnActive]}
                    onPress={() => setFormData(p => ({ ...p, type: t as any }))}
                  >
                    <Text style={[styles.typeBtnText, formData.type === t && styles.typeBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>No WhatsApp / HP</Text>
              <TextInput
                style={styles.input}
                value={formData.phone || ''}
                onChangeText={(t) => setFormData(p => ({ ...p, phone: t }))}
                placeholder="Contoh: 0812345678"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Alamat</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={formData.address || ''}
                onChangeText={(t) => setFormData(p => ({ ...p, address: t }))}
                placeholder="Alamat lengkap"
                placeholderTextColor={Colors.textTertiary}
                multiline
              />

              <GradientButton
                title={saving ? "Menyimpan..." : "Simpan Data"}
                onPress={handleSave}
                disabled={saving}
                style={{ marginTop: 24, marginBottom: 40 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { marginRight: 16 },
  headerTitleText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 48 },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  emptyTextCenter: { color: Colors.textTertiary, fontSize: FontSize.sm, textAlign: 'center', marginVertical: 16 },
  // Pencarian + chip filter — pola History.
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
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm },
  chipStrip: {
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  chipTextActive: { color: '#FFFFFF' },
  resultCount: { fontSize: FontSize.xs, color: Colors.textTertiary, paddingHorizontal: 12, paddingVertical: 8 },
  // Tabel — disalin dari TransactionHistoryScreen (zebra, sel 12px).
  tableContainer: { flex: 1 },
  listContent: { paddingBottom: Spacing.xl },
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
  tableRowEven: { backgroundColor: Colors.surface },
  tableCell: { fontSize: 12, color: Colors.textPrimary },
  colName: { flex: 2.4 },
  colType: { flex: 1.1 },
  colPhone: { flex: 1.6 },
  nameText: { fontWeight: FontWeight.bold },
  typeCellWrap: { alignItems: 'center', justifyContent: 'center' },
  typeBadgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTextSm: { fontSize: 9, fontWeight: 'bold' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: 'bold' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Modal detail layar penuh — pola TransactionHistoryScreen.
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
  detailHeaderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  detailContent: { padding: Spacing.lg, gap: Spacing.md },
  detailSection: { gap: 8 },
  detailName: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.textPrimary },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textTertiary },
  detailValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT + '15',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginTop: 8,
    marginBottom: 24,
  },
  editBtnText: { color: ACCENT, fontWeight: 'bold', fontSize: FontSize.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: 'bold', color: Colors.textSecondary, marginBottom: 12 },
  recentSaleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  saleInvoice: { fontSize: FontSize.sm, fontWeight: 'bold', color: Colors.textPrimary },
  saleDate: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  saleTotal: { fontSize: FontSize.sm, fontWeight: 'bold', color: ACCENT },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    minHeight: '50%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.textPrimary },
  inputLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 6, marginTop: 12, fontWeight: '500' },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    height: 44,
    color: Colors.textPrimary,
  },
  typeSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  typeBtnActive: {
    backgroundColor: ACCENT + '15',
    borderColor: ACCENT,
  },
  typeBtnText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  typeBtnTextActive: { color: ACCENT, fontWeight: 'bold' },
});
