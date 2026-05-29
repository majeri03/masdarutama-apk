import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSidebarStore } from '../../stores/sidebar.store';
import { useAuthStore } from '../../stores/auth.store';
import { useNotificationStore } from '../../stores/notification.store';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { navigationRef } from '../../utils/navigation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

interface MenuRoute {
  name: string;
  label: string;
  icon: string;
}

export const SidebarDrawer: React.FC = () => {
  const { isOpen, closeSidebar } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const waOrdersPending = useNotificationStore((state) => state.waOrdersPending);
  const deliveriesPending = useNotificationStore((state) => state.deliveriesPending);

  
  // Animation value
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      // Animate open
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate close
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const handleNavigate = (routeName: string) => {
    closeSidebar();
    
    // Defer navigation slightly to allow drawer closing animation to finish
    setTimeout(() => {
      if (navigationRef.isReady()) {
        // Check if route is a MainTabNavigator route or outside stack route
        const tabRoutes = ['Dashboard', 'POS', 'Products', 'History', 'Reports', 'Settings'];
        if (tabRoutes.includes(routeName)) {
          (navigationRef as any).navigate('Main', { screen: routeName });
        } else {
          (navigationRef as any).navigate(routeName);
        }
      }
    }, 150);
  };

  const handleLogout = () => {
    closeSidebar();
    setTimeout(() => {
      logout();
    }, 150);
  };

  const routes: MenuRoute[] = [
    { name: 'StockOpname', label: 'Stock Opname', icon: 'clipboard-outline' },
    { name: 'Delivery', label: 'Surat Jalan & Pengiriman', icon: 'paper-plane-outline' },
    { name: 'Purchase', label: 'Purchase Order (PO)', icon: 'cart-outline' },
    { name: 'Debt', label: 'Manajemen Utang & Piutang', icon: 'journal-outline' },
    { name: 'InvoiceLayout', label: 'Desain & Layout Invoice', icon: 'color-palette-outline' },
    { name: 'WaOrders', label: 'Orderan WhatsApp', icon: 'logo-whatsapp' },
    { name: 'Customers', label: 'Pelanggan', icon: 'people-outline' },
  ];

  if (!isOpen) return null;

  return (
    <Modal
      transparent
      visible={isOpen}
      onRequestClose={closeSidebar}
      animationType="none"
    >
      <View style={styles.container}>
        {/* Backdrop overlay */}
        <TouchableWithoutFeedback onPress={closeSidebar}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Drawer Content Panel */}
        <Animated.View style={[styles.drawerPanel, { transform: [{ translateX: slideAnim }] }]}>
          <BlurView intensity={40} tint="light" style={styles.blurWrapper}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.95)', 'rgba(240, 244, 248, 0.85)']}
              style={styles.gradientWrapper}
            >
              <SafeAreaView style={styles.safeArea}>
                {/* Store & User Profile Header */}
                <View style={styles.header}>
                  <View style={styles.logoRow}>
                    <View style={styles.logoBg}>
                      <Ionicons name="storefront-outline" size={24} color={Colors.primaryStart} />
                    </View>
                    <View>
                      <Text style={styles.storeName}>TB Masdar Utama</Text>
                      <Text style={styles.storeTagline}>Aplikasi Kasir Premium</Text>
                    </View>
                  </View>

                  <View style={styles.profileBox}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'K'}</Text>
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={styles.userName}>{user?.name || 'Kasir'}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>{user?.role || 'KASIR'}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
                  <Text style={styles.menuSectionTitle}>Navigasi Fitur</Text>
                  {routes.map((route) => {
                    // Check for badges
                    let badgeCount = 0;
                    if (route.name === 'WaOrders') badgeCount = waOrdersPending;
                    if (route.name === 'Delivery') badgeCount = deliveriesPending;

                    return (
                      <TouchableOpacity
                        key={route.name}
                        style={styles.menuItem}
                        onPress={() => handleNavigate(route.name)}
                      >
                        <View style={styles.menuItemLeft}>
                          <View style={styles.menuIconBg}>
                            <Ionicons name={route.icon as any} size={20} color={Colors.primaryStart} />
                          </View>
                          <Text style={styles.menuItemLabel}>{route.label}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {badgeCount > 0 && (
                            <View style={{ backgroundColor: Colors.error, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
                            </View>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Footer Section */}
                <View style={styles.footer}>
                  <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color={Colors.error} />
                    <Text style={styles.logoutText}>Keluar Sesi Kasir</Text>
                  </TouchableOpacity>
                  <Text style={styles.versionText}>Versi 1.1.0 • Antigravity UI</Text>
                </View>
              </SafeAreaView>
            </LinearGradient>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)', // Dark blue-slate overlay
  },
  drawerPanel: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: 'transparent',
    borderTopRightRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  blurWrapper: {
    flex: 1,
  },
  gradientWrapper: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  logoBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryStart + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  storeTagline: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  profileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: Colors.primaryStart + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  menuSectionTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuIconBg: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryStart + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    gap: Spacing.md,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorLight,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error + '20',
  },
  logoutText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  versionText: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
