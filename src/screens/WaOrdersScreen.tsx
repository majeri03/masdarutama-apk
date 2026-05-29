import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform, LayoutAnimation } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight } from '../constants/theme';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { useNavigation } from '@react-navigation/native';
import { AppToast } from '../utils/toast';
import { useNotificationStore } from '../stores/notification.store';

import { DatePickerInput } from '../components/ui/DatePickerInput';

// Sesuai dengan response /api/wa-orders
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

function parseBotInfo(notes?: string | null) {
  if (!notes) return null;
  if (notes.includes("[BOT-YA")) return { label: "Bot: YA", color: Colors.success };
  if (notes.includes("[BOT-PENDING")) return { label: "Bot: PENDING", color: Colors.warning };
  if (notes.includes("[BOT-CONFIRMED")) return { label: "Bot: Konf", color: Colors.info };
  return null;
}

export const WaOrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<WaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL'|'PENDING'|'CONFIRMED'|'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const navigation = useNavigation<any>();
  const lastFetched = useNotificationStore(state => state.lastFetched);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url = `${API_ENDPOINTS.WA_ORDERS}?limit=20`;
      if (filterStatus !== 'ALL') url += `&status=${filterStatus}`;
      
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (dateFrom) url += `&dateFrom=${dateFrom.toISOString().split('T')[0]}`;
      if (dateTo) url += `&dateTo=${dateTo.toISOString().split('T')[0]}`;

      const response = await api.get(url);
      if (response.data.success || response.data.status === 'success') {
        setOrders(response.data.data || []);
      }
    } catch (error: any) {
      if (!silent) AppToast.error('Error', error.message || 'Gagal mengambil data orderan WA');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [filterStatus, dateFrom, dateTo]);

  const onSubmitSearch = () => { fetchOrders(); };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchOrders(true); });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (lastFetched) fetchOrders(true);
  }, [lastFetched]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === id ? null : id);
  };

  const renderHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.headerCell, { width: 50 }]}>Waktu</Text>
      <Text style={[styles.headerCell, { flex: 1.2 }]}>Pengirim/Cust</Text>
      <Text style={[styles.headerCell, { flex: 1.5 }]}>Pesanan</Text>
      <Text style={[styles.headerCell, { width: 55, textAlign: 'center' }]}>Status</Text>
      <Text style={[styles.headerCell, { width: 35, textAlign: 'center' }]}>Aksi</Text>
    </View>
  );

  const renderItem = ({ item }: { item: WaOrder }) => {
    const dateObj = item.receivedAt ? new Date(item.receivedAt) : new Date();
    const isExpanded = expandedId === item.id;
    const parsedItems = Array.isArray(item.parsedItems) ? item.parsedItems : [];
    const botInfo = parseBotInfo(item.notes);
    
    return (
      <View style={styles.rowWrapper}>
        <TouchableOpacity 
          activeOpacity={0.7} 
          onPress={() => toggleExpand(item.id)}
          style={[styles.tableRow, item.status === 'PENDING' && { backgroundColor: Colors.warning + '08' }]}
        >
          {/* Kolom 1: Waktu */}
          <View style={[styles.cell, { width: 50 }]}>
            <Text style={styles.timeText}>{dateObj.toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit'})}</Text>
            <Text style={styles.timeTextBold}>{dateObj.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</Text>
          </View>
          
          {/* Kolom 2: Pengirim & Customer */}
          <View style={[styles.cell, { flex: 1.2, paddingRight: 4 }]}>
            <Text style={styles.senderText} numberOfLines={1}>{item.senderName}</Text>
            {item.customerName && item.customerName !== item.senderName && (
              <Text style={styles.customerText} numberOfLines={1}>→ {item.customerName}</Text>
            )}
            <Text style={styles.phoneText} numberOfLines={1}>{item.senderPhone}</Text>
          </View>

          {/* Kolom 3: Pesanan */}
          <View style={[styles.cell, { flex: 1.5, paddingRight: 4 }]}>
            {parsedItems.length > 0 ? (
              <Text style={styles.orderSummary} numberOfLines={2}>
                {parsedItems[0]?.quantity} {parsedItems[0]?.unitName || parsedItems[0]?.unit} {parsedItems[0]?.productName}
                {parsedItems.length > 1 ? ` +${parsedItems.length - 1} lg` : ''}
              </Text>
            ) : (
              <Text style={styles.msgPreview} numberOfLines={2}>{item.rawMessage || '-'}</Text>
            )}
          </View>

          {/* Kolom 4: Status */}
          <View style={[styles.cell, { width: 55, alignItems: 'center' }]}>
            <View style={[styles.miniBadge, 
              item.status === 'CONFIRMED' ? {backgroundColor: Colors.success+'20'} : 
              item.status === 'REJECTED' ? {backgroundColor: Colors.error+'20'} : 
              {backgroundColor: Colors.warning+'20'}
            ]}>
              <Text style={[styles.miniBadgeText, 
                item.status === 'CONFIRMED' ? {color: Colors.success} : 
                item.status === 'REJECTED' ? {color: Colors.error} : 
                {color: Colors.warning}
              ]}>
                {item.status === 'PENDING' ? 'Pend' : item.status === 'CONFIRMED' ? 'Conf' : 'Rej'}
              </Text>
            </View>
            {botInfo && (
              <Text style={[styles.botTag, {color: botInfo.color}]}>{botInfo.label}</Text>
            )}
          </View>

          {/* Kolom 5: Aksi */}
          <View style={[styles.cell, { width: 35, alignItems: 'center', justifyContent: 'center' }]}>
            {item.status === 'PENDING' ? (
              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={() => navigation.navigate('WaOrderConfirm', { order: item })}
              >
                <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
              </TouchableOpacity>
            ) : (
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textTertiary} />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded View */}
        {isExpanded && (
          <View style={styles.expandedContainer}>
            <Text style={styles.expandLabel}>Pesan Asli:</Text>
            <View style={styles.msgBox}>
              <Text style={styles.msgFullText}>{item.rawMessage}</Text>
            </View>
            
            {parsedItems.length > 0 && (
              <View style={{marginTop: 8}}>
                <Text style={styles.expandLabel}>Barang Terdeteksi ({parsedItems.length}):</Text>
                {parsedItems.map((pi: any, idx: number) => (
                  <View key={idx} style={styles.parsedRow}>
                    <Text style={styles.parsedItemName} numberOfLines={1}>• {pi.productName || "?"}</Text>
                    <Text style={styles.parsedItemQty}>{pi.quantity} {pi.unit || pi.unitName}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {item.notes && (
              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>Catatan (Bot/Audit):</Text>
                <Text style={styles.noteText}>{item.notes}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Tabel Orderan WA</Text>
      </View>

      <View style={styles.filtersContainer}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama, nomor, pesan..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={onSubmitSearch}
            returnKeyType="search"
            placeholderTextColor={Colors.textTertiary}
          />
          {searchQuery !== '' && (
             <TouchableOpacity onPress={() => { setSearchQuery(''); setTimeout(fetchOrders, 100); }}>
               <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
             </TouchableOpacity>
          )}
        </View>

        {/* Date Filter with DatePickerInput */}
        <View style={styles.dateFilterContainer}>
          <DatePickerInput 
            value={dateFrom} 
            onChange={setDateFrom} 
            placeholder="Dari Tgl" 
            compact={true} 
            style={{flex: 1}} 
          />
          <Text style={{color: Colors.textTertiary, marginHorizontal: 4}}>-</Text>
          <DatePickerInput 
            value={dateTo} 
            onChange={setDateTo} 
            placeholder="Sampai" 
            compact={true} 
            style={{flex: 1}} 
          />
          <TouchableOpacity style={styles.searchBtn} onPress={onSubmitSearch}>
             <Ionicons name="funnel" size={14} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Status Filter */}
        <View style={styles.chipsContainer}>
          {(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL'] as const).map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.chip, filterStatus === status && styles.chipActive]}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={[styles.chipText, filterStatus === status && styles.chipTextActive]}>
                {status === 'ALL' ? 'Semua' : status === 'PENDING' ? 'Pending' : status === 'CONFIRMED' ? 'Confirmed' : 'Rejected'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {/* List Header */}
      {renderHeader()}

      {/* Main Table Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (orders?.length || 0) === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>Data kosong. (Tampil max 20 terbaru)</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryStart]} />}
          
          // Optimasi FlatList Standar Industri
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { marginRight: 16 },
  headerTitleText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { marginTop: 12, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  
  // Filters
  filtersContainer: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 8, height: 36, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, marginLeft: 6, color: Colors.textPrimary, fontSize: 12, padding: 0 },
  dateFilterContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dateInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 6, height: 32, borderWidth: 1, borderColor: Colors.border },
  dateInput: { flex: 1, marginLeft: 4, fontSize: 10, color: Colors.textPrimary, padding: 0 },
  searchBtn: { backgroundColor: Colors.primaryStart, width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  chipsContainer: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  chipText: { fontSize: 10, color: Colors.textSecondary, fontWeight: 'bold' },
  chipTextActive: { color: '#FFFFFF' },

  // Table Layout
  tableHeader: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerCell: { fontSize: 10, fontWeight: 'bold', color: Colors.textSecondary },
  listContainer: { paddingBottom: 40 },
  rowWrapper: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, alignItems: 'flex-start' },
  cell: { justifyContent: 'center' },
  
  // Typography inside cells
  timeText: { fontSize: 9, color: Colors.textSecondary },
  timeTextBold: { fontSize: 9, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 2 },
  senderText: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary },
  customerText: { fontSize: 9, color: Colors.success, fontWeight: 'bold', marginTop: 1 },
  phoneText: { fontSize: 9, color: Colors.textTertiary, marginTop: 1 },
  orderSummary: { fontSize: 10, color: Colors.textPrimary, lineHeight: 14 },
  msgPreview: { fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 14 },
  
  miniBadge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, alignSelf: 'center' },
  miniBadgeText: { fontSize: 8, fontWeight: 'bold' },
  botTag: { fontSize: 8, fontWeight: 'bold', marginTop: 4, textAlign: 'center' },
  actionBtn: { padding: 4 },

  // Expanded View
  expandedContainer: { backgroundColor: '#f8fafc', padding: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  expandLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.primaryStart, marginBottom: 4 },
  msgBox: { backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  msgFullText: { fontSize: 11, color: Colors.textPrimary, lineHeight: 16 },
  parsedRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  parsedItemName: { fontSize: 11, color: Colors.textSecondary, flex: 1, paddingRight: 8 },
  parsedItemQty: { fontSize: 11, color: Colors.textPrimary, fontWeight: 'bold' },
  noteBox: { backgroundColor: Colors.info + '10', padding: 8, borderRadius: 6, marginTop: 8, borderWidth: 1, borderColor: Colors.info + '30' },
  noteTitle: { fontSize: 10, fontWeight: 'bold', color: Colors.info, marginBottom: 2 },
  noteText: { fontSize: 10, color: Colors.textSecondary },
});
