/**
 * PointsScreen — halaman Poin Loyalitas (24 Nov 2026, pisah Sales & Poin).
 * Dulu pengaturan poin hanya ada di tab "Sales & Poin" Pengaturan web.
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
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { masterService } from '../services/master.service';
import type { Customer } from '../types';
import { useAuthStore } from '../stores/auth.store';
import { AppToast } from '../utils/toast';

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

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const renderItem = ({ item }: { item: Customer }) => {
    const isUmum = item.type === 'UMUM';
    return (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.sub}>{item.code} • {item.type}</Text>
          </View>
          <Text style={styles.points}>{isUmum ? '—' : `${item.points ?? 0} poin`}</Text>
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
              style={[styles.adjustBtn, { backgroundColor: Colors.success }]}
              disabled={adjustingId === item.id}
              onPress={() => handleAdjust(item, 1)}
            >
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={styles.adjustBtnText}>Tambah</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adjustBtn, { backgroundColor: Colors.warning }]}
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
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />}
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Poin Loyalitas</Text>
              <Text style={styles.subtitle}>
                Poin = total belanja lunas dibagi Rp per poin (dibulatkan ke bawah). Bukan CREDIT, bukan customer Umum.
              </Text>

              <GlassCard style={{ marginTop: Spacing.md }}>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Aktifkan pemberian poin</Text>
                  <Switch
                    value={pointsEnabled}
                    onValueChange={setPointsEnabled}
                    disabled={!isSuperAdmin}
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
                  <GradientButton
                    title={savingSettings ? 'Menyimpan…' : 'Simpan Pengaturan Poin'}
                    onPress={handleSaveSettings}
                    disabled={savingSettings}
                    style={{ marginTop: Spacing.md }}
                  />
                ) : (
                  <Text style={styles.note}>Pengaturan ini hanya bisa diubah SUPER_ADMIN.</Text>
                )}
              </GlassCard>

              <Text style={[styles.title, { fontSize: FontSize.md, marginTop: Spacing.lg }]}>Saldo Poin Customer</Text>
              <TextInput
                style={[styles.input, { marginTop: Spacing.sm }]}
                value={search}
                onChangeText={setSearch}
                placeholder="Cari nama / kode customer…"
              />
            </View>
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  points: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  adjustInput: {
    width: 64, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: BorderRadius.md,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: FontSize.md, color: Colors.textPrimary,
    backgroundColor: Colors.background, textAlign: 'center',
  },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md },
  adjustBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
