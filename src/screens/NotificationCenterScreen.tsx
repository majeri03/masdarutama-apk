import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { GlassCard } from '../components/ui';
import { navigateToScreen } from '../hooks/usePushNotifications';

/**
 * Tab screen names in Main tab navigator — navigasi ke sini butuh
 * navigate('Main', { screen: 'NamaTab' }).
 * Stack screens: navigate langsung.
 */
const TAB_SCREENS = new Set(['Dashboard', 'POS', 'Products', 'History', 'Reports', 'Settings']);

// Kategori filter notifikasi
const CATEGORIES = [
  { key: '', label: 'Semua', icon: 'notifications-outline' as const, color: Colors.primaryStart },
  { key: 'finance', label: 'Keuangan', icon: 'cash-outline' as const, color: Colors.error },
  { key: 'orders', label: 'Pesanan', icon: 'receipt-outline' as const, color: Colors.warning },
  { key: 'deliveries', label: 'Pengiriman', icon: 'car-outline' as const, color: Colors.info },
  { key: 'stock', label: 'Stok', icon: 'cube-outline' as const, color: Colors.success },
  { key: 'purchase', label: 'Pembelian', icon: 'cart-outline' as const, color: Colors.primaryStart },
];

// Mendapatkan ikon dan warna berdasarkan konten notifikasi
const getNotifMeta = (item: any): { icon: any; color: string; category: string } => {
  const titleLower = (item.title || '').toLowerCase();
  const bodyLower = (item.body || '').toLowerCase();
  const type = item.data?.type || '';

  // Deteksi dari type field dulu
  if (type === 'finance' || titleLower.includes('hutang') || titleLower.includes('piutang') || titleLower.includes('cicilan')) {
    return { icon: 'cash-outline', color: Colors.error, category: 'finance' };
  }
  if (type === 'deliveries' || titleLower.includes('surat jalan') || titleLower.includes('pengiriman') || bodyLower.includes('transit')) {
    return { icon: 'car-outline', color: Colors.info, category: 'deliveries' };
  }
  if (type === 'orders' || titleLower.includes('pesanan') || titleLower.includes('penjualan') || titleLower.includes('kasir')) {
    return { icon: 'receipt-outline', color: Colors.warning, category: 'orders' };
  }
  if (type === 'stock' || titleLower.includes('stok') || bodyLower.includes('stok')) {
    return { icon: 'cube-outline', color: Colors.success, category: 'stock' };
  }
  if (type === 'purchase' || titleLower.includes('purchase') || titleLower.includes('pembelian') || titleLower.includes('po')) {
    return { icon: 'cart-outline', color: Colors.primaryStart, category: 'purchase' };
  }
  return { icon: 'notifications-outline', color: Colors.textSecondary, category: '' };
};

export const NotificationCenterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [activeFilter, setActiveFilter] = useState('');
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    cleanupOldNotifications,
    fetchRemoteNotifications,
  } = useNotificationCenterStore();

  useEffect(() => {
    cleanupOldNotifications();
    fetchRemoteNotifications();
  }, []);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };

  /** Navigate ke screen yang tepat — bedakan Tab vs Stack */
  const handleNavigate = (screen: string, params?: any) => {
    try {
      navigation.goBack(); // Tutup dulu notification center
      setTimeout(() => {
        navigateToScreen(screen, params);
      }, 100);
    } catch (e) {
      console.warn('[NotifCenter] Navigasi gagal ke screen:', screen);
    }
  };

  // Filter notifikasi berdasarkan kategori aktif
  const filteredNotifications = activeFilter
    ? notifications.filter((n) => getNotifMeta(n).category === activeFilter)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const renderItem = ({ item }: { item: any }) => {
    // Fallback jika data dari push notification Expo (struktur berbeda)
    const title = item.title || item.request?.content?.title || 'Notifikasi Baru';
    const body = item.body || item.request?.content?.body || item.subtitle || '';
    const notifData = item.data || item.request?.content?.data || {};
    const meta = getNotifMeta(item);

    // Tentukan screen target: dari field 'screen', atau dari 'type' mapping
    const targetScreen = notifData?.screen || (
      notifData?.type && CATEGORIES.find(c => c.key === notifData.type) ? notifData.type : null
    );

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (!item.isRead) markAsRead(item.id);
          if (targetScreen) {
            handleNavigate(targetScreen, notifData?.params);
          }
        }}
        style={{ marginBottom: Spacing.sm }}
      >
        <GlassCard padding={12} style={{ ...styles.card, ...(!item.isRead ? styles.unreadCard : {}) }}>
          <View style={styles.cardRow}>
            {/* Ikon kategori */}
            <View style={[styles.iconCircle, { backgroundColor: meta.color + '18' }]}>
              <Ionicons name={meta.icon} size={18} color={meta.color} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, !item.isRead && { fontWeight: 'bold' }]} numberOfLines={2}>
                  {title}
                </Text>
                {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}
              </View>
              {!!body && (
                <Text style={styles.cardBody} numberOfLines={3}>{body}</Text>
              )}
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
                {targetScreen && (
                  <Text style={[styles.tapHint, { color: meta.color }]}>Ketuk untuk membuka →</Text>
                )}
              </View>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>PUSAT NOTIFIKASI</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} belum dibaca</Text>
          )}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.categoryBtn,
              activeFilter === cat.key && { backgroundColor: cat.color, borderColor: cat.color },
            ]}
            onPress={() => setActiveFilter(cat.key)}
          >
            <Ionicons
              name={cat.icon}
              size={13}
              color={activeFilter === cat.key ? '#fff' : cat.color}
            />
            <Text style={[
              styles.categoryBtnText,
              activeFilter === cat.key && { color: '#fff' },
            ]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={markAllAsRead} style={styles.actionBtn}>
          <Ionicons name="checkmark-done" size={16} color={Colors.primaryStart} />
          <Text style={styles.actionBtnText}>Baca Semua</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} style={[styles.actionBtn, { borderColor: Colors.error }]}>
          <Ionicons name="trash-outline" size={16} color={Colors.error} />
          <Text style={[styles.actionBtnText, { color: Colors.error }]}>Bersihkan</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>
              {activeFilter ? `Tidak ada notifikasi kategori ini.` : 'Tidak ada notifikasi baru.'}
            </Text>
            <Text style={styles.emptySubText}>Notifikasi yang lebih lama dari 5 hari akan dihapus otomatis.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: Colors.primaryStart,
    fontWeight: FontWeight.semibold,
  },
  // Category Filter
  categoryScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  categoryBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primaryStart,
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: {
    fontSize: FontSize.xs,
    color: Colors.primaryStart,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  card: {
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    marginBottom: 0,
  },
  unreadCard: {
    borderLeftColor: Colors.primaryStart,
    backgroundColor: Colors.primaryStart + '06',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryStart,
    marginLeft: 8,
    marginTop: 4,
  },
  cardBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 17,
  },
  cardDate: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tapHint: {
    fontSize: 10,
    color: Colors.primaryStart,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 64,
    padding: 32,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
});
