import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator, Modal, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { productService } from '../services/product.service';
import type { Product, Customer } from '../types';

interface MappedItem {
  originalName: string;
  originalUnit: string;
  quantity: number;
  productId: string | null;
  productName: string | null;
  unitId: string | null;
  unitName: string | null;
  availableUnits: any[];
}

export const WaOrderConfirmScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { order } = route.params;

  const [loading, setLoading] = useState(false);
  const [createDeliveryOrder, setCreateDeliveryOrder] = useState(true);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [mappedItems, setMappedItems] = useState<MappedItem[]>([]);

  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Customer Modal states
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const handleAddManualItem = () => {
    setMappedItems(prev => [...prev, {
      originalName: 'Barang Tambahan',
      originalUnit: '',
      quantity: 1,
      productId: null,
      productName: null,
      unitId: null,
      unitName: null,
      availableUnits: []
    }]);
  };

  useEffect(() => {
    // Initialize mapped items
    if (order.parsedItems && Array.isArray(order.parsedItems)) {
      const initialMap = order.parsedItems.map((pi: any) => ({
        originalName: pi.productName || 'Barang Tidak Dikenal',
        originalUnit: pi.unitName || '',
        quantity: pi.quantity || 1,
        productId: null,
        productName: null,
        unitId: null,
        unitName: null,
        availableUnits: []
      }));
      setMappedItems(initialMap);
    } else {
      // If no parsed items, add one empty row
      setMappedItems([{
        originalName: 'Manual Input',
        originalUnit: '',
        quantity: 1,
        productId: null,
        productName: null,
        unitId: null,
        unitName: null,
        availableUnits: []
      }]);
    }

    const fetchData = async () => {
      try {
        const [custRes, prodRes] = await Promise.all([
          api.get(API_ENDPOINTS.CUSTOMERS),
          productService.getProducts({ limit: 500, isActive: true }) // Fetch all active products
        ]);

        if (custRes.data.success && custRes.data.data.length > 0) {
          const custData = custRes.data.data;
          setCustomers(custData);
          
          const umumCust = custData.find((c: any) => c.name.toLowerCase() === 'umum' || c.type === 'UMUM');
          if (umumCust) {
            setSelectedCustomerId(umumCust.id);
          } else {
            setSelectedCustomerId(custData[0].id);
          }
        }

        if (prodRes.success && prodRes.data?.products) {
          setProducts(prodRes.data.products);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const handleSelectProduct = (product: Product) => {
    if (activeItemIndex === null) return;

    const primaryUnit = product.productUnits.find(u => u.isPrimary) || product.productUnits[0];

    setMappedItems(prev => {
      const newItems = [...prev];
      newItems[activeItemIndex] = {
        ...newItems[activeItemIndex],
        productId: product.id,
        productName: product.name,
        availableUnits: product.productUnits,
        unitId: primaryUnit ? primaryUnit.unitId : null,
        unitName: primaryUnit ? primaryUnit.unit.name : null,
      };
      return newItems;
    });

    setShowProductModal(false);
    setProductSearch('');
  };

  const handleConfirm = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Error', 'Pilih customer terlebih dahulu');
      return;
    }

    // Validate
    const invalidItems = mappedItems.filter(item => !item.productId || !item.unitId);
    if (invalidItems.length > 0) {
      Alert.alert('Error', 'Silakan pilih produk asli dan satuannya untuk semua baris barang.');
      return;
    }

    const itemsPayload = mappedItems.map(item => ({
      productId: item.productId,
      unitId: item.unitId,
      quantity: item.quantity,
    }));

    setLoading(true);
    try {
      const payload = {
        customerId: selectedCustomerId,
        createDeliveryOrder,
        deliveryDate: new Date().toISOString(),
        items: itemsPayload,
      };

      const res = await api.post(API_ENDPOINTS.WA_ORDER_CONFIRM(order.id), payload);
      if (res.data.success) {
        Alert.alert('Sukses', res.data.message);
        navigation.goBack();
      } else {
        Alert.alert('Gagal', res.data.message || 'Terjadi kesalahan');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Gagal mengkonfirmasi orderan.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    Alert.alert('Tolak', 'Yakin ingin menolak orderan ini?', [
      { text: 'Batal', style: 'cancel' },
      { 
        text: 'Tolak', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const res = await api.post(API_ENDPOINTS.WA_ORDER_REJECT(order.id), { reason: 'Ditolak dari aplikasi' });
            if (res.data.success) {
              navigation.goBack();
            }
          } catch (e) {
            Alert.alert('Error', 'Gagal menolak orderan');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Konfirmasi Order WA</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pesan Asli</Text>
          <Text style={styles.senderText}>{order.senderName} ({order.senderPhone})</Text>
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{order.rawMessage}</Text>
          </View>
        </View>

        {order.status === 'PENDING' ? (
          <>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.sectionTitle}>Buat Surat Jalan?</Text>
                  <Text style={styles.helpText}>Jika mati, hanya masuk transaksi POS.</Text>
                </View>
                <Switch
                  value={createDeliveryOrder}
                  onValueChange={setCreateDeliveryOrder}
                  trackColor={{ false: Colors.border, true: Colors.primaryStart }}
                />
              </View>
            </View>

            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Data Customer</Text>
                <TouchableOpacity onPress={() => setShowCustomerModal(true)}>
                  <Text style={{ fontSize: FontSize.sm, color: Colors.primaryStart, fontWeight: 'bold' }}>Ubah</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>
                {selectedCustomerId && customers.find(c => c.id === selectedCustomerId)
                  ? `Customer Terpilih: ${customers.find(c => c.id === selectedCustomerId)?.name}`
                  : 'Memuat data customer...'}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pemetaan Produk</Text>
              <View style={{ marginTop: 12, gap: 12 }}>
                {mappedItems.map((item, idx) => (
                  <View key={idx} style={styles.mappedItemCard}>
                    <View style={styles.mappedItemHeader}>
                      <Text style={styles.originalText}>
                        Teks Asli: <Text style={{ fontWeight: 'bold' }}>{item.quantity} {item.originalUnit} {item.originalName}</Text>
                      </Text>
                    </View>

                    {item.productId ? (
                      <View style={styles.selectedProductBox}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedProductName}>{item.productName}</Text>
                          
                          {/* Simple Unit Picker (Horizontal Scroll) */}
                          {item.availableUnits.length > 1 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                              {item.availableUnits.map(pu => (
                                <TouchableOpacity 
                                  key={pu.unitId} 
                                  style={[styles.unitChip, item.unitId === pu.unitId && styles.unitChipActive]}
                                  onPress={() => {
                                    setMappedItems(prev => {
                                      const n = [...prev];
                                      n[idx].unitId = pu.unitId;
                                      n[idx].unitName = pu.unit.name;
                                      return n;
                                    });
                                  }}
                                >
                                  <Text style={[styles.unitChipText, item.unitId === pu.unitId && styles.unitChipTextActive]}>{pu.unit.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : (
                            <Text style={styles.unitTextLabel}>Satuan: {item.unitName}</Text>
                          )}
                        </View>

                        <TouchableOpacity 
                          onPress={() => {
                            setActiveItemIndex(idx);
                            setShowProductModal(true);
                          }}
                          style={styles.btnChangeProduct}
                        >
                          <Ionicons name="swap-horizontal" size={20} color={Colors.primaryStart} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity 
                        style={styles.btnSelectProduct}
                        onPress={() => {
                          setActiveItemIndex(idx);
                          setShowProductModal(true);
                        }}
                      >
                        <Ionicons name="search" size={20} color="#fff" />
                        <Text style={styles.btnSelectProductText}>Pilih Produk dari Database</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity style={styles.btnSelectProduct} onPress={handleAddManualItem}>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.btnSelectProductText}>Tambah Barang Manual</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Status Orderan</Text>
            <Text style={[styles.helpText, { color: order.status === 'CONFIRMED' ? Colors.success : Colors.error, fontWeight: 'bold', fontSize: FontSize.md, marginTop: 8 }]}>
              {order.status === 'CONFIRMED' ? 'Dikonfirmasi' : 'Ditolak'}
            </Text>
            {order.status === 'REJECTED' && order.rejectedReason ? (
              <Text style={{ marginTop: 8, color: Colors.textSecondary }}>Alasan: {order.rejectedReason}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {order.status === 'PENDING' && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={handleReject} disabled={loading}>
            <Text style={styles.btnRejectText}>Tolak</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={handleConfirm} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnConfirmText}>Konfirmasi</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* --- PRODUCT SEARCH MODAL --- */}
      <Modal visible={showProductModal} animationType="slide" onRequestClose={() => setShowProductModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowProductModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Cari Produk</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama atau kode produk..."
              value={productSearch}
              onChangeText={setProductSearch}
              autoFocus
            />
          </View>

          <FlatList
            data={filteredProducts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productListItem} onPress={() => handleSelectProduct(item)}>
                <View>
                  <Text style={styles.productListName}>{item.name}</Text>
                  <Text style={styles.productListCode}>{item.code}</Text>
                </View>
                <Ionicons name="add-circle" size={24} color={Colors.primaryStart} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <Text style={{ textAlign: 'center', marginTop: 24, color: Colors.textSecondary }}>Produk tidak ditemukan</Text>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* --- CUSTOMER SEARCH MODAL --- */}
      <Modal visible={showCustomerModal} animationType="slide" onRequestClose={() => setShowCustomerModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCustomerModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Pilih Customer</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama customer..."
              value={customerSearch}
              onChangeText={setCustomerSearch}
            />
          </View>

          <FlatList
            data={customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.productListItem} 
                onPress={() => {
                  setSelectedCustomerId(item.id);
                  setShowCustomerModal(false);
                  setCustomerSearch('');
                }}
              >
                <View>
                  <Text style={styles.productListName}>{item.name}</Text>
                  <Text style={styles.productListCode}>{item.phone || 'No HP Kosong'}</Text>
                </View>
                <Ionicons name="person" size={24} color={item.id === selectedCustomerId ? Colors.primaryStart : Colors.textTertiary} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <Text style={{ textAlign: 'center', marginTop: 24, color: Colors.textSecondary }}>Customer tidak ditemukan</Text>
            )}
          />
        </SafeAreaView>
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
  content: { flex: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 8 },
  senderText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primaryStart, marginBottom: 8 },
  messageBox: { backgroundColor: Colors.backgroundSecondary, padding: 12, borderRadius: 8 },
  messageText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontStyle: 'italic' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helpText: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: -4 },
  
  // Mapping UI
  mappedItemCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  mappedItemHeader: {
    backgroundColor: Colors.backgroundSecondary,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  originalText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  btnSelectProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryStart,
    padding: 12,
    gap: 8,
  },
  btnSelectProductText: { color: '#fff', fontWeight: 'bold' },
  selectedProductBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
  },
  selectedProductName: { fontSize: FontSize.sm, fontWeight: 'bold', color: Colors.textPrimary },
  unitTextLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 },
  btnChangeProduct: { padding: 8 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  unitChipActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  unitChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  unitChipTextActive: { color: '#fff', fontWeight: 'bold' },

  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnReject: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.error },
  btnRejectText: { color: Colors.error, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  btnConfirm: { backgroundColor: Colors.primaryStart },
  btnConfirmText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.md, fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, margin: 16, paddingHorizontal: 12, height: 44, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, marginLeft: 8 },
  productListItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  productListName: { fontSize: FontSize.sm, fontWeight: 'bold', color: Colors.textPrimary },
  productListCode: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 },
});
