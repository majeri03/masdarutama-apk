/**
 * WaOrdersScreen — Daftar Orderan
 * 
 * Perubahan v2:
 * - Tabel responsif (tidak bisa digeser kanan-kiri), semua kolom kelihatan
 * - Tambah tombol "Buat Surat Jalan" langsung di setiap baris
 * - Filter & search tetap ada
 * - Tidak butuh bot WA lagi — cocok untuk orderan manual
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, LayoutAnimation, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants/theme';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { useNavigation } from '@react-navigation/native';
import { AppToast } from '../utils/toast';
import { useNotificationStore } from '../stores/notification.store';
import { DatePickerInput } from '../components/ui/DatePickerInput';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface WaOrder {
  id: string;
  senderName: string;
  senderPhone: string;
  customerName: string | null;
  rawMessage: string;
  status: string;
  notes: string | null;
  receivedAt: string;
  confirmedAt: string | null;
  confirmedBy?: { id: string; name: string } | null;
  parsedItems: any;
}

export const WaOrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<WaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const navigation = useNavigation<any>();
  const lastFetched = useNotificationStore(state => state.lastFetched);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url = `${API_ENDPOINTS.WA_ORDERS}?limit=30`;
      if (filterStatus !== 'ALL') url += `&status=${filterStatus}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (dateFrom) url += `&dateFrom=${dateFrom.toISOString().split('T')[0]}`;
      if (dateTo) url += `&dateTo=${dateTo.toISOString().split('T')[0]}`;

      const response = await api.get(url);
      if (response.data.success || response.data.status === 'success') {
        setOrders(response.data.data || []);
      }
    } catch (error: any) {
      if (!silent) AppToast.error('Error', error.message || 'Gagal mengambil data orderan');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [filterStatus, dateFrom, dateTo]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => fetchOrders(true));
    return unsubscribe;
  }, [navigation]);
  useEffect(() => { if (lastFetched) fetchOrders(true); }, [lastFetched]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };
  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleCreateDelivery = (item: WaOrder) => {
    // Parse items untuk pre-fill ke DeliveryScreen
    const parsedItems = Array.isArray(item.parsedItems) ? item.parsedItems : [];
    const doItems = parsedItems.map((pi: any) => ({
      productName: pi.productName || pi.name || '',
      productCode: pi.productCode || pi.code || '',
      productId: pi.productId || '',
      unitId: pi.unitId || '',
      unitName: pi.unitName || pi.unit || 'Unit',
      quantity: pi.quantity || 1,
    }));

    navigation.navigate('Delivery', {
      prefillItems: doItems,
      prefillCustomerName: item.customerName || item.senderName,
      prefillNotes: `Order WA dari ${item.senderName} (${item.senderPhone})`,
      sourceOrderId: item.id,
    });
  };

  const handleReject = async (item: WaOrder) => {
    try {
      await api.post(API_ENDPOINTS.WA_ORDER_REJECT(item.id), { reason: 'Ditolak dari daftar orderan' });
      AppToast.success('Sukses', 'Orderan ditolak');
      fetchOrders(true);
    } catch {
      AppToast.error('Error', 'Gagal menolak orderan');
    }
  };

  // ── TABLE HEADER ──
  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      {/* Waktu */}
      <Text style={[styles.thCell, { width: 46 }]}>TGL</Text>
      {/* Pengirim */}
      <Text style={[styles.thCell, { flex: 1 }]}>PENGIRIM</Text>
      {/* Pesanan */}
      <Text style={[styles.thCell, { flex: 1.2 }]}>PESANAN</Text>
      {/* Status */}
      <Text style={[styles.thCell, { width: 44, textAlign: 'center' }]}>STATUS</Text>
      {/* Aksi */}
      <Text style={[styles.thCell, { width: 58, textAlign: 'center' }]}>AKSI</Text>
    </View>
  );

  // ── TABLE ROW ──
  const renderItem = ({ item, index }: { item: WaOrder; index: number }) => {
    const dateObj = item.receivedAt ? new Date(item.receivedAt) : new Date();
    const isExpanded = expandedId === item.id;
    const parsedItems = Array.isArray(item.parsedItems) ? item.parsedItems : [];
    const isPending = item.status === 'PENDING';
    const isConfirmed = item.status === 'CONFIRMED';

    const statusColor = isConfirmed ? Colors.success : item.status === 'REJECTED' ? Colors.error : Colors.warning;
    const statusLabel = isConfirmed ? 'Conf' : item.status === 'REJECTED' ? 'Rej' : 'Pend';

    return (
      <View style={[styles.rowWrapper, index % 2 === 1 && styles.rowAlt]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpand(item.id)}
          style={styles.tableRow}
        >
          {/* Kolom Waktu */}
          <View style={[styles.tdCell, { width: 46 }]}>
            <Text style={styles.timeDate}>
              {dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })}
            </Text>
            <Text style={styles.timeHour}>
              {dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {/* Kolom Pengirim */}
          <View style={[styles.tdCell, { flex: 1, paddingRight: 4 }]}>
            <Text style={styles.senderName} numberOfLines={1}>
              {item.customerName || item.senderName}
            </Text>
            <Text style={styles.senderPhone} numberOfLines={1}>{item.senderPhone}</Text>
          </View>

          {/* Kolom Pesanan */}
          <View style={[styles.tdCell, { flex: 1.2, paddingRight: 4 }]}>
            {parsedItems.length > 0 ? (
              <Text style={styles.orderPreview} numberOfLines={2}>
                {parsedItems.slice(0, 2).map((pi: any) =>
                  `${pi.quantity} ${pi.unitName || pi.unit || ''} ${pi.productName || ''}`
                ).join('\n')}
                {parsedItems.length > 2 && ` +${parsedItems.length - 2}`}
              </Text>
            ) : (
              <Text style={styles.orderPreviewRaw} numberOfLines={2}>
                {item.rawMessage || '-'}
              </Text>
            )}
          </View>

          {/* Kolom Status */}
          <View style={[styles.tdCell, { width: 44, alignItems: 'center' }]}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          {/* Kolom Aksi */}
          <View style={[styles.tdCell, { width: 58, alignItems: 'center', gap: 4 }]}>
            {isPending ? (
              <>
                <TouchableOpacity
                  style={styles.actionBtnSJ}
                  onPress={() => handleCreateDelivery(item)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="car-outline" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtnConfirm}
                  onPress={() => navigation.navigate('WaOrderConfirm', { order: item })}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textTertiary}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded detail */}
        {isExpanded && (
          <View style={styles.expandedPanel}>
            <Text style={styles.expandLabel}>Pesan Asli:</Text>
            <Text style={styles.expandMessage}>{item.rawMessage}</Text>

            {parsedItems.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.expandLabel}>Barang ({parsedItems.length}):</Text>
                {parsedItems.map((pi: any, idx: number) => (
                  <View key={idx} style={styles.parsedRow}>
                    <Text style={styles.parsedItem} numberOfLines={1}>
                      • {pi.productName || '?'}
                    </Text>
                    <Text style={styles.parsedQty}>
                      {pi.quantity} {pi.unit || pi.unitName}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Aksi di expanded */}
            {isPending && (
              <View style={styles.expandActions}>
                <TouchableOpacity
                  style={styles.expandBtnSJ}
                  onPress={() => handleCreateDelivery(item)}
                >
                  <Ionicons name="car-outline" size={14} color="#fff" />
                  <Text style={styles.expandBtnText}>Buat Surat Jalan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.expandBtnConfirm}
                  onPress={() => navigation.navigate('WaOrderConfirm', { order: item })}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                  <Text style={styles.expandBtnText}>Konfirmasi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.expandBtnReject}
                  onPress={() => handleReject(item)}
                >
                  <Ionicons name="close-circle-outline" size={14} color={Colors.error} />
                  <Text style={[styles.expandBtnText, { color: Colors.error }]}>Tolak</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>📋 Daftar Orderan</Text>
          <Text style={styles.headerSub}>
            {orders.length} data · Tap baris untuk detail
          </Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={14} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama, nomor, pesan..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => fetchOrders()}
            returnKeyType="search"
            placeholderTextColor={Colors.textTertiary}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setTimeout(fetchOrders, 100); }}>
              <Ionicons name="close-circle" size={14} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Date filter */}
        <View style={styles.dateFilterRow}>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="Dari Tgl" compact style={{ flex: 1 }} />
          <Text style={styles.dateSep}>–</Text>
          <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="Sampai" compact style={{ flex: 1 }} />
          <TouchableOpacity style={styles.filterApplyBtn} onPress={() => fetchOrders()}>
            <Ionicons name="funnel" size={13} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Status chips */}
        <View style={styles.statusChips}>
          {(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL'] as const).map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.chip, filterStatus === status && styles.chipActive]}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={[styles.chipText, filterStatus === status && styles.chipTextActive]}>
                {status === 'ALL' ? 'Semua' : status === 'PENDING' ? 'Pending' : status === 'CONFIRMED' ? 'Conf.' : 'Ditolak'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Legend aksi */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.info }]}>
              <Ionicons name="car-outline" size={9} color="#fff" />
            </View>
            <Text style={styles.legendText}>= Buat Surat Jalan</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.success }]}>
              <Ionicons name="checkmark" size={9} color="#fff" />
            </View>
            <Text style={styles.legendText}>= Konfirmasi</Text>
          </View>
        </View>
      </View>

      {/* Table header */}
      {renderTableHeader()}

      {/* Table body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>Tidak ada data orderan.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryStart]} />
          }
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: 10, color: Colors.textTertiary, marginTop: 1 },

  filtersContainer: {
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 8, paddingHorizontal: 8, height: 34,
    borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 12, padding: 0 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateSep: { color: Colors.textTertiary, fontSize: 12 },
  filterApplyBtn: {
    backgroundColor: Colors.primaryStart, width: 32, height: 32,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  statusChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  chipText: { fontSize: 10, color: Colors.textSecondary, fontWeight: 'bold' },
  chipTextActive: { color: '#fff' },

  legendRow: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: {
    width: 18, height: 18, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  legendText: { fontSize: 10, color: Colors.textTertiary },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontSize: 9, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 0.4,
  },

  listContainer: { paddingBottom: 40 },
  rowWrapper: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowAlt: { backgroundColor: '#F9FAFB' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 9, alignItems: 'flex-start' },
  tdCell: { justifyContent: 'flex-start' },

  timeDate: { fontSize: 9, color: Colors.textSecondary },
  timeHour: { fontSize: 9, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 2 },
  senderName: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary, lineHeight: 15 },
  senderPhone: { fontSize: 9, color: Colors.textTertiary, marginTop: 1 },
  orderPreview: { fontSize: 10, color: Colors.textPrimary, lineHeight: 14 },
  orderPreviewRaw: { fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 14 },

  statusBadge: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4 },
  statusBadgeText: { fontSize: 9, fontWeight: 'bold' },

  // Action buttons (icon only, dalam baris tabel)
  actionBtnSJ: {
    backgroundColor: Colors.info, borderRadius: 4, width: 24, height: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  actionBtnConfirm: {
    backgroundColor: Colors.success, borderRadius: 4, width: 24, height: 22,
    justifyContent: 'center', alignItems: 'center',
  },

  // Expanded panel
  expandedPanel: {
    backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  expandLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.primaryStart, marginBottom: 4 },
  expandMessage: { fontSize: 11, color: Colors.textPrimary, lineHeight: 16, marginBottom: 4 },
  parsedRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  parsedItem: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  parsedQty: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary },

  expandActions: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  expandBtnSJ: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.info, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  expandBtnConfirm: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  expandBtnReject: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.error + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.error + '40',
  },
  expandBtnText: { fontSize: 11, fontWeight: 'bold', color: '#fff' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { marginTop: 12, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
});
