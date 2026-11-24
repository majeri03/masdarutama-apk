/**
 * SalesmenScreen — halaman Salesman (24 Nov 2026, pisah Sales & Poin).
 * Dulu kelola salesman hanya ada di tab "Sales & Poin" Pengaturan web.
 * Layar ini memakai service yang sudah ada (salesService.getSalesmen +
 * create/update/delete/toggle baru di sales.service.ts, endpoint backend
 * /api/salesmen yang sama seperti web).
 *
 * Aturan akses (server tetap yang memutuskan; UI hanya menyembunyikan):
 * - Baca daftar: KASIR+ (GET /api/salesmen).
 * - Tulis (tambah/ubah/nonaktifkan/hapus): SUPER_ADMIN saja.
 * Salesman tercatat internal di penjualan — TIDAK PERNAH dicetak di
 * invoice/struk/surat jalan.
 *
 * Fee salesman (24 Nov 2026, APK fee) — sama dengan web
 * (/dashboard/salesmen): tap nama/tombol Detail membuka detail salesman
 * (transaksi + TOTAL penjualan + TOTAL fee, dihitung server), kartu
 * pengaturan fee global (saklar + persen, default MATI, 2%), dan
 * SUPER_ADMIN bisa mengubah fee per invoice di dalam detail.
 * Aturan fee: global MATI = fee Rp0 semua invoice; fee =
 * floor(grandTotal x persen / 100). Fee TIDAK PERNAH dicetak di invoice.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GradientButton } from '../components/ui';
import { salesService } from '../services/sales.service';
import type { Salesman, SalesmanDetail, SalesmanDetailSaleRow } from '../types';
import { useAuthStore } from '../stores/auth.store';
import { AppToast } from '../utils/toast';

export const SalesmenScreen: React.FC = () => {
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin());
  const hasMinRole = useAuthStore((state) => state.hasMinRole);
  const canRead = hasMinRole('KASIR');

  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Salesman>>({});
  const [saving, setSaving] = useState(false);

  // Pengaturan fee global (24 Nov 2026): default MATI, persen default 2%.
  // Hanya SUPER_ADMIN yang bisa mengubah (server yang memutuskan);
  // KASIR+ hanya melihat statusnya.
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feePercent, setFeePercent] = useState(2);
  const [feePercentDraft, setFeePercentDraft] = useState('2');
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeSaving, setFeeSaving] = useState(false);

  // Detail salesman (24 Nov 2026): modal mengikuti pola web
  // (SalesmanDetailModal) — angka dihitung server, APK hanya tampil.
  const [detailSalesman, setDetailSalesman] = useState<Salesman | null>(null);
  const [detail, setDetail] = useState<SalesmanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [savingSaleId, setSavingSaleId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState('');
  // Draft override per baris: enabled "global" | "on" | "off",
  // percent "" = ikut persen global.
  const [drafts, setDrafts] = useState<Record<string, { enabled: string; percent: string }>>({});

  const loadData = useCallback(async (isRefresh = false) => {
    if (!canRead) { setLoading(false); setFeeLoading(false); return; }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // false = semua salesman (termasuk nonaktif), supaya SUPER_ADMIN
      // bisa mengaktifkan kembali yang dinonaktifkan.
      const res = await salesService.getSalesmen(false);
      if (res.success && Array.isArray(res.data)) {
        setSalesmen(res.data);
      } else if (!res.success) {
        AppToast.error('Gagal', res.error || 'Gagal memuat daftar salesman');
      }
    } catch (e) {
      console.warn('[SALESMEN] Error loading salesmen:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Pengaturan fee global — dimuat terpisah supaya gagalnya fee tidak
    // menghalangi daftar salesman.
    try {
      const feeRes = await salesService.getSalesmanFeeSetting();
      if (feeRes.success && feeRes.data) {
        setFeeEnabled(feeRes.data.enabled);
        setFeePercent(feeRes.data.percent);
        setFeePercentDraft(String(feeRes.data.percent));
      } else if (!feeRes.success) {
        AppToast.error('Gagal', feeRes.error || 'Gagal memuat pengaturan fee');
      }
    } catch (e) {
      console.warn('[SALESMEN] Error loading fee setting:', e);
    } finally {
      setFeeLoading(false);
    }
  }, [canRead]);

  const handleSaveFeeSetting = async () => {
    const percent = parseInt(feePercentDraft, 10);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      AppToast.error('Gagal', 'Persen fee harus bilangan bulat 0–100');
      return;
    }
    setFeeSaving(true);
    try {
      const res = await salesService.updateSalesmanFeeSetting({ enabled: feeEnabled, percent });
      if (res.success && res.data) {
        setFeeEnabled(res.data.enabled);
        setFeePercent(res.data.percent);
        setFeePercentDraft(String(res.data.percent));
        AppToast.success('Sukses', feeEnabled ? `Fee salesman diaktifkan: ${percent}% per invoice.` : 'Fee salesman dimatikan — semua invoice kini fee Rp0.');
      } else {
        AppToast.error('Gagal', res.error || 'Gagal menyimpan pengaturan fee');
      }
    } catch {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setFeeSaving(false);
    }
  };

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

  const formatShortDate = (value: string) =>
    new Date(value).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const openDetail = async (salesman: Salesman) => {
    setDetailSalesman(salesman);
    setDetail(null);
    setDetailError('');
    setRowMessage('');
    setDetailLoading(true);
    try {
      const res = await salesService.getSalesmanDetail(salesman.id);
      if (res.success && res.data) {
        setDetail(res.data);
        const nextDrafts: Record<string, { enabled: string; percent: string }> = {};
        for (const row of res.data.sales) {
          nextDrafts[row.id] = {
            enabled: row.feeEnabledOverride === null ? 'global' : row.feeEnabledOverride ? 'on' : 'off',
            percent: row.feePercentOverride === null ? '' : String(row.feePercentOverride),
          };
        }
        setDrafts(nextDrafts);
      } else {
        setDetailError(res.error || 'Gagal memuat detail salesman');
      }
    } catch {
      setDetailError('Gagal memuat detail salesman');
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async () => {
    if (detailSalesman) await openDetail(detailSalesman);
  };

  // Pilihan "fee invoice ini" (Ikut global / Aktif / Nonaktif) langsung
  // tersimpan saat dipilih — sama seperti web.
  const handleOverrideEnabled = async (saleId: string, value: string) => {
    const draft = { ...(drafts[saleId] || { enabled: 'global', percent: '' }), enabled: value };
    setDrafts((prev) => ({ ...prev, [saleId]: draft }));
    setSavingSaleId(saleId);
    setRowMessage('');
    try {
      const res = await salesService.updateSaleFeeOverride(saleId, {
        enabled: value === 'global' ? null : value === 'on',
      });
      setRowMessage(res.success ? 'Pengaturan fee invoice disimpan.' : res.error || 'Gagal menyimpan pengaturan fee invoice.');
      await reloadDetail();
    } catch {
      setRowMessage('Gagal menyimpan pengaturan fee invoice.');
    } finally {
      setSavingSaleId(null);
    }
  };

  // Persen khusus invoice disimpan lewat tombol ✓. Kosong = ikut global.
  const handlePercentSave = async (saleId: string) => {
    const draft = drafts[saleId] || { enabled: 'global', percent: '' };
    const raw = draft.percent.trim();
    if (raw === '') {
      setSavingSaleId(saleId);
      try {
        const res = await salesService.updateSaleFeeOverride(saleId, { percent: null });
        setRowMessage(res.success ? 'Persen fee invoice kembali ikut global.' : res.error || 'Gagal menyimpan persen fee invoice.');
        await reloadDetail();
      } catch {
        setRowMessage('Gagal menyimpan persen fee invoice.');
      } finally {
        setSavingSaleId(null);
      }
      return;
    }
    const percent = parseInt(raw, 10);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      setRowMessage('Persen fee harus bilangan bulat 0–100.');
      return;
    }
    setSavingSaleId(saleId);
    setRowMessage('');
    try {
      const res = await salesService.updateSaleFeeOverride(saleId, { percent });
      setRowMessage(res.success ? 'Persen fee invoice disimpan.' : res.error || 'Gagal menyimpan persen fee invoice.');
      await reloadDetail();
    } catch {
      setRowMessage('Gagal menyimpan persen fee invoice.');
    } finally {
      setSavingSaleId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => loadData(true);

  const openAddForm = () => {
    setFormData({ name: '', phone: '' });
    setShowForm(true);
  };

  const openEditForm = (salesman: Salesman) => {
    setFormData({ ...salesman });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      AppToast.error('Error', 'Nama salesman wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: formData.name.trim(), phone: formData.phone?.trim() || null };
      const res = formData.id
        ? await salesService.updateSalesman(formData.id, payload)
        : await salesService.createSalesman(payload);
      if (res.success) {
        AppToast.success('Sukses', formData.id ? 'Salesman berhasil diperbarui' : 'Salesman berhasil ditambahkan');
        setShowForm(false);
        loadData();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal menyimpan salesman');
      }
    } catch {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (salesman: Salesman) => {
    const res = await salesService.toggleSalesmanStatus(salesman);
    if (res.success) {
      AppToast.success('Sukses', res.data?.isActive ? `"${salesman.name}" diaktifkan` : `"${salesman.name}" dinonaktifkan`);
      loadData();
    } else {
      AppToast.error('Gagal', res.error || 'Gagal mengubah status salesman');
    }
  };

  const handleDelete = (salesman: Salesman) => {
    Alert.alert(
      'Hapus Salesman',
      `Hapus salesman "${salesman.name}"? Salesman yang sudah tercatat di penjualan tidak bisa dihapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const res = await salesService.deleteSalesman(salesman.id);
            if (res.success) {
              AppToast.success('Sukses', 'Salesman berhasil dihapus');
              loadData();
            } else {
              AppToast.error('Gagal', res.error || 'Gagal menghapus salesman');
            }
          },
        },
      ]
    );
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

  const renderItem = ({ item }: { item: Salesman }) => (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => openDetail(item)}>
            <Text style={[styles.name, { color: Colors.primaryStart }]}>{item.name}</Text>
          </TouchableOpacity>
          <Text style={styles.sub}>{item.phone || '-'}</Text>
          <Text style={styles.sub}>{item.salesCount ?? 0} transaksi</Text>
        </View>
        <TouchableOpacity
          disabled={!isSuperAdmin}
          onPress={() => handleToggle(item)}
          style={[styles.statusBadge, { backgroundColor: item.isActive ? Colors.successLight : 'rgba(0,0,0,0.05)' }]}
        >
          <Text style={[styles.statusText, { color: item.isActive ? Colors.success : Colors.textTertiary }]}>
            {item.isActive ? 'Aktif' : 'Nonaktif'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openDetail(item)}>
          <Ionicons name="eye-outline" size={16} color={Colors.primaryStart} />
          <Text style={styles.actionText}>Detail</Text>
        </TouchableOpacity>
        {isSuperAdmin && (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEditForm(item)}>
              <Ionicons name="create-outline" size={16} color={Colors.primaryStart} />
              <Text style={styles.actionText}>Ubah</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={[styles.actionText, { color: Colors.error }]}>Hapus</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Salesman</Text>
        <Text style={styles.subtitle}>
          {isSuperAdmin
            ? 'Kelola salesman — dipilih per transaksi di POS'
            : 'Daftar salesman (hanya lihat — perubahan oleh SUPER_ADMIN)'}
        </Text>
      </View>

      {/* Pengaturan fee salesman (24 Nov 2026) — sama dengan kartu fee
          di halaman Salesman web. SUPER_ADMIN bisa mengubah; KASIR+
          hanya melihat statusnya. */}
      <View style={styles.feeCard}>
        <View style={styles.feeCardHeader}>
          <Ionicons name="pricetag-outline" size={18} color={Colors.primaryStart} />
          <Text style={styles.feeCardTitle}>Fee Salesman (per invoice)</Text>
        </View>
        {feeLoading ? (
          <Text style={styles.sub}>Memuat pengaturan fee…</Text>
        ) : isSuperAdmin ? (
          <>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Fee salesman aktif</Text>
              <Switch value={feeEnabled} onValueChange={setFeeEnabled} />
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Persen fee (%)</Text>
              <TextInput
                style={[styles.input, styles.feePercentInput]}
                value={feePercentDraft}
                onChangeText={setFeePercentDraft}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="2"
              />
            </View>
            <GradientButton
              title={feeSaving ? 'Menyimpan…' : 'Simpan Fee'}
              onPress={handleSaveFeeSetting}
              disabled={feeSaving}
              style={{ marginTop: 8 }}
            />
            <Text style={styles.feeNote}>
              Fee = floor(grand total × persen / 100) per invoice, hanya untuk penjualan yang punya salesman. Contoh: Rp57.850 × 2% = Rp1.157. Kalau fee dimatikan di sini, fee SEMUA invoice jadi Rp0 — apa pun pengaturan fee per invoice. Fee tidak pernah dicetak di invoice.
            </Text>
          </>
        ) : (
          <Text style={styles.sub}>
            Fee salesman saat ini: {feeEnabled ? `AKTIF — ${feePercent}% per invoice` : 'NONAKTIF — fee Rp0'}. Hanya SUPER_ADMIN yang bisa mengubahnya.
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primaryStart} />
        </View>
      ) : (
        <FlatList
          data={salesmen}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStart} />}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Ionicons name="people-outline" size={48} color={Colors.textTertiary} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>Belum ada salesman</Text>
            </View>
          }
        />
      )}

      {isSuperAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openAddForm}>
          <Ionicons name="add" size={30} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Modal detail salesman (24 Nov 2026) — mengikuti SalesmanDetailModal
          web: transaksi + TOTAL penjualan + TOTAL fee (dihitung server).
          Fee TIDAK PERNAH dicetak di invoice — layar ini internal saja. */}
      <Modal visible={detailSalesman !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detail Salesman</Text>
              <TouchableOpacity onPress={() => setDetailSalesman(null)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              {detailSalesman && (
                <>
                  <Text style={[styles.name, { fontSize: FontSize.lg }]}>{detailSalesman.name}</Text>
                  <Text style={styles.sub}>{detailSalesman.phone || '-'}</Text>
                  <Text style={styles.sub}>{detailSalesman.isActive ? 'Aktif' : 'Nonaktif'}</Text>
                  {detail?.feeSetting && (
                    <Text style={[styles.sub, { color: Colors.primaryStart, fontWeight: FontWeight.bold, marginTop: 4 }]}>
                      Fee global: {detail.feeSetting.enabled ? `AKTIF ${detail.feeSetting.percent}%` : 'NONAKTIF (fee Rp0)'}
                    </Text>
                  )}
                </>
              )}
              {detailLoading ? (
                <View style={[styles.centerBox, { paddingVertical: 32 }]}>
                  <ActivityIndicator size="large" color={Colors.primaryStart} />
                </View>
              ) : detailError ? (
                <View style={{ paddingVertical: 16 }}>
                  <Text style={[styles.sub, { color: Colors.error }]}>{detailError}</Text>
                  <GradientButton title="Coba Lagi" onPress={reloadDetail} style={{ marginTop: 12 }} />
                </View>
              ) : detail ? (
                <>
                  <View style={styles.totalsRow}>
                    <View style={styles.totalBox}>
                      <Text style={styles.totalLabel}>Transaksi</Text>
                      <Text style={styles.totalValue}>{detail.salesCount}</Text>
                    </View>
                    <View style={styles.totalBox}>
                      <Text style={styles.totalLabel}>Total Penjualan</Text>
                      <Text style={styles.totalValueSmall}>{formatCurrency(detail.totalSales)}</Text>
                    </View>
                    <View style={styles.totalBox}>
                      <Text style={styles.totalLabel}>Total Fee</Text>
                      <Text style={[styles.totalValueSmall, { color: Colors.primaryStart }]}>{formatCurrency(detail.totalFee)}</Text>
                    </View>
                  </View>
                  {!detail.feeSetting.enabled && (
                    <Text style={styles.feeNote}>
                      Fee global sedang NONAKTIF, jadi fee semua invoice Rp0 (aturan utama: fee global mati = tidak ada fee di invoice mana pun).
                    </Text>
                  )}
                  <Text style={[styles.modalTitle, { marginTop: 16, marginBottom: 8 }]}>Riwayat Transaksi</Text>
                  {detail.sales.length === 0 ? (
                    <Text style={styles.sub}>Belum ada transaksi untuk salesman ini</Text>
                  ) : (
                    detail.sales.map((row: SalesmanDetailSaleRow) => {
                      const draft = drafts[row.id] || { enabled: 'global', percent: '' };
                      return (
                        <View key={row.id} style={styles.detailRow}>
                          <View style={styles.detailRowMain}>
                            <Text style={styles.detailInvoice}>{row.invoiceNumber}</Text>
                            <Text style={styles.sub}>{formatShortDate(row.saleDate)}</Text>
                            <Text style={styles.sub}>{row.customerName} • {row.status}</Text>
                            <Text style={[styles.sub, { fontWeight: FontWeight.bold, color: Colors.textPrimary }]}>
                              {formatCurrency(row.grandTotal)}
                            </Text>
                            <Text style={[styles.sub, { color: Colors.primaryStart, fontWeight: FontWeight.bold }]}>
                              Fee: {row.feeEnabled ? `${row.feePercent}%` : '0% (mati)'}{row.feePercentOverride !== null ? ' (khusus invoice)' : ''} = {formatCurrency(row.feeAmount)}
                            </Text>
                          </View>
                          {isSuperAdmin && (
                            <View style={styles.overrideBox}>
                              <View style={styles.overrideBtns}>
                                {(['global', 'on', 'off'] as const).map((opt) => (
                                  <TouchableOpacity
                                    key={opt}
                                    disabled={savingSaleId === row.id}
                                    onPress={() => handleOverrideEnabled(row.id, opt)}
                                    style={[styles.overrideBtn, draft.enabled === opt && styles.overrideBtnActive]}
                                  >
                                    <Text style={[styles.overrideBtnText, draft.enabled === opt && styles.overrideBtnTextActive]}>
                                      {opt === 'global' ? 'Ikut global' : opt === 'on' ? 'Fee aktif' : 'Fee nonaktif'}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                              <View style={styles.overridePercentRow}>
                                <TextInput
                                  style={[styles.input, styles.feePercentInput]}
                                  value={draft.percent}
                                  onChangeText={(t) => setDrafts((prev) => ({ ...prev, [row.id]: { ...draft, percent: t } }))}
                                  keyboardType="number-pad"
                                  maxLength={3}
                                  placeholder={`${detail.feeSetting.percent}%`}
                                  editable={savingSaleId !== row.id}
                                />
                                <TouchableOpacity
                                  style={styles.percentSaveBtn}
                                  disabled={savingSaleId === row.id}
                                  onPress={() => handlePercentSave(row.id)}
                                >
                                  <Text style={styles.percentSaveText}>{savingSaleId === row.id ? '…' : '✓'}</Text>
                                </TouchableOpacity>
                              </View>
                              <Text style={styles.feeNote}>Persen kosong = ikut persen global.</Text>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                  {rowMessage ? <Text style={[styles.sub, { marginTop: 8 }]}>{rowMessage}</Text> : null}
                  {isSuperAdmin && (
                    <Text style={styles.feeNote}>
                      Hanya SUPER_ADMIN yang bisa mengubah fee per invoice. &quot;Ikut global&quot; = invoice mengikuti saklar fee global; kalau saklar global mati, fee invoice ini tetap Rp0.
                    </Text>
                  )}
                </>
              ) : null}
              <GradientButton title="Tutup" onPress={() => setDetailSalesman(null)} style={{ marginTop: 16, marginBottom: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showForm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{formData.id ? 'Ubah Salesman' : 'Tambah Salesman'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.inputLabel}>Nama Salesman <Text style={{ color: Colors.error }}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.name || ''}
                onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
                placeholder="Nama salesman"
                maxLength={100}
              />
              <Text style={styles.inputLabel}>No. HP (opsional)</Text>
              <TextInput
                style={styles.input}
                value={formData.phone || ''}
                onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
                placeholder="08xxxxxxxxxx"
                keyboardType="phone-pad"
                maxLength={30}
              />
              <GradientButton
                title={saving ? 'Menyimpan…' : 'Simpan'}
                onPress={handleSave}
                disabled={saving}
                style={{ marginTop: 16, marginBottom: 24 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
  listContainer: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 44, height: 44, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryStart, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  actions: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primaryStart },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primaryStart, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  feeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  feeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  feeCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  feeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  feePercentInput: { width: 80, textAlign: 'right' },
  feeNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 8, lineHeight: 18 },
  totalsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  totalBox: { flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  totalLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  totalValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 4 },
  totalValueSmall: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 4, textAlign: 'center' },
  detailRow: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  detailRowMain: { gap: 2 },
  detailInvoice: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primaryStart },
  overrideBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  overrideBtns: { flexDirection: 'row', gap: 6 },
  overrideBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', alignItems: 'center' },
  overrideBtnActive: { backgroundColor: Colors.primaryStart, borderColor: Colors.primaryStart },
  overrideBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  overrideBtnTextActive: { color: '#FFFFFF' },
  overridePercentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  percentSaveBtn: { backgroundColor: Colors.primaryStart, borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  percentSaveText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  modalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  inputLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.md, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
});
