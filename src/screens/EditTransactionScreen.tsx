import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, BorderRadius, Spacing } from '../constants/theme';
import api from '../services/api';
import { salesService } from '../services/sales.service';
import { productService } from '../services/product.service';
import { AppToast } from '../utils/toast';
import { useNavigation, useRoute } from '@react-navigation/native';

interface EditItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  // productUnitId adalah ID row di tabel ProductUnit (bukan unitId/Unit.id)
  productUnitId: string;
  unitId: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  availableUnits: Array<{
    id: string;       // ProductUnit.id
    unitId: string;   // Unit.id
    unit: { name: string; symbol: string | null };
    sellPrice: number;
    isPrimary: boolean;
  }>;
}

export const EditTransactionScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { saleId } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [saleData, setSaleData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [items, setItems] = useState<EditItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');

  const [showProductModal, setShowProductModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch produk dan customer dulu, baru fetch sale agar availableUnits tersedia
      const [custRes, prodRes] = await Promise.all([
        api.get('/api/customers'),
        productService.getProducts({ limit: 500, isActive: true })
      ]);

      const loadedCustomers = custRes.data?.success ? custRes.data.data : [];
      const loadedProducts = prodRes.success && prodRes.data?.products ? prodRes.data.products : [];

      setCustomers(loadedCustomers);
      setAllProducts(loadedProducts);

      // Sekarang fetch sale - produk sudah tersedia di closure
      const saleRes = await salesService.getSaleById(saleId);

      if (saleRes.success && saleRes.data) {
        const sd = saleRes.data;
        setSaleData(sd);
        setSelectedCustomerId(sd.customerId || '');
        setPaymentMethod(sd.paymentMethod || 'CASH');
        setPaidAmount(String(sd.paidAmount ?? 0));
        setNotes(sd.notes || '');

        // Map sale items → resolve productUnitId & availableUnits dari data produk
        const mappedItems: EditItem[] = sd.saleItems.map((si: any) => {
          const matchedProduct = loadedProducts.find((p: any) => p.id === si.productId);
          const availableUnits = matchedProduct?.productUnits ?? [];
          
          // Cari ProductUnit.id yang cocok berdasarkan unitId (Unit.id)
          const matchedPU = availableUnits.find((pu: any) => pu.unitId === si.unitId);
          const productUnitId = matchedPU?.id ?? '';
          const unitName = matchedPU?.unit?.name ?? si.unit?.name ?? '';

          return {
            id: si.id,
            productId: si.productId,
            productName: si.product?.name ?? '',
            productCode: si.product?.code ?? '',
            productUnitId,
            unitId: si.unitId,
            unitName,
            quantity: si.quantity,
            unitPrice: si.unitPrice,
            discount: si.discount,
            subtotal: si.subtotal,
            availableUnits,
          };
        });
        setItems(mappedItems);
      } else {
        AppToast.error('Error', 'Gagal memuat data transaksi');
        navigation.goBack();
      }
    } catch (e) {
      console.error('[EditTransaction] fetchInitialData:', e);
      AppToast.error('Error', 'Gagal memuat data');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleAddProduct = (product: any) => {
    const primaryUnit = product.productUnits.find((u: any) => u.isPrimary) || product.productUnits[0];
    if (!primaryUnit) {
      AppToast.error('Error', 'Produk tidak memiliki satuan yang valid');
      return;
    }
    const newItem: EditItem = {
      id: `new-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      productCode: product.code,
      productUnitId: primaryUnit.id,
      unitId: primaryUnit.unitId,
      unitName: primaryUnit.unit?.name ?? '',
      quantity: 1,
      unitPrice: Number(primaryUnit.sellPrice) || 0,
      discount: 0,
      subtotal: Number(primaryUnit.sellPrice) || 0,
      availableUnits: product.productUnits,
    };
    setItems(prev => [...prev, newItem]);
    setShowProductModal(false);
    setProductSearch('');
  };

  const updateItemUnit = (index: number, pu: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productUnitId: pu.id,
        unitId: pu.unitId,
        unitName: pu.unit?.name ?? '',
        unitPrice: Number(pu.sellPrice) || updated[index].unitPrice,
        subtotal: updated[index].quantity * (Number(pu.sellPrice) || updated[index].unitPrice) - updated[index].discount,
      };
      return updated;
    });
  };

  const updateItemField = (index: number, field: 'quantity' | 'unitPrice' | 'discount', rawValue: string) => {
    const value = Number(rawValue) || 0;
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      item.subtotal = Math.max(0, item.quantity * item.unitPrice - item.discount);
      updated[index] = item;
      return updated;
    });
  };

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const totalDiscount = items.reduce((sum, i) => sum + i.discount, 0);
  const grandTotal = Math.max(0, totalAmount - totalDiscount);

  const handleSubmit = async () => {
    if (!selectedCustomerId) return AppToast.error('Peringatan', 'Pilih customer terlebih dahulu');
    if (items.length === 0) return AppToast.error('Peringatan', 'Tambahkan minimal 1 barang');

    const missingUnit = items.find(i => !i.productUnitId);
    if (missingUnit) {
      return AppToast.error('Peringatan', `Satuan produk "${missingUnit.productName}" tidak valid`);
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: selectedCustomerId,
        paymentMethod,
        totalAmount,
        discount: totalDiscount,
        tax: 0,
        grandTotal,
        paidAmount: Number(paidAmount),
        changeAmount: Math.max(0, Number(paidAmount) - grandTotal),
        notes,
        items: items.map(i => ({
          productId: i.productId,
          productUnitId: i.productUnitId,   // ID row ProductUnit yang benar
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          subtotal: i.subtotal,
        })),
      };

      const res = await api.put(`/api/sales/${saleId}`, payload);
      if (res.data.success) {
        AppToast.success('Berhasil', res.data.message || 'Transaksi berhasil diedit');
        navigation.goBack();
      } else {
        AppToast.error('Gagal', res.data.error || res.data.message || 'Terjadi kesalahan');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || 'Terjadi kesalahan saat menyimpan';
      AppToast.error('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primaryStart} />
        <Text style={{ marginTop: 12, color: Colors.textSecondary }}>Memuat data transaksi...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>Edit Transaksi</Text>
          {saleData && <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary }}>{saleData.invoiceNumber}</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* Customer */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.label}>Customer</Text>
            <TouchableOpacity onPress={() => setShowCustomerModal(true)}>
              <Text style={{ color: Colors.primaryStart, fontWeight: 'bold', fontSize: FontSize.sm }}>Ubah</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 6, color: Colors.textPrimary }}>
            {customers.find(c => c.id === selectedCustomerId)?.name || '— Belum dipilih —'}
          </Text>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.label}>Daftar Barang</Text>
            <TouchableOpacity onPress={() => setShowProductModal(true)} style={styles.addBtn}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: 'bold' }}>Tambah</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 && (
            <Text style={{ textAlign: 'center', color: Colors.textTertiary, paddingVertical: 16 }}>Belum ada barang. Tap "Tambah" di atas.</Text>
          )}

          {items.map((item, idx) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: FontSize.sm }}>{item.productName}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary }}>{item.productCode}</Text>
                </View>
                <TouchableOpacity onPress={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>

              {/* Unit selector */}
              {item.availableUnits.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
                  {item.availableUnits.map(pu => (
                    <TouchableOpacity
                      key={pu.id}
                      style={[styles.unitChip, item.productUnitId === pu.id && styles.unitChipActive]}
                      onPress={() => updateItemUnit(idx, pu)}
                    >
                      <Text style={[styles.unitChipText, item.productUnitId === pu.id && styles.unitChipTextActive]}>
                        {pu.unit?.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {item.availableUnits.length === 1 && (
                <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 }}>Satuan: {item.unitName}</Text>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Qty</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(item.quantity)}
                    onChangeText={(t) => updateItemField(idx, 'quantity', t)}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.smallLabel}>Harga Satuan</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(item.unitPrice)}
                    onChangeText={(t) => updateItemField(idx, 'unitPrice', t)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Diskon</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(item.discount)}
                    onChangeText={(t) => updateItemField(idx, 'discount', t)}
                  />
                </View>
              </View>
              <Text style={{ marginTop: 6, textAlign: 'right', fontWeight: 'bold', color: Colors.primaryStart }}>
                Subtotal: Rp {item.subtotal.toLocaleString('id-ID')}
              </Text>
            </View>
          ))}
        </View>

        {/* Pembayaran */}
        <View style={styles.card}>
          <Text style={styles.label}>Metode Pembayaran</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Tunai', value: 'CASH' },
              { label: 'Piutang', value: 'CREDIT' },
              { label: 'Transfer', value: 'TRANSFER' },
              { label: 'QRIS', value: 'QRIS' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.methodBtn, paymentMethod === opt.value && styles.methodBtnActive]}
                onPress={() => setPaymentMethod(opt.value)}
              >
                <Text style={[styles.methodBtnText, paymentMethod === opt.value && styles.methodBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Jumlah Dibayar</Text>
            <TextInput
              style={[styles.input, { marginTop: 4 }]}
              keyboardType="numeric"
              value={paidAmount}
              onChangeText={setPaidAmount}
              placeholder="0"
            />
          </View>
        </View>

        {/* Catatan */}
        <View style={styles.card}>
          <Text style={styles.label}>Catatan</Text>
          <TextInput
            style={[styles.input, { marginTop: 4, minHeight: 60, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Catatan tambahan..."
            multiline
          />
        </View>

        {/* Summary */}
        <View style={[styles.card, { backgroundColor: Colors.primaryStart + '15' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.textSecondary }}>Subtotal</Text>
            <Text>Rp {totalAmount.toLocaleString('id-ID')}</Text>
          </View>
          {totalDiscount > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: Colors.textSecondary }}>Total Diskon</Text>
              <Text style={{ color: Colors.error }}>- Rp {totalDiscount.toLocaleString('id-ID')}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: FontSize.md }}>Grand Total</Text>
            <Text style={{ fontWeight: 'bold', fontSize: FontSize.md, color: Colors.primaryStart }}>
              Rp {grandTotal.toLocaleString('id-ID')}
            </Text>
          </View>
          {Number(paidAmount) > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: Colors.textSecondary }}>Kembalian</Text>
              <Text style={{ color: Colors.success }}>
                Rp {Math.max(0, Number(paidAmount) - grandTotal).toLocaleString('id-ID')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Tombol Simpan */}
      <View style={{ padding: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderColor: Colors.border }}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: FontSize.md }}>Simpan Perubahan</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Modal Pilih Produk */}
      <Modal visible={showProductModal} animationType="slide" onRequestClose={() => setShowProductModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowProductModal(false); setProductSearch(''); }}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Pilih Produk</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama / kode produk..."
              value={productSearch}
              onChangeText={setProductSearch}
              autoFocus
            />
          </View>
          <ScrollView>
            {filteredProducts.map(p => (
              <TouchableOpacity
                key={p.id}
                style={{ padding: 16, borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => handleAddProduct(p)}
              >
                <View>
                  <Text style={{ fontWeight: 'bold', color: Colors.textPrimary }}>{p.name}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary }}>{p.code} · Stok: {p.currentStock}</Text>
                </View>
                <Ionicons name="add-circle" size={24} color={Colors.primaryStart} />
              </TouchableOpacity>
            ))}
            {filteredProducts.length === 0 && (
              <Text style={{ textAlign: 'center', padding: 24, color: Colors.textTertiary }}>Produk tidak ditemukan</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Pilih Customer */}
      <Modal visible={showCustomerModal} animationType="slide" onRequestClose={() => setShowCustomerModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Pilih Customer</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama customer..."
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoFocus
            />
          </View>
          <ScrollView>
            {filteredCustomers.map(c => (
              <TouchableOpacity
                key={c.id}
                style={{ padding: 16, borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => { setSelectedCustomerId(c.id); setShowCustomerModal(false); setCustomerSearch(''); }}
              >
                <View>
                  <Text style={{ fontWeight: 'bold', color: Colors.textPrimary }}>{c.name}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary }}>{c.phone || 'No HP kosong'}</Text>
                </View>
                {c.id === selectedCustomerId && <Ionicons name="checkmark-circle" size={22} color={Colors.primaryStart} />}
              </TouchableOpacity>
            ))}
            {filteredCustomers.length === 0 && (
              <Text style={{ textAlign: 'center', padding: 24, color: Colors.textTertiary }}>Customer tidak ditemukan</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.textPrimary },
  card: { padding: 16, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  label: { fontWeight: 'bold', fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: 4 },
  smallLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.surfaceLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: FontSize.sm, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryStart, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, gap: 4 },
  saveBtn: { backgroundColor: Colors.primaryStart, padding: 16, borderRadius: 10 },
  itemCard: { padding: 12, backgroundColor: Colors.surfaceLight, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  unitChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  unitChipActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  unitChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  unitChipTextActive: { color: '#fff', fontWeight: 'bold' },
  methodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  methodBtnActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  methodBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  methodBtnTextActive: { color: '#fff', fontWeight: 'bold' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  modalTitle: { fontSize: FontSize.md, fontWeight: 'bold', color: Colors.textPrimary },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 12, height: 44, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 8 },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
});
