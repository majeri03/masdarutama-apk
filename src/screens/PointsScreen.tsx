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
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Switch, ScrollView, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
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

  const renderItem = ({ item }: { item: Customer }) => {
    const isUmum = item.type === 'UMUM';
    return (
      <View style={styles.row}>
        <View style={styles.rowCols}>
          <View style={styles.colName}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.sub}>{item.code} • {item.type}</Text>
          </View>
          <Text style={[styles.cell, styles.colMoney]}>
            {isUmum ? '—' : formatCurrency(item.totalBelanja ?? 0)}
          </Text>
          <Text style={[styles.cell, styles.colPoints, { color: ACCENT, fontWeight: FontWeight.bold }]}>
            {isUmum ? '—' : `${(item.points ?? 0).toLocaleString('id-ID')} poin`}
          </Text>
        </View>
        {isSuperAdmin && !isUmum && (
          <View style={styles.adjustRow}>
            <TextInput
              style={styles.adjustInput}
              value={adjustInputs[item.id] || ''}
              onChangeText={(t) => setAdjustInputs((v) => ({ ...v, [item.id]: t }))}
              placeholder="0"
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[styles.adjustBtn, { backgroundColor: ACCENT }]}
              disabled={adjustingId === item.id}
              onPress={() => handleAdjust(item, 1)}
            >
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={styles.adjustBtnText}>Tambah</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adjustBtn, { backgroundColor: Colors.textSecondary }]}
              disabled={adjustingId === item.id}
              onPress={() => handleAdjust(item, -1)}
            >
              <Ionicons name="remove" size={16} color="#FFF" />
              <Text style={styles.adjustBtnText}>Kurang</Text>
            </TouchableOpacity>
          </View>
        )}
        {isUmum && (
          <Text style={styles.note}>Customer Umum tidak dapat poin.</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Poin Loyalitas</Text>
              <Text style={styles.subtitle}>
                Poin = total belanja lunas dibagi Rp per poin (dibulatkan ke bawah). Bukan CREDIT, bukan customer Umum.
              </Text>

              {/* Ringkasan total — mengikuti filter yang aktif */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Customer</Text>
                  <Text style={styles.summaryValue}>{totals.count}</Text>
                  <Text style={styles.summarySub}>bukan Umum</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Total Poin</Text>
                  <Text style={[styles.summaryValue, { fontSize: FontSize.sm, color: ACCENT }]}>
                    {totals.totalPoints.toLocaleString('id-ID')} poin
                  </Text>
                  <Text style={styles.summarySub}>saldo semua customer</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Total Belanja</Text>
                  <Text style={[styles.summaryValue, { fontSize: FontSize.sm }]}>{formatCurrency(totals.totalBelanja)}</Text>
                  <Text style={styles.summarySub}>lunas saja</Text>
                </View>
              </View>

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

              <Text style={[styles.title, { fontSize: FontSize.md, marginTop: Spacing.lg }]}>Saldo Poin Customer</Text>
              <Text style={styles.subtitle}>
                Kolom Total Belanja hanya menghitung penjualan lunas (bukan CREDIT, bukan CANCELLED/RETURN) — basis yang sama dengan perolehan poin.
              </Text>

              {/* Pencarian + filter + urutan */}
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Cari nama / kode customer…"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
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

              {/* Kepala tabel */}
              <View style={[styles.rowCols, styles.tableHeader]}>
                <Text style={[styles.headerCell, styles.colName]}>Customer</Text>
                <Text style={[styles.headerCell, styles.colMoney, { textAlign: 'right' }]}>Belanja (Lunas)</Text>
                <Text style={[styles.headerCell, styles.colPoints, { textAlign: 'right' }]}>Poin</Text>
              </View>
            </View>
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <View style={[styles.rowCols, styles.tableFooter]}>
                <Text style={[styles.footerCell, styles.colName]}>TOTAL</Text>
                <Text style={[styles.footerCell, styles.colMoney, { textAlign: 'right' }]}>{formatCurrency(totals.totalBelanja)}</Text>
                <Text style={[styles.footerCell, styles.colPoints, { textAlign: 'right', color: ACCENT }]}>
                  {totals.totalPoints.toLocaleString('id-ID')} poin
                </Text>
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
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
  listContainer: { padding: Spacing.lg, gap: Spacing.md },
  // Tombol utama lokal (aksen #7F1D1D, solid).
  accentButton: {
    backgroundColor: ACCENT, borderRadius: BorderRadius.md,
    paddingVertical: 12, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  accentButtonDisabled: { opacity: 0.5 },
  accentButtonText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  // Ringkasan total (3 kotak).
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  summaryBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 4 },
  summarySub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  settingsCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.md,
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
  // Pencarian + chip filter/urutan.
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12, paddingVertical: 10, marginTop: Spacing.md, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, padding: 0 },
  chipScroll: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  chipTextActive: { color: '#FFFFFF' },
  chipDivider: { width: 1, height: 24, backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: 2 },
  resultCount: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 8 },
  // Tabel (disesuaikan layar HP): 3 kolom — Customer | Belanja | Poin.
  tableHeader: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  headerCell: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowCols: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  colName: { flex: 2 },
  colMoney: { flex: 1.35, textAlign: 'right' },
  colPoints: { flex: 0.95, textAlign: 'right' },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cell: { fontSize: FontSize.sm, color: Colors.textPrimary, paddingTop: 2 },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  adjustInput: {
    width: 64, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: BorderRadius.md,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: FontSize.md, color: Colors.textPrimary,
    backgroundColor: Colors.background, textAlign: 'center',
  },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md },
  adjustBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  tableFooter: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginTop: 8,
  },
  footerCell: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
});
