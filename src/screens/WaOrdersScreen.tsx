import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight } from '../constants/theme';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { useNavigation } from '@react-navigation/native';

interface WaOrder {
  id: string;
  senderName: string;
  senderPhone: string;
  rawMessage: string;
  status: string;
  receivedAt: string;
  parsedItems: any;
}

export const WaOrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<WaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'PENDING'|'CONFIRMED'|'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation<any>();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get(`${API_ENDPOINTS.WA_ORDERS}?status=${filterStatus}`);
      if (response.data.success) {
        setOrders(response.data.data);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Gagal mengambil data orderan WA');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filterStatus]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchOrders();
    });
    return unsubscribe;
  }, [navigation, filterStatus]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const filteredOrders = orders.filter(o => {
    if (!searchQuery) return true;
    const lower = searchQuery.toLowerCase();
    return o.senderName?.toLowerCase().includes(lower) || 
           o.senderPhone?.toLowerCase().includes(lower) ||
           o.rawMessage?.toLowerCase().includes(lower);
  });

  const renderItem = ({ item }: { item: WaOrder }) => {
    const dateStr = item.receivedAt ? new Date(item.receivedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    
    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigation.navigate('WaOrderConfirm', { order: item })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerTitle}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            <Text style={styles.senderName}>{item.senderName}</Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <Text style={styles.phoneText}>{item.senderPhone}</Text>
        <View style={styles.messageContainer}>
          <Text style={styles.messageText} numberOfLines={3}>{item.rawMessage}</Text>
        </View>
        
        {item.parsedItems && Array.isArray(item.parsedItems) && (
          <View style={styles.parsedContainer}>
            <Text style={styles.parsedTitle}>Terdeteksi {item.parsedItems.length} barang:</Text>
            {item.parsedItems.slice(0, 2).map((pi: any, idx: number) => (
              <Text key={idx} style={styles.parsedItem}>• {pi.quantity} {pi.unitName} {pi.productName}</Text>
            ))}
            {item.parsedItems.length > 2 && <Text style={styles.parsedItem}>... dan lainnya</Text>}
          </View>
        )}
        
        <View style={styles.actionContainer}>
          <View style={[styles.badge, item.status === 'CONFIRMED' ? {backgroundColor: Colors.success+'20'} : item.status === 'REJECTED' ? {backgroundColor: Colors.error+'20'} : {}]}>
            <Text style={[styles.badgeText, item.status === 'CONFIRMED' ? {color: Colors.success} : item.status === 'REJECTED' ? {color: Colors.error} : {}]}>
              {item.status === 'PENDING' ? 'Menunggu Konfirmasi' : item.status === 'CONFIRMED' ? 'Dikonfirmasi' : 'Ditolak'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Orderan WhatsApp</Text>
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama, nomor, pesan..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.textTertiary}
          />
        </View>
        <View style={styles.chipsContainer}>
          {(['PENDING', 'CONFIRMED', 'REJECTED'] as const).map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.chip, filterStatus === status && styles.chipActive]}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={[styles.chipText, filterStatus === status && styles.chipTextActive]}>
                {status === 'PENDING' ? 'Pending' : status === 'CONFIRMED' ? 'Confirmed' : 'Rejected'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyText}>Tidak ada orderan WA yang tertunda.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryStart]} />}
        />
      )}
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
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { marginTop: 16, fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  filtersContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 12, height: 40, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, marginLeft: 8, color: Colors.textPrimary, fontSize: FontSize.sm },
  chipsContainer: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: 'bold' },
  chipTextActive: { color: '#FFFFFF' },
  listContainer: { padding: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  senderName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  dateText: { fontSize: FontSize.xs, color: Colors.textTertiary },
  phoneText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 12 },
  messageContainer: { backgroundColor: Colors.backgroundSecondary, padding: 12, borderRadius: 8, marginBottom: 12 },
  messageText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontStyle: 'italic' },
  parsedContainer: { marginBottom: 12 },
  parsedTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primaryStart, marginBottom: 4 },
  parsedItem: { fontSize: FontSize.sm, color: Colors.textSecondary },
  actionContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  badge: { backgroundColor: Colors.warning + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
});
