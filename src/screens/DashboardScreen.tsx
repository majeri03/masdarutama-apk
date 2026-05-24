import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import { productService } from '../services/product.service';
import { reportService } from '../services/report.service';
import { salesService } from '../services/sales.service';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GlassCard, StatCard } from '../components/ui';
import type { Product, FinancialReport } from '../types';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';
import { Image } from 'react-native';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
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
        const { name, logoUrl } = settingsRes.data.data;
        if (name) setStoreName(name);
        if (logoUrl) setStoreLogo(logoUrl);
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
        {storeLogo ? (
          <Image source={{ uri: storeLogo }} style={styles.storeLogo} resizeMode="contain" />
        ) : (
          <Image source={require('../../assets/logomasdarutama.png')} style={styles.storeLogo} resizeMode="contain" />
        )}
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

      {/* Quick Navigation Cards */}
      <Text style={styles.sectionTitle}>Akses Cepat</Text>
      <View style={styles.gridContainer}>
        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => navigation.navigate('POS')}
        >
          <GlassCard padding={16} style={styles.glassCardInner}>
            <View style={[styles.iconBox, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="calculator-outline" size={24} color={Colors.success} />
            </View>
            <Text style={styles.gridCardTitle}>Buat Transaksi</Text>
            <Text style={styles.gridCardDesc}>Point of Sale POS</Text>
          </GlassCard>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => navigation.navigate('Products')}
        >
          <GlassCard padding={16} style={styles.glassCardInner}>
            <View style={[styles.iconBox, { backgroundColor: Colors.infoLight }]}>
              <Ionicons name="cube-outline" size={24} color={Colors.info} />
            </View>
            <Text style={styles.gridCardTitle}>Daftar Produk</Text>
            <Text style={styles.gridCardDesc}>Cari & cek stok</Text>
          </GlassCard>
        </TouchableOpacity>
      </View>

      <View style={[styles.gridContainer, { marginTop: Spacing.md }]}>
        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => navigation.navigate('StockOpname')}
        >
          <GlassCard padding={16} style={styles.glassCardInner}>
            <View style={[styles.iconBox, { backgroundColor: Colors.warningLight }]}>
              <Ionicons name="clipboard-outline" size={24} color={Colors.warning} />
            </View>
            <Text style={styles.gridCardTitle}>Stock Opname</Text>
            <Text style={styles.gridCardDesc}>Penyesuaian stok</Text>
          </GlassCard>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => navigation.navigate('History')}
        >
          <GlassCard padding={16} style={styles.glassCardInner}>
            <View style={[styles.iconBox, { backgroundColor: Colors.primaryStart + '18' }]}>
              <Ionicons name="receipt-outline" size={24} color={Colors.primaryStart} />
            </View>
            <Text style={styles.gridCardTitle}>Riwayat Transaksi</Text>
            <Text style={styles.gridCardDesc}>Laporan penjualan</Text>
          </GlassCard>
        </TouchableOpacity>
      </View>

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
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
  avatarBg: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  storeLogo: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
  },
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
