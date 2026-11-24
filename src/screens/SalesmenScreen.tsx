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
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { GradientButton } from '../components/ui';
import { salesService } from '../services/sales.service';
import type { Salesman } from '../types';
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

  const loadData = useCallback(async (isRefresh = false) => {
    if (!canRead) { setLoading(false); return; }
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
  }, [canRead]);

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
          <Text style={styles.name}>{item.name}</Text>
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
      {isSuperAdmin && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEditForm(item)}>
            <Ionicons name="create-outline" size={16} color={Colors.primaryStart} />
            <Text style={styles.actionText}>Ubah</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={[styles.actionText, { color: Colors.error }]}>Hapus</Text>
          </TouchableOpacity>
        </View>
      )}
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
