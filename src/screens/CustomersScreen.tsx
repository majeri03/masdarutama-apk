import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { masterService } from '../services/master.service';
import { salesService } from '../services/sales.service';
import type { Customer, Sale } from '../types';
import { AppToast } from '../utils/toast';

export const CustomersScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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
      const res = await masterService.getCustomers(search || undefined);
      if (res.success && res.data?.customers) {
        setCustomers(res.data.customers);
      }
    } catch (e) {
      console.warn('[CUSTOMERS] Error loading customers:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => loadData(true);

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
    setFormData({ type: 'UMUM', name: '', phone: '', address: '' });
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
      let res;
      if (formData.id) {
        res = await masterService.updateCustomer(formData.id, formData);
      } else {
        res = await masterService.createCustomer(formData);
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

  const renderItem = ({ item }: { item: Customer }) => {
    const typeColor = getCustomerTypeColor(item.type);
    
    return (
      <TouchableOpacity onPress={() => openDetail(item)} activeOpacity={0.7}>
        <GlassCard padding={16} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>
                <Ionicons name="call-outline" size={12} color={Colors.textTertiary} /> {item.phone || 'Belum ada No HP'}
              </Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '15', borderColor: typeColor }]}>
              <Text style={[styles.typeText, { color: typeColor }]}>{item.type}</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.cardBottom}>
            <Text style={styles.address} numberOfLines={1}>
              <Ionicons name="location-outline" size={12} color={Colors.textTertiary} /> {item.address || 'Alamat tidak diatur'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primaryStart} />
          </View>
        </GlassCard>
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

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.textTertiary} />
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
            <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Ionicons name="people-outline" size={48} color={Colors.textTertiary} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>Pelanggan tidak ditemukan</Text>
            </View>
          }
        />
      )}

      {/* FAB Add */}
      <TouchableOpacity style={styles.fab} onPress={openAddForm}>
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal visible={showDetail} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detail Pelanggan</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedCustomer && (
              <ScrollView style={{ padding: 16 }}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nama</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.name}</Text>
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

                <TouchableOpacity style={styles.editBtn} onPress={() => openEditForm(selectedCustomer)}>
                  <Ionicons name="create-outline" size={16} color={Colors.primaryStart} />
                  <Text style={styles.editBtnText}>Edit Data Pelanggan</Text>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>5 Transaksi Terakhir</Text>
                {loadingSales ? (
                  <ActivityIndicator size="small" color={Colors.primaryStart} style={{ margin: 20 }} />
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
          </View>
        </View>
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

            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.inputLabel}>Nama Pelanggan <Text style={{color: Colors.error}}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.name || ''}
                onChangeText={(t) => setFormData(p => ({ ...p, name: t }))}
                placeholder="Masukkan nama"
              />

              <Text style={styles.inputLabel}>Tipe Pelanggan</Text>
              <View style={styles.typeSelectorRow}>
                {['UMUM', 'REGULER', 'GROSIR', 'PROYEK'].map(t => (
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
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Alamat</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={formData.address || ''}
                onChangeText={(t) => setFormData(p => ({ ...p, address: t }))}
                placeholder="Alamat lengkap"
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
  container: { flex: 1, backgroundColor: Colors.background },
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, marginLeft: 8, color: Colors.textPrimary },
  listContainer: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { marginBottom: 0 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: FontSize.md, fontWeight: 'bold', color: Colors.textPrimary },
  phone: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  address: { fontSize: FontSize.xs, color: Colors.textTertiary, flex: 1, marginRight: 8 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 48 },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  emptyTextCenter: { color: Colors.textTertiary, fontSize: FontSize.sm, textAlign: 'center', marginVertical: 16 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.primaryStart,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  detailRow: { marginBottom: 16 },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 4 },
  detailValue: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '500' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primaryStart + '15',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginTop: 8,
    marginBottom: 24,
  },
  editBtnText: { color: Colors.primaryStart, fontWeight: 'bold', fontSize: FontSize.sm },
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
  saleTotal: { fontSize: FontSize.sm, fontWeight: 'bold', color: Colors.primaryStart },
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
    backgroundColor: Colors.primaryStart + '15',
    borderColor: Colors.primaryStart,
  },
  typeBtnText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  typeBtnTextActive: { color: Colors.primaryStart, fontWeight: 'bold' },
});
