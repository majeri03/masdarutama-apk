import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../stores/cart.store';
import { productService } from '../services/product.service';
import { masterService } from '../services/master.service';
import { salesService, CheckoutPayload } from '../services/sales.service';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import type { Product, Category, Customer, CartItem, PaymentMethod } from '../types';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { printInvoice, shareInvoicePdf } from '../utils/invoicePdf';

export const POSScreen: React.FC = () => {
  const {
    items,
    selectedCustomerId,
    discount,
    notes,
    addItem,
    removeItem,
    updateQuantity,
    updateItemDiscount,
    updateItemUnit,
    setCustomer,
    setDiscount,
    setNotes,
    clearCart,
    getCalculation,
  } = useCartStore();

  // Component States
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cart & Checkout Modals
  const [showCartModal, setShowCartModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [processingCheckout, setProcessingCheckout] = useState(false);

  // Unit Selection Modal for adding item
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [activeProductForUnit, setActiveProductForUnit] = useState<Product | null>(null);

  // Scanner States
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Add Customer States
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Checkout Success Modal States
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdSale, setCreatedSale] = useState<any | null>(null);

  const navigation = useNavigation<any>();

  // Handle hardware back button navigation
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (showScanner) {
          setShowScanner(false);
          return true;
        }
        if (showAddCustomer) {
          setShowAddCustomer(false);
          return true;
        }
        if (showSuccessModal) {
          setShowSuccessModal(false);
          setCreatedSale(null);
          return true;
        }
        if (showCheckoutModal) {
          setShowCheckoutModal(false);
          return true;
        }
        if (showCartModal) {
          setShowCartModal(false);
          return true;
        }
        if (showUnitModal) {
          setShowUnitModal(false);
          setActiveProductForUnit(null);
          return true;
        }
        navigation.navigate('Dashboard');
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [navigation, showScanner, showAddCustomer, showSuccessModal, showCheckoutModal, showCartModal, showUnitModal, activeProductForUnit])
  );

  // Automatically select default customer when list is loaded or selectedCustomerId is cleared
  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      const regulerCust = customers.find((c) => c.type === 'REGULER') || customers.find((c) => c.code === 'CUST-001') || customers[0];
      if (regulerCust) {
        setCustomer(regulerCust.id);
      }
    }
  }, [selectedCustomerId, customers]);

  // Fetch initial data
  const loadInitialData = async (selectCustomerId?: string) => {
    try {
      const [catRes, custRes] = await Promise.all([
        productService.getCategories(),
        masterService.getCustomers(),
      ]);

      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
      if (custRes.success && custRes.data?.customers) {
        setCustomers(custRes.data.customers);
        
        if (selectCustomerId) {
          setCustomer(selectCustomerId);
        }
      }
    } catch (e) {
      console.warn('[POS] Error loading master data:', e);
    }
  };

  const loadProducts = async (search = '', catId = null, pageNum = 1, resetList = true) => {
    if (pageNum === 1) {
      setLoadingProducts(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await productService.getProducts({
        search: search || undefined,
        categoryId: catId || undefined,
        isActive: true,
        page: pageNum,
        limit: 16,
      });
      if (res.success && res.data) {
        const fetchedProducts = res.data.products;
        if (resetList || pageNum === 1) {
          setProducts(fetchedProducts);
        } else {
          setProducts((prev) => [...prev, ...fetchedProducts]);
        }
        if (res.data.pagination) {
          setTotalPages(res.data.pagination.totalPages || 1);
        }
      }
    } catch (e) {
      console.warn('[POS] Error loading products:', e);
    } finally {
      setLoadingProducts(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    setPage(1);
    loadProducts(text, selectedCategory as any, 1, true);
  };

  const handleCategorySelect = (catId: string | null) => {
    setSelectedCategory(catId);
    setPage(1);
    loadProducts(searchQuery, catId as any, 1, true);
  };

  const loadMore = () => {
    if (!loadingMore && page < totalPages) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadProducts(searchQuery, selectedCategory as any, nextPage, false);
    }
  };

  const triggerAddItem = (product: Product) => {
    const units = product.productUnits || [];
    if (units.length > 1) {
      // Show modal to choose unit
      setActiveProductForUnit(product);
      setShowUnitModal(true);
    } else if (units.length === 1) {
      // Add immediately with primary unit
      addItem(product, units[0].unitId);
    } else {
      Alert.alert('Eror', 'Produk tidak memiliki unit penjualan.');
    }
  };

  const handleSelectUnitAndAdd = (unitId: string) => {
    if (activeProductForUnit) {
      addItem(activeProductForUnit, unitId);
    }
    setShowUnitModal(false);
    setActiveProductForUnit(null);
  };

  const calculation = getCalculation();

  // Camera handler
  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    setSearchQuery(data);
    loadProducts(data);
    setShowScanner(false);
  };

  const openScanner = () => {
    if (!permission) {
      requestPermission();
    } else if (!permission.granted) {
      Alert.alert('Izin Kamera', 'Aplikasi membutuhkan izin untuk menggunakan kamera.');
      requestPermission();
      return;
    }
    setScanned(false);
    setShowScanner(true);
  };

  // Add Customer handler
  const handleSaveCustomer = async () => {
    if (!newCustomerName) {
      Alert.alert('Peringatan', 'Nama pelanggan wajib diisi.');
      return;
    }
    setSavingCustomer(true);
    try {
      const res = await masterService.createCustomer({
        name: newCustomerName,
        phone: newCustomerPhone,
        type: 'REGULER',
      } as any);
      if (res.success && res.data) {
        Alert.alert('Sukses', 'Pelanggan berhasil ditambahkan');
        setShowAddCustomer(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        loadInitialData(res.data.id); // Refresh & select newly added customer
      } else {
        Alert.alert('Gagal', res.error || 'Gagal menambahkan pelanggan');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleCheckoutSubmit = async () => {
    const payNum = Number(paidAmount || 0);
    if (paymentMethod === 'CASH' && payNum < calculation.grandTotal) {
      Alert.alert('Perhatian', 'Jumlah bayar kurang dari total belanja.');
      return;
    }

    if (paymentMethod === 'CREDIT' && payNum > calculation.grandTotal) {
      Alert.alert('Perhatian', 'Jumlah DP tidak boleh melebihi grand total.');
      return;
    }

    // Validasi customer wajib dipilih
    if (!selectedCustomerId) {
      Alert.alert('Perhatian', 'Silakan pilih pelanggan terlebih dahulu.');
      return;
    }

    // Hitung paidAmount (DP untuk Credit, Jumlah bayar untuk Cash, Grand total untuk yang lain)
    let effectivePaid = calculation.grandTotal;
    let changeAmount = 0;

    if (paymentMethod === 'CASH') {
      effectivePaid = payNum;
      changeAmount = Math.max(0, payNum - calculation.grandTotal);
    } else if (paymentMethod === 'CREDIT') {
      effectivePaid = payNum; // DP
      changeAmount = 0;
    }

    setProcessingCheckout(true);
    try {
      const payload: CheckoutPayload = {
        customerId: selectedCustomerId,
        items: items.map((item) => ({
          productId: item.productId,
          productUnitId: item.productUnitId, // ← KRITIS: pakai productUnitId dari CartItem
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,           // ← KRITIS: sudah dihitung di cart.store
        })),
        totalAmount: calculation.subtotal,   // ← KRITIS: total sebelum diskon global & pajak
        discount,
        tax: calculation.tax,
        grandTotal: calculation.grandTotal,  // ← KRITIS: final total
        paymentMethod,
        paidAmount: effectivePaid,
        changeAmount,                        // ← KRITIS: kembalian
        notes: notes || undefined,
      };

      const res = await salesService.checkout(payload);
      if (res.success && res.data) {
        // Fetch full sale detail including cashier/customer/items for printing
        try {
          const detailRes = await salesService.getSaleById(res.data.id);
          if (detailRes.success && detailRes.data) {
            setCreatedSale(detailRes.data);
          } else {
            setCreatedSale(res.data);
          }
        } catch (detailErr) {
          setCreatedSale(res.data);
        }

        clearCart();
        setPaidAmount('');
        setShowCheckoutModal(false);
        setShowCartModal(false);
        loadProducts(); // Refresh stock
        setShowSuccessModal(true); // Open success modal
      } else {
        Alert.alert('Gagal', res.error || 'Transaksi gagal diproses.');
      }
    } catch (e) {
      Alert.alert('Eror', 'Terjadi kesalahan sistem.');
    } finally {
      setProcessingCheckout(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search & Category Header */}
      <View style={styles.header}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari barcode / nama produk..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          <TouchableOpacity onPress={openScanner}>
            <Ionicons name="barcode-outline" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Categories Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          <TouchableOpacity
            style={[
              styles.categoryBadge,
              selectedCategory === null && styles.categoryBadgeActive,
            ]}
            onPress={() => handleCategorySelect(null)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === null && styles.categoryTextActive,
              ]}
            >
              Semua
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryBadge,
                selectedCategory === cat.id && styles.categoryBadgeActive,
              ]}
              onPress={() => handleCategorySelect(cat.id)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat.id && styles.categoryTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Products Grid */}
      {loadingProducts ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.productsList}
          renderItem={({ item }) => {
            const primaryUnit = item.productUnits?.find((pu) => pu.isPrimary) || item.productUnits?.[0];
            const imageUrl = item.productImages && item.productImages.length > 0 ? item.productImages[0].imageUrl : null;
            return (
              <View style={styles.productCardWrapper}>
                <GlassCard padding={12} style={styles.productCard}>
                  <View style={styles.productIconBg}>
                    {imageUrl ? (
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="cube-outline" size={28} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.productCode} numberOfLines={1}>
                    {item.code}
                  </Text>
                  <Text style={styles.productPrice}>
                    Rp {primaryUnit ? primaryUnit.sellPrice.toLocaleString('id-ID') : '0'}
                    <Text style={styles.unitNameText}>
                      /{primaryUnit?.unit?.name || 'unit'}
                    </Text>
                  </Text>
                  <Text
                    style={[
                      styles.productStock,
                      item.currentStock <= item.minStock && { color: Colors.error },
                    ]}
                  >
                    Stok: {item.currentStock}
                  </Text>

                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => triggerAddItem(item)}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                    <Text style={styles.addButtonText}>Tambah</Text>
                  </TouchableOpacity>
                </GlassCard>
              </View>
            );
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 16 }} />
            ) : null
          }
        />
      )}

      {/* Footer Cart Bar (Sticky Bottom) */}
      {items.length > 0 && (
        <View style={styles.cartFooter}>
          <View style={styles.cartFooterLeft}>
            <View style={styles.cartIconWrapper}>
              <Ionicons name="cart-outline" size={24} color="#FFFFFF" />
              <View style={styles.cartBadgeCount}>
                <Text style={styles.cartBadgeCountText}>{items.length}</Text>
              </View>
            </View>
            <View>
              <Text style={styles.cartFooterLabel}>Total Pembayaran</Text>
              <Text style={styles.cartFooterTotal}>
                Rp {calculation.grandTotal.toLocaleString('id-ID')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.cartFooterButton}
            onPress={() => setShowCartModal(true)}
          >
            <Text style={styles.cartFooterButtonText}>Tinjau Keranjang</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* --- UNIT SELECTION MODAL --- */}
      <Modal visible={showUnitModal} transparent animationType="fade" onRequestClose={() => { setShowUnitModal(false); setActiveProductForUnit(null); }}>
        <View style={styles.modalOverlay}>
          <GlassCard padding={24} style={styles.unitModalCard}>
            <Text style={styles.modalTitle}>Pilih Satuan</Text>
            <Text style={styles.modalSubtitle}>
              Pilih satuan penjualan untuk produk {activeProductForUnit?.name}
            </Text>
            <View style={styles.unitList}>
              {activeProductForUnit?.productUnits?.map((pu) => (
                <TouchableOpacity
                  key={pu.id}
                  style={styles.unitItem}
                  onPress={() => handleSelectUnitAndAdd(pu.unitId)}
                >
                  <Text style={styles.unitItemName}>{pu.unit?.name}</Text>
                  <Text style={styles.unitItemPrice}>
                    Rp {pu.sellPrice.toLocaleString('id-ID')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <GradientButton
              title="Batal"
              onPress={() => {
                setShowUnitModal(false);
                setActiveProductForUnit(null);
              }}
              variant="outline"
              fullWidth
              style={styles.modalCancelBtn}
            />
          </GlassCard>
        </View>
      </Modal>

      {/* --- CART REVIEW MODAL --- */}
      <Modal visible={showCartModal} animationType="slide" onRequestClose={() => setShowCartModal(false)}>
        <SafeAreaView style={styles.fullModalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCartModal(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Detail Keranjang</Text>
            <TouchableOpacity onPress={clearCart}>
              <Text style={styles.clearCartText}>Kosongkan</Text>
            </TouchableOpacity>
          </View>

          {/* Customer Selector Card */}
          <View style={styles.customerSelectorCard}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm}}>
              <Text style={[styles.customerLabel, {marginBottom: 0}]}>Pelanggan</Text>
              <TouchableOpacity onPress={() => setShowAddCustomer(true)}>
                <Text style={{color: Colors.primary, fontSize: FontSize.xs, fontWeight: 'bold'}}>+ Tambah</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                {customers.map((cust) => (
                  <TouchableOpacity
                    key={cust.id}
                    style={[
                      styles.pickerOption,
                      selectedCustomerId === cust.id && styles.pickerOptionActive,
                    ]}
                    onPress={() => setCustomer(cust.id)}
                  >
                    <Ionicons
                      name="person-outline"
                      size={14}
                      color={selectedCustomerId === cust.id ? '#FFFFFF' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.pickerOptionText,
                        selectedCustomerId === cust.id && styles.pickerOptionTextActive,
                      ]}
                    >
                      {cust.name} ({cust.type})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Cart Items List */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.cartList}
            renderItem={({ item }) => (
              <GlassCard padding={12} style={styles.cartCardItem}>
                <View style={styles.cartItemTop}>
                  <View style={styles.cartItemHeader}>
                    <Text style={styles.cartItemName}>{item.productName}</Text>
                    <Text style={styles.cartItemCode}>{item.productCode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item.id)}>
                    <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  </TouchableOpacity>
                </View>

                {/* Satuan & Qty Row */}
                <View style={styles.cartItemControls}>
                  <View style={styles.unitSelector}>
                    {item.availableUnits.map((unit) => (
                      <TouchableOpacity
                        key={unit.unitId}
                        style={[
                          styles.cartUnitBadge,
                          item.unitId === unit.unitId && styles.cartUnitBadgeActive,
                        ]}
                        onPress={() => updateItemUnit(item.id, unit.unitId)}
                      >
                        <Text
                          style={[
                            styles.cartUnitText,
                            item.unitId === unit.unitId && styles.cartUnitTextActive,
                          ]}
                        >
                          {unit.unitName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.qtyContainer}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      <Ionicons name="remove" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.qtyInput}
                      keyboardType="numeric"
                      value={String(item.quantity)}
                      onChangeText={(val) => {
                        const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(num)) {
                          updateQuantity(item.id, num);
                        } else if (val === '') {
                          updateQuantity(item.id, 0);
                        }
                      }}
                      onBlur={() => {
                        if (!item.quantity || item.quantity <= 0) {
                          updateQuantity(item.id, 1);
                        }
                      }}
                    />
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Diskon per Item */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="pricetag-outline" size={14} color={Colors.textTertiary} />
                    <Text style={{ fontSize: 11, color: Colors.textSecondary }}>Diskon Item (Rp):</Text>
                  </View>
                  <TextInput
                    style={{
                      backgroundColor: Colors.surface,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: BorderRadius.sm,
                      height: 36,
                      flex: 1,
                      marginLeft: 12,
                      color: Colors.textPrimary,
                      textAlign: 'right',
                      paddingHorizontal: Spacing.sm,
                      fontSize: FontSize.sm,
                      fontWeight: 'bold',
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                    value={item.discount > 0 ? String(item.discount) : ''}
                    onChangeText={(val) => updateItemDiscount(item.id, Number(val || 0))}
                  />
                </View>

                {/* Harga & Diskon Item */}
                <View style={styles.cartItemPriceRow}>
                  <Text style={styles.cartItemUnitPrice}>
                    Rp {item.unitPrice.toLocaleString('id-ID')} / {item.unitName}
                  </Text>
                  <Text style={styles.cartItemSubtotal}>
                    Rp {item.subtotal.toLocaleString('id-ID')}
                  </Text>
                </View>
              </GlassCard>
            )}
          />

          {/* Calculation Bottom Card */}
          <GlassCard padding={20} style={styles.calculationCard} noBorder>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcValue}>Rp {calculation.subtotal.toLocaleString('id-ID')}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Diskon Pelanggan</Text>
              <TextInput
                style={styles.discountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textTertiary}
                value={String(discount || '')}
                onChangeText={(text) => setDiscount(Number(text || 0))}
              />
            </View>
            <View style={[styles.calcRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total Akhir</Text>
              <Text style={styles.grandTotalValue}>
                Rp {calculation.grandTotal.toLocaleString('id-ID')}
              </Text>
            </View>

            <GradientButton
              title="Lanjutkan Pembayaran"
              onPress={() => setShowCheckoutModal(true)}
              variant="success"
              fullWidth
              style={styles.checkoutBtn}
            />
          </GlassCard>
        </SafeAreaView>
      </Modal>

      {/* --- PAYMENT / CHECKOUT MODAL --- */}
      <Modal visible={showCheckoutModal} animationType="slide" onRequestClose={() => setShowCheckoutModal(false)}>
        <SafeAreaView style={styles.fullModalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCheckoutModal(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Selesaikan Transaksi</Text>
            <TouchableOpacity onPress={() => setShowCheckoutModal(false)} style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
              <Text style={{ color: Colors.error, fontWeight: 'bold', fontSize: FontSize.sm }}>Batal</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.checkoutContent}>
            {/* Total Summary */}
            <GlassCard padding={20} style={styles.paymentSummary}>
              <Text style={styles.summaryLabel}>GRAND TOTAL</Text>
              <Text style={styles.summaryValue}>
                Rp {calculation.grandTotal.toLocaleString('id-ID')}
              </Text>
            </GlassCard>

            {/* Payment Method Selector */}
            <Text style={styles.sectionLabel}>Metode Pembayaran</Text>
            <View style={styles.methodGrid}>
              {[
                { type: 'CASH', label: 'Tunai', icon: 'cash-outline' },
                { type: 'TRANSFER', label: 'Transfer', icon: 'logo-usd' },
                { type: 'QRIS', label: 'QRIS', icon: 'qr-code-outline' },
                { type: 'CREDIT', label: 'Piutang', icon: 'calendar-outline' },
              ].map((m) => (
                <TouchableOpacity
                  key={m.type}
                  style={[
                    styles.methodCard,
                    paymentMethod === m.type && styles.methodCardActive,
                  ]}
                  onPress={() => setPaymentMethod(m.type as PaymentMethod)}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={22}
                    color={paymentMethod === m.type ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.methodCardLabel,
                      paymentMethod === m.type && styles.methodCardLabelActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Paid Amount Input (only for Cash) */}
            {paymentMethod === 'CASH' && (
              <View style={styles.cashInputContainer}>
                <Text style={styles.cashLabel}>Jumlah Uang Diterima (Rp)</Text>
                <TextInput
                  style={styles.cashInput}
                  keyboardType="numeric"
                  placeholder="Masukkan jumlah bayar"
                  placeholderTextColor={Colors.textTertiary}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  autoFocus
                />

                {/* Quick money buttons */}
                <View style={styles.quickCashContainer}>
                  {[calculation.grandTotal, 50000, 100000, 200000].map((cash) => (
                    <TouchableOpacity
                      key={cash}
                      style={styles.quickCashBtn}
                      onPress={() => setPaidAmount(String(cash))}
                    >
                      <Text style={styles.quickCashText}>
                        {cash === calculation.grandTotal ? 'Uang Pas' : cash.toLocaleString('id-ID')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Change Calculation */}
                {Number(paidAmount) >= calculation.grandTotal && (
                  <View style={styles.changeCard}>
                    <Text style={styles.changeLabel}>Uang Kembalian</Text>
                    <Text style={styles.changeValue}>
                      Rp {(Number(paidAmount) - calculation.grandTotal).toLocaleString('id-ID')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* DP Input (only for Credit/Piutang) */}
            {paymentMethod === 'CREDIT' && (
              <View style={styles.cashInputContainer}>
                <Text style={styles.cashLabel}>Uang Muka / Down Payment (DP) (Rp)</Text>
                <TextInput
                  style={styles.cashInput}
                  keyboardType="numeric"
                  placeholder="Masukkan jumlah DP (Kosongkan jika Rp 0)"
                  placeholderTextColor={Colors.textTertiary}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                />

                {/* Quick DP buttons */}
                <View style={styles.quickCashContainer}>
                  {[0, Math.floor(calculation.grandTotal * 0.1), Math.floor(calculation.grandTotal * 0.25), Math.floor(calculation.grandTotal * 0.5)].map((cash) => (
                    <TouchableOpacity
                      key={cash}
                      style={styles.quickCashBtn}
                      onPress={() => setPaidAmount(String(cash))}
                    >
                      <Text style={styles.quickCashText}>
                        {cash === 0 ? 'Tanpa DP' : `DP ${cash.toLocaleString('id-ID')}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Sisa Piutang Calculation */}
                <View style={styles.changeCard}>
                  <Text style={styles.changeLabel}>Sisa Piutang (Utang Pelanggan)</Text>
                  <Text style={[styles.changeValue, { color: Colors.error }]}>
                    Rp {Math.max(0, calculation.grandTotal - Number(paidAmount)).toLocaleString('id-ID')}
                  </Text>
                </View>
              </View>
            )}

            {/* Notes input */}
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Catatan Transaksi</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Tambahkan catatan khusus..."
                placeholderTextColor={Colors.textTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </ScrollView>

          {/* Sticky checkout btn */}
          <View style={styles.stickyPayBtnContainer}>
            <GradientButton
              title="Konfirmasi Pembayaran"
              onPress={handleCheckoutSubmit}
              loading={processingCheckout}
              variant="success"
              fullWidth
            />
            <TouchableOpacity
              onPress={() => setShowCheckoutModal(false)}
              disabled={processingCheckout}
              style={styles.modalCancelRowBtn}
            >
              <Ionicons name="close-circle-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.modalCancelRowText}>Batal / Kembali ke Keranjang</Text>
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- ADD CUSTOMER MODAL --- */}
      <Modal visible={showAddCustomer} transparent animationType="fade" onRequestClose={() => setShowAddCustomer(false)}>
        <View style={styles.modalOverlay}>
          <GlassCard padding={24} style={styles.unitModalCard}>
            <Text style={styles.modalTitle}>Tambah Pelanggan</Text>
            
            <View style={{marginTop: Spacing.xl, gap: Spacing.md}}>
              <View>
                <Text style={styles.modalLabel}>Nama Pelanggan *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Masukkan nama"
                  placeholderTextColor={Colors.textTertiary}
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                />
              </View>
              <View>
                <Text style={styles.modalLabel}>No HP</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Masukkan No HP"
                  placeholderTextColor={Colors.textTertiary}
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={{marginTop: Spacing.xl, gap: Spacing.sm}}>
              <GradientButton
                title="Simpan Pelanggan"
                onPress={handleSaveCustomer}
                loading={savingCustomer}
                variant="primary"
                fullWidth
              />
              <GradientButton
                title="Batal"
                onPress={() => setShowAddCustomer(false)}
                variant="outline"
                fullWidth
              />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* --- CHECKOUT SUCCESS MODAL --- */}
      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => { setShowSuccessModal(false); setCreatedSale(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.successModalCard, { padding: 24, borderRadius: BorderRadius.xl }]}>
            <View style={styles.successIconWrapper}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            </View>
            
            <Text style={styles.successTitle}>Transaksi Berhasil!</Text>
            <Text style={styles.successSubtitle}>
              Invoice: {createdSale?.invoiceNumber}
            </Text>
            
            {createdSale?.changeAmount > 0 && (
               <View style={styles.changeDisplayBox}>
                 <Text style={styles.changeDisplayLabel}>UANG KEMBALIAN</Text>
                 <Text style={styles.changeDisplayVal}>
                   Rp {createdSale.changeAmount.toLocaleString('id-ID')}
                 </Text>
               </View>
            )}

            <View style={{ marginTop: Spacing.xl, gap: Spacing.md, width: '100%' }}>
              <GradientButton
                title="Cetak Struk / PDF"
                onPress={() => createdSale && printInvoice(createdSale)}
                variant="success"
                fullWidth
                icon={<Ionicons name="print-outline" size={20} color="#FFFFFF" />}
              />
              <GradientButton
                title="Bagikan PDF"
                onPress={() => createdSale && shareInvoicePdf(createdSale)}
                variant="primary"
                fullWidth
                icon={<Ionicons name="share-social-outline" size={20} color="#FFFFFF" />}
              />
              <GradientButton
                title="Selesai & Transaksi Baru"
                onPress={() => {
                  setShowSuccessModal(false);
                  setCreatedSale(null);
                }}
                variant="outline"
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* --- BARCODE SCANNER MODAL --- */}
      <Modal visible={showScanner} transparent animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <SafeAreaView style={styles.fullModalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Scan Barcode</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{flex: 1, backgroundColor: '#000'}}>
             <CameraView
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"],
                }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame} />
                <Text style={styles.scannerText}>Arahkan barcode produk ke dalam kotak</Text>
              </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    // shadow iOS
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  categoriesScroll: {
    gap: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  categoryBadgeActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productsList: {
    padding: Spacing.sm,
  },
  productCardWrapper: {
    flex: 1,
    padding: Spacing.xs,
  },
  productCard: {
    height: 230,
    justifyContent: 'space-between',
  },
  productIconBg: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(108, 99, 255, 0.12)',  // ungu lavender lembut
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  productCode: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  productPrice: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryStart,
    marginTop: 2,
  },
  unitNameText: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  productStock: {
    fontSize: 10,
    color: Colors.success,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    height: 36,
    gap: 4,
    marginTop: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: '#FFFFFF',
  },
  cartFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 76,
    backgroundColor: Colors.surface,
    borderTopWidth: 1.5,
    borderColor: Colors.primaryStart,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  cartFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cartIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.secondaryStart,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cartBadgeCountText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  cartFooterLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  cartFooterTotal: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  cartFooterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  cartFooterButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  unitModalCard: {
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.xl,
  },
  unitList: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 52,
    paddingHorizontal: Spacing.lg,
  },
  unitItemName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  unitItemPrice: {
    fontSize: FontSize.sm,
    color: Colors.primaryStart,
    fontWeight: FontWeight.semibold,
  },
  modalCancelBtn: {
    marginTop: Spacing.sm,
  },
  fullModalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  modalHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  clearCartText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
  customerSelectorCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  customerLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  pickerWrapper: {
    flexDirection: 'row',
  },
  pickerScroll: {
    gap: Spacing.sm,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  pickerOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerOptionText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  cartList: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  cartCardItem: {
    backgroundColor: Colors.backgroundSecondary,
  },
  cartItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cartItemHeader: {
    flex: 1,
  },
  cartItemName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  cartItemCode: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cartItemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  cartUnitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  cartUnitBadgeActive: {
    backgroundColor: Colors.primaryStart + '20',
    borderColor: Colors.primaryStart,
  },
  cartUnitText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  cartUnitTextActive: {
    color: Colors.primaryStart,
    fontWeight: FontWeight.bold,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.full,
    height: 44,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  qtyInput: {
    paddingHorizontal: 8,
    paddingVertical: 0,
    height: 40,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
    textAlign: 'center',
    minWidth: 60,
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  cartItemUnitPrice: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  cartItemSubtotal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  calculationCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  calcLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  calcValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  discountInput: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 40,
    width: 150,
    color: Colors.textPrimary,
    textAlign: 'right',
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    fontWeight: 'bold',
  },
  grandTotalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  grandTotalLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  grandTotalValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  checkoutBtn: {
    marginTop: Spacing.md,
  },
  checkoutContent: {
    padding: Spacing.lg,
  },
  paymentSummary: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary + '30',
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  methodCard: {
    width: '46%',
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: BorderRadius.md,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  methodCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodCardLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  methodCardLabelActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  cashInputContainer: {
    marginBottom: Spacing.xl,
  },
  cashLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  cashInput: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 56,
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.lg,
  },
  quickCashContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
  },
  quickCashBtn: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  quickCashText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  changeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.success + '30',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  changeLabel: {
    fontSize: FontSize.sm,
    color: Colors.success,
    fontWeight: FontWeight.medium,
  },
  changeValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  notesContainer: {
    marginBottom: Spacing['3xl'],
  },
  notesLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    color: Colors.textPrimary,
    padding: Spacing.md,
    height: 80,
    fontSize: FontSize.sm,
    textAlignVertical: 'top',
  },
  stickyPayBtnContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: '#fff',
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.md,
  },
  modalInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 50,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  modalLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  successModalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  changeDisplayBox: {
    backgroundColor: Colors.successLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.success + '20',
    padding: Spacing.md,
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  changeDisplayLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    letterSpacing: 1,
  },
  changeDisplayVal: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    marginTop: 4,
  },
  modalCancelRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingVertical: 10,
    gap: Spacing.xs,
  },
  modalCancelRowText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  }
});
