import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import {
  QUICK_ACTION_CATALOG,
  DEFAULT_QUICK_ACTION_IDS,
  loadQuickActionIds,
  saveQuickActionIds,
  resolveQuickActions,
  moveQuickActionId,
  navigateToQuickAction,
  type QuickActionDef,
  type QuickActionGate,
} from '../utils/quickActions';
import { productService } from '../services/product.service';
import { reportService } from '../services/report.service';
import { salesService } from '../services/sales.service';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GlassCard, StatCard } from '../components/ui';
import type { Product, FinancialReport } from '../types';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const { user, allowedPages } = useAuthStore();
  const hasMinRole = useAuthStore((state) => state.hasMinRole);

  // ── Tombol Cepat (WS-4, 25 Nov 2026) ───────────────────────────────
  // Pilihan tombol disimpan per user di AsyncStorage (kunci menyertakan
  // user id). null = belum dimuat; setelah dimuat berisi array id (bisa
  // kosong kalau user sengaja menghapus semua tombol).
  const [quickActionIds, setQuickActionIds] = useState<string[] | null>(null);
  const [editingQuickActions, setEditingQuickActions] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const quickActionGate: QuickActionGate = {
    role: user?.role,
    allowedPages,
    hasMinRole,
  };

  // Muat simpanan saat user berubah; belum pernah mengatur = default.
  // JANGAN muat selagi allowedPages masih kosong untuk non-SUPER_ADMIN:
  // daftar itu diisi async setelah login (fetchAllowedPages) — kalau
  // dimuat terlalu dini, tombol ber-gating (POS, Stock Opname, Armada)
  // akan terbuang dari hasil sanitize padahal user berhak memakainya.
  // allowedPages selalu terisi untuk semua peran (fallback ADMIN/KASIR
  // ada di auth.store), jadi length > 0 = sinyal "akses sudah dimuat".
  const quickActionsLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    if (quickActionsLoadedFor.current === user.id) return;
    if ((user.role || '').toUpperCase() !== 'SUPER_ADMIN' && allowedPages.length === 0) return;
    quickActionsLoadedFor.current = user.id;
    let alive = true;
    (async () => {
      const stored = await loadQuickActionIds(user?.id, quickActionGate);
      if (!alive) return;
      setQuickActionIds(
        stored ?? resolveQuickActions(DEFAULT_QUICK_ACTION_IDS, quickActionGate).map((d) => d.id),
      );
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, allowedPages]);

  // Kalau akses halaman berubah (mis. peran diganti / dicabut), buang
  // tombol yang sudah tidak boleh diakses — jangan tampilkan tombol mati.
  useEffect(() => {
    if (quickActionIds === null) return;
    const clean = resolveQuickActions(quickActionIds, quickActionGate).map((d) => d.id);
    if (clean.length !== quickActionIds.length) {
      setQuickActionIds(clean);
      void saveQuickActionIds(user?.id, clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedPages]);

  const visibleQuickActions: QuickActionDef[] =
    quickActionIds === null
      ? resolveQuickActions(DEFAULT_QUICK_ACTION_IDS, quickActionGate)
      : resolveQuickActions(quickActionIds, quickActionGate);

  const updateQuickActions = (next: string[]) => {
    const clean = resolveQuickActions(next, quickActionGate).map((d) => d.id);
    setQuickActionIds(clean);
    void saveQuickActionIds(user?.id, clean);
  };

  const addQuickAction = (id: string) => {
    if ((quickActionIds ?? []).includes(id)) return;
    updateQuickActions([...(quickActionIds ?? []), id]);
  };

  const removeQuickAction = (id: string) => {
    updateQuickActions((quickActionIds ?? []).filter((x) => x !== id));
  };

  const moveQuickAction = (index: number, direction: -1 | 1) => {
    updateQuickActions(moveQuickActionId(quickActionIds ?? [], index, direction));
  };

  const resetQuickActions = () => {
    Alert.alert(
      'Atur Ulang Tombol Cepat',
      'Kembalikan ke 6 tombol bawaan (Buat Transaksi, Daftar Produk, Stock Opname, Riwayat Transaksi, Tracking Armada, Printer & Device)?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Atur Ulang',
          style: 'destructive',
          onPress: () => updateQuickActions(DEFAULT_QUICK_ACTION_IDS),
        },
      ],
    );
  };

  const openPicker = () => {
    setEditingQuickActions(true);
    setPickerVisible(true);
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [storeName, setStoreName] = useState("TB Masdar Utama");
  const [weeklyData, setWeeklyData] = useState<{ day: string; amount: number }[]>([]);

  const aggregateWeeklySales = (salesList: any[]) => {
    const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const result: { day: string; dateString: string; amount: number }[] = [];

    // Create placeholders for the last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = daysOfWeek[d.getDay()];
      const dateString = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' }); // Makassar / WITA local format

      result.push({
        day: dayName,
        dateString: dateString,
        amount: 0,
      });
    }

    // Accumulate sales amount matching dateString
    salesList.forEach((sale) => {
      const saleDateString = new Date(sale.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' });
      const found = result.find(r => r.dateString === saleDateString);
      if (found) {
        found.amount += sale.grandTotal;
      }
    });

    return result.map(r => ({ day: r.day, amount: r.amount }));
  };

  const fetchData = async () => {
    try {
      const [stockRes, reportRes, settingsRes, salesRes] = await Promise.all([
        productService.getProducts({ lowStock: true, limit: 5 }),
        reportService.getFinancialReport({ period: 'daily' }),
        api.get(API_ENDPOINTS.STORE_SETTINGS).catch(() => null),
        salesService.getSales({ limit: 100 }),
      ]);

      if (stockRes.success && stockRes.data) {
        setLowStockProducts(stockRes.data.products || []);
      }
      if (reportRes.success && reportRes.data) {
        setFinancialReport(reportRes.data);
      }
      if (settingsRes?.data?.success && settingsRes?.data?.data) {
        const { name } = settingsRes.data.data;
        if (name) setStoreName(name);
        // WS-6: logoUrl dulu disimpan ke state storeLogo tapi TIDAK PERNAH
        // dirender di layar ini (header hanya menampilkan nama toko teks),
        // jadi state + fetch logonya dihapus.
      }
      if (salesRes.success && salesRes.data) {
        const salesList = (salesRes.data as any).sales || salesRes.data;
        if (Array.isArray(salesList)) {
          setWeeklyData(aggregateWeeklySales(salesList));
        }
      }
    } catch (e) {
      console.warn('[DASHBOARD] Error fetching data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getTodayFormatted = () => {
    return new Date().toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const unreadCount = useNotificationCenterStore((state) =>
    state.notifications.filter(n => !n.isRead).length
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, gap: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NotificationCenter')}
            style={{ padding: 4, position: 'relative' }}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute',
                top: 0,
                right: 0,
                backgroundColor: Colors.error,
                borderRadius: 10,
                minWidth: 18,
                height: 18,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: Colors.surface,
              }}>
                <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, unreadCount]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Header Profile Section */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.welcomeText}>{storeName}</Text>
          <Text style={styles.userName}>Hai, {user?.name || 'Kasir'}</Text>
          <View style={styles.roleContainer}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role || 'KASIR'}</Text>
            </View>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.dateText}>{getTodayFormatted()}</Text>
          </View>
        </View>
      </View>

      {/* Metrics Row (Stat Cards) */}
      <Text style={styles.sectionTitle}>Ringkasan Transaksi Hari Ini</Text>
      <View style={styles.statsRow}>
        <StatCard
          title="Omzet Kas"
          value={`Rp ${(financialReport?.totalRevenue || 0).toLocaleString('id-ID')}`}
          icon="cash-outline"
          iconColor={Colors.success}
        />
        <StatCard
          title="Transaksi"
          value={financialReport?.totalTransactions || 0}
          icon="cart-outline"
          iconColor={Colors.info}
        />
      </View>

      {/* Weekly Sales Bar Chart */}
      {weeklyData.length > 0 && (
        <View style={{ marginTop: Spacing.lg }}>
          <GlassCard padding={20} style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md }}>
              <Ionicons name="bar-chart-outline" size={18} color={Colors.primaryStart} />
              <Text style={styles.chartTitle}>Grafik Penjualan 7 Hari Terakhir</Text>
            </View>
            <View style={styles.chartRow}>
              {(() => {
                const maxAmount = Math.max(...weeklyData.map(d => d.amount), 1);
                return weeklyData.map((d, index) => {
                  const ratio = d.amount / maxAmount;
                  const barHeight = Math.max(6, ratio * 100); // Max height 100px
                  return (
                    <View key={index} style={styles.chartColumn}>
                      <View style={styles.barContainer}>
                        {d.amount > 0 ? (
                          <Text style={styles.barValueText}>
                            {d.amount >= 1000000
                              ? `${(d.amount / 1000000).toFixed(1)}M`
                              : d.amount >= 1000
                                ? `${Math.round(d.amount / 1000)}k`
                                : d.amount}
                          </Text>
                        ) : null}
                        <View style={[styles.bar, { height: barHeight }]} />
                      </View>
                      <Text style={styles.barLabel}>{d.day}</Text>
                    </View>
                  );
                });
              })()}
            </View>
          </GlassCard>
        </View>
      )}

      {/* Quick Navigation Cards — bisa diubah user (WS-4, 25 Nov 2026).
          Default = 6 tombol lama. Dalam mode edit, ketuk tombol tidak
          membuka layar; yang aktif hanya ✕ / ↑ / ↓ dan "Tambah". */}
      <View style={styles.quickHeaderRow}>
        <Text style={[styles.sectionTitle, styles.quickSectionTitle]}>Akses Cepat</Text>
        <TouchableOpacity
          style={styles.editToggleBtn}
          onPress={() => setEditingQuickActions((v) => !v)}
        >
          <Ionicons
            name={editingQuickActions ? 'checkmark-outline' : 'create-outline'}
            size={16}
            color={Colors.primaryStart}
          />
          <Text style={styles.editToggleText}>
            {editingQuickActions ? 'Selesai' : 'Ubah'}
          </Text>
        </TouchableOpacity>
      </View>
      {editingQuickActions && (
        <View style={styles.editHintRow}>
          <Text style={styles.editHintText}>
            Ketuk ✕ untuk menghapus, ↑ ↓ untuk memindah. Perubahan tersimpan otomatis.
          </Text>
          <TouchableOpacity onPress={resetQuickActions}>
            <Text style={styles.resetText}>Atur Ulang</Text>
          </TouchableOpacity>
        </View>
      )}

      {visibleQuickActions.length === 0 ? (
        <GlassCard padding={20} style={styles.emptyQuick}>
          <Ionicons name="grid-outline" size={32} color={Colors.textTertiary} />
          <Text style={styles.emptyQuickText}>Belum ada tombol cepat.</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={openPicker}>
            <Text style={styles.addFirstBtnText}>+ Tambah Fitur</Text>
          </TouchableOpacity>
        </GlassCard>
      ) : (
        <>
          {Array.from(
            { length: Math.ceil((visibleQuickActions.length + (editingQuickActions ? 1 : 0)) / 2) },
            (_, rowIndex) => {
              const rowItems = visibleQuickActions.slice(rowIndex * 2, rowIndex * 2 + 2);
              const showAddTile =
                editingQuickActions &&
                rowIndex ===
                  Math.ceil((visibleQuickActions.length + 1) / 2) - 1 &&
                visibleQuickActions.length % 2 === 0;
              return (
                <View
                  key={`quick-row-${rowIndex}`}
                  style={[styles.gridContainer, rowIndex > 0 && { marginTop: Spacing.md }]}
                >
                  {rowItems.map((def) => {
                    const index = visibleQuickActions.indexOf(def);
                    return (
                      <TouchableOpacity
                        key={def.id}
                        style={styles.gridCard}
                        activeOpacity={editingQuickActions ? 1 : 0.7}
                        onPress={() => {
                          if (!editingQuickActions) navigateToQuickAction(navigation, def);
                        }}
                      >
                        <GlassCard
                          padding={16}
                          style={[
                            styles.glassCardInner,
                            editingQuickActions && styles.glassCardInnerEditing,
                          ]}
                        >
                          <View style={[styles.iconBox, { backgroundColor: def.iconBg }]}>
                            <Ionicons name={def.icon as any} size={24} color={def.iconColor} />
                          </View>
                          <Text style={styles.gridCardTitle}>{def.label}</Text>
                          <Text style={styles.gridCardDesc}>{def.desc}</Text>
                          {editingQuickActions && (
                            <View style={styles.editActionsRow}>
                              <TouchableOpacity
                                style={[styles.editActionBtn, index === 0 && styles.editActionBtnDisabled]}
                                disabled={index === 0}
                                onPress={() => moveQuickAction(index, -1)}
                              >
                                <Ionicons
                                  name="arrow-up-outline"
                                  size={16}
                                  color={index === 0 ? Colors.textMuted : Colors.primaryStart}
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.editActionBtn,
                                  index === visibleQuickActions.length - 1 && styles.editActionBtnDisabled,
                                ]}
                                disabled={index === visibleQuickActions.length - 1}
                                onPress={() => moveQuickAction(index, 1)}
                              >
                                <Ionicons
                                  name="arrow-down-outline"
                                  size={16}
                                  color={
                                    index === visibleQuickActions.length - 1
                                      ? Colors.textMuted
                                      : Colors.primaryStart
                                  }
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.editActionBtn, styles.editRemoveBtn]}
                                onPress={() => removeQuickAction(def.id)}
                              >
                                <Ionicons name="close-outline" size={16} color={Colors.error} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </GlassCard>
                      </TouchableOpacity>
                    );
                  })}
                  {showAddTile && (
                    <TouchableOpacity style={styles.gridCard} onPress={openPicker}>
                      <View style={[styles.glassCardInner, styles.addTile]}>
                        <Ionicons name="add-circle-outline" size={28} color={Colors.primaryStart} />
                        <Text style={styles.addTileText}>Tambah Fitur</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  {/* Tile tambah di baris terakhir yang ganjil (1 kartu). */}
                  {editingQuickActions &&
                    rowItems.length === 1 &&
                    rowIndex === Math.ceil(visibleQuickActions.length / 2) - 1 && (
                      <TouchableOpacity style={styles.gridCard} onPress={openPicker}>
                        <View style={[styles.glassCardInner, styles.addTile]}>
                          <Ionicons name="add-circle-outline" size={28} color={Colors.primaryStart} />
                          <Text style={styles.addTileText}>Tambah Fitur</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                </View>
              );
            },
          )}
        </>
      )}

      {/* Pemilih fitur — hanya menampilkan fitur yang BOLEH diakses akun
          ini (gating peran yang sama seperti drawer). Sudah ditambahkan =
          tidak bisa dipilih dua kali. */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Tambah Tombol Cepat</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.pickerCloseBtn}>
                <Ionicons name="close-outline" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerNote}>
              Hanya fitur yang boleh diakses akun ini yang tampil. Ketuk + untuk menambahkan.
            </Text>
            <ScrollView>
              {QUICK_ACTION_CATALOG.filter((def) =>
                resolveQuickActions([def.id], quickActionGate).length > 0,
              ).map((def) => {
                const alreadyAdded = (quickActionIds ?? []).includes(def.id);
                return (
                  <View key={def.id}>
                    <View style={styles.pickerItem}>
                      <View style={[styles.iconBox, { backgroundColor: def.iconBg, marginBottom: 0 }]}>
                        <Ionicons name={def.icon as any} size={22} color={def.iconColor} />
                      </View>
                      <View style={styles.pickerItemText}>
                        <Text style={styles.pickerItemLabel}>{def.label}</Text>
                        <Text style={styles.pickerItemDesc}>{def.desc}</Text>
                      </View>
                      {alreadyAdded ? (
                        <View style={styles.pickerAddedBadge}>
                          <Ionicons name="checkmark-outline" size={16} color={Colors.success} />
                          <Text style={styles.pickerAddedText}>Ditambahkan</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.pickerAddBtn}
                          onPress={() => addQuickAction(def.id)}
                        >
                          <Ionicons name="add-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.pickerAddBtnText}>Tambah</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.pickerSeparator} />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>



      {/* Low Stock Alerts */}
      <View style={styles.alertHeaderRow}>
        <Text style={styles.sectionTitle}>Peringatan Stok Menipis</Text>
        <View style={styles.alertBadge}>
          <Text style={styles.alertBadgeText}>{lowStockProducts.length} Item</Text>
        </View>
      </View>

      {lowStockProducts.length === 0 ? (
        <GlassCard padding={20} style={styles.emptyAlert}>
          <Ionicons name="checkmark-circle-outline" size={32} color={Colors.success} />
          <Text style={styles.emptyAlertText}>Semua stok produk dalam kondisi aman.</Text>
        </GlassCard>
      ) : (
        <View style={styles.alertList}>
          {lowStockProducts.map((item) => (
            <GlassCard key={item.id} padding={12} style={styles.alertItem}>
              <View style={styles.alertLeft}>
                <View style={styles.alertIconBg}>
                  <Ionicons name="warning-outline" size={20} color={Colors.error} />
                </View>
                <View>
                  <Text style={styles.alertName}>{item.name}</Text>
                  <Text style={styles.alertCode}>{item.code}</Text>
                </View>
              </View>
              <View style={styles.alertRight}>
                <Text style={styles.alertStockText}>{item.currentStock}</Text>
                <Text style={styles.alertUnitText}>
                  {item.productUnits?.find((u) => u.isPrimary)?.unit?.name || 'Unit'}
                </Text>
              </View>
            </GlassCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',  // WS-6: tembus ke AppBackground app-wide
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: 'transparent',  // WS-6: tembus ke AppBackground app-wide
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerInfo: {
    flex: 1,
  },
  welcomeText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  roleBadge: {
    backgroundColor: Colors.primaryStart + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primaryStart + '40',
  },
  roleText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  dot: {
    color: Colors.textTertiary,
  },
  dateText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  // WS-6 (26 Nov 2026): DIHAPUS — style avatarBg, avatarText, storeLogo
  // tidak pernah dipakai (header profil/logo lama sudah diganti teks
  // nama toko + sapaan saja, logonya pun tidak dirender).
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  gridContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  gridCard: {
    flex: 1,
  },
  glassCardInner: {
    height: 120,
    justifyContent: 'center',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  gridCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  gridCardDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  // ── Tombol Cepat: mode edit + pemilih (WS-4) ──────────────────────
  quickHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  quickSectionTitle: {
    marginTop: 0,
    marginBottom: 0,
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryStart + '12',
    borderWidth: 1,
    borderColor: Colors.primaryStart + '30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  editToggleText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryStart,
  },
  editHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  editHintText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  resetText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
  glassCardInnerEditing: {
    height: 152,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editActionBtn: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryStart + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editActionBtnDisabled: {
    backgroundColor: Colors.background,
  },
  editRemoveBtn: {
    backgroundColor: Colors.errorLight,
    marginLeft: 'auto',
  },
  addTile: {
    height: 120,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryStart + '60',
    backgroundColor: Colors.primaryStart + '08',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addTileText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primaryStart,
  },
  emptyQuick: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  emptyQuickText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  addFirstBtn: {
    backgroundColor: Colors.primaryStart,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  addFirstBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  pickerCloseBtn: {
    padding: 4,
  },
  pickerNote: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pickerItemText: {
    flex: 1,
  },
  pickerItemLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  pickerItemDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  pickerSeparator: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  pickerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryStart,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  pickerAddBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  pickerAddedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  pickerAddedText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  alertBadge: {
    backgroundColor: Colors.errorLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  alertBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
  emptyAlert: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  emptyAlertText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  alertList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
    borderColor: 'rgba(239, 68, 68, 0.1)',
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  alertIconBg: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  alertCode: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  alertRight: {
    alignItems: 'flex-end',
  },
  alertStockText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  alertUnitText: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  chartCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  chartTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 10,
  },
  chartColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 110,
    width: '100%',
  },
  barValueText: {
    fontSize: 8,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    marginBottom: 4,
  },
  bar: {
    width: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryStart,
  },
  barLabel: {
    marginTop: 8,
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
});
