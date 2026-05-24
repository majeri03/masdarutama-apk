/**
 * Utility UI components: Badge, SearchBar, StatusBadge, EmptyState
 */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../../constants/theme';

// ==================== SEARCH BAR ====================
interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Cari...',
  onClear,
}) => (
  <View style={searchStyles.container}>
    <Ionicons name="search-outline" size={20} color={Colors.textTertiary} />
    <TextInput
      style={searchStyles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      autoCapitalize="none"
    />
    {value.length > 0 && (
      <TouchableOpacity onPress={onClear || (() => onChangeText(''))}>
        <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
      </TouchableOpacity>
    )}
  </View>
);

const searchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,       // putih solid
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
});

// ==================== STATUS BADGE ====================
interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  COMPLETED: { bg: Colors.successLight, text: Colors.success },
  DELIVERED: { bg: Colors.successLight, text: Colors.success },
  PAID: { bg: Colors.successLight, text: Colors.success },
  RECEIVED: { bg: Colors.successLight, text: Colors.success },
  PENDING: { bg: Colors.warningLight, text: Colors.warning },
  IN_TRANSIT: { bg: Colors.infoLight, text: Colors.info },
  PARTIAL: { bg: Colors.warningLight, text: Colors.warning },
  UNPAID: { bg: Colors.errorLight, text: Colors.error },
  OVERDUE: { bg: Colors.errorLight, text: Colors.error },
  CANCELLED: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9CA3AF' },
  RETURN: { bg: Colors.errorLight, text: Colors.error },
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Selesai',
  DELIVERED: 'Terkirim',
  PAID: 'Lunas',
  RECEIVED: 'Diterima',
  PENDING: 'Menunggu',
  IN_TRANSIT: 'Dalam Perjalanan',
  PARTIAL: 'Sebagian',
  UNPAID: 'Belum Bayar',
  OVERDUE: 'Jatuh Tempo',
  CANCELLED: 'Dibatalkan',
  RETURN: 'Retur',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const colors = STATUS_COLORS[status] || { bg: Colors.glass, text: Colors.textSecondary };
  const label = STATUS_LABELS[status] || status;

  return (
    <View
      style={[
        badgeStyles.badge,
        { backgroundColor: colors.bg },
        size === 'sm' ? badgeStyles.sm : badgeStyles.md,
      ]}
    >
      <Text
        style={[
          badgeStyles.text,
          { color: colors.text },
          size === 'sm' ? badgeStyles.textSm : badgeStyles.textMd,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  md: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  text: {
    fontWeight: FontWeight.semibold,
  },
  textSm: {
    fontSize: FontSize.xs,
  },
  textMd: {
    fontSize: FontSize.sm,
  },
});

// ==================== EMPTY STATE ====================
interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'file-tray-outline',
  title,
  message,
}) => (
  <View style={emptyStyles.container}>
    <Ionicons name={icon as any} size={64} color={Colors.textTertiary} />
    <Text style={emptyStyles.title}>{title}</Text>
    {message && <Text style={emptyStyles.message}>{message}</Text>}
  </View>
);

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    maxWidth: '80%',
  },
});

// ==================== STAT CARD ====================
interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  iconColor?: string;
  trend?: string;
  trendUp?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor = Colors.primary,
  trend,
  trendUp,
}) => (
  <View style={statStyles.card}>
    <View style={[statStyles.iconBg, { backgroundColor: iconColor + '20' }]}>
      <Ionicons name={icon as any} size={22} color={iconColor} />
    </View>
    <Text style={statStyles.value}>{value}</Text>
    <Text style={statStyles.title}>{title}</Text>
    {trend && (
      <View style={statStyles.trendRow}>
        <Ionicons
          name={trendUp ? 'trending-up' : 'trending-down'}
          size={14}
          color={trendUp ? Colors.success : Colors.error}
        />
        <Text
          style={[statStyles.trend, { color: trendUp ? Colors.success : Colors.error }]}
        >
          {trend}
        </Text>
      </View>
    )}
  </View>
);

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,    // putih solid untuk kontras di light bg
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
    // Shadow iOS lembut
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  title: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trend: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
