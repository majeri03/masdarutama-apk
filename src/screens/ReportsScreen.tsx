import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportService } from '../services/report.service';
import { salesService } from '../services/sales.service';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GlassCard, StatusBadge, StatCard } from '../components/ui';
import type { Sale, FinancialReport } from '../types';
import { acquirePrintLock, releasePrintLock } from '../utils/printLock';

export const ReportsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [financials, setFinancials] = useState<FinancialReport | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const fetchData = async (activePeriod = period) => {
    try {
      const [finRes, salesRes] = await Promise.all([
        reportService.getFinancialReport({ period: activePeriod }),
        salesService.getSales({ limit: 10 }),
      ]);

      if (finRes.success && finRes.data) {
        setFinancials(finRes.data);
      }
      if (salesRes.success && salesRes.data?.sales) {
        setRecentSales(salesRes.data.sales);
      }
    } catch (e) {
      console.warn('[REPORTS] Error loading reports:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodChange = (newPeriod: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(newPeriod);
    setLoading(true);
    fetchData(newPeriod);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getPeriodLabel = () => {
    if (period === 'daily') return 'Hari Ini';
    if (period === 'weekly') return 'Minggu Ini';
    return 'Bulan Ini';
  };

  const generateReportHtml = () => {
    if (!financials) return '';
    const printDateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'long', timeStyle: 'short' }) + ' WITA';
    const signDateStr = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'long' });
    const revenueStr = (financials.totalRevenue || 0).toLocaleString('id-ID');
    const profitStr = (financials.totalProfit || 0).toLocaleString('id-ID');
    const transactionCountStr = String(financials.totalTransactions || 0);

    let rowsHtml = '';
    recentSales.forEach((sale) => {
      const dateStr = new Date(sale.createdAt).toLocaleDateString('id-ID', {
        timeZone: 'Asia/Makassar',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      rowsHtml += `
        <tr>
          <td>${sale.invoiceNumber}</td>
          <td>${dateStr}</td>
          <td>${sale.customer?.name || 'Customer Umum'}</td>
          <td>${sale.paymentMethod}</td>
          <td class="text-right">Rp ${sale.grandTotal.toLocaleString('id-ID')}</td>
        </tr>
      `;
    });

    if (recentSales.length === 0) {
      rowsHtml = '<tr><td colspan="5" style="text-align: center; color: #888;">Tidak ada transaksi pada periode ini</td></tr>';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Laporan Keuangan TB Masdar Utama</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; color: #111; padding: 40px; margin: 0; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #111; padding-bottom: 15px; }
          .header h1 { margin: 0 0 5px 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
          .header p { margin: 3px 0; font-size: 13px; color: #444; }
          .section-title { font-size: 14px; font-weight: bold; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 35px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th, td { border: 1px solid #111; padding: 10px 12px; text-align: left; font-size: 11px; }
          th { background-color: #f0f0f0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
          .text-right { text-align: right; }
          .summary-box { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 15px; }
          .summary-item { flex: 1; border: 1px solid #111; padding: 15px; text-align: center; }
          .summary-item h3 { margin: 0 0 6px 0; font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-item p { margin: 0; font-size: 18px; font-weight: 800; }
          .footer { margin-top: 60px; display: flex; justify-content: flex-end; }
          .signature { text-align: center; width: 200px; font-size: 12px; }
          .signature-space { height: 60px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>TB MASDAR UTAMA</h1>
          <p>Laporan Ringkasan Keuangan - Periode: ${getPeriodLabel()}</p>
          <p>Dicetak pada: ${printDateStr}</p>
        </div>

        <div class="summary-box">
          <div class="summary-item">
            <h3>Omzet Penjualan</h3>
            <p>Rp ${revenueStr}</p>
          </div>
          <div class="summary-item">
            <h3>Laba Bersih</h3>
            <p>Rp ${profitStr}</p>
          </div>
          <div class="summary-item">
            <h3>Jumlah Transaksi</h3>
            <p>${transactionCountStr}</p>
          </div>
        </div>

        <div class="section-title">Riwayat Transaksi Terbaru</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">No. Invoice</th>
              <th style="width: 25%;">Tanggal</th>
              <th style="width: 25%;">Pelanggan</th>
              <th style="width: 13%;">Metode</th>
              <th style="width: 12%; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div class="signature">
            <p>Makassar, ${signDateStr}</p>
            <div class="signature-space"></div>
            <p><b>Administrasi</b></p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintReport = async () => {
    if (!financials || isPrinting) return;
    if (!acquirePrintLock()) return;
    setIsPrinting(true);
    try {
      const html = generateReportHtml();
      await Print.printAsync({ html });
    } catch (error) {
      console.warn('[PRINT_REPORT_ERROR]', error);
    } finally {
      setIsPrinting(false);
      releasePrintLock();
    }
  };

  const handleShareReport = async () => {
    if (!financials || isSharing) return;
    if (!acquirePrintLock()) return;
    setIsSharing(true);
    try {
      const html = generateReportHtml();
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share Laporan Keuangan ${getPeriodLabel()}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      console.warn('[SHARE_REPORT_ERROR]', error);
    } finally {
      setIsSharing(false);
      releasePrintLock();
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingBox}>
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
      {/* Period Selector Tabs */}
      <View style={styles.periodTabs}>
        {(['daily', 'weekly', 'monthly'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, period === p && styles.tabActive]}
            onPress={() => handlePeriodChange(p)}
          >
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action Buttons Row */}
      <View style={styles.reportActionsRow}>
        <TouchableOpacity
          style={[styles.reportActionBtn, isPrinting && { opacity: 0.6 }]}
          onPress={handlePrintReport}
          disabled={isPrinting}
          activeOpacity={0.7}
        >
          {isPrinting ? (
            <ActivityIndicator size="small" color="#333333" />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color="#333333" />
              <Text style={styles.reportActionText}>Cetak B&W</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reportActionBtn, isSharing && { opacity: 0.6 }]}
          onPress={handleShareReport}
          disabled={isSharing}
          activeOpacity={0.7}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color="#333333" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={18} color="#333333" />
              <Text style={styles.reportActionText}>Bagikan PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Financials overview cards */}
      <Text style={styles.sectionTitle}>Ringkasan Performa ({getPeriodLabel()})</Text>
      <View style={styles.metricsContainer}>
        <View style={styles.row}>
          <StatCard
            title="Omzet Penjualan"
            value={`Rp ${(financials?.totalRevenue || 0).toLocaleString('id-ID')}`}
            icon="trending-up-outline"
            iconColor={Colors.success}
          />
          <StatCard
            title="Laba Bersih"
            value={`Rp ${(financials?.totalProfit || 0).toLocaleString('id-ID')}`}
            icon="cash-outline"
            iconColor={Colors.primaryStart}
          />
        </View>
        <View style={[styles.row, { marginTop: Spacing.md }]}>
          <StatCard
            title="Jumlah Transaksi"
            value={financials?.totalTransactions || 0}
            icon="cart-outline"
            iconColor={Colors.info}
          />
          <StatCard
            title="Utang Pelanggan"
            value={`Rp ${(financials?.totalCustomerDebt || 0).toLocaleString('id-ID')}`}
            icon="calendar-outline"
            iconColor={Colors.warning}
          />
        </View>
      </View>

      {/* Recent sales history list */}
      <Text style={styles.sectionTitle}>Riwayat Transaksi Terbaru</Text>

      {recentSales.length === 0 ? (
        <GlassCard padding={24} style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>Belum ada riwayat transaksi penjualan.</Text>
        </GlassCard>
      ) : (
        <View style={styles.salesList}>
          {recentSales.map((sale) => (
            <GlassCard key={sale.id} padding={16} style={styles.saleCard}>
              <View style={styles.saleHeader}>
                <View>
                  <Text style={styles.saleInvoice}>{sale.invoiceNumber}</Text>
                  <Text style={styles.saleCustomer}>{sale.customer?.name || 'Customer Umum'}</Text>
                </View>
                <StatusBadge status={sale.status} />
              </View>

              <View style={styles.saleBody}>
                <View style={styles.saleInfoGroup}>
                  <Text style={styles.infoLabel}>Tanggal</Text>
                  <Text style={styles.infoText}>
                    {new Date(sale.createdAt).toLocaleDateString('id-ID', {
                      timeZone: 'Asia/Makassar',
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={styles.saleInfoGroup}>
                  <Text style={styles.infoLabel}>Metode Bayar</Text>
                  <View style={styles.paymentBadge}>
                    <Text style={styles.paymentBadgeText}>{sale.paymentMethod}</Text>
                  </View>
                </View>

                <View style={[styles.saleInfoGroup, { alignItems: 'flex-end' }]}>
                  <Text style={styles.infoLabel}>Total Belanja</Text>
                  <Text style={styles.saleTotal}>
                    Rp {sale.grandTotal.toLocaleString('id-ID')}
                  </Text>
                </View>
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
  loadingBox: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    letterSpacing: 0.2,
  },
  metricsContainer: {},
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  salesList: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  saleCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.md,
  },
  saleInvoice: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  saleCustomer: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  saleBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  saleInfoGroup: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  infoText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  paymentBadge: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.info,
  },
  saleTotal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    marginTop: 2,
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  reportActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#333333',
    borderRadius: BorderRadius.md,
    height: 44,
    gap: Spacing.xs,
  },
  reportActionText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#333333',
  },
});
