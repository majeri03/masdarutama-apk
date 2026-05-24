import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  Image,
  RefreshControl,
  Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { productService } from '../services/product.service';
import { masterService } from '../services/master.service';
import { useAuthStore } from '../stores/auth.store';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight, Shadow } from '../constants/theme';
import { GlassCard, StatusBadge, GradientButton } from '../components/ui';
import type { Product, Category, Unit, SubCategory } from '../types';

export const ProductsScreen: React.FC = () => {
  const { isAdmin } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await Promise.all([
      loadInitialData(),
      loadProducts(searchQuery, selectedCategory as any, 1, true),
    ]);
    setRefreshing(false);
  };

  // Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Form Modal State (Create / Edit)
  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProductId, setEditingProductId] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMinStock, setFormMinStock] = useState('0');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Add Category Modal State
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Add SubCategory Modal State
  const [showAddSubCategoryModal, setShowAddSubCategoryModal] = useState(false);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newSubCategoryDesc, setNewSubCategoryDesc] = useState('');
  const [savingSubCategory, setSavingSubCategory] = useState(false);

  // Units in Form State
  const [formProductUnits, setFormProductUnits] = useState<{
    unitId: string;
    conversionValue: number;
    buyPrice: number;
    sellPrice: number;
    isPrimary: boolean;
  }[]>([]);

  // Add Unit Form State (temp)
  const [showAddUnitForm, setShowAddUnitForm] = useState(false);
  const [tempUnitId, setTempUnitId] = useState('');
  const [tempConversion, setTempConversion] = useState('1');
  const [tempBuyPrice, setTempBuyPrice] = useState('0');
  const [tempSellPrice, setTempSellPrice] = useState('0');
  const [tempIsPrimary, setTempIsPrimary] = useState(false);

  const loadInitialData = async () => {
    try {
      const [catRes, unitRes] = await Promise.all([
        productService.getCategories(),
        masterService.getUnits(),
      ]);
      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
      if (unitRes.success && unitRes.data?.units) {
        setUnits(unitRes.data.units);
      }
    } catch (e) {
      console.warn('[PRODUCTS] Error fetching initial data:', e);
    }
  };

  const loadProducts = async (search = '', catId = null, pageNum = 1, resetList = true) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await productService.getProducts({
        search: search || undefined,
        categoryId: catId || undefined,
        page: pageNum,
        limit: 15,
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
      console.warn('[PRODUCTS] Error fetching products:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadProducts();
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

  const handleViewDetail = (product: Product) => {
    setSelectedProduct(product);
    setShowDetailModal(true);
  };

  // Open Form for Adding New Product
  const handleOpenAddForm = () => {
    setIsEditing(false);
    setEditingProductId('');
    setFormName('');
    setFormBarcode('');
    setFormCategory(categories[0]?.id || '');
    setFormSubCategory('');
    setFormDescription('');
    setFormMinStock('0');
    setFormIsActive(true);
    setFormProductUnits([]);
    setFormImageUrl(null);
    setShowFormModal(true);
  };

  // Open Form for Editing Product
  const handleOpenEditForm = (product: Product) => {
    setIsEditing(true);
    setEditingProductId(product.id);
    setFormName(product.name);
    setFormBarcode(product.barcode || '');
    setFormCategory(product.categoryId);
    setFormSubCategory(product.subCategoryId || '');
    setFormDescription(product.description || '');
    setFormMinStock(String(product.minStock));
    setFormIsActive(product.isActive);
    setFormImageUrl(product.productImages && product.productImages.length > 0 ? product.productImages[0].imageUrl : null);

    // Map units to match form format
    const mappedUnits = (product.productUnits || []).map((pu) => ({
      unitId: pu.unitId,
      conversionValue: pu.conversionValue,
      buyPrice: pu.buyPrice,
      sellPrice: pu.sellPrice,
      isPrimary: pu.isPrimary,
    }));
    setFormProductUnits(mappedUnits);

    setShowDetailModal(false);
    setShowFormModal(true);
  };

  // Delete Product
  const handleDeleteProduct = (product: Product) => {
    Alert.alert(
      'Konfirmasi Hapus',
      `Apakah Anda yakin ingin menghapus produk "${product.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await productService.deleteProduct(product.id);
              if (res.success) {
                Alert.alert('Sukses', `Produk "${product.name}" berhasil dihapus.`);
                setShowDetailModal(false);
                setSelectedProduct(null);
                loadProducts(searchQuery, selectedCategory as any);
              } else {
                Alert.alert('Gagal', res.error || 'Gagal menghapus produk.');
              }
            } catch (e) {
              Alert.alert('Error', 'Terjadi kesalahan sistem.');
            }
          },
        },
      ]
    );
  };

  // Add Unit to Form list
  const handleAddUnitToForm = () => {
    if (!tempUnitId) {
      Alert.alert('Peringatan', 'Pilih satuan terlebih dahulu.');
      return;
    }
    const conv = Number(tempConversion);
    const buy = Number(tempBuyPrice);
    const sell = Number(tempSellPrice);

    if (isNaN(conv) || conv < 1) {
      Alert.alert('Peringatan', 'Nilai konversi minimal 1.');
      return;
    }
    if (isNaN(buy) || buy < 0 || isNaN(sell) || sell < 0) {
      Alert.alert('Peringatan', 'Harga tidak boleh negatif.');
      return;
    }
    if (sell < buy) {
      Alert.alert('Peringatan', 'Harga jual tidak boleh lebih kecil dari harga beli.');
      return;
    }

    // Check duplicate
    if (formProductUnits.some((pu) => pu.unitId === tempUnitId)) {
      Alert.alert('Peringatan', 'Satuan ini sudah ditambahkan.');
      return;
    }

    let updatedUnits = [...formProductUnits];

    // If this is primary, clear previous primary flags
    if (tempIsPrimary) {
      updatedUnits = updatedUnits.map((u) => ({ ...u, isPrimary: false }));
    }

    updatedUnits.push({
      unitId: tempUnitId,
      conversionValue: tempIsPrimary ? 1 : conv, // primary unit must have conversion value = 1
      buyPrice: buy,
      sellPrice: sell,
      isPrimary: tempIsPrimary,
    });

    setFormProductUnits(updatedUnits);
    setShowAddUnitForm(false);
    setTempUnitId('');
    setTempConversion('1');
    setTempBuyPrice('0');
    setTempSellPrice('0');
    setTempIsPrimary(false);
  };

  const handleRemoveUnitFromForm = (unitId: string) => {
    setFormProductUnits(formProductUnits.filter((u) => u.unitId !== unitId));
  };

  // Select Image Source (Camera / Gallery)
  const handleSelectImageSource = () => {
    Alert.alert(
      'Foto Produk',
      'Pilih sumber foto produk:',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Kamera (Ambil Foto)', onPress: () => handleImageSource('camera') },
        { text: 'Galeri (Pilih Foto)', onPress: () => handleImageSource('gallery') },
      ]
    );
  };

  // Image capture & compression logic
  const handleImageSource = async (source: 'camera' | 'gallery') => {
    try {
      let status;
      if (source === 'camera') {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        status = res.status;
      } else {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = res.status;
      }

      if (status !== 'granted') {
        Alert.alert('Izin Ditolak', 'Aplikasi memerlukan izin untuk mengakses gambar.');
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.1,
      };

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const rawUri = result.assets[0].uri;

      setUploadingImage(true);
      // Compress & Resize using ImageManipulator (Aiming for 1-5KB, highly optimized)
      const manipulated = await ImageManipulator.manipulateAsync(
        rawUri,
        [{ resize: { width: 150 } }],
        { compress: 0.1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const uploadRes = await productService.uploadImage(manipulated.uri);
      if (uploadRes.success && uploadRes.data?.url) {
        setFormImageUrl(uploadRes.data.url);
      } else {
        Alert.alert('Gagal', uploadRes.error || 'Gagal mengunggah foto produk');
      }
    } catch (e) {
      console.warn('[IMAGE_UPLOAD_ERROR]', e);
      Alert.alert('Error', 'Gagal memproses gambar');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setFormImageUrl(null);
  };

  // Create Category helper
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Peringatan', 'Nama kategori wajib diisi.');
      return;
    }
    setSavingCategory(true);
    try {
      const res = await masterService.createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim() || null,
      });
      if (res.success && res.data) {
        Alert.alert('Sukses', `Kategori "${res.data.name}" berhasil dibuat!`);
        setShowAddCategoryModal(false);
        setNewCategoryName('');
        setNewCategoryDesc('');

        // Reload initial data
        const catRes = await productService.getCategories();
        if (catRes.success && catRes.data) {
          setCategories(catRes.data);
          // Auto select new category
          setFormCategory(res.data.id);
        }
      } else {
        Alert.alert('Gagal', res.error || 'Gagal membuat kategori.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setSavingCategory(false);
    }
  };

  // Create Sub-Category helper
  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      Alert.alert('Peringatan', 'Nama sub-kategori wajib diisi.');
      return;
    }
    if (!formCategory) {
      Alert.alert('Peringatan', 'Pilih kategori utama terlebih dahulu.');
      return;
    }
    setSavingSubCategory(true);
    try {
      const res = await masterService.createSubCategory({
        name: newSubCategoryName.trim(),
        categoryId: formCategory,
      });
      if (res.success && res.data) {
        Alert.alert('Sukses', `Sub-kategori "${res.data.name}" berhasil dibuat!`);
        setShowAddSubCategoryModal(false);
        setNewSubCategoryName('');

        // Reload initial data
        const catRes = await productService.getCategories();
        if (catRes.success && catRes.data) {
          setCategories(catRes.data);
          // Auto select new subcategory
          setFormSubCategory(res.data.id);
        }
      } else {
        Alert.alert('Gagal', res.error || 'Gagal membuat sub-kategori.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setSavingSubCategory(false);
    }
  };

  // Form Submit
  const handleFormSubmit = async () => {
    if (!formName.trim()) {
      Alert.alert('Peringatan', 'Nama produk wajib diisi.');
      return;
    }
    if (!formCategory) {
      Alert.alert('Peringatan', 'Kategori produk wajib dipilih.');
      return;
    }
    if (formProductUnits.length === 0) {
      Alert.alert('Peringatan', 'Minimal harus menentukan 1 satuan penjualan.');
      return;
    }

    // Check primary unit requirements
    const primaryUnits = formProductUnits.filter((u) => u.isPrimary);
    if (primaryUnits.length !== 1) {
      Alert.alert('Peringatan', 'Harus menentukan tepat 1 satuan utama (primary).');
      return;
    }
    if (primaryUnits[0].conversionValue !== 1) {
      Alert.alert('Peringatan', 'Satuan utama harus memiliki nilai konversi = 1.');
      return;
    }

    const payload = {
      name: formName.trim(),
      barcode: formBarcode.trim() || null,
      categoryId: formCategory,
      subCategoryId: formSubCategory || null,
      description: formDescription.trim() || null,
      minStock: Number(formMinStock) || 0,
      isActive: formIsActive,
      units: formProductUnits,
      images: formImageUrl ? [{ imageUrl: formImageUrl, isPrimary: true }] : [],
    };

    setSavingProduct(true);
    try {
      let res;
      if (isEditing) {
        res = await productService.updateProduct(editingProductId, payload as any);
      } else {
        res = await productService.createProduct(payload as any);
      }

      if (res.success) {
        Alert.alert('Sukses', isEditing ? 'Produk berhasil diperbarui!' : 'Produk berhasil dibuat!');
        setShowFormModal(false);
        loadProducts(searchQuery, selectedCategory as any);
      } else {
        Alert.alert('Gagal', res.error || 'Gagal menyimpan produk.');
      }
    } catch (e) {
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search and Category Header */}
      <View style={styles.header}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama produk / kode..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {isAdmin() && (
            <TouchableOpacity style={styles.addIconBtn} onPress={handleOpenAddForm}>
              <Ionicons name="add-circle" size={28} color={Colors.primaryStart} />
            </TouchableOpacity>
          )}
        </View>

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

      {/* Products list */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const primaryUnit = item.productUnits?.find((pu) => pu.isPrimary) || item.productUnits?.[0];
            const isLowStock = item.currentStock <= item.minStock;
            const imageUrl = item.productImages && item.productImages.length > 0 ? item.productImages[0].imageUrl : null;

            return (
              <TouchableOpacity onPress={() => handleViewDetail(item)}>
                <GlassCard padding={16} style={styles.productCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.iconBg}>
                        {imageUrl ? (
                          <Image
                            source={{ uri: imageUrl }}
                            style={{ width: 40, height: 40, borderRadius: BorderRadius.md }}
                          />
                        ) : (
                          <Ionicons name="cube-outline" size={24} color="#FFFFFF" />
                        )}
                      </View>
                      <View>
                        <Text style={styles.productName}>{item.name}</Text>
                        <Text style={styles.productCode}>{item.code}</Text>
                      </View>
                    </View>
                    <StatusBadge status={item.isActive ? 'RECEIVED' : 'CANCELLED'} />
                  </View>

                  <View style={styles.cardInfoRow}>
                    <View>
                      <Text style={styles.infoLabel}>Harga Jual</Text>
                      <Text style={styles.infoValue}>
                        Rp {primaryUnit ? primaryUnit.sellPrice.toLocaleString('id-ID') : '0'}
                        <Text style={styles.unitText}>/{primaryUnit?.unit?.name || 'unit'}</Text>
                      </Text>
                    </View>
                    <View style={styles.alignRight}>
                      <Text style={styles.infoLabel}>Stok Saat Ini</Text>
                      <Text style={[styles.infoValue, isLowStock && { color: Colors.error }]}>
                        {item.currentStock} {primaryUnit?.unit?.name || 'unit'}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primaryStart}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 16 }} />
            ) : null
          }
        />
      )}

      {/* --- DETAIL MODAL --- */}
      <Modal visible={showDetailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            {/* Header — fixed at top */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detail Produk</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close-circle-outline" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable content */}
            {selectedProduct && (
              <ScrollView
                style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}
                contentContainerStyle={styles.modalContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled={true}
              >
                {(() => {
                  const imgUrl = selectedProduct.productImages && selectedProduct.productImages.length > 0
                    ? selectedProduct.productImages[0].imageUrl
                    : null;
                  if (!imgUrl) return null;
                  return (
                    <Image
                      source={{ uri: imgUrl }}
                      style={{
                        width: '100%',
                        height: 200,
                        borderRadius: BorderRadius.md,
                        marginBottom: Spacing.md,
                        backgroundColor: Colors.surfaceLight,
                      }}
                      resizeMode="cover"
                    />
                  );
                })()}

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Nama Produk</Text>
                  <Text style={styles.detailText}>{selectedProduct.name}</Text>
                </View>

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Kode Produk (SKU)</Text>
                  <Text style={styles.detailText}>{selectedProduct.code}</Text>
                </View>

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Barcode</Text>
                  <Text style={styles.detailText}>{selectedProduct.barcode || '-'}</Text>
                </View>

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Kategori</Text>
                  <Text style={styles.detailText}>
                    {selectedProduct.category?.name || 'Umum'}
                    {selectedProduct.subCategory && ` / ${selectedProduct.subCategory.name}`}
                  </Text>
                </View>

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Deskripsi</Text>
                  <Text style={styles.detailText}>
                    {selectedProduct.description || 'Tidak ada deskripsi.'}
                  </Text>
                </View>

                <View style={styles.detailGroup}>
                  <Text style={styles.detailLabel}>Batas Minimum Stok</Text>
                  <Text style={styles.detailText}>{selectedProduct.minStock} unit</Text>
                </View>

                {/* Units List */}
                <Text style={styles.subTitle}>Daftar Satuan Penjualan</Text>
                <View style={styles.unitsContainer}>
                  {selectedProduct.productUnits?.map((pu) => (
                    <View key={pu.id} style={styles.unitRow}>
                      <View style={styles.unitLeft}>
                        <Ionicons name="pricetag-outline" size={16} color={Colors.primaryStart} />
                        <Text style={styles.unitRowName}>
                          {pu.unit?.name} {pu.isPrimary && '(Utama)'}
                        </Text>
                      </View>
                      <View style={styles.unitRight}>
                        <Text style={styles.unitPriceText}>
                          Rp {pu.sellPrice.toLocaleString('id-ID')}
                        </Text>
                        {!isAdmin() ? null : (
                          <Text style={{ fontSize: 10, color: Colors.textTertiary, textAlign: 'right' }}>
                            Beli: Rp {pu.buyPrice.toLocaleString('id-ID')}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Action buttons pinned at bottom — always visible */}
            {selectedProduct && isAdmin() && (
              <View style={styles.adminActions}>
                <GradientButton
                  title="Edit Produk"
                  onPress={() => handleOpenEditForm(selectedProduct)}
                  variant="primary"
                  style={{ flex: 1 }}
                />
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteProduct(selectedProduct)}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            )}

            <GradientButton
              title="Tutup"
              onPress={() => {
                setShowDetailModal(false);
                setSelectedProduct(null);
              }}
              variant="outline"
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* --- FORM MODAL (ADD / EDIT) --- */}
      <Modal visible={showFormModal} animationType="slide">
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <TouchableOpacity onPress={() => setShowFormModal(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.formHeaderTitle}>
              {isEditing ? 'Ubah Produk' : 'Tambah Produk Baru'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.formContent}
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nama Produk *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: Semen Padang 50kg"
                placeholderTextColor={Colors.textTertiary}
                value={formName}
                onChangeText={setFormName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Barcode (Opsional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Scan / Ketik Barcode"
                placeholderTextColor={Colors.textTertiary}
                value={formBarcode}
                onChangeText={setFormBarcode}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.inputLabel}>Kategori *</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => setShowAddCategoryModal(true)}
                >
                  <Ionicons name="add-circle-outline" size={16} color={Colors.primaryStart} />
                  <Text style={{ fontSize: FontSize.xs, color: Colors.primaryStart, fontWeight: FontWeight.bold }}>+ Kategori</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.pickerItem,
                        formCategory === cat.id && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setFormCategory(cat.id);
                        setFormSubCategory(''); // Reset subcategory when category changes
                      }}
                    >
                      <Text style={[styles.pickerText, formCategory === cat.id && styles.pickerTextActive]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Sub-Category Picker */}
            {formCategory ? (
              <View style={styles.inputGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.inputLabel}>Sub-Kategori</Text>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    onPress={() => setShowAddSubCategoryModal(true)}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={Colors.primaryStart} />
                    <Text style={{ fontSize: FontSize.xs, color: Colors.primaryStart, fontWeight: FontWeight.bold }}>+ Sub-Kategori</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pickerWrapper}>
                  {(() => {
                    const selectedCatObj = categories.find(c => c.id === formCategory);
                    const subCats = selectedCatObj?.subCategories || [];
                    if (subCats.length === 0) {
                      return <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary, fontStyle: 'italic', paddingVertical: 8 }}>Tidak ada sub-kategori. Klik "+ Sub-Kategori" untuk membuat baru.</Text>;
                    }
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity
                          style={[
                            styles.pickerItem,
                            !formSubCategory && styles.pickerItemActive,
                          ]}
                          onPress={() => setFormSubCategory('')}
                        >
                          <Text style={[styles.pickerText, !formSubCategory && styles.pickerTextActive]}>
                            Tanpa Sub-Kategori
                          </Text>
                        </TouchableOpacity>
                        {subCats.map((sub) => (
                          <TouchableOpacity
                            key={sub.id}
                            style={[
                              styles.pickerItem,
                              formSubCategory === sub.id && styles.pickerItemActive,
                            ]}
                            onPress={() => setFormSubCategory(sub.id)}
                          >
                            <Text style={[styles.pickerText, formSubCategory === sub.id && styles.pickerTextActive]}>
                              {sub.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    );
                  })()}
                </View>
              </View>
            ) : null}

            {/* Foto Produk Section */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Foto Produk</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 4 }}>
                {formImageUrl ? (
                  <View style={{ position: 'relative' }}>
                    <Image
                      source={{ uri: formImageUrl }}
                      style={{ width: 80, height: 80, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight }}
                    />
                    <TouchableOpacity
                      onPress={handleRemoveImage}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        backgroundColor: Colors.error,
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: '#fff'
                      }}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleSelectImageSource}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: BorderRadius.md,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderStyle: 'dashed',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: Colors.surface
                    }}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color={Colors.primaryStart} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={24} color={Colors.textTertiary} />
                        <Text style={{ fontSize: 9, color: Colors.textTertiary, marginTop: 4 }}>Tambah Foto</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {uploadingImage && (
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary }}>Mengompres & Mengunggah...</Text>
                )}
                {formImageUrl && !uploadingImage && (
                  <Text style={{ fontSize: FontSize.xs, color: Colors.success, fontWeight: 'bold' }}>✓ Foto terunggah (sangat kecil & terkompresi)</Text>
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Batas Stok Minimum</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={formMinStock}
                onChangeText={setFormMinStock}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Deskripsi</Text>
              <TextInput
                style={[styles.textInput, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Keterangan produk..."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={3}
                value={formDescription}
                onChangeText={setFormDescription}
              />
            </View>

            <View style={[styles.inputGroup, styles.switchGroup]}>
              <Text style={styles.inputLabel}>Status Aktif</Text>
              <Switch
                value={formIsActive}
                onValueChange={setFormIsActive}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor="#fff"
              />
            </View>

            {/* Units list in form */}
            <View style={styles.unitsSectionHeader}>
              <Text style={styles.unitsSectionTitle}>Satuan & Harga Jual *</Text>
              <TouchableOpacity
                style={styles.addUnitBtn}
                onPress={() => {
                  setTempUnitId(units[0]?.id || '');
                  setTempConversion('1');
                  setTempBuyPrice('0');
                  setTempSellPrice('0');
                  setTempIsPrimary(formProductUnits.length === 0); // default primary for the first unit
                  setShowAddUnitForm(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primaryStart} />
                <Text style={styles.addUnitBtnText}>Tambah Satuan</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addedUnitsList}>
              {formProductUnits.map((item, index) => {
                const unitName = units.find((u) => u.id === item.unitId)?.name || 'Satuan';
                return (
                  <View key={item.unitId + index} style={styles.formUnitCard}>
                    <View style={styles.formUnitCardLeft}>
                      <Text style={styles.formUnitCardTitle}>
                        {unitName} {item.isPrimary && '(Utama)'}
                      </Text>
                      <Text style={styles.formUnitCardDesc}>
                        Konversi: {item.conversionValue} | Beli: Rp {item.buyPrice.toLocaleString('id-ID')}
                      </Text>
                    </View>
                    <View style={styles.formUnitCardRight}>
                      <Text style={styles.formUnitCardPrice}>
                        Rp {item.sellPrice.toLocaleString('id-ID')}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveUnitFromForm(item.unitId)}
                        style={styles.removeUnitBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {formProductUnits.length === 0 && (
                <Text style={styles.emptyUnitsText}>Belum ada satuan ditambahkan.</Text>
              )}
            </View>

            <View style={{ height: Spacing['3xl'] }} />
          </ScrollView>

          <View style={styles.formFooter}>
            <GradientButton
              title="Simpan Produk"
              onPress={handleFormSubmit}
              loading={savingProduct}
              variant="primary"
              fullWidth
            />
          </View>
        </View>

        {/* --- ADD UNIT INNER MODAL --- */}
        <Modal visible={showAddUnitForm} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <GlassCard padding={24} style={styles.addUnitModalCard}>
              <Text style={styles.modalTitle}>Tambah Satuan</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Satuan *</Text>
                <View style={styles.pickerWrapper}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {units.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.pickerItem,
                          tempUnitId === u.id && styles.pickerItemActive,
                        ]}
                        onPress={() => setTempUnitId(u.id)}
                      >
                        <Text style={[styles.pickerText, tempUnitId === u.id && styles.pickerTextActive]}>
                          {u.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nilai Konversi * (Satuan Utama = 1)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={tempConversion}
                  onChangeText={setTempConversion}
                  editable={!tempIsPrimary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Harga Beli (Rp) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={tempBuyPrice}
                  onChangeText={setTempBuyPrice}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Harga Jual (Rp) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={tempSellPrice}
                  onChangeText={setTempSellPrice}
                />
              </View>

              <View style={[styles.inputGroup, styles.switchGroup]}>
                <Text style={styles.inputLabel}>Sebagai Satuan Utama (Primary)</Text>
                <Switch
                  value={tempIsPrimary}
                  onValueChange={(val) => {
                    setTempIsPrimary(val);
                    if (val) setTempConversion('1'); // primary must be 1
                  }}
                />
              </View>

              <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
                <GradientButton
                  title="Tambahkan"
                  onPress={handleAddUnitToForm}
                  variant="primary"
                  fullWidth
                />
                <GradientButton
                  title="Batal"
                  onPress={() => setShowAddUnitForm(false)}
                  variant="outline"
                  fullWidth
                />
              </View>
            </GlassCard>
          </View>
        </Modal>

        {/* --- ADD CATEGORY MODAL --- */}
        <Modal visible={showAddCategoryModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <GlassCard padding={24} style={styles.addUnitModalCard}>
              <Text style={styles.modalTitle}>Tambah Kategori Baru</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Kategori *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nama kategori baru"
                  placeholderTextColor={Colors.textTertiary}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Deskripsi (Opsional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Keterangan singkat"
                  placeholderTextColor={Colors.textTertiary}
                  value={newCategoryDesc}
                  onChangeText={setNewCategoryDesc}
                />
              </View>

              <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
                <GradientButton
                  title="Simpan Kategori"
                  onPress={handleCreateCategory}
                  loading={savingCategory}
                  variant="primary"
                  fullWidth
                />
                <GradientButton
                  title="Batal"
                  onPress={() => {
                    setShowAddCategoryModal(false);
                    setNewCategoryName('');
                    setNewCategoryDesc('');
                  }}
                  variant="outline"
                  fullWidth
                />
              </View>
            </GlassCard>
          </View>
        </Modal>

        {/* --- ADD SUB-CATEGORY MODAL --- */}
        <Modal visible={showAddSubCategoryModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <GlassCard padding={24} style={styles.addUnitModalCard}>
              <Text style={styles.modalTitle}>Tambah Sub-Kategori</Text>

              {(() => {
                const parentCat = categories.find(c => c.id === formCategory);
                return (
                  <View style={{ marginBottom: Spacing.xs }}>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textTertiary }}>Kategori Utama:</Text>
                    <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary }}>
                      {parentCat ? parentCat.name : '-'}
                    </Text>
                  </View>
                );
              })()}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Sub-Kategori *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nama sub-kategori baru"
                  placeholderTextColor={Colors.textTertiary}
                  value={newSubCategoryName}
                  onChangeText={setNewSubCategoryName}
                />
              </View>

              <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
                <GradientButton
                  title="Simpan Sub-Kategori"
                  onPress={handleCreateSubCategory}
                  loading={savingSubCategory}
                  variant="primary"
                  fullWidth
                />
                <GradientButton
                  title="Batal"
                  onPress={() => {
                    setShowAddSubCategoryModal(false);
                    setNewSubCategoryName('');
                  }}
                  variant="outline"
                  fullWidth
                />
              </View>
            </GlassCard>
          </View>
        </Modal>
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
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  addIconBtn: {
    paddingLeft: Spacing.xs,
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
  listContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  productCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryStart + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  productCode: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  infoLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  unitText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textTertiary,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  detailModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalContent: {
    gap: Spacing.md,
  },
  detailGroup: {
    marginBottom: Spacing.xs,
  },
  detailLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  detailText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  subTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  unitsContainer: {
    gap: Spacing.sm,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  unitRowName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  unitRight: {},
  unitPriceText: {
    fontSize: FontSize.sm,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  adminActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Form Container Styles ──
  formContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  formHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  formContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  pickerWrapper: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  pickerItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerItemActive: {
    backgroundColor: Colors.primaryStart,
    borderColor: Colors.primaryStart,
  },
  pickerText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  pickerTextActive: {
    color: '#fff',
    fontWeight: FontWeight.bold,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  unitsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.lg,
  },
  unitsSectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addUnitBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primaryStart,
    fontWeight: FontWeight.bold,
  },
  addedUnitsList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  formUnitCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
  },
  formUnitCardLeft: {
    gap: 2,
  },
  formUnitCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  formUnitCardDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  formUnitCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  formUnitCardPrice: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
  removeUnitBtn: {
    padding: 2,
  },
  emptyUnitsText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: Spacing.md,
  },
  formFooter: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  addUnitModalCard: {
    width: '100%',
    maxWidth: 360,
    gap: Spacing.md,
  },
});
