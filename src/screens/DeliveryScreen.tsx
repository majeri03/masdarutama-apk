import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import { deliveryService } from '../services/delivery.service';
import { masterService } from '../services/master.service';
import { productService } from '../services/product.service';
import { salesService } from '../services/sales.service';
import { generateInvoiceHtml } from '../utils/invoicePdf';
import { acquirePrintLock, releasePrintLock } from '../utils/printLock';
import type { Customer, Product, Sale } from '../types';

interface DeliveryOrder {
  id: string;
  doNumber: string;
  customerId: string;
  saleId: string | null;
  deliveryDate: string;
  driver: string | null;
  vehicle: string | null;
  notes: string | null;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  createdBy: { id: string; name: string };
  deliveryItems: Array<{
    id: string;
    productId: string;
    unitId: string;
    quantity: number;
    notes: string | null;
    product: { id: string; name: string; code: string };
    unit: { id: string; name: string; symbol: string | null };
  }>;
  sale?: { id: string; invoiceNumber: string } | null;
}

export const DeliveryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Selected DO Details Modal
  const [selectedDO, setSelectedDO] = useState<DeliveryOrder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Status modification Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'>('PENDING');
  const [receivedBy, setReceivedBy] = useState('');

  // Create DO Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');

  // Add Item to DO form
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const selectedProductId = selectedProduct?.id || '';
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [doItems, setDoItems] = useState<Array<{
    productId: string;
    productName: string;
    productCode: string;
    unitId: string;
    unitName: string;
    quantity: number;
    notes?: string;
  }>>([]);

  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  const loadSearchProducts = async (search = '') => {
    setLoadingProducts(true);
    try {
      const res = await productService.getProducts({
        search,
        isActive: true,
        limit: 10,
      });
      if (res.success && res.data?.products) {
        setProducts(res.data.products);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading search products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deliveryService.getDeliveryOrders({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      if (res.success && res.data) {
        setDeliveryOrders(res.data as DeliveryOrder[]);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading DOs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const loadMasterData = async () => {
    try {
      const [custRes, prodRes, salesRes] = await Promise.all([
        masterService.getCustomers(),
        productService.getProducts({ limit: 100, isActive: true }),
        salesService.getSales({ limit: 50, status: 'PENDING' }),
      ]);
      if (custRes.success && custRes.data?.customers) {
        setCustomers(custRes.data.customers);
        // Pre-select reguler customer by default
        const defaultCust = custRes.data.customers.find((c: any) => c.type === 'REGULER') || custRes.data.customers[0];
        if (defaultCust && !selectedCustomerId) {
          setSelectedCustomerId(defaultCust.id);
        }
      }
      if (prodRes.success && prodRes.data?.products) {
        setProducts(prodRes.data.products);
      }
      if (salesRes.success && salesRes.data?.sales) {
        // filter sales that are PENDING and don't have DO yet
        setSalesList(salesRes.data.sales);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading master data:', e);
    }
  };

  useEffect(() => {
    if (showCreateModal) {
      loadMasterData();
      setSelectedProduct(null);
      setSearchProductQuery('');
    }
  }, [showCreateModal]);

  const handleCreateDO = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Peringatan', 'Silakan pilih pelanggan terlebih dahulu.');
      return;
    }
    if (doItems.length === 0) {
      Alert.alert('Peringatan', 'Masukkan minimal 1 produk kiriman.');
      return;
    }

    try {
      const payload = {
        customerId: selectedCustomerId,
        saleId: selectedSaleId || undefined,
        deliveryDate,
        driver: driver || undefined,
        vehicle: vehicle || undefined,
        notes: notes || undefined,
        items: doItems.map((item) => ({
          productId: item.productId,
          unitId: item.unitId,
          quantity: item.quantity,
          notes: item.notes,
        })),
      };

      const res = await deliveryService.createDeliveryOrder(payload);
      if (res.success) {
        Alert.alert('Sukses', res.message || 'Surat Jalan berhasil dibuat!');
        setShowCreateModal(false);
        // Reset form
        setSelectedCustomerId('');
        setSelectedSaleId('');
        setDriver('');
        setVehicle('');
        setNotes('');
        setDoItems([]);
        loadData();
      } else {
        Alert.alert('Gagal', res.error || 'Gagal membuat Surat Jalan.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedDO) return;
    if (newStatus === 'DELIVERED' && !receivedBy) {
      Alert.alert('Peringatan', 'Nama penerima wajib diisi saat status Diterima.');
      return;
    }

    try {
      const res = await deliveryService.updateDeliveryStatus({
        id: selectedDO.id,
        status: newStatus,
        receivedBy: newStatus === 'DELIVERED' ? receivedBy : undefined,
        receivedDate: newStatus === 'DELIVERED' ? new Date().toISOString() : undefined,
      });

      if (res.success) {
        Alert.alert('Sukses', res.message || 'Status pengiriman berhasil diperbarui!');
        setShowStatusModal(false);
        setReceivedBy('');
        // Refresh detail modal
        if (res.data) {
          setSelectedDO(res.data as DeliveryOrder);
        } else {
          setShowDetailsModal(false);
        }
        loadData();
      } else {
        Alert.alert('Gagal', res.error || 'Gagal memperbarui status.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    }
  };

  const handleDeleteDO = (id: string) => {
    Alert.alert(
      'Hapus Surat Jalan',
      'Apakah Anda yakin ingin menghapus Surat Jalan ini?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const res = await deliveryService.deleteDeliveryOrder(id);
            if (res.success) {
              Alert.alert('Sukses', 'Surat Jalan berhasil dihapus.');
              setShowDetailsModal(false);
              setSelectedDO(null);
              loadData();
            } else {
              Alert.alert('Gagal', res.error || 'Gagal menghapus Surat Jalan.');
            }
          },
        },
      ]
    );
  };

  const handlePrintDO = async (doItem: DeliveryOrder) => {
    if (!acquirePrintLock()) return;
    try {
      // Mock a sale object for DO generation
      const mockSale: Sale = {
        id: doItem.id,
        invoiceNumber: doItem.doNumber,
        customerId: doItem.customerId,
        cashierId: doItem.createdBy.id,
        saleDate: doItem.deliveryDate,
        createdAt: doItem.createdAt,
        updatedAt: doItem.createdAt,
        totalAmount: 0,
        discount: 0,
        tax: 0,
        grandTotal: 0,
        paymentMethod: 'CREDIT',
        paidAmount: 0,
        changeAmount: 0,
        notes: doItem.notes,
        status: 'PENDING',
        customer: {
          id: doItem.customer.id,
          code: doItem.customer.code,
          name: doItem.customer.name,
          phone: doItem.customer.phone,
          address: doItem.customer.address,
          type: 'REGULER',
        },
        cashier: { id: doItem.createdBy.id, name: doItem.createdBy.name, email: '' },
        saleItems: doItem.deliveryItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: 0,
          discount: 0,
          subtotal: 0,
          product: { id: item.productId, code: item.product.code, name: item.product.name },
          unit: { id: item.unitId, name: item.unit.name, symbol: item.unit.symbol },
        })),
      };

      const store = {
        name: 'TB Masdar Utama',
        phone: '6285398346677',
        address: 'Jl. Poros Maros - Pangkep, Maccini Baji, Kec. Lau, Kabupaten Maros, Sulawesi Selatan',
        tagline: 'Distributor Bahan Bangunan Terpercaya',
      };

      // Set layout store temporarily to SURAT_JALAN
      const { updateLayout } = require('../stores/invoice-layout.store').useInvoiceLayoutStore.getState();
      updateLayout({ layoutType: 'SURAT_JALAN' });

      const html = generateInvoiceHtml(mockSale, store);
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Gagal Cetak', 'Gagal memproses cetak berkas Surat Jalan.');
    } finally {
      releasePrintLock();
    }
  };

  const handleShareDO = async (doItem: DeliveryOrder) => {
    if (!acquirePrintLock()) return;
    try {
      const mockSale: Sale = {
        id: doItem.id,
        invoiceNumber: doItem.doNumber,
        customerId: doItem.customerId,
        cashierId: doItem.createdBy.id,
        saleDate: doItem.deliveryDate,
        createdAt: doItem.createdAt,
        updatedAt: doItem.createdAt,
        totalAmount: 0,
        discount: 0,
        tax: 0,
        grandTotal: 0,
        paymentMethod: 'CREDIT',
        paidAmount: 0,
        changeAmount: 0,
        notes: doItem.notes,
        status: 'PENDING',
        customer: {
          id: doItem.customer.id,
          code: doItem.customer.code,
          name: doItem.customer.name,
          phone: doItem.customer.phone,
          address: doItem.customer.address,
          type: 'REGULER',
        },
        cashier: { id: doItem.createdBy.id, name: doItem.createdBy.name, email: '' },
        saleItems: doItem.deliveryItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: 0,
          discount: 0,
          subtotal: 0,
          product: { id: item.productId, code: item.product.code, name: item.product.name },
          unit: { id: item.unitId, name: item.unit.name, symbol: item.unit.symbol },
        })),
      };

      const store = {
        name: 'TB Masdar Utama',
        phone: '6285398346677',
        address: 'Jl. Poros Maros - Pangkep, Maccini Baji, Kec. Lau, Kabupaten Maros, Sulawesi Selatan',
        tagline: 'Distributor Bahan Bangunan Terpercaya',
      };

      const { updateLayout } = require('../stores/invoice-layout.store').useInvoiceLayoutStore.getState();
      updateLayout({ layoutType: 'SURAT_JALAN' });

      const html = generateInvoiceHtml(mockSale, store);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share Surat Jalan ${doItem.doNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e) {
      Alert.alert('Gagal Share', 'Gagal membagikan berkas PDF Surat Jalan.');
    } finally {
      releasePrintLock();
    }
  };

  const addItemToDo = () => {
    if (!selectedProductId || !selectedUnitId || !quantity) {
      Alert.alert('Peringatan', 'Silakan pilih produk, satuan, dan masukkan kuantitas.');
      return;
    }
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const unit = product.productUnits?.find((pu) => pu.unitId === selectedUnitId);
    if (!unit) return;

    const existingIndex = doItems.findIndex(
      (item) => item.productId === selectedProductId && item.unitId === selectedUnitId
    );

    if (existingIndex >= 0) {
      const updated = [...doItems];
      updated[existingIndex].quantity += Number(quantity);
      setDoItems(updated);
    } else {
      setDoItems([
        ...doItems,
        {
          productId: selectedProductId,
          productName: product.name,
          productCode: product.code,
          unitId: selectedUnitId,
          unitName: unit.unit?.name || 'Unit',
          quantity: Number(quantity),
        },
      ]);
    }

    // Reset item input
    setSelectedProduct(null);
    setSelectedUnitId('');
    setQuantity('1');
    setSearchProductQuery('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return Colors.warning;
      case 'IN_TRANSIT':
        return Colors.info;
      case 'DELIVERED':
        return Colors.success;
      case 'CANCELLED':
        return Colors.error;
      default:
        return Colors.textTertiary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Tunda (Pending)';
      case 'IN_TRANSIT':
        return 'Kirim (In Transit)';
      case 'DELIVERED':
        return 'Diterima (Delivered)';
      case 'CANCELLED':
        return 'Dibatalkan (Cancelled)';
      default:
        return status;
    }
  };

  const renderDOItem = ({ item }: { item: DeliveryOrder }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedDO(item);
          setShowDetailsModal(true);
        }}
      >
        <GlassCard padding={16} style={styles.doCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.doNumber}>{item.doNumber}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '15', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>
          
          <Text style={styles.customerName}>{item.customer.name}</Text>
          <Text style={styles.deliveryDate}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textTertiary} /> {new Date(item.deliveryDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={{ gap: 2 }}>
              <Text style={styles.driverInfo}>Sopir: {item.driver || '-'}</Text>
              <Text style={styles.driverInfo}>Mobil: {item.vehicle || '-'}</Text>
            </View>
            <Text style={styles.itemsCount}>{item.deliveryItems.length} Produk</Text>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  const activeProduct = selectedProduct;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PENGIRIMAN & SURAT JALAN</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={Colors.primaryStart} />
        </TouchableOpacity>
      </View>

      {/* Filter & Search */}
      <View style={styles.filterSection}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari No. DO, Pelanggan, Sopir..."
            placeholderTextColor={Colors.textTertiary}
            value={search}
            onChangeText={(text) => {
              setSearch(text);
            }}
            onSubmitEditing={loadData}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFilters}>
          <TouchableOpacity
            style={[styles.filterBadge, statusFilter === '' && styles.filterBadgeActive]}
            onPress={() => setStatusFilter('')}
          >
            <Text style={[styles.filterText, statusFilter === '' && styles.filterTextActive]}>Semua</Text>
          </TouchableOpacity>
          {['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.filterBadge, statusFilter === st && styles.filterBadgeActive]}
              onPress={() => setStatusFilter(st)}
            >
              <Text style={[styles.filterText, statusFilter === st && styles.filterTextActive]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (
        <FlatList
          data={deliveryOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderDOItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="paper-plane-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>Tidak ada data Surat Jalan ditemukan.</Text>
            </View>
          }
        />
      )}

      {/* ─── DO DETAILS MODAL ─── */}
      <Modal visible={showDetailsModal} animationType="slide" onRequestClose={() => setShowDetailsModal(false)}>
        {selectedDO && (
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Detail Surat Jalan</Text>
              <TouchableOpacity onPress={() => handleDeleteDO(selectedDO.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <GlassCard padding={16} style={styles.detailsCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.detailsDoNum}>{selectedDO.doNumber}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedDO.status) + '15', borderColor: getStatusColor(selectedDO.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedDO.status) }]}>{selectedDO.status}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.detailsLabel}>PELANGGAN</Text>
                <Text style={styles.detailsVal}>{selectedDO.customer.name}</Text>
                {selectedDO.customer.phone && <Text style={styles.detailsSubVal}>Telp: {selectedDO.customer.phone}</Text>}
                {selectedDO.customer.address && <Text style={styles.detailsSubVal}>Alamat: {selectedDO.customer.address}</Text>}

                <View style={styles.divider} />

                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.detailsLabel}>TANGGAL KIRIM</Text>
                    <Text style={styles.detailsVal}>
                      {new Date(selectedDO.deliveryDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailsLabel}>PEMBUAT</Text>
                    <Text style={styles.detailsVal}>{selectedDO.createdBy.name}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.detailsLabel}>SOPIR</Text>
                    <Text style={styles.detailsVal}>{selectedDO.driver || '-'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailsLabel}>PLAT MOBIL</Text>
                    <Text style={styles.detailsVal}>{selectedDO.vehicle || '-'}</Text>
                  </View>
                </View>

                {selectedDO.notes && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.detailsLabel}>CATATAN</Text>
                    <Text style={[styles.detailsVal, { fontStyle: 'italic' }]}>"{selectedDO.notes}"</Text>
                  </>
                )}
              </GlassCard>

              {/* Items Card */}
              <Text style={styles.modalSectionTitle}>Daftar Barang Kiriman</Text>
              <GlassCard padding={16} style={styles.detailsCard}>
                {selectedDO.deliveryItems.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.product.name}</Text>
                        <Text style={styles.itemCode}>{item.product.code}</Text>
                      </View>
                      <Text style={styles.itemQty}>{item.quantity} {item.unit?.name}</Text>
                    </View>
                  </View>
                ))}
              </GlassCard>

              {/* Action Buttons */}
              <View style={{ gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
                <GradientButton
                  title="Ubah Status Pengiriman"
                  onPress={() => {
                    setNewStatus(selectedDO.status);
                    setShowStatusModal(true);
                  }}
                  variant="primary"
                  fullWidth
                  icon={<Ionicons name="git-branch-outline" size={20} color="#FFFFFF" />}
                />
                <View style={styles.rowBetween}>
                  <GradientButton
                    title="Cetak Surat Jalan"
                    onPress={() => handlePrintDO(selectedDO)}
                    variant="success"
                    style={{ flex: 1, marginRight: Spacing.sm }}
                    icon={<Ionicons name="print-outline" size={18} color="#FFFFFF" />}
                  />
                  <GradientButton
                    title="Bagikan PDF"
                    onPress={() => handleShareDO(selectedDO)}
                    variant="accent"
                    style={{ flex: 1 }}
                    icon={<Ionicons name="share-social-outline" size={18} color="#FFFFFF" />}
                  />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* ─── UPDATE STATUS MODAL ─── */}
      <Modal visible={showStatusModal} transparent animationType="fade" onRequestClose={() => setShowStatusModal(false)}>
        <View style={styles.statusOverlay}>
          <GlassCard padding={24} style={styles.statusModalCard}>
            <Text style={styles.statusModalTitle}>Ubah Status Surat Jalan</Text>
            
            <View style={styles.statusOptions}>
              {(['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusOptionBtn, newStatus === st && styles.statusOptionBtnActive]}
                  onPress={() => setNewStatus(st)}
                >
                  <Text style={[styles.statusOptionText, newStatus === st && styles.statusOptionTextActive]}>
                    {getStatusLabel(st)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {newStatus === 'DELIVERED' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Penerima *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Masukkan nama penerima barang"
                  placeholderTextColor={Colors.textTertiary}
                  value={receivedBy}
                  onChangeText={setReceivedBy}
                />
              </View>
            )}

            <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
              <GradientButton title="Simpan Status Baru" onPress={handleUpdateStatus} variant="primary" fullWidth />
              <GradientButton title="Batal" onPress={() => setShowStatusModal(false)} variant="outline" fullWidth />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* ─── CREATE DO MODAL ─── */}
      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Buat Surat Jalan Baru</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <GlassCard padding={16} style={styles.createCard}>
              <Text style={styles.formGroupTitle}>Informasi Dokumen</Text>

              {/* Customer Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Pelanggan *</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                    {customers.map((cust) => (
                      <TouchableOpacity
                        key={cust.id}
                        style={[styles.pickerOption, selectedCustomerId === cust.id && styles.pickerOptionActive]}
                        onPress={() => setSelectedCustomerId(cust.id)}
                      >
                        <Text style={[styles.pickerOptionText, selectedCustomerId === cust.id && styles.pickerOptionTextActive]}>
                          {cust.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Link to POS Sale (Optional) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hubungkan ke Transaksi Kredit POS (Opsional)</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                    <TouchableOpacity
                      style={[styles.pickerOption, selectedSaleId === '' && styles.pickerOptionActive]}
                      onPress={() => setSelectedSaleId('')}
                    >
                      <Text style={[styles.pickerOptionText, selectedSaleId === '' && styles.pickerOptionTextActive]}>
                        Tanpa POS
                      </Text>
                    </TouchableOpacity>
                    {salesList.map((sale) => (
                      <TouchableOpacity
                        key={sale.id}
                        style={[styles.pickerOption, selectedSaleId === sale.id && styles.pickerOptionActive]}
                        onPress={() => {
                          setSelectedSaleId(sale.id);
                          if (sale.customerId) {
                            setSelectedCustomerId(sale.customerId);
                          }
                          // Auto populate items from POS sale
                          const autoItems = sale.saleItems?.map((sitem: any) => ({
                            productId: sitem.productId,
                            productName: sitem.product.name,
                            productCode: sitem.product.code,
                            unitId: sitem.unitId,
                            unitName: sitem.unit.name,
                            quantity: sitem.quantity,
                          })) || [];
                          setDoItems(autoItems);
                        }}
                      >
                        <Text style={[styles.pickerOptionText, selectedSaleId === sale.id && styles.pickerOptionTextActive]}>
                          Ref: #{sale.invoiceNumber}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Delivery Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tanggal Pengiriman (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.textInput}
                  value={deliveryDate}
                  onChangeText={setDeliveryDate}
                  placeholder="Contoh: 2026-05-24"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              {/* Driver & Vehicle */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Sopir</Text>
                <TextInput
                  style={styles.textInput}
                  value={driver}
                  onChangeText={setDriver}
                  placeholder="Nama sopir pengantar"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plat Nomor / Nomor Mobil</Text>
                <TextInput
                  style={styles.textInput}
                  value={vehicle}
                  onChangeText={setVehicle}
                  placeholder="Contoh: DD 1234 AB"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Catatan Khusus</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Catatan alamat / barang pecah belah dsb."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                />
              </View>
            </GlassCard>

            {/* DO ITEMS CONTAINER */}
            <Text style={styles.modalSectionTitle}>Daftar Barang Kiriman</Text>
            
            {/* Form Tambah Item */}
            <GlassCard padding={16} style={styles.createCard}>
              <Text style={styles.formGroupTitle}>Tambah Barang ke Surat Jalan</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cari Produk *</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    placeholder="Ketik nama atau kode produk..."
                    placeholderTextColor={Colors.textTertiary}
                    value={searchProductQuery}
                    onChangeText={(text) => {
                      setSearchProductQuery(text);
                      if (text.length > 1) {
                        loadSearchProducts(text);
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
                      style={{ position: 'absolute', right: 12 }}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dropdown list for products search */}
                {loadingProducts ? (
                  <ActivityIndicator size="small" color={Colors.primaryStart} style={{ marginVertical: 8 }} />
                ) : products.length > 0 && !selectedProduct ? (
                  <View style={{
                    backgroundColor: Colors.surface,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: BorderRadius.md,
                    maxHeight: 180,
                    overflow: 'hidden',
                    marginTop: 4,
                  }}>
                    <ScrollView nestedScrollEnabled>
                      {products.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={{
                            padding: Spacing.md,
                            borderBottomWidth: 1,
                            borderColor: Colors.borderLight,
                          }}
                          onPress={() => {
                            setSelectedProduct(p);
                            setSelectedUnitId(p.productUnits?.[0]?.unitId || '');
                            setSearchProductQuery(p.name);
                            setProducts([]);
                          }}
                        >
                          <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary }}>{p.name}</Text>
                          <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 }}>{p.code} (Stok: {p.currentStock})</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Selected Product info card */}
                {selectedProduct && (
                  <GlassCard padding={12} style={{ marginTop: 4 }} tinted>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                      <Ionicons name="cube-outline" size={20} color={Colors.primaryStart} />
                      <View>
                        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary }}>{selectedProduct.name}</Text>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary }}>Stok Tercatat: {selectedProduct.currentStock} unit</Text>
                      </View>
                    </View>
                  </GlassCard>
                )}
              </View>

              {activeProduct && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Pilih Satuan</Text>
                  <View style={styles.pickerContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                      {activeProduct.productUnits?.map((pu) => (
                        <TouchableOpacity
                          key={pu.id}
                          style={[styles.pickerOption, selectedUnitId === pu.unitId && styles.pickerOptionActive]}
                          onPress={() => setSelectedUnitId(pu.unitId)}
                        >
                          <Text style={[styles.pickerOptionText, selectedUnitId === pu.unitId && styles.pickerOptionTextActive]}>
                            {pu.unit?.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}

              <View style={styles.rowBetween}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.inputLabel}>Kuantitas</Text>
                  <TextInput
                    style={styles.textInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                  />
                </View>
                <GradientButton
                  title="Tambah Item"
                  onPress={addItemToDo}
                  variant="primary"
                  style={{ marginTop: 22, height: 46 }}
                />
              </View>
            </GlassCard>

            {/* List Item yang Sudah Ditambahkan */}
            <GlassCard padding={16} style={{ ...styles.createCard, marginTop: Spacing.md }}>
              <Text style={styles.formGroupTitle}>Daftar Item Ditambahkan ({doItems.length})</Text>
              
              {doItems.length === 0 ? (
                <Text style={styles.emptyItemsText}>Belum ada barang dimasukkan.</Text>
              ) : (
                doItems.map((item, index) => (
                  <View key={`${item.productId}-${item.unitId}`}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.productName}</Text>
                        <Text style={styles.itemCode}>{item.productCode} • {item.unitName}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                        <Text style={styles.itemQty}>{item.quantity} {item.unitName}</Text>
                        <TouchableOpacity
                          onPress={() => setDoItems(doItems.filter((_, i) => i !== index))}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </GlassCard>

            {/* Actions */}
            <View style={{ gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
              <GradientButton title="Simpan Surat Jalan (DO)" onPress={handleCreateDO} variant="success" fullWidth />
              <GradientButton title="Batal" onPress={() => setShowCreateModal(false)} variant="outline" fullWidth />
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    padding: 4,
  },
  addBtn: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  // ─── Filter Section ───
  filterSection: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 44,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  statusFilters: {
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  filterBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  filterBadgeActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  filterText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  // ─── List Content ───
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  doCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  doNumber: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
  },
  customerName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  deliveryDate: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  driverInfo: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  itemsCount: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  // ─── Modals Details & Create DO ───
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: Spacing.lg,
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: Spacing.md,
  },
  detailsDoNum: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  detailsLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  detailsVal: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  detailsSubVal: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginVertical: Spacing.md,
    marginLeft: 4,
  },
  itemName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  itemCode: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  itemQty: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  // Status Edit Overlay
  statusOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  statusModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
  },
  statusModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  statusOptions: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statusOptionBtn: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  statusOptionBtnActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  statusOptionText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  statusOptionTextActive: {
    color: '#FFFFFF',
  },
  // Create DO styles
  createCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: Spacing.lg,
  },
  formGroupTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  pickerContainer: {
    height: 40,
  },
  pickerScroll: {
    gap: Spacing.sm,
  },
  pickerOption: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
  },
  pickerOptionActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  pickerOptionText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
  },
  emptyItemsText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
});

export default DeliveryScreen;
