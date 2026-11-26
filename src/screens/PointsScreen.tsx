/**
 * PointsScreen — halaman Poin Loyalitas (24 Nov 2026, pisah Sales & Poin).
 * Dulu pengaturan poin hanya ada di tab "Sales & Poin" Pengaturan web.
 *
 * WS-8 (25 Nov 2026) — desain ulang tampilan: tabel rapi + filter /
 * pencarian + ringkasan total, disesuaikan layar HP. LOGIKA TIDAK
 * BERUBAH: pengaturan poin, saldo poin, dan penyesuaian manual sama
 * seperti sebelumnya; kolom Total Belanja (lunas) adalah agregat tampilan
 * dari backend (getCustomers) — APK hanya menampilkan. Aksen visual:
 * merah gelap #7F1D1D, latar putih / abu terang. Tombol utama memakai
 * warna aksen solid, bukan gradien biru-ungu global (komponen
 * GradientButton tidak diubah).
 *
 * WS-3 (26 Nov 2026, paket perbaikan APK ke-2) — samakan tampilan
 * dengan TransactionHistoryScreen ("itu bagus dan keren"): baris tabel
 * satu baris per customer (Customer | Belanja | Poin), teks singkat
 * (angka tanpa "Rp", tanpa "poin" di tiap baris, tanpa kontrol
 * Tambah/Kurang di tiap baris), zebra striping, dan info lengkap +
 * penyesuaian manual poin pindah ke modal detail layar penuh seperti
 * detail history. Filter & urutan tetap sama, hanya tampilannya
 * dirapikan. LOGIKA TETAP TIDAK BERUBAH.
 *
 * Isi layar ini:
 * - Pengaturan poin (aktif/mati + Rp per poin) — GET/PUT /api/settings,
 *   pola yang sama seperti SettingsScreen (api + API_ENDPOINTS).
 * - Saldo poin per customer — masterService.getCustomers() (field points
 *   sudah ada di tipe Customer).
 * - Penyesuaian manual poin — masterService.adjustCustomerPoints(), ke
 *   endpoint POST /api/customers/[id]/points yang disediakan backend
 *   bersama patch web ini.
 *
 * Aturan akses (server tetap yang memutuskan; UI hanya menyembunyikan):
 * - Pengaturan poin + penyesuaian manual: SUPER_ADMIN saja.
 * - Saldo poin: KASIR+ (POS butuh ini).
 * Aturan dapat poin TIDAK berubah: floor(grandTotal / Rp per poin), hanya
 * penjualan lunas (bukan CREDIT), bukan customer Umum.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Switch, ScrollView, Modal, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GlassCard } from '../components/ui';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { masterService } from '../services/master.service';
import type { Customer } from '../types';
import { useAuthStore } from '../stores/auth.store';
import { AppToast } from '../utils/toast';

// Aksen visual WS-8 — merah gelap, sama dengan halaman web.
const ACCENT = '#7F1D1D';

// Tombol utama lokal (aksen solid). Dipakai di layar ini saja supaya
// GradientButton global (gradien biru-ungu) tidak perlu diubah.
const AccentButton: React.FC<{ title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle }> = ({
  title,
  onPress,
  disabled,
  style,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    style={[styles.accentButton, disabled && styles.accentButtonDisabled, style]}
  >
    <Text style={styles.accentButtonText}>{title}</Text>
  </TouchableOpacity>
);

type TypeFilter = 'ALL' | 'REGULER' | 'GROSIR' | 'PROYEK' | 'UMUM';
type PointsFilter = 'ALL' | 'HAS_POINTS' | 'NO_POINTS';
type SortKey = 'name' | 'points' | 'belanja';

export const PointsScreen: React.FC = () => {
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin());
  const hasMinRole = useAuthStore((state) => state.hasMinRole);
  const canRead = hasMinRole('KASIR');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pointsEnabled, setPointsEnabled] = useState(true);
  const [pointsRate, setPointsRate] = useState('10000');
  const [savingSettings, setSavingSettings] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [pointsFilter, setPointsFilter] = useState<PointsFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  // WS-3: modal detail per customer (pola detail History).
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!canRead) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [settingsRes, customersRes] = await Promise.all([
        api.get(API_ENDPOINTS.STORE_SETTINGS),
        masterService.getCustomers(),
      ]);
      const settings = settingsRes.data?.data;
      if (settings) {
        setPointsEnabled(settings.pointsEnabled ?? true);
        setPointsRate(String(settings.pointsRupiahPerPoint ?? 10000));
      }
      if (customersRes.success && customersRes.data?.customers) {
        setCustomers(customersRes.data.customers);
      }
    } catch (e) {
      console.warn('[POINTS] Error loading points:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canRead]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => loadData(true);

  const handleSaveSettings = async () => {
    const rate = parseInt(pointsRate, 10);
    if (!Number.isInteger(rate) || rate < 1) {
      AppToast.error('Gagal', 'Nilai Rp per poin harus bilangan bulat minimal Rp 1');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await api.put(API_ENDPOINTS.STORE_SETTINGS, {
        pointsEnabled,
        pointsRupiahPerPoint: rate,
      });
      if (res.data?.success) {
        AppToast.success('Sukses', 'Pengaturan poin berhasil disimpan');
      } else {
        AppToast.error('Gagal', res.data?.error || 'Gagal menyimpan pengaturan poin');
      }
    } catch (e: any) {
      AppToast.error('Gagal', e.response?.data?.error || 'Gagal menyimpan pengaturan poin');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAdjust = async (customer: Customer, sign: 1 | -1) => {
    const amount = parseInt(adjustInputs[customer.id] || '', 10);
    if (!amount || amount <= 0) {
      AppToast.info('Perhatian', 'Masukkan jumlah poin lebih dari 0');
      return;
    }
    setAdjustingId(customer.id);
    try {
      const res = await masterService.adjustCustomerPoints(customer.id, sign * amount);
      if (res.success) {
        const updatedPoints = (res.data as unknown as { points?: number } | undefined)?.points;
        setCustomers((list) =>
          list.map((c) =>
            c.id === customer.id
              ? { ...c, points: typeof updatedPoints === 'number' ? updatedPoints : Math.max(0, (c.points ?? 0) + sign * amount) }
              : c
          )
        );
        // Sinkronkan tampilan modal detail yang sedang terbuka (WS-3).
        setDetailCustomer((prev) =>
          prev && prev.id === customer.id
            ? { ...prev, points: typeof updatedPoints === 'number' ? updatedPoints : Math.max(0, (prev.points ?? 0) + sign * amount) }
            : prev
        );
        setAdjustInputs((v) => ({ ...v, [customer.id]: '' }));
        AppToast.success('Sukses', sign > 0 ? `${amount} poin ditambahkan` : `${amount} poin dikurangi`);
      } else {
        AppToast.error('Gagal', res.error || 'Gagal mengubah poin');
      }
    } catch {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setAdjustingId(null);
    }
  };

  // ---------- Tampilan: filter + urutan + total (klien saja) ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
      if (pointsFilter === 'HAS_POINTS' && (c.points ?? 0) <= 0) return false;
      if (pointsFilter === 'NO_POINTS' && (c.points ?? 0) > 0) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) return false;
      return true;
    });
    switch (sortKey) {
      case 'points':
        return [...list].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      case 'belanja':
        return [...list].sort((a, b) => (b.totalBelanja ?? 0) - (a.totalBelanja ?? 0));
      case 'name':
      default:
        return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    }
  }, [customers, search, typeFilter, pointsFilter, sortKey]);

  // Total mengikuti filter yang aktif; customer UMUM tidak dihitung
  // (tidak punya poin dan tidak masuk total belanja berpoin).
  const totals = useMemo(() => {
    const counted = filtered.filter((c) => c.type !== 'UMUM');
    return {
      count: counted.length,
      totalPoints: counted.reduce((sum, c) => sum + (c.points ?? 0), 0),
      totalBelanja: counted.reduce((sum, c) => sum + (c.totalBelanja ?? 0), 0),
    };
  }, [filtered]);

  if (!canRead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textTertiary} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyText}>Halaman ini hanya untuk KASIR ke atas.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
  // Angka polos tanpa "Rp"/"poin" untuk sel tabel (seperti kolom Total
  // di History) — kepala tabel sudah menulis satuannya.
  const formatPlain = (value: number) => value.toLocaleString('id-ID');

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: 'ALL', label: 'Semua Tipe' },
    { key: 'REGULER', label: 'Reguler' },
    { key: 'GROSIR', label: 'Grosir' },
    { key: 'PROYEK', label: 'Proyek' },
    { key: 'UMUM', label: 'Umum' },
  ];
  const pointsChips: { key: PointsFilter; label: string }[] = [
    { key: 'ALL', label: 'Semua Poin' },
    { key: 'HAS_POINTS', label: 'Ada Poin' },
    { key: 'NO_POINTS', label: 'Tanpa Poin' },
  ];
  const sortChips: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Nama A–Z' },
    { key: 'points', label: 'Poin ↓' },
    { key: 'belanja', label: 'Belanja ↓' },
  ];

  // Baris tabel ala History: satu baris, teks singkat, tap = detail.
  // Kode, tipe & kontrol Tambah/Kurang pindah ke modal detail (WS-3).
  const renderItem = ({ item, index }: { item: Customer; index: number }) => {
    const isUmum = item.type === 'UMUM';
    const isEven = index % 2 === 0;
    return (
      <TouchableOpacity
        onPress={() => setDetailCustomer(item)}
        activeOpacity={0.7}
        style={[styles.tableRow, isEven && styles.tableRowEven]}
      >
        <Text style={[styles.tableCell, styles.colName, styles.nameText]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.tableCell, styles.colMoney]} numberOfLines={1}>
          {isUmum ? '—' : formatPlain(item.totalBelanja ?? 0)}
        </Text>
        <Text style={[styles.tableCell, styles.colPoints, styles.pointsText]} numberOfLines={1}>
          {isUmum ? '—' : formatPlain(item.points ?? 0)}
        </Text>
      </TouchableOpacity>
    );
  };

  const detailIsUmum = detailCustomer?.type === 'UMUM';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Poin Loyalitas</Text>
        <Text style={styles.subtitle}>
          Poin = belanja lunas ÷ Rp per poin (dibulatkan ke bawah). Bukan CREDIT, bukan customer Umum.
        </Text>
      </View>

      {/* Pencarian + chip filter/urutan — pola History (bar pencarian
          + strip chip), bukan kartu terpisah. */}
      <View style={styles.searchBar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama / kode customer…"
            placeholderTextColor={Colors.textTertiary}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipStrip}>
        <View style={styles.chipRow}>
          {typeChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setTypeFilter(chip.key)}
              style={[styles.chip, typeFilter === chip.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, typeFilter === chip.key && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.chipDivider} />
          {pointsChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setPointsFilter(chip.key)}
              style={[styles.chip, pointsFilter === chip.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, pointsFilter === chip.key && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.chipDivider} />
          {sortChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setSortKey(chip.key)}
              style={[styles.chip, sortKey === chip.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, sortKey === chip.key && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.resultCount}>
        Menampilkan {filtered.length} dari {customers.length} customer
      </Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <View style={styles.tableContainer}>
          {/* Ringkasan total — mengikuti filter yang aktif (label + angka saja) */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Customer</Text>
              <Text style={styles.summaryValue}>{totals.count}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Poin</Text>
              <Text style={[styles.summaryValue, { fontSize: FontSize.sm, color: ACCENT }]}>
                {formatPlain(totals.totalPoints)}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Belanja</Text>
              <Text style={[styles.summaryValue, { fontSize: FontSize.sm }]}>{formatCurrency(totals.totalBelanja)}</Text>
            </View>
          </View>

          {/* Kartu pengaturan poin — tetap di atas tabel, isinya sama */}
          <View style={styles.settingsCard}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Aktifkan pemberian poin</Text>
              <Switch
                value={pointsEnabled}
                onValueChange={setPointsEnabled}
                disabled={!isSuperAdmin}
                trackColor={{ false: '#D1D5DB', true: ACCENT }}
              />
            </View>
            <Text style={styles.inputLabel}>Nilai Rp per 1 poin</Text>
            <TextInput
              style={[styles.input, !isSuperAdmin && styles.inputDisabled]}
              value={pointsRate}
              onChangeText={setPointsRate}
              placeholder="10000"
              keyboardType="number-pad"
              editable={isSuperAdmin}
            />
            {isSuperAdmin ? (
              <AccentButton
                title={savingSettings ? 'Menyimpan…' : 'Simpan Pengaturan Poin'}
                onPress={handleSaveSettings}
                disabled={savingSettings}
                style={{ marginTop: Spacing.md }}
              />
            ) : (
              <Text style={styles.note}>Pengaturan ini hanya bisa diubah SUPER_ADMIN.</Text>
            )}
          </View>

          {/* Kepala tabel — sama seperti History */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colName]}>Customer</Text>
            <Text style={[styles.tableHeaderText, styles.colMoney, { textAlign: 'right' }]}>Belanja (Rp)</Text>
            <Text style={[styles.tableHeaderText, styles.colPoints, { textAlign: 'right' }]}>Poin</Text>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
            removeClippedSubviews={true}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListFooterComponent={
              filtered.length > 0 ? (
                <View style={[styles.tableRow, styles.tableFooter]}>
                  <Text style={[styles.footerCell, styles.colName]}>TOTAL</Text>
                  <Text style={[styles.footerCell, styles.colMoney, { textAlign: 'right' }]}>{formatPlain(totals.totalBelanja)}</Text>
                  <Text style={[styles.footerCell, styles.colPoints, { textAlign: 'right', color: ACCENT }]}>{formatPlain(totals.totalPoints)}</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Ionicons name="star-outline" size={48} color={Colors.textTertiary} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>Tidak ada customer yang cocok</Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── MODAL DETAIL CUSTOMER (WS-3): layar penuh ala detail
          History. Kode, tipe, no. HP & penyesuaian manual poin yang
          dulu ada di tiap baris pindah ke sini. ── */}
      <Modal visible={detailCustomer !== null} animationType="slide">
        <SafeAreaView style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setDetailCustomer(null)}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>Detail Poin Customer</Text>
            <TouchableOpacity onPress={() => setDetailCustomer(null)}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {detailCustomer && (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <GlassCard padding={16} style={styles.detailSection}>
                <Text style={styles.detailName}>{detailCustomer.name}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kode</Text>
                  <Text style={styles.detailValue}>{detailCustomer.code}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipe</Text>
                  <Text style={styles.detailValue}>{detailCustomer.type}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>No. HP</Text>
                  <Text style={styles.detailValue}>{detailCustomer.phone || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Total Belanja (Lunas)</Text>
                  <Text style={styles.detailValue}>
                    {detailIsUmum ? '—' : formatCurrency(detailCustomer.totalBelanja ?? 0)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Saldo Poin</Text>
                  <Text style={[styles.detailValue, { color: ACCENT }]}>
                    {detailIsUmum ? '—' : `${formatPlain(detailCustomer.points ?? 0)} poin`}
                  </Text>
                </View>
                <Text style={styles.note}>
                  Total Belanja hanya menghitung penjualan lunas (bukan CREDIT, bukan CANCELLED/RETURN) — basis yang sama dengan perolehan poin.
                </Text>
              </GlassCard>

              {detailIsUmum ? (
                <Text style={styles.note}>Customer Umum tidak dapat poin.</Text>
              ) : isSuperAdmin ? (
                <GlassCard padding={16} style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Penyesuaian Manual Poin</Text>
                  <View style={styles.adjustRow}>
                    <TextInput
                      style={styles.adjustInput}
                      value={adjustInputs[detailCustomer.id] || ''}
                      onChangeText={(t) => setAdjustInputs((v) => ({ ...v, [detailCustomer.id]: t }))}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={[styles.adjustBtn, { backgroundColor: ACCENT }]}
                      disabled={adjustingId === detailCustomer.id}
                      onPress={() => handleAdjust(detailCustomer, 1)}
                    >
                      <Ionicons name="add" size={16} color="#FFF" />
                      <Text style={styles.adjustBtnText}>Tambah</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.adjustBtn, { backgroundColor: Colors.textSecondary }]}
                      disabled={adjustingId === detailCustomer.id}
                      onPress={() => handleAdjust(detailCustomer, -1)}
                    >
                      <Ionicons name="remove" size={16} color="#FFF" />
                      <Text style={styles.adjustBtnText}>Kurang</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ) : null}

              <View style={{ marginTop: Spacing.xl, marginBottom: Spacing['3xl'] }}>
                <AccentButton title="Tutup" onPress={() => setDetailCustomer(null)} />
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Koordinator (26 Nov 2026): container transparan supaya background kaca app-wide (AppBackground di App.tsx) terlihat di layar ini juga.
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm, backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
  // Tombol utama lokal (aksen #7F1D1D, solid).
  accentButton: {
    backgroundColor: ACCENT, borderRadius: BorderRadius.md,
    paddingVertical: 12, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  accentButtonDisabled: { opacity: 0.5 },
  accentButtonText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  // Ringkasan total (3 kotak, label + angka saja).
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  summaryBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 4 },
  settingsCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  inputLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.md, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  inputDisabled: { color: Colors.textTertiary, backgroundColor: 'rgba(0,0,0,0.03)' },
  note: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: Spacing.sm },
  // Pencarian + chip filter/urutan — pola History.
  searchBar: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm },
  chipStrip: {
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  chipTextActive: { color: '#FFFFFF' },
  chipDivider: { width: 1, height: 24, backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: 2 },
  resultCount: { fontSize: FontSize.xs, color: Colors.textTertiary, paddingHorizontal: 12, paddingVertical: 8 },
  // Tabel — disalin dari TransactionHistoryScreen (zebra, sel 12px).
  tableContainer: { flex: 1 },
  listContent: { paddingBottom: Spacing.xl },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderColor: Colors.border + '80',
  },
  tableRowEven: { backgroundColor: Colors.surface },
  tableCell: { fontSize: 12, color: Colors.textPrimary },
  tableFooter: {
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  footerCell: { fontSize: 12, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  colName: { flex: 2 },
  colMoney: { flex: 1.35, textAlign: 'right' },
  colPoints: { flex: 0.95, textAlign: 'right' },
  nameText: { fontWeight: FontWeight.bold },
  pointsText: { color: ACCENT, fontWeight: FontWeight.bold },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm },
  adjustInput: {
    width: 64, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: BorderRadius.md,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: FontSize.md, color: Colors.textPrimary,
    backgroundColor: Colors.background, textAlign: 'center',
  },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md },
  adjustBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  // Modal detail layar penuh — pola TransactionHistoryScreen.
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  detailHeaderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  detailContent: { padding: Spacing.lg, gap: Spacing.md },
  detailSection: { gap: 8 },
  detailSectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  detailName: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.textPrimary },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textTertiary },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
});
