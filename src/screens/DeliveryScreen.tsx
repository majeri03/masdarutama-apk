import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton, ProofImageUploader } from '../components/ui';
import { DatePickerInput } from '../components/ui/DatePickerInput';
import { deliveryService } from '../services/delivery.service';
import { masterService } from '../services/master.service';
import { productService } from '../services/product.service';
import { salesService } from '../services/sales.service';
import { uploadService } from '../services/upload.service';
import { AppToast } from '../utils/toast';
import { useDebouncedValue } from '../utils/debounce';
import { toLocalDateString } from '../utils/dates';
import { generateInvoiceHtml, getStoreSettings } from '../utils/invoicePdf';
import { acquirePrintLock, releasePrintLock } from '../utils/printLock';
import { useAuthStore } from '../stores/auth.store';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
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
  receivedBy?: string | null;
  receivedDate?: string | null;
  proofImage?: string | null;
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

// ── WS-4 (26 Nov 2026): tempel nomor invoice & plat turunan sopir ────────
/** Samakan format nomor invoice — huruf besar, '/' jadi '-'. */
const normalizeInvoiceNumber = (v: string): string =>
  v.trim().toUpperCase().replace(/\//g, '-');
/** Bentuk nomor invoice lengkap, mis. INV/20261125-0002 atau INV-20261125-0002. */
const INVOICE_NUMBER_PATTERN = /^INV[/-]\d{8}-\d+$/i;

const normalizeDriverName = (v: string): string => v.trim().toLowerCase();
/** Label kendaraan seperti yang selama ini disimpan di DO: "DD 1234 AB (Toyota)". */
const vehicleDescOf = (f: any): string =>
  f?.brand ? `${f.plateNumber} (${f.brand})` : f.plateNumber;
/** Ambil plat dari label kendaraan: "DD 1234 AB (Toyota)" -> "DD 1234 AB". */
const extractPlateNumber = (vehicle: string): string =>
  vehicle.replace(/\s*\([^)]*\)\s*$/, '').trim();
/** Kendaraan armada milik sopir (cocok nama, abaikan huruf besar/kecil + spasi). */
const vehiclesForDriver = (fleet: any[], driverName: string): any[] =>
  (fleet || []).filter(
    (f: any) =>
      f?.plateNumber &&
      normalizeDriverName(f.driverName || '') === normalizeDriverName(driverName)
  );
/** Benar bila plat yang terisi adalah salah satu kendaraan sopir itu (atau plat ketikan manual). */
const isDerivedVehicle = (fleet: any[], driverName: string, vehicleVal: string): boolean => {
  const vs = vehiclesForDriver(fleet, driverName);
  return (
    vs.length > 0 &&
    vs.some((f) => vehicleDescOf(f) === vehicleVal || f.plateNumber === vehicleVal)
  );
};

