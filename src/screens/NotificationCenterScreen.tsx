import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotificationCenterStore } from '../stores/notificationCenter.store';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { GlassCard } from '../components/ui';

export const NotificationCenterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    cleanupOldNotifications,
  } = useNotificationCenterStore();

  useEffect(() => {
    cleanupOldNotifications();
  }, []);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const renderItem = ({ item }: { item: any }) => {
    // Fallback jika data dari push notification Expo (struktur berbeda)
    const title = item.title || item.request?.content?.title || 'Notifikasi Baru';
    const body = item.body || item.request?.content?.body || item.subtitle || '';
    const notifData = item.data || item.request?.content?.data || {};

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (!item.isRead) markAsRead(item.id);
          const screen = notifData?.screen;
          if (screen) {
            try {
              if (notifData?.params) {
                navigation.navigate(screen, notifData.params);
              } else {
                navigation.navigate(screen);
              }
            } catch (e) {
              // screen name mungkin tidak valid, abaikan
            }
          }
        }}
        style={{ marginBottom: Spacing.md }}
      >
        <GlassCard padding={16} style={{...styles.card, ...(!item.isRead ? styles.unreadCard : {})}}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, !item.isRead && { fontWeight: 'bold' }]} numberOfLines={2}>
              {title}
            </Text>
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          {!!body && (
            <Text style={styles.cardBody} numberOfLines={3}>{body}</Text>
          )}
          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
            {notifData?.screen && (
              <Text style={styles.tapHint}>Ketuk untuk membuka →</Text>
            )}
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
        <Text style={styles.headerTitle}>PUSAT NOTIFIKASI</Text>
        <View style={{ width: 32 }} />
      </View>

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
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Tidak ada notifikasi baru.</Text>
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
    paddingBottom: Spacing.xl,
  },
  card: {
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  unreadCard: {
    borderLeftColor: Colors.primaryStart,
    backgroundColor: Colors.primaryStart + '08',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryStart,
    marginLeft: 8,
  },
  cardBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  cardDate: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
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
  },
  emptySubText: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
});
