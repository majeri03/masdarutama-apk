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
import { DatePickerInput } from '../components/ui/DatePickerInput';
import { purchaseService } from '../services/purchase.service';
import { masterService } from '../services/master.service';
import { productService } from '../services/product.service';
import { AppToast } from '../utils/toast';
import type { Supplier, Product } from '../types';

interface PurchaseItem {
  id?: string;
  productId: string;
  unitId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  product: { id: string; code: string; name: string };
  unit: { id: string; name: string };
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  adminId: string;
  purchaseDate: string;
  totalAmount: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: string | null;
  notes: string | null;
  status: 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
  receivedDate: string | null;
  createdAt: string;
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  admin: { id: string; name: string; email: string };
  purchaseItems: PurchaseItem[];
}

export const PurchaseScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Details Modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [receivingPO, setReceivingPO] = useState(false);

  // Create PO Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<Date | null>(new Date());
  const [paymentMethod, setPaymentMethod] = useState('CREDIT');
  const [globalDiscount, setGlobalDiscount] = useState('0');
  const [globalTaxPercent, setGlobalTaxPercent] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');

  // Add Item Form
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const selectedProductId = selectedProduct?.id || '';
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');

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
      console.warn('[PURCHASE] Error loading search products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [itemDiscount, setItemDiscount] = useState('0');
  const [poItems, setPoItems] = useState<Array<{
    productId: string;
    productName: string;
    productCode: string;
    unitId: string;
    unitName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
  }>>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await purchaseService.getPurchases({
        search: search || undefined,
        supplierId: undefined,
        status: statusFilter || undefined,
      });
      if (res.success && res.data) {
        setPurchases(res.data as PurchaseOrder[]);
      }
    } catch (e) {
      console.warn('[PURCHASE] Error loading POs:', e);
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
      const [suppRes, prodRes] = await Promise.all([
        masterService.getSuppliers(),
        productService.getProducts({ limit: 100, isActive: true }),
      ]);
      if (suppRes.success && suppRes.data?.suppliers) {
        setSuppliers(suppRes.data.suppliers);
      }
      if (prodRes.success && prodRes.data?.products) {
        setProducts(prodRes.data.products);
      }
    } catch (e) {
      console.warn('[PURCHASE] Error loading master data:', e);
    }
  };

  useEffect(() => {
    if (showCreateModal) {
      loadMasterData();
      setSelectedProduct(null);
      setSearchProductQuery('');
    }
  }, [showCreateModal]);

  // Calculations for creating PO
  const subtotal = poItems.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = Number(globalDiscount || 0);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxPercent = Number(globalTaxPercent || 0);
  const taxAmount = Math.round((afterDiscount * taxPercent) / 100);
  const grandTotal = afterDiscount + taxAmount;
  const remainingDebt = Math.max(0, grandTotal - Number(paidAmount || 0));

  const addItemToPO = () => {
    if (!selectedProductId) {
      AppToast.error('Peringatan', 'Silakan pilih produk terlebih dahulu.');
      return;
    }
    if (!selectedUnitId) {
      AppToast.error('Peringatan', 'Silakan pilih satuan produk.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      AppToast.error('Peringatan', 'Kuantitas harus lebih dari 0.');
      return;
    }
    if (!purchasePrice || purchasePrice === '') {
      AppToast.error('Peringatan', 'Harga beli wajib diisi.');
      return;
    }

    const product = selectedProduct;
    if (!product) return;

    const unit = product.productUnits?.find((pu) => pu.unitId === selectedUnitId);
    if (!unit) {
      AppToast.error('Gagal', 'Satuan produk tidak ditemukan atau produk ini belum diatur satuannya.');
      return;
    }

    const qtyVal = Number(quantity);
    const priceVal = Number(purchasePrice);
    const discVal = Number(itemDiscount || 0);
    const itemSubtotal = qtyVal * priceVal - discVal;

    const existingIndex = poItems.findIndex(
      (item) => item.productId === selectedProductId && item.unitId === selectedUnitId
    );

    if (existingIndex >= 0) {
      const updated = [...poItems];
      updated[existingIndex].quantity += qtyVal;
      updated[existingIndex].subtotal = updated[existingIndex].quantity * priceVal - updated[existingIndex].discount;
      setPoItems(updated);
    } else {
      setPoItems([
        ...poItems,
        {
          productId: selectedProductId,
          productName: product.name,
          productCode: product.code,
          unitId: selectedUnitId,
          unitName: unit.unit?.name || 'Unit',
          quantity: qtyVal,
          unitPrice: priceVal,
          discount: discVal,
          subtotal: itemSubtotal,
        },
      ]);
    }

    // Reset item form
    setSelectedProduct(null);
    setSelectedUnitId('');
    setQuantity('1');
    setPurchasePrice('0');
    setItemDiscount('0');
    setSearchProductQuery('');
  };

  const handleCreatePO = async () => {
    if (!selectedSupplierId) {
      AppToast.error('Peringatan', 'Silakan pilih supplier terlebih dahulu.');
      return;
    }
    if (poItems.length === 0) {
      AppToast.error('Peringatan', 'Masukkan minimal 1 produk barang pesanan.');
      return;
    }

    try {
      const payload = {
        supplierId: selectedSupplierId,
        purchaseDate: purchaseDate ? purchaseDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        discount: discountAmount,
        tax: taxAmount,
        paidAmount: Number(paidAmount || 0),
        paymentMethod: paymentMethod || undefined,
        notes: notes || undefined,
        items: poItems.map((item) => ({
          productId: item.productId,
          unitId: item.unitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,
        })),
      };

      const res = await purchaseService.createPurchase(payload);
      if (res.success) {
        AppToast.success('Sukses', res.message || 'Purchase Order berhasil dibuat!');
        setShowCreateModal(false);
        // Reset form
        setSelectedSupplierId('');
        setPoItems([]);
        setGlobalDiscount('0');
        setGlobalTaxPercent('0');
        setPaidAmount('0');
        setNotes('');
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal membuat Purchase Order.');
      }
    } catch (e) {
      AppToast.error('Error', 'Terjadi kesalahan sistem.');
    }
  };

  const handleReceivePO = (id: string) => {
    Alert.alert(
      'Terima Barang',
      'Apakah Anda yakin barang dari Purchase Order ini sudah diterima dan masuk ke gudang? Stok barang akan bertambah secara otomatis.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Terima Barang',
          onPress: async () => {
            setReceivingPO(true);
            try {
              const res = await purchaseService.receivePurchase(id, new Date().toISOString());
              if (res.success) {
                AppToast.success('Sukses', res.message || 'Barang berhasil masuk gudang!');
                setShowDetailsModal(false);
                setSelectedPO(null);
                loadData();
              } else {
                AppToast.error('Gagal', res.error || 'Gagal memproses penerimaan barang.');
              }
            } catch (e) {
              AppToast.error('Error', 'Terjadi kesalahan sistem.');
            } finally {
              setReceivingPO(false);
            }
          },
        },
      ]
    );
  };

  const handleDeletePO = (id: string) => {
    Alert.alert(
      'Hapus Purchase Order',
      'Apakah Anda yakin ingin menghapus PO ini? Hubungan utang supplier terkait juga akan ikut dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const res = await purchaseService.deletePurchase(id);
            if (res.success) {
              AppToast.success('Sukses', 'Purchase Order berhasil dihapus.');
              setShowDetailsModal(false);
              setSelectedPO(null);
              loadData();
            } else {
              AppToast.error('Gagal', res.error || 'Gagal menghapus PO.');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return Colors.warning;
      case 'RECEIVED':
        return Colors.success;
      case 'PARTIAL':
        return Colors.info;
      case 'CANCELLED':
        return Colors.error;
      default:
        return Colors.textTertiary;
    }
  };

  const renderPOItem = ({ item }: { item: PurchaseOrder }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedPO(item);
          setShowDetailsModal(true);
        }}
      >
        <GlassCard padding={16} style={styles.poCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.poNumber}>{item.poNumber}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '15', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>
          
          <Text style={styles.supplierName}>{item.supplier.name}</Text>
          <Text style={styles.purchaseDate}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textTertiary} /> {new Date(item.purchaseDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={{ gap: 2 }}>
              <Text style={styles.totalLabel}>Total PO</Text>
              <Text style={styles.totalValue}>Rp {item.grandTotal.toLocaleString('id-ID')}</Text>
            </View>
            <Text style={styles.itemsCount}>{item.purchaseItems.length} Barang</Text>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MANAJEMEN PO BARANG</Text>
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
            placeholder="Cari No. PO, Supplier..."
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
          {['PENDING', 'RECEIVED', 'PARTIAL', 'CANCELLED'].map((st) => (
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
          data={purchases}
          keyExtractor={(item) => item.id}
          renderItem={renderPOItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />
          }
          
          // Optimasi FlatList
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}

          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>Tidak ada data Purchase Order ditemukan.</Text>
            </View>
          }
        />
      )}

      {/* ─── PO DETAILS MODAL ─── */}
      <Modal visible={showDetailsModal} animationType="slide" onRequestClose={() => setShowDetailsModal(false)}>
        {selectedPO && (
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Detail Purchase Order</Text>
              {selectedPO.status === 'PENDING' ? (
                <TouchableOpacity onPress={() => handleDeletePO(selectedPO.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <GlassCard padding={16} style={styles.detailsCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.detailsPoNum}>{selectedPO.poNumber}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedPO.status) + '15', borderColor: getStatusColor(selectedPO.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedPO.status) }]}>{selectedPO.status}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.detailsLabel}>SUPPLIER</Text>
                <Text style={styles.detailsVal}>{selectedPO.supplier.name}</Text>
                {selectedPO.supplier.phone && <Text style={styles.detailsSubVal}>Telp: {selectedPO.supplier.phone}</Text>}
                {selectedPO.supplier.address && <Text style={styles.detailsSubVal}>Alamat: {selectedPO.supplier.address}</Text>}

                <View style={styles.divider} />

                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.detailsLabel}>TANGGAL PO</Text>
                    <Text style={styles.detailsVal}>
                      {new Date(selectedPO.purchaseDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailsLabel}>ADMIN PEMBUAT</Text>
                    <Text style={styles.detailsVal}>{selectedPO.admin.name}</Text>
                  </View>
                </View>

                {selectedPO.notes && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.detailsLabel}>CATATAN</Text>
                    <Text style={[styles.detailsVal, { fontStyle: 'italic' }]}>"{selectedPO.notes}"</Text>
                  </>
                )}
              </GlassCard>

              {/* Items Card */}
              <Text style={styles.modalSectionTitle}>Daftar Barang Pesanan</Text>
              <GlassCard padding={16} style={styles.detailsCard}>
                {selectedPO.purchaseItems.map((item, index) => (
                  <View key={item.id || index}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={styles.itemName}>{item.product.name}</Text>
                        <Text style={styles.itemCode}>{item.product.code} • {item.unit?.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flex: 1 }}>
                        <Text style={styles.itemQty}>{item.quantity} {item.unit?.name}</Text>
                        <Text style={styles.itemPrice}>@Rp {item.unitPrice.toLocaleString('id-ID')}</Text>
                        <Text style={styles.itemSub}>Sub: Rp {item.subtotal.toLocaleString('id-ID')}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </GlassCard>

              {/* Financial Totals Card */}
              <GlassCard padding={16} style={styles.detailsCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.totalRowLabel}>Total Sebelum Diskon</Text>
                  <Text style={styles.totalRowVal}>Rp {selectedPO.totalAmount.toLocaleString('id-ID')}</Text>
                </View>
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Text style={[styles.totalRowLabel, { color: Colors.error }]}>Diskon PO</Text>
                  <Text style={[styles.totalRowVal, { color: Colors.error }]}>-Rp {selectedPO.discount.toLocaleString('id-ID')}</Text>
                </View>
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Text style={styles.totalRowLabel}>Pajak</Text>
                  <Text style={styles.totalRowVal}>Rp {selectedPO.tax.toLocaleString('id-ID')}</Text>
                </View>
                <View style={[styles.divider, { marginVertical: Spacing.sm }]} />
                <View style={styles.rowBetween}>
                  <Text style={[styles.totalRowLabel, { fontWeight: 'bold', fontSize: FontSize.md }]}>GRAND TOTAL PO</Text>
                  <Text style={[styles.totalRowVal, { fontWeight: 'bold', fontSize: FontSize.md, color: Colors.primaryStart }]}>
                    Rp {selectedPO.grandTotal.toLocaleString('id-ID')}
                  </Text>
                </View>
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Text style={styles.totalRowLabel}>Jumlah Dibayar</Text>
                  <Text style={styles.totalRowVal}>Rp {selectedPO.paidAmount.toLocaleString('id-ID')}</Text>
                </View>
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Text style={[styles.totalRowLabel, { color: Colors.warning, fontWeight: 'semibold' }]}>Kekurangan (Hutang)</Text>
                  <Text style={[styles.totalRowVal, { color: Colors.warning, fontWeight: 'bold' }]}>
                    Rp {(selectedPO.grandTotal - selectedPO.paidAmount).toLocaleString('id-ID')}
                  </Text>
                </View>
              </GlassCard>

              {/* Action Buttons */}
              <View style={{ gap: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing['3xl'] }}>
                {selectedPO.status === 'PENDING' && (
                  <GradientButton
                    title={receivingPO ? 'Memproses...' : 'Konfirmasi Penerimaan Barang'}
                    onPress={() => handleReceivePO(selectedPO.id)}
                    variant="success"
                    fullWidth
                    loading={receivingPO}
                    icon={<Ionicons name="checkbox-outline" size={20} color="#FFFFFF" />}
                  />
                )}
                <GradientButton
                  title="Tutup Detail"
                  onPress={() => setShowDetailsModal(false)}
                  variant="outline"
                  fullWidth
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* ─── CREATE PO MODAL ─── */}
      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Buat PO Barang Baru</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <GlassCard padding={16} style={styles.createCard}>
              <Text style={styles.formGroupTitle}>Informasi PO</Text>

              {/* Supplier Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Pilih Supplier *</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                    {suppliers.map((supp) => (
                      <TouchableOpacity
                        key={supp.id}
                        style={[styles.pickerOption, selectedSupplierId === supp.id && styles.pickerOptionActive]}
                        onPress={() => setSelectedSupplierId(supp.id)}
                      >
                        <Text style={[styles.pickerOptionText, selectedSupplierId === supp.id && styles.pickerOptionTextActive]}>
                          {supp.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tanggal PO *</Text>
                <DatePickerInput
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  placeholder="Pilih Tanggal PO"
                  iconSize={20}
                  style={{height: 48, paddingHorizontal: 12}}
                />
              </View>

              {/* Payment Method */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Metode Pembayaran *</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                    {['CREDIT', 'CASH', 'TRANSFER'].map((method) => (
                      <TouchableOpacity
                        key={method}
                        style={[styles.pickerOption, paymentMethod === method && styles.pickerOptionActive]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Text style={[styles.pickerOptionText, paymentMethod === method && styles.pickerOptionTextActive]}>
                          {method === 'CREDIT' ? 'Hutang / Tempo' : method}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Catatan PO</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Keterangan PO barang dsb."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                />
              </View>
            </GlassCard>

            {/* ADD PRODUCTS TO PO */}
            <Text style={styles.modalSectionTitle}>Tambah Barang Ke PO</Text>
            
            <GlassCard padding={16} style={styles.createCard}>
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
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
                <View style={{ flex: 1.5, marginRight: Spacing.sm }}>
                  <Text style={styles.inputLabel}>Harga Beli (Rp)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={[styles.rowBetween, { marginTop: Spacing.md }]}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.inputLabel}>Diskon Item (Rp)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={itemDiscount}
                    onChangeText={setItemDiscount}
                    keyboardType="numeric"
                  />
                </View>
                <GradientButton
                  title="Tambah"
                  onPress={addItemToPO}
                  variant="primary"
                  style={{ marginTop: 22, height: 46 }}
                />
              </View>
            </GlassCard>

            {/* List Item yang Sudah Ditambahkan */}
            <GlassCard padding={16} style={{ ...styles.createCard, marginTop: Spacing.md }}>
              <Text style={styles.formGroupTitle}>Daftar Barang Ditambahkan ({poItems.length})</Text>
              
              {poItems.length === 0 ? (
                <Text style={styles.emptyItemsText}>Belum ada barang dimasukkan.</Text>
              ) : (
                poItems.map((item, index) => (
                  <View key={`${item.productId}-${item.unitId}`}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={styles.itemName}>{item.productName}</Text>
                        <Text style={styles.itemCode}>{item.productCode} • {item.unitName}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flex: 1, marginRight: Spacing.sm }}>
                        <Text style={styles.itemQty}>{item.quantity} {item.unitName}</Text>
                        <Text style={styles.itemPrice}>@Rp {item.unitPrice.toLocaleString('id-ID')}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setPoItems(poItems.filter((_, i) => i !== index))}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </GlassCard>

            {/* Financial Calculations */}
            <GlassCard padding={16} style={styles.createCard}>
              <Text style={styles.formGroupTitle}>Rincian Finansial</Text>
              
              <View style={styles.rowBetween}>
                <Text style={styles.totalRowLabel}>Subtotal</Text>
                <Text style={styles.totalRowVal}>Rp {subtotal.toLocaleString('id-ID')}</Text>
              </View>

              <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
                <Text style={styles.inputLabel}>Diskon Global (Rp)</Text>
                <TextInput
                  style={[styles.textInput, { width: 140, height: 38, textAlign: 'right' }]}
                  value={globalDiscount}
                  onChangeText={setGlobalDiscount}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
                <Text style={styles.inputLabel}>Pajak (%)</Text>
                <TextInput
                  style={[styles.textInput, { width: 140, height: 38, textAlign: 'right' }]}
                  value={globalTaxPercent}
                  onChangeText={setGlobalTaxPercent}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.divider, { marginVertical: Spacing.sm }]} />

              <View style={styles.rowBetween}>
                <Text style={[styles.totalRowLabel, { fontWeight: 'bold' }]}>Grand Total</Text>
                <Text style={[styles.totalRowVal, { fontWeight: 'bold', color: Colors.primaryStart }]}>
                  Rp {grandTotal.toLocaleString('id-ID')}
                </Text>
              </View>

              <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
                <Text style={styles.inputLabel}>Dibayar (Rp)</Text>
                <TextInput
                  style={[styles.textInput, { width: 140, height: 38, textAlign: 'right' }]}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
                <Text style={[styles.totalRowLabel, { color: Colors.warning }]}>Kekurangan (Hutang)</Text>
                <Text style={[styles.totalRowVal, { color: Colors.warning, fontWeight: 'bold' }]}>
                  Rp {remainingDebt.toLocaleString('id-ID')}
                </Text>
              </View>
            </GlassCard>

            {/* Actions */}
            <View style={{ gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
              <GradientButton title="Simpan Purchase Order" onPress={handleCreatePO} variant="success" fullWidth />
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
  poCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  poNumber: {
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
  supplierName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  purchaseDate: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  totalLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
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
  detailsPoNum: {
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
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  itemPrice: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  itemSub: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  totalRowLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  totalRowVal: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  // Create PO styles
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

export default PurchaseScreen;