export const DeliveryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [search, setSearch] = useState('');

  // ── Satu sumber kebenaran pencarian (Nov 2026) ───────────────────────
  // Dulu loadData() membaca `search` dari closure state: saat ketuk notifikasi
  // DO, effect params memuat daftar terfilter, tapi useFocusEffect +
  // lastNotificationTimestamp memanggil loadData() dengan search='' yang basi
  // dan menimpa hasilnya. Sekarang semua pemuatan membaca searchRef
  // (disinkronkan di setiap setSearch) atau argumen eksplisit, dan respons
  // basi dibuang lewat nomor urut request.
  const searchRef = useRef('');
  const loadSeqRef = useRef(0);
  const firstLoadDoneRef = useRef(false);

  // ── Paging daftar DO (Nov 2026) ──────────────────────────────────────
  // Backend saat ini MENGABAIKAN page/limit (getAllDeliveryOrders tanpa
  // take/skip), jadi layar ini hybrid: kirim page+limit ke server, lalu
  // deteksi dari hasil — kalau halaman 1 mengembalikan LEBIH dari limit,
  // berarti backend mengabaikan paging: simpan semua di ref dan iris
  // client-side. Kalau backend suatu hari mem-page server-side, alur
  // bawah (fetch halaman berikut) yang jalan. Dua-duanya lewat onEndReached.
  const DO_PAGE_SIZE = 30;
  const [doHasMore, setDoHasMore] = useState(false);
  const [doLoadingMore, setDoLoadingMore] = useState(false);
  const doPageRef = useRef(1);
  const doServerPagedRef = useRef<boolean | null>(null);
  const doAllRef = useRef<DeliveryOrder[]>([]);

  /** Terapkan hasil fetch halaman 1 ke state paging. */
  const applyDoFirstPage = (items: DeliveryOrder[]) => {
    doPageRef.current = 1;
    if (items.length > DO_PAGE_SIZE) {
      // Backend mengabaikan page/limit — mode client-side.
      doServerPagedRef.current = false;
      doAllRef.current = items;
      setDeliveryOrders(items.slice(0, DO_PAGE_SIZE));
      setDoHasMore(true);
    } else {
      doServerPagedRef.current = true;
      doAllRef.current = [];
      setDeliveryOrders(items);
      setDoHasMore(items.length === DO_PAGE_SIZE);
    }
  };

  /** Muat halaman berikut (dipanggil FlatList onEndReached). */
  const loadMoreDOs = async () => {
    if (loading || doLoadingMore || !doHasMore) return;
    if (doServerPagedRef.current === false) {
      // Mode client-side: iris dari data yang sudah di-fetch semua.
      const nextPage = doPageRef.current + 1;
      setDeliveryOrders(doAllRef.current.slice(0, nextPage * DO_PAGE_SIZE));
      doPageRef.current = nextPage;
      setDoHasMore(doAllRef.current.length > nextPage * DO_PAGE_SIZE);
      return;
    }
    setDoLoadingMore(true);
    try {
      const res = await deliveryService.getDeliveryOrders({
        search: search || undefined,
        status: statusFilter || undefined,
        dateFrom: startDate ? toLocalDateString(startDate) : undefined,
        dateTo: endDate ? toLocalDateString(endDate) : undefined,
        page: doPageRef.current + 1,
        limit: DO_PAGE_SIZE,
      });
      if (res.success && res.data) {
        const items = res.data as DeliveryOrder[];
        setDeliveryOrders((prev) => [...prev, ...items]);
        doPageRef.current += 1;
        setDoHasMore(items.length === DO_PAGE_SIZE);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading more DOs:', e);
    } finally {
      setDoLoadingMore(false);
    }
  };

  // Tangkap parameter pencarian dari notifikasi (misal: Surat Jalan #DO-xxx)
  useEffect(() => {
    const rawSearch = route.params?.search || route.params?.doNumber;
    if (rawSearch) {
      // Bersihkan karakter awalan seperti '#' jika ada
      const cleaned = String(rawSearch).replace(/^#/, '').trim();
      setSearch(cleaned);
      searchRef.current = cleaned;
      // Muat lewat jalur yang sama dengan semua pemuatan lain (nomor urut
      // request membuang respons basi) — jangan fetch langsung di sini.
      loadData(cleaned);
    }
  }, [route.params?.search, route.params?.doNumber]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Selected DO Details Modal
  const [selectedDO, setSelectedDO] = useState<DeliveryOrder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Status modification Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'>('PENDING');
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveryProofUrl, setDeliveryProofUrl] = useState<string | null>(null);

  // Edit DO Modal (Superadmin / Admin Only)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDriver, setEditDriver] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date | null>(new Date());
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'>('PENDING');
  const [editReceivedBy, setEditReceivedBy] = useState('');
  const [editProofImage, setEditProofImage] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Zoom Image Modal
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [showZoomModal, setShowZoomModal] = useState(false);

  // Create DO Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(new Date());
  const [salesList, setSalesList] = useState<any[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [fleetList, setFleetList] = useState<any[]>([]);
  // Upload foto bukti pengiriman saat pembuatan
  const [createDoPhotoUrl, setCreateDoPhotoUrl] = useState<string | null>(null);

  // Pencarian Transaksi POS & Filter Tanggal
  const [saleSearch, setSaleSearch] = useState('');
  const [saleSearchDate, setSaleSearchDate] = useState<Date | null>(null);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [isCreatingDO, setIsCreatingDO] = useState(false);

  // Sopir Search / Autocomplete
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [editDriverSearchQuery, setEditDriverSearchQuery] = useState('');

  const handleSelectDriver = (driverName: string, isEdit = false) => {
    if (isEdit) {
      setEditDriver(driverName);
    } else {
      setDriver(driverName);
    }
    // WS-4: plat adalah TURUNAN sopir, bukan pilihan bebas. 1 kendaraan:
    // langsung terisi otomatis. >1 kendaraan: user pilih SATU dari
    // kendaraan sopir itu. 0 kendaraan: plat dikosongkan + tampil pesan.
    const vehicles = vehiclesForDriver(fleetList, driverName);
    if (vehicles.length === 1) {
      const desc = vehicleDescOf(vehicles[0]);
      if (isEdit) {
        setEditVehicle(desc);
      } else {
        setVehicle(desc);
      }
    } else {
      if (isEdit) {
        setEditVehicle('');
      } else {
        setVehicle('');
      }
    }
  };

  /** Pilih satu kendaraan milik sopir yang sudah dipilih (kasus sopir >1 kendaraan). */
  const handleSelectDriverVehicle = (desc: string, isEdit = false) => {
    if (isEdit) {
      setEditVehicle(desc);
    } else {
      setVehicle(desc);
    }
  };

  /** Ketik nama sopir manual: kalau teks baru bukan lagi sopir armada, plat turunan ikut dihapus. */
  const handleDriverTextChange = (text: string, isEdit = false) => {
    if (isEdit) {
      setEditDriver(text);
      setEditDriverSearchQuery(text);
      if (
        isDerivedVehicle(fleetList, editDriver, editVehicle) &&
        vehiclesForDriver(fleetList, text).length === 0
      ) {
        setEditVehicle('');
      }
    } else {
      setDriver(text);
      setDriverSearchQuery(text);
      if (
        isDerivedVehicle(fleetList, driver, vehicle) &&
        vehiclesForDriver(fleetList, text).length === 0
      ) {
        setVehicle('');
      }
    }
  };

  /** Penjaga kirim: tolak pasangan sopir-plat yang tidak cocok (cermin validasi server). */
  const checkDriverVehiclePair = (driverName: string, vehicleVal: string): string | null => {
    const drv = driverName.trim();
    if (!drv) return null;
    const vehicles = vehiclesForDriver(fleetList, drv);
    if (vehicles.length === 0) return null; // Sopir luar — plat manual dibolehkan.
    if (!vehicleVal.trim()) {
      return `Sopir ${drv} punya ${vehicles.length} kendaraan — pilih plat kendaraannya.`;
    }
    const plate = extractPlateNumber(vehicleVal);
    const ok = vehicles.some((f) => f.plateNumber.trim().toUpperCase() === plate.toUpperCase());
    if (!ok) {
      return `Plat ${plate} bukan kendaraan sopir ${drv}.`;
    }
    return null;
  };

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
  // QA fix m-24: pencarian produk di-debounce 300ms supaya tidak memanggil
  // API di setiap ketikan.
  const debouncedSearchProductQuery = useDebouncedValue(searchProductQuery, 300);
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

  useEffect(() => {
    if (debouncedSearchProductQuery.length > 1) {
      loadSearchProducts(debouncedSearchProductQuery);
    }
  }, [debouncedSearchProductQuery]);

  const loadData = useCallback(async (searchOverride?: string) => {
    // Nomor urut: hanya respons dari request TERAKHIR yang boleh mengubah daftar.
    const mySeq = ++loadSeqRef.current;
    // Jangan tampilkan spinner layar penuh kalau daftar sudah ada isinya —
    // dulu setiap notifikasi masuk membuat layar jadi abu-abu kosong.
    const showFullSpinner = !firstLoadDoneRef.current;
    if (showFullSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await deliveryService.getDeliveryOrders({
        search: (searchOverride ?? searchRef.current) || undefined,
        status: statusFilter || undefined,
        // QA fix M-33: param benar adalah dateFrom/dateTo (startDate/endDate
        // diabaikan backend, jadi filter tanggal tidak pernah jalan).
        dateFrom: startDate ? toLocalDateString(startDate) : undefined,
        dateTo: endDate ? toLocalDateString(endDate) : undefined,
        page: 1,
        limit: DO_PAGE_SIZE,
      });
      // Respons basi (sudah ada request lebih baru) — buang, jangan timpa daftar.
      if (mySeq !== loadSeqRef.current) return;
      if (res.success && res.data) {
        applyDoFirstPage(res.data as DeliveryOrder[]);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading DOs:', e);
    } finally {
      if (mySeq === loadSeqRef.current) {
        firstLoadDoneRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [statusFilter, startDate, endDate]);

  const lastNotificationTimestamp = useNotificationCenterStore((s) => s.lastNotificationTimestamp);

  useEffect(() => {
    if (lastNotificationTimestamp > 0) {
      loadData();
    }
  }, [lastNotificationTimestamp, loadData]);

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
      // FIX (Nov 2026): dulu memuat 100 produk sekaligus saat modal dibuka —
      // boros dan tidak perlu, karena dropdown produk sudah memakai pencarian
      // server (loadSearchProducts, limit 10). Produk hanya diisi dari hasil
      // cari; di sini products sengaja dikosongkan.
      const [custRes, fleetRes] = await Promise.all([
        masterService.getCustomers(),
        masterService.getFleetVehicles(),
      ]);
      if (custRes.success && custRes.data?.customers) {
        setCustomers(custRes.data.customers);
        // Pre-select UMUM customer by default
        const defaultCust = custRes.data.customers.find((c: any) => c.type === 'UMUM') || custRes.data.customers[0];
        if (defaultCust && !selectedCustomerId) {
          setSelectedCustomerId(defaultCust.id);
        }
      }
      setProducts([]);
      setSalesList([]); // Jangan load semua otomatis, user cari manual
      if (fleetRes.success && fleetRes.data) {
        setFleetList(fleetRes.data);
      }
    } catch (e) {
      console.warn('[DELIVERY] Error loading master data:', e);
    }
  };

  // Pencarian sale otomatis saat mengetik (debounce 400ms, pola sama
  // dengan pencarian produk). Dulu: 2 request paralel (PENDING + COMPLETED)
  // dan hanya jalan saat tekan tombol. Sekarang 1 request tanpa filter status,
  // CANCELLED/RETURN + sale yang sudah punya DO aktif disaring di klien.
  // Helper tanggal lokal (YYYY-MM-DD) — sama seperti utils/dates.ts, ditulis
  // lokal supaya patch ini tidak bentrok dengan import di patch v2.
  const toLocalDateStr = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const debouncedSaleSearch = useDebouncedValue(saleSearch, 400);

  // Penjaga balapan (race guard): tiap pencarian menaikkan nomor urut; hanya
  // respons dari pencarian TERAKHIR yang dipakai. Tanpa ini, respons lambat
  // dari ketikan lama bisa menimpa hasil ketikan terbaru.
  const saleSearchSeqRef = useRef(0);

  const searchSales = async (query?: string, date?: Date | null) => {
    const q = (query ?? saleSearch).trim();
    const d = date !== undefined ? date : saleSearchDate;
    if (!q && !d) {
      AppToast.info('Info', 'Masukkan nomor ref/nama pelanggan atau pilih tanggal untuk mencari transaksi.');
      return;
    }
    const seq = ++saleSearchSeqRef.current;
    setIsLoadingSales(true);
    try {
      // WS-4: tempelan nomor invoice sering membawa spasi/enter dari
      // clipboard. Kalau yang ditempel berbentuk nomor invoice lengkap
      // (INV/... atau INV-...), buang semua spasi dulu; pencarian nama
      // pelanggan tetap memakai teks asli.
      const qNoSpace = q.replace(/\s+/g, '');
      const lookupTerm = INVOICE_NUMBER_PATTERN.test(qNoSpace) ? qNoSpace : q;
      const baseFilters: any = { limit: 30 };
      if (q) baseFilters.search = lookupTerm;
      if (d) {
        baseFilters.dateFrom = toLocalDateStr(d);
        baseFilters.dateTo = toLocalDateStr(d);
      }
      const res = await salesService.getSales(baseFilters);
      // Respons basi (sudah ada pencarian baru sesudahnya) — abaikan.
      if (seq !== saleSearchSeqRef.current) return;
      if (!res.success) {
        AppToast.error('Gagal', res.error || 'Gagal mencari transaksi.');
        return;
      }
      const sales = (res.data?.sales ?? []).filter((s: any) => {
        if (s.status === 'CANCELLED' || s.status === 'RETURN') return false;
        if (s.deliveryOrder && s.deliveryOrder.status !== 'CANCELLED') return false;
        return true;
      });
      sales.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSalesList(sales);
      // WS-4: tempel nomor invoice lengkap -> kalau cocok PERSIS satu
      // transaksi, langsung tautkan (pelanggan + item terisi) tanpa
      // menunggu ketukan pada baris hasil.
      if (INVOICE_NUMBER_PATTERN.test(qNoSpace)) {
        const normQ = normalizeInvoiceNumber(qNoSpace);
        const exact = sales.find(
          (s: any) => normalizeInvoiceNumber(String(s.invoiceNumber || '')) === normQ
        );
        if (exact) {
          selectSale(exact);
          AppToast.success('Ditemukan', `Invoice ${exact.invoiceNumber} terhubung — pelanggan & barang terisi otomatis.`);
          return;
        }
        if (sales.length === 0) {
          AppToast.info('Tidak Ditemukan', `Invoice ${qNoSpace} tidak ditemukan, atau sudah dibuatkan Surat Jalan.`);
          return;
        }
      }
      if (sales.length === 0) {
        AppToast.info('Tidak Ditemukan', 'Tidak ada transaksi yang cocok.');
      }
    } catch (e) {
      if (seq !== saleSearchSeqRef.current) return;
      AppToast.error('Error', 'Gagal mencari transaksi.');
    } finally {
      if (seq === saleSearchSeqRef.current) setIsLoadingSales(false);
    }
  };

  useEffect(() => {
    if (debouncedSaleSearch.trim().length >= 2 || saleSearchDate) {
      searchSales(debouncedSaleSearch, saleSearchDate);
    } else if (debouncedSaleSearch.trim().length === 0 && !saleSearchDate) {
      setSalesList([]);
    }
  }, [debouncedSaleSearch, saleSearchDate]);

  useEffect(() => {
    if (showCreateModal) {
      loadMasterData();
      setSelectedProduct(null);
      setSearchProductQuery('');
    }
  }, [showCreateModal]);

  // WS-4: modal Edit juga butuh daftar armada (turunan sopir -> plat).
  // Dulu fleetList hanya dimuat saat modal Buat dibuka, jadi edit yang
  // dibuka duluan tidak punya data sopir/kendaraan sama sekali.
  useEffect(() => {
    if (showEditModal && fleetList.length === 0) {
      masterService.getFleetVehicles().then((res) => {
        if (res.success && res.data) setFleetList(res.data);
      }).catch((e) => console.warn('[DELIVERY] Error loading fleet for edit:', e));
    }
  }, [showEditModal]);

  // ── FIX C1 (Nov 2026) ────────────────────────────────────────────────
  // Tiga fungsi ini DIPANGGIL di layar (hasil cari sale, tombol "Tanpa POS",
  // tombol Batal, dan setelah DO berhasil dibuat) tapi DEFINISINYA HILANG
  // dari patch DO kemarin — akibatnya aplikasi crash (ReferenceError) dan
  // `tsc` gagal. Definisi lengkapnya ada di sini.

  /** Pilih sale dari hasil pencarian: kunci pelanggan + isi item dari invoice. */
  const selectSale = (sale: any) => {
    if (!sale) return;
    setSelectedSaleId(sale.id);
    // Pelanggan mengikuti transaksi yang dipilih.
    const custId = sale.customerId || sale.customer?.id || '';
    if (custId) setSelectedCustomerId(custId);
    // Isi item dari invoice — lewati item tanpa produk atau qty <= 0.
    const items = ((sale.saleItems || []) as any[])
      .filter((it: any) => it && it.productId && it.product && Number(it.quantity) > 0)
      .map((it: any) => ({
        productId: it.productId,
        productName: it.product?.name || '',
        productCode: it.product?.code || '',
        unitId: it.unitId,
        unitName: it.unit?.name || 'Unit',
        quantity: Number(it.quantity),
      }));
    setDoItems(items);
    if (items.length === 0) {
      AppToast.info('Info', 'Transaksi ini tidak punya item yang bisa dikirim.');
    }
  };

  /** Kembali ke DO Manual: lepas sale + item-nya, pelanggan kembali ke UMUM. */
  const resetToManual = () => {
    setSelectedSaleId('');
    setDoItems([]);
    const umum = customers.find((c: any) => c.type === 'UMUM') || customers[0];
    if (umum) setSelectedCustomerId(umum.id);
  };

  /** Reset SELURUH form buat DO (dipakai tombol Batal + setelah DO tersimpan). */
  const resetCreateModal = () => {
    setSelectedCustomerId('');
    setSelectedSaleId('');
    setSaleSearch('');
    setSaleSearchDate(null);
    setSalesList([]);
    setCustomerSearch('');
    setDoItems([]);
    setDriver('');
    setDriverSearchQuery('');
    setVehicle('');
    setNotes('');
    setCreateDoPhotoUrl(null);
    setDeliveryDate(new Date());
    setSearchProductQuery('');
    setSelectedProduct(null);
    setSelectedUnitId('');
    setQuantity('1');
    setShowCreateModal(false);
  };

  const handleCreateDO = async () => {
    if (isCreatingDO) return;
    if (!selectedCustomerId) {
      AppToast.error('Peringatan', 'Silakan pilih pelanggan terlebih dahulu.');
      return;
    }
    if (doItems.length === 0) {
      AppToast.error('Peringatan', 'Masukkan minimal 1 produk kiriman.');
      return;
    }
    if (doItems.some((it: any) => !Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0)) {
      AppToast.error('Peringatan', 'Ada item dengan kuantitas tidak valid (harus > 0).');
      return;
    }
    // WS-4: tolak pasangan sopir-plat yang tidak cocok sebelum kirim.
    const pairError = checkDriverVehiclePair(driver, vehicle);
    if (pairError) {
      AppToast.error('Peringatan', pairError);
      return;
    }

    setIsCreatingDO(true);
    try {
      const payload = {
        customerId: selectedCustomerId,
        saleId: selectedSaleId || undefined,
        deliveryDate: deliveryDate ? toLocalDateStr(deliveryDate) : toLocalDateStr(new Date()),
        driver: driver || undefined,
        vehicle: vehicle || undefined,
        notes: notes || undefined,
        proofImage: createDoPhotoUrl || undefined,
        items: doItems.map((item) => ({
          productId: item.productId,
          unitId: item.unitId,
          quantity: item.quantity,
          notes: item.notes,
        })),
      };

      const res = await deliveryService.createDeliveryOrder(payload);
      if (res.success) {
        const autoInv = (res.data as any)?.autoInvoiceNumber;
        AppToast.success(
          'Sukses',
          autoInv
            ? `Surat Jalan berhasil dibuat! Invoice otomatis: ${autoInv} (jatuh tempo 30 hari).`
            : (res.message || 'Surat Jalan berhasil dibuat!')
        );
        resetCreateModal();
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal membuat Surat Jalan.');
      }
    } catch (e) {
      AppToast.error('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setIsCreatingDO(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedDO || updatingStatusId === selectedDO.id) return;
    if (newStatus === 'DELIVERED' && !receivedBy) {
      AppToast.error('Peringatan', 'Nama penerima wajib diisi saat status Diterima.');
      return;
    }

    setUpdatingStatusId(selectedDO.id);
    try {
      const res = await deliveryService.updateDeliveryStatus({
        id: selectedDO.id,
        status: newStatus,
        receivedBy: newStatus === 'DELIVERED' ? receivedBy : undefined,
        receivedDate: newStatus === 'DELIVERED' ? new Date().toISOString() : undefined,
        notes: selectedDO.notes || undefined,
        proofImage: deliveryProofUrl || undefined,
      });

      if (res.success) {
        // Jika ada foto bukti baru, daftarkan juga ke endpoint photos agar tersinkron ke tabel DeliveryPhoto
        if (deliveryProofUrl) {
          const estimatedSize = 200 * 1024; // 200 KB fallback
          const filename = deliveryProofUrl.split('/files/')[1]
            || deliveryProofUrl.split('/').pop()
            || deliveryProofUrl;
          deliveryService.addDeliveryPhoto(selectedDO.id, {
            url: deliveryProofUrl,
            filename,
            sizeBytes: estimatedSize,
            mimeType: 'image/jpeg',
          }).catch((err) => console.warn('[DO_PHOTO_SYNC_WARN]', err));
        }

        AppToast.success('Sukses', 'Status Surat Jalan berhasil diperbarui!');
        setShowStatusModal(false);
        setDeliveryProofUrl(null);
        if (selectedDO) {
          setSelectedDO({
            ...selectedDO,
            status: newStatus,
            receivedBy: newStatus === 'DELIVERED' ? receivedBy : selectedDO.receivedBy,
            proofImage: deliveryProofUrl || selectedDO.proofImage,
          });
        }
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal memperbarui status.');
      }
    } catch (e) {
      AppToast.error('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const openEditModal = (item: DeliveryOrder) => {
    const rawNotes = item.notes || '';
    const cleanNotes = rawNotes
      .replace(/\[BUKTI_KIRIM\]:\s*[^\s\]\n]+/g, '')
      .replace(/\[FOTO_LOKASI\]:\s*[^\s\]\n]+/g, '')
      .trim();

    const proofMatch = rawNotes.match(/\[BUKTI_KIRIM\]:\s*([^\s\]\n]+)/) || rawNotes.match(/\[FOTO_LOKASI\]:\s*([^\s\]\n]+)/);
    const resolvedProof = item.proofImage || (proofMatch ? proofMatch[1] : null);

    setEditDriver(item.driver || '');
    setEditVehicle(item.vehicle || '');
    setEditDeliveryDate(item.deliveryDate ? new Date(item.deliveryDate) : new Date());
    setEditNotes(cleanNotes);
    setEditStatus(item.status);
    setEditReceivedBy(item.receivedBy || '');
    setEditProofImage(resolvedProof);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedDO || isSavingEdit) return;
    if (editStatus === 'DELIVERED' && !editReceivedBy) {
      AppToast.error('Peringatan', 'Nama penerima wajib diisi saat status Diterima.');
      return;
    }
    // WS-4: tolak pasangan sopir-plat yang tidak cocok sebelum kirim.
    const editPairError = checkDriverVehiclePair(editDriver, editVehicle);
    if (editPairError) {
      AppToast.error('Peringatan', editPairError);
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await deliveryService.updateDeliveryOrder({
        id: selectedDO.id,
        driver: editDriver || undefined,
        vehicle: editVehicle || undefined,
        deliveryDate: editDeliveryDate ? toLocalDateString(editDeliveryDate) : undefined,
        notes: editNotes || undefined,
        status: editStatus,
        receivedBy: editStatus === 'DELIVERED' ? editReceivedBy : undefined,
        receivedDate: editStatus === 'DELIVERED' ? new Date().toISOString() : undefined,
        proofImage: editProofImage || undefined,
      });

      if (res.success) {
        // Sinkron foto baru ke tabel DeliveryPhoto
        if (editProofImage && editProofImage !== selectedDO.proofImage) {
          const estimatedSize = 200 * 1024;
          const filename = editProofImage.split('/files/')[1]
            || editProofImage.split('/').pop()
            || editProofImage;
          deliveryService.addDeliveryPhoto(selectedDO.id, {
            url: editProofImage,
            filename,
            sizeBytes: estimatedSize,
            mimeType: 'image/jpeg',
          }).catch((err) => console.warn('[DO_PHOTO_SYNC_EDIT]', err));
        }

        AppToast.success('Sukses', 'Surat Jalan berhasil diperbarui!');
        setShowEditModal(false);
        const updatedDO: DeliveryOrder = {
          ...selectedDO,
          driver: editDriver || null,
          vehicle: editVehicle || null,
          deliveryDate: editDeliveryDate ? toLocalDateString(editDeliveryDate) : selectedDO.deliveryDate,
          notes: editNotes || null,
          status: editStatus,
          receivedBy: editStatus === 'DELIVERED' ? editReceivedBy : null,
          proofImage: editProofImage || null,
        };
        setSelectedDO(updatedDO);
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal mengubah Surat Jalan.');
      }
    } catch (e) {
      AppToast.error('Error', 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteDO = (id: string) => {
    Alert.alert(
      'Hapus Surat Jalan',
      'Apakah Anda yakin ingin menghapus Surat Jalan ini? Foto bukti yang terkait juga akan dihapus dari server.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            // Hapus foto dari Cloudflare R2 jika ada (sinkronisasi)
            const doItem = deliveryOrders.find((d) => d.id === id);
            if (doItem?.notes) {
              const proofMatch = doItem.notes.match(/\[BUKTI_KIRIM\]:\s*([^\s\]\n]+)/);
              const fotoMatch = doItem.notes.match(/\[FOTO_LOKASI\]:\s*([^\s\]\n]+)/);
              // Hapus semua foto terkait dari Cloudflare
              const urlsToDelete: string[] = [];
              if (proofMatch?.[1]) urlsToDelete.push(proofMatch[1]);
              if (fotoMatch?.[1]) urlsToDelete.push(fotoMatch[1]);

              for (const imgUrl of urlsToDelete) {
                try {
                  // Ekstrak filename dari URL
                  const filename = imgUrl.split('/').pop();
                  if (filename) {
                    await uploadService.deleteImage(filename);
                  }
                } catch (e) {
                  // Non-blocking: lanjut hapus DO meski foto gagal dihapus
                  console.warn('[DELIVERY] Gagal hapus foto dari Cloudflare:', e);
                }
              }
            }

            const res = await deliveryService.deleteDeliveryOrder(id);
            if (res.success) {
              AppToast.success('Sukses', 'Surat Jalan berhasil dihapus.');
              setShowDetailsModal(false);
              setSelectedDO(null);
              loadData();
            } else {
              AppToast.error('Gagal', res.error || 'Gagal menghapus Surat Jalan.');
            }
          },
        },
      ]
    );
  };

  const handlePrintDO = async (doItem: DeliveryOrder) => {
    const acquired = acquirePrintLock();
    if (!acquired) {
      AppToast.info('Tunggu', 'Sedang ada proses cetak lain yang berjalan.');
      return;
    }

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
          id: doItem.customer?.id ?? '',
          code: doItem.customer?.code ?? '',
          name: doItem.customer?.name ?? '-',
          phone: doItem.customer?.phone ?? null,
          address: doItem.customer?.address ?? null,
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

      // WS-6: info toko dari API (getStoreSettings juga menyinkronkan layout
      // dari server). Surat Jalan hanya untuk render ini -- JANGAN ubah store
      // layout tersimpan: dulu updateLayout({ layoutType: 'SURAT_JALAN' })
      // membuat semua invoice berikutnya ikut menjadi Surat Jalan sampai
      // diubah manual di layar Desain Invoice.
      const store = await getStoreSettings();

      const html = generateInvoiceHtml(mockSale, store, { layoutType: 'SURAT_JALAN' });
      await Print.printAsync({ html });
    } catch (error) {
      AppToast.error('Gagal Cetak', 'Gagal memproses cetak surat jalan.');
    } finally {
      releasePrintLock();
    }
  };

  const handleShareDO = async (doItem: DeliveryOrder) => {
    const acquired = acquirePrintLock();
    if (!acquired) {
      AppToast.info('Tunggu', 'Sedang ada proses cetak lain yang berjalan.');
      return;
    }

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
          id: doItem.customer?.id ?? '',
          code: doItem.customer?.code ?? '',
          name: doItem.customer?.name ?? '-',
          phone: doItem.customer?.phone ?? null,
          address: doItem.customer?.address ?? null,
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

      // WS-6: info toko dari API (getStoreSettings juga menyinkronkan layout
      // dari server). Surat Jalan hanya untuk render ini -- JANGAN ubah store
      // layout tersimpan: dulu updateLayout({ layoutType: 'SURAT_JALAN' })
      // membuat semua invoice berikutnya ikut menjadi Surat Jalan sampai
      // diubah manual di layar Desain Invoice.
      const store = await getStoreSettings();

      const html = generateInvoiceHtml(mockSale, store, { layoutType: 'SURAT_JALAN' });
      const { uri } = await Print.printToFileAsync({ html });
      
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        AppToast.error('Gagal', 'Fitur bagikan PDF tidak didukung di perangkat ini.');
        return;
      }

      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      AppToast.error('Gagal Share', 'Gagal membagikan berkas PDF surat jalan.');
    } finally {
      releasePrintLock();
    }
  };

  const addItemToDo = () => {
    if (!selectedProduct || !selectedUnitId || !quantity) {
      AppToast.error('Peringatan', 'Silakan pilih produk, satuan, dan masukkan kuantitas.');
      return;
    }
    // FIX (Nov 2026): dulu quantity langsung Number(...) tanpa validasi —
    // ketikan "abc"/"0"/"-2" lolos sebagai NaN/0 dan merusak item DO.
    // Parse sekali, tolak yang bukan angka atau <= 0, pakai hasil parse-nya.
    const qtyNum = Number(quantity);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      AppToast.error('Peringatan', 'Kuantitas harus angka lebih dari 0.');
      return;
    }
    const product = selectedProduct;

    const unit = product.productUnits?.find((pu) => pu.unitId === selectedUnitId);
    if (!unit) return;

    const existingIndex = doItems.findIndex(
      (item) => item.productId === selectedProductId && item.unitId === selectedUnitId
    );

    if (existingIndex >= 0) {
      const updated = [...doItems];
      updated[existingIndex].quantity += qtyNum;
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
          quantity: qtyNum,
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
          
          <Text style={styles.customerName}>{item.customer?.name ?? '-'}</Text>
          <Text style={styles.deliveryDate}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textTertiary} /> {new Date(item.deliveryDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={{ gap: 2 }}>
              <Text style={styles.driverInfo}>Sopir: {item.driver || '-'}</Text>
              <Text style={styles.driverInfo}>Mobil: {item.vehicle || '-'}</Text>
            </View>
            <Text style={styles.itemsCount}>{item.deliveryItems?.length ?? 0} Produk</Text>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  const activeProduct = selectedProduct;

  // WS-4: kendaraan milik sopir yang sedang dipilih (plat turunan sopir).
  const createDriverVehicles = vehiclesForDriver(fleetList, driver);
  const createVehicleLocked = createDriverVehicles.length > 0;
  const editDriverVehicles = vehiclesForDriver(fleetList, editDriver);
  const editVehicleLocked = editDriverVehicles.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PENGIRIMAN & SURAT JALAN</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={Colors.primaryStart} />
        </TouchableOpacity>
      </View>

      {/* Filter & Search */}
      <View style={{ ...styles.filterSection, gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={[styles.searchWrapper, { flex: 1 }]}>
            <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari No. DO, Pelanggan..."
              placeholderTextColor={Colors.textTertiary}
              value={search}
              onChangeText={(text) => {
                setSearch(text);
                searchRef.current = text;
              }}
              onSubmitEditing={() => loadData()}
            />
            {!!search && (
              <TouchableOpacity
                onPress={() => {
                  setSearch('');
                  searchRef.current = '';
                  loadData('');
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.searchWrapper, { flex: 1, paddingHorizontal: 4 }]}>
            <DatePickerInput 
              value={startDate} 
              onChange={setStartDate} 
              placeholder="Dari Tgl" 
              compact={true} 
            />
          </View>
          <View style={[styles.searchWrapper, { flex: 1, paddingHorizontal: 4 }]}>
            <DatePickerInput 
              value={endDate} 
              onChange={setEndDate} 
              placeholder="Sp Tgl" 
              compact={true} 
            />
          </View>
        </View>

        <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4}}>
           <TouchableOpacity onPress={() => loadData()} style={{backgroundColor: Colors.primaryStart, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8}}>
             <Text style={{color: '#fff', fontSize: 12, fontWeight: 'bold'}}>Terapkan Filter</Text>
           </TouchableOpacity>
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
              <Text style={[styles.filterText, statusFilter === st && styles.filterTextActive]}>
                {st === 'IN_TRANSIT' ? 'DALAM PERJALANAN' : st}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List / Table — Responsif tanpa horizontal scroll */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Table Header — flex proporsional */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>NO. DO</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.85 }]}>TGL</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>PELANGGAN</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.75, textAlign: 'center' }]}>STATUS</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.55, textAlign: 'center' }]}>AKSI</Text>
          </View>

          <FlatList
            data={deliveryOrders}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />}
            contentContainerStyle={{ paddingBottom: Spacing['3xl'] }}
            onEndReached={loadMoreDOs}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              doLoadingMore ? (
                <View style={{ paddingVertical: Spacing.md, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.primaryStart} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="paper-plane-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>Tidak ada data Surat Jalan ditemukan.</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const statusColor = getStatusColor(item.status);
              const shortStatus = item.status === 'IN_TRANSIT' ? 'TRANSIT'
                : item.status === 'DELIVERED' ? 'TERIMA'
                : item.status === 'CANCELLED' ? 'BATAL'
                : 'TUNDA';
              return (
                <TouchableOpacity
                  style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                  onPress={() => {
                    setSelectedDO(item);
                    setShowDetailsModal(true);
                  }}
                >
                  {/* NO DO */}
                  <Text
                    style={[styles.tableRowText, { flex: 1.2, fontWeight: 'bold', color: Colors.primaryStart }]}
                    numberOfLines={1}
                  >
                    {item.doNumber}
                  </Text>

                  {/* Tanggal (dd MMM) */}
                  <View style={{ flex: 0.85 }}>
                    <Text style={[styles.tableRowText, { fontSize: 10 }]}>
                      {new Date(item.deliveryDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'short' })}
                    </Text>
                    <Text style={{ fontSize: 9, color: Colors.textTertiary }}>
                      {new Date(item.deliveryDate).getFullYear()}
                    </Text>
                  </View>

                  {/* Pelanggan */}
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableRowText, { fontSize: 11 }]} numberOfLines={1}>
                      {item.customer?.name ?? '-'}
                    </Text>
                    <Text style={{ fontSize: 9, color: Colors.textTertiary }} numberOfLines={1}>
                      {item.deliveryItems?.length ?? 0} produk
                    </Text>
                  </View>

                  {/* Status badge */}
                  <View style={{ flex: 0.75, alignItems: 'center' }}>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: statusColor + '15', borderColor: statusColor, alignSelf: 'center', margin: 0 }
                    ]}>
                      <Text style={[styles.statusText, { color: statusColor, fontSize: 9 }]}>
                        {shortStatus}
                      </Text>
                    </View>
                  </View>

                  {/* Aksi: print + share */}
                  <View style={{ flex: 0.55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={() => handlePrintDO(item)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                      <Ionicons name="print-outline" size={16} color={Colors.primaryStart} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleShareDO(item)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                      <Ionicons name="share-social-outline" size={16} color={Colors.success} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isAdmin() && (
                  <TouchableOpacity onPress={() => openEditModal(selectedDO)} style={[styles.deleteBtn, { backgroundColor: Colors.primary + '15' }]}>
                    <Ionicons name="create-outline" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                )}
                {isAdmin() && (
                  <TouchableOpacity onPress={() => handleDeleteDO(selectedDO.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  </TouchableOpacity>
                )}
              </View>
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
                <Text style={styles.detailsVal}>{selectedDO.customer?.name ?? '-'}</Text>
                {selectedDO.customer?.phone && <Text style={styles.detailsSubVal}>Telp: {selectedDO.customer.phone}</Text>}
                {selectedDO.customer?.address && <Text style={styles.detailsSubVal}>Alamat: {selectedDO.customer.address}</Text>}

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

                {selectedDO.receivedBy && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.rowBetween}>
                      <View>
                        <Text style={styles.detailsLabel}>PENERIMA</Text>
                        <Text style={styles.detailsVal}>{selectedDO.receivedBy}</Text>
                      </View>
                      {selectedDO.receivedDate && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.detailsLabel}>TGL DITERIMA</Text>
                          <Text style={styles.detailsVal}>
                            {new Date(selectedDO.receivedDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}

                {(() => {
                  const cleanNotes = (selectedDO.notes || '')
                    .replace(/\[BUKTI_KIRIM\]:\s*[^\s\]\n]+/g, '')
                    .replace(/\[FOTO_LOKASI\]:\s*[^\s\]\n]+/g, '')
                    .trim();
                  if (!cleanNotes) return null;
                  return (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.detailsLabel}>CATATAN</Text>
                      <Text style={[styles.detailsVal, { fontStyle: 'italic' }]}>"{cleanNotes}"</Text>
                    </>
                  );
                })()}
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

              {/* Foto Bukti Pengiriman Card */}
              {(() => {
                const proofMatch = selectedDO.notes?.match(/\[BUKTI_KIRIM\]:\s*([^\s\]\n]+)/);
                const fotoMatch = selectedDO.notes?.match(/\[FOTO_LOKASI\]:\s*([^\s\]\n]+)/);
                const resolvedProof = selectedDO.proofImage || (proofMatch ? proofMatch[1] : null) || (fotoMatch ? fotoMatch[1] : null);

                if (!resolvedProof) return null;

                return (
                  <>
                    <View style={[styles.rowBetween, { marginTop: Spacing.md, marginBottom: Spacing.xs }]}>
                      <Text style={styles.modalSectionTitle}>Foto Bukti Pengiriman</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: Colors.success }}>Terverifikasi</Text>
                      </View>
                    </View>
                    <GlassCard padding={12} style={styles.detailsCard}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => { setZoomImageUrl(resolvedProof); setShowZoomModal(true); }}
                        style={{ borderRadius: BorderRadius.md, overflow: 'hidden', height: 190, backgroundColor: '#000', position: 'relative' }}
                      >
                        <Image source={{ uri: resolvedProof }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="scan-outline" size={14} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' }}>Ketuk untuk Perbesar</Text>
                        </View>
                      </TouchableOpacity>
                    </GlassCard>
                  </>
                );
              })()}

              {/* Action Buttons */}
              <View style={{ gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
                {selectedDO.status !== 'DELIVERED' && selectedDO.status !== 'CANCELLED' && (
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
                )}
                {isAdmin() && (
                  <GradientButton
                    title="Edit Surat Jalan (Admin)"
                    onPress={() => openEditModal(selectedDO)}
                    variant="secondary"
                    fullWidth
                    icon={<Ionicons name="create-outline" size={18} color="#FFFFFF" />}
                  />
                )}
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
              <>
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

                <ProofImageUploader
                  label="Foto Bukti Kiriman / Barang Sampai"
                  sublabel="Foto barang di lokasi atau tanda tangan nota (Kamera langsung)"
                  imageUrl={deliveryProofUrl}
                  onImageUploaded={setDeliveryProofUrl}
                  folder="proofs_delivery"
                />
              </>
            )}

            <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
              <GradientButton title="Simpan Status Baru" onPress={handleUpdateStatus} loading={updatingStatusId === selectedDO?.id} variant="primary" fullWidth />
              <GradientButton title="Batal" onPress={() => setShowStatusModal(false)} variant="outline" fullWidth />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* ─── FULLSCREEN ZOOM MODAL ─── */}
      <Modal
        visible={showZoomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowZoomModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 10 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#FFFFFF' }}>
              Foto Bukti Kiriman
            </Text>
            <TouchableOpacity onPress={() => setShowZoomModal(false)} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {zoomImageUrl ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 }}>
              <Image source={{ uri: zoomImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          ) : null}
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
                <TextInput
                  style={[styles.textInput, { marginBottom: Spacing.sm, height: 40 }]}
                  placeholder="Cari pelanggan..."
                  placeholderTextColor={Colors.textTertiary}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  editable={!selectedSaleId}
                />
                {selectedSaleId ? (
                  <Text style={{ fontSize: 11, color: Colors.warning, marginBottom: Spacing.sm }}>
                    Pelanggan terkunci mengikuti transaksi POS yang dipilih. Ketuk "Tanpa POS (DO Manual)" di bawah untuk mengubah pelanggan.
                  </Text>
                ) : null}
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                    {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map((cust) => (
                      <TouchableOpacity
                        key={cust.id}
                        style={[styles.pickerOption, selectedCustomerId === cust.id && styles.pickerOptionActive]}
                        onPress={() => {
                          // FIX (Nov 2026): pelanggan terkunci saat sale dipilih —
                          // ganti pelanggan di tengah jalan akan membuat DO dan
                          // invoice tidak konsisten.
                          if (selectedSaleId) return;
                          setSelectedCustomerId(cust.id);
                        }}
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

                {/* Search bar */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  <TextInput
                    style={[styles.textInput, { flex: 1, height: 40 }]}
                    placeholder="Cari No. Inv / Nama Pelanggan..."
                    placeholderTextColor={Colors.textTertiary}
                    value={saleSearch}
                    onChangeText={setSaleSearch}
                    onSubmitEditing={() => searchSales()}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.primaryStart, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' }}
                    onPress={() => searchSales()}
                  >
                    {isLoadingSales
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="search" size={18} color="#FFF" />}
                  </TouchableOpacity>
                </View>

                {/* Filter tanggal */}
                <View style={{ marginBottom: 8 }}>
                  <DatePickerInput
                    value={saleSearchDate}
                    onChange={setSaleSearchDate}
                    placeholder="Filter Tanggal Transaksi (Opsional)"
                    compact={true}
                  />
                </View>

                {/* Hasil pencarian */}
                {salesList.length > 0 ? (
                  <View style={styles.saleResultsContainer}>
                    <Text style={{ fontSize: 11, color: Colors.textSecondary, paddingHorizontal: 10, paddingTop: 8 }}>
                      Ditemukan {salesList.length} transaksi — ketuk untuk menghubungkan:
                    </Text>
                    <TouchableOpacity
                      style={[styles.pickerOption, { alignSelf: 'stretch' }, selectedSaleId === '' && styles.pickerOptionActive]}
                      onPress={resetToManual}
                    >
                      <Text style={[styles.pickerOptionText, selectedSaleId === '' && styles.pickerOptionTextActive]}>
                        Tanpa POS (DO Manual)
                      </Text>
                    </TouchableOpacity>
                    <FlatList
                      data={salesList}
                      keyExtractor={(item: any) => item.id}
                      nestedScrollEnabled
                      renderItem={({ item: sale }: any) => (
                        <TouchableOpacity
                          style={[styles.pickerOption, { alignSelf: 'stretch', marginVertical: 2 }, selectedSaleId === sale.id && styles.pickerOptionActive]}
                          onPress={() => selectSale(sale)}
                        >
                          <Text style={[styles.pickerOptionText, selectedSaleId === sale.id && styles.pickerOptionTextActive]}>
                            #{sale.invoiceNumber} • {(sale as any).customer?.name || ''}
                          </Text>
                          <Text style={{ fontSize: 10, color: Colors.textTertiary }}>
                            {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('id-ID') : ''} • Rp {Number(sale.grandTotal || 0).toLocaleString('id-ID')} • {sale.status}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: Colors.textTertiary, marginTop: 4 }}>
                    Ketik nomor invoice / nama pelanggan (min. 2 huruf) — hasil muncul otomatis. Kosong = DO Manual.
                  </Text>
                )}
              </View>

              {/* Delivery Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tanggal Pengiriman *</Text>
                <DatePickerInput
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                  placeholder="Pilih Tanggal Pengiriman"
                  iconSize={20}
                  style={{height: 48, paddingHorizontal: 12}}
                />
              </View>

              {/* Driver with Autocomplete */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Sopir (Armada)</Text>
                <TextInput
                  style={styles.textInput}
                  value={driver}
                  onChangeText={(text) => handleDriverTextChange(text, false)}
                  placeholder="Ketik nama sopir..."
                  placeholderTextColor={Colors.textTertiary}
                />
                {fleetList.length > 0 && driverSearchQuery.length > 0 && (() => {
                  const uniqueDrivers = Array.from(new Set(fleetList.map((f: any) => f.driverName).filter(Boolean)));
                  const suggestions = uniqueDrivers.filter(
                    (n: any) => n.toLowerCase().includes(driverSearchQuery.toLowerCase()) && n !== driver
                  );
                  if (suggestions.length === 0) return null;
                  return (
                    <View style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, maxHeight: 130, overflow: 'hidden', marginTop: 2 }}>
                      <ScrollView nestedScrollEnabled>
                        {suggestions.map((dName: any) => (
                          <TouchableOpacity
                            key={dName}
                            style={{ padding: 10, borderBottomWidth: 1, borderColor: Colors.borderLight }}
                            onPress={() => { handleSelectDriver(dName, false); setDriverSearchQuery(''); }}
                          >
                            <Text style={{ fontSize: 13, color: Colors.textPrimary }}>{dName}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  );
                })()}
              </View>

              {/* WS-4: plat TURUNAN sopir — terkunci & terisi otomatis. */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plat Nomor / Kendaraan Armada</Text>
                {!driver.trim() ? (
                  <Text style={{ fontSize: 11, color: Colors.textTertiary, marginBottom: 6 }}>
                    Pilih sopir dulu — plat terisi otomatis dari kendaraan sopir.
                  </Text>
                ) : createDriverVehicles.length === 0 ? (
                  <Text style={{ fontSize: 11, color: Colors.warning, marginBottom: 6 }}>
                    Sopir "{driver.trim()}" tidak ada di data armada — isi plat manual (sopir luar/borongan).
                  </Text>
                ) : createDriverVehicles.length === 1 ? (
                  <Text style={{ fontSize: 11, color: Colors.success, marginBottom: 6 }}>
                    Plat terisi otomatis — sopir ini punya 1 kendaraan.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 6 }}>
                    Sopir ini punya {createDriverVehicles.length} kendaraan — pilih satu:
                  </Text>
                )}
                {createDriverVehicles.length > 1 && (
                  <View style={{ marginBottom: 6 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                      {createDriverVehicles.map((f) => {
                        const label = vehicleDescOf(f);
                        const isSelected = vehicle === f.plateNumber || vehicle === label;
                        return (
                          <TouchableOpacity
                            key={f.id || f.plateNumber}
                            style={[
                              styles.pickerOption,
                              isSelected && styles.pickerOptionActive,
                              { paddingHorizontal: 10, paddingVertical: 6 }
                            ]}
                            onPress={() => handleSelectDriverVehicle(label, false)}
                          >
                            <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive, { fontSize: 11 }]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
                <TextInput
                  style={[styles.textInput, createVehicleLocked && { backgroundColor: Colors.glass, color: Colors.textSecondary }]}
                  value={vehicle}
                  onChangeText={setVehicle}
                  placeholder={createVehicleLocked ? 'Plat terisi otomatis dari sopir' : 'Contoh: DD 1234 AB'}
                  placeholderTextColor={Colors.textTertiary}
                  editable={!createVehicleLocked}
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

              {/* Foto Bukti Pengiriman */}
              <ProofImageUploader
                label="Foto Bukti Pengiriman"
                sublabel="Foto barang di kendaraan / bukti awal muat barang (Opsional)"
                imageUrl={createDoPhotoUrl}
                onImageUploaded={setCreateDoPhotoUrl}
                folder="proofs_delivery"
              />
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
              <GradientButton title="Simpan Surat Jalan (DO)" onPress={handleCreateDO} variant="success" fullWidth loading={isCreatingDO} disabled={isCreatingDO} />
              <GradientButton title="Batal" onPress={resetCreateModal} variant="outline" fullWidth />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ─── EDIT DO MODAL (ADMIN / SUPERADMIN) ─── */}
      <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Edit Surat Jalan</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {selectedDO && (
              <GlassCard padding={16} style={styles.createCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.detailsDoNum}>{selectedDO.doNumber}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Pelanggan: {selectedDO.customer?.name ?? '-'}</Text>
                </View>

                <View style={styles.divider} />

                {/* Status Pengiriman */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Status Pengiriman *</Text>
                  <View style={styles.statusOptions}>
                    {(['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const).map((st) => (
                      <TouchableOpacity
                        key={st}
                        style={[styles.statusOptionBtn, editStatus === st && styles.statusOptionBtnActive]}
                        onPress={() => setEditStatus(st)}
                      >
                        <Text style={[styles.statusOptionText, editStatus === st && styles.statusOptionTextActive]}>
                          {getStatusLabel(st)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Tanggal Kirim */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tanggal Pengiriman *</Text>
                  <DatePickerInput
                    value={editDeliveryDate}
                    onChange={setEditDeliveryDate}
                    placeholder="Pilih tanggal pengiriman"
                  />
                </View>

                {/* Sopir */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nama Sopir</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDriver}
                    onChangeText={(text) => handleDriverTextChange(text, true)}
                    placeholder="Nama sopir pengantar"
                    placeholderTextColor={Colors.textTertiary}
                  />
                  {fleetList.length > 0 && editDriverSearchQuery.length > 0 && (() => {
                    const uniqueDrivers = Array.from(new Set(fleetList.map((f: any) => f.driverName).filter(Boolean)));
                    const suggestions = uniqueDrivers.filter(
                      (n: any) => n.toLowerCase().includes(editDriverSearchQuery.toLowerCase()) && n !== editDriver
                    );
                    if (suggestions.length === 0) return null;
                    return (
                      <View style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, maxHeight: 130, overflow: 'hidden', marginTop: 2 }}>
                        <ScrollView nestedScrollEnabled>
                          {suggestions.map((dName: any) => (
                            <TouchableOpacity
                              key={dName}
                              style={{ padding: 10, borderBottomWidth: 1, borderColor: Colors.borderLight }}
                              onPress={() => { handleSelectDriver(dName, true); setEditDriverSearchQuery(''); }}
                            >
                              <Text style={{ fontSize: 13, color: Colors.textPrimary }}>{dName}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })()}
                </View>

                {/* Kendaraan — WS-4: plat TURUNAN sopir, terkunci & terisi otomatis. */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Plat Nomor / Armada</Text>
                  {!editDriver.trim() ? (
                    <Text style={{ fontSize: 11, color: Colors.textTertiary, marginBottom: 6 }}>
                      Pilih sopir dulu — plat terisi otomatis dari kendaraan sopir.
                    </Text>
                  ) : editDriverVehicles.length === 0 ? (
                    <Text style={{ fontSize: 11, color: Colors.warning, marginBottom: 6 }}>
                      Sopir "{editDriver.trim()}" tidak ada di data armada — isi plat manual (sopir luar/borongan).
                    </Text>
                  ) : editDriverVehicles.length === 1 ? (
                    <Text style={{ fontSize: 11, color: Colors.success, marginBottom: 6 }}>
                      Plat terisi otomatis — sopir ini punya 1 kendaraan.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 6 }}>
                      Sopir ini punya {editDriverVehicles.length} kendaraan — pilih satu:
                    </Text>
                  )}
                  {editDriverVehicles.length > 1 && (
                    <View style={{ marginBottom: 6 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                        {editDriverVehicles.map((f) => {
                          const label = vehicleDescOf(f);
                          const isSelected = editVehicle === f.plateNumber || editVehicle === label;
                          return (
                            <TouchableOpacity
                              key={f.id || f.plateNumber}
                              style={[
                                styles.pickerOption,
                                isSelected && styles.pickerOptionActive,
                                { paddingHorizontal: 10, paddingVertical: 6 }
                              ]}
                              onPress={() => handleSelectDriverVehicle(label, true)}
                            >
                              <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive, { fontSize: 11 }]}>
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                  <TextInput
                    style={[styles.textInput, editVehicleLocked && { backgroundColor: Colors.glass, color: Colors.textSecondary }]}
                    value={editVehicle}
                    onChangeText={setEditVehicle}
                    placeholder={editVehicleLocked ? 'Plat terisi otomatis dari sopir' : 'Contoh: DD 1234 AB'}
                    placeholderTextColor={Colors.textTertiary}
                    editable={!editVehicleLocked}
                  />
                </View>

                {/* Nama Penerima (jika DELIVERED) */}
                {editStatus === 'DELIVERED' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Nama Penerima *</Text>
                    <TextInput
                      style={styles.textInput}
                      value={editReceivedBy}
                      onChangeText={setEditReceivedBy}
                      placeholder="Nama orang yang menerima kiriman"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                )}

                {/* Catatan */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Catatan Pengiriman</Text>
                  <TextInput
                    style={[styles.textInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Catatan alamat, kondisi pengiriman, dll."
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                  />
                </View>

                {/* Foto Bukti Pengiriman */}
                <ProofImageUploader
                  label="Foto Bukti Pengiriman"
                  sublabel="Unggah atau ganti foto bukti muat barang / pengiriman"
                  imageUrl={editProofImage}
                  onImageUploaded={setEditProofImage}
                  folder="proofs_delivery"
                />
              </GlassCard>
            )}

            {/* Actions */}
            <View style={{ gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
              <GradientButton
                title="Simpan Perubahan Surat Jalan"
                onPress={handleSaveEdit}
                loading={isSavingEdit}
                variant="primary"
                fullWidth
                icon={<Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />}
              />
              <GradientButton
                title="Batal"
                onPress={() => setShowEditModal(false)}
                variant="outline"
                fullWidth
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
  // WS-4: wadah hasil cari invoice — JANGAN pakai pickerContainer (height 40)
  // karena daftar hasil jadi terpotong 40px dan barisnya tidak bisa diketuk.
  saleResultsContainer: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: BorderRadius.md,
    maxHeight: 260,
    overflow: 'hidden',
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
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tableRowAlt: {
    backgroundColor: '#F9FAFB',
  },
  tableRowText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
});

export default DeliveryScreen;
