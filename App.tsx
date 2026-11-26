import React, { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Vibration, Image, LogBox } from 'react-native';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

// Import state store
import { useAuthStore } from './src/stores/auth.store';
import { useSidebarStore } from './src/stores/sidebar.store';

// Import Screens
import { LoginScreen } from './src/screens/LoginScreen';
import { VerifyOtpScreen } from './src/screens/VerifyOtpScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { POSScreen } from './src/screens/POSScreen';
import { ProductsScreen } from './src/screens/ProductsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { TransactionHistoryScreen } from './src/screens/TransactionHistoryScreen';
import { StockOpnameScreen } from './src/screens/StockOpnameScreen';
import { InvoiceLayoutScreen } from './src/screens/InvoiceLayoutScreen';
import { DeliveryScreen } from './src/screens/DeliveryScreen';
import { PurchaseScreen } from './src/screens/PurchaseScreen';
import { DebtScreen } from './src/screens/DebtScreen';
import { EditTransactionScreen } from './src/screens/EditTransactionScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { DeviceSettingsScreen } from './src/screens/DeviceSettingsScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import { FleetTrackingScreen } from './src/screens/FleetTrackingScreen';
import AppUpdateScreen from './src/screens/AppUpdateScreen';
import { StorageManagerScreen } from './src/screens/StorageManagerScreen';
import { SalesmenScreen } from './src/screens/SalesmenScreen';
import { PointsScreen } from './src/screens/PointsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

// Import Sidebar Drawer
import { SidebarDrawer } from './src/components/ui/SidebarDrawer';
import { FloatingShortcut } from './src/components/ui/FloatingShortcut';
// WS-6 (26 Nov 2026): background kaca app-wide — dipasang sekali di sini,
// di belakang NavigationContainer; lihat src/components/ui/AppBackground.tsx.
import { AppBackground } from './src/components/ui/AppBackground';

// Design Theme
import { Colors, FontWeight, FontSize } from './src/constants/theme';
import { useNotificationStore } from './src/stores/notification.store';
import { useNotificationCenterStore } from './src/stores/notificationCenter.store';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { useDeepLinks } from './src/hooks/useDeepLinks';

import { navigationRef } from './src/utils/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_NOTIF_KEY = 'masdar_pending_notifications';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Burger Button for Main Tabs
const HeaderBurgerButton: React.FC = () => {
  const openSidebar = useSidebarStore((state) => state.openSidebar);
  return (
    <TouchableOpacity
      onPress={openSidebar}
      style={{ marginLeft: 16, padding: 4 }}
    >
      <Ionicons name="menu-outline" size={24} color={Colors.textPrimary} />
    </TouchableOpacity>
  );
};

// Back Button specifically for POS screen to go back to Dashboard
const HeaderBackButton: React.FC = () => {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Dashboard')}
      style={{ marginLeft: 16, padding: 4 }}
    >
      <Ionicons name="arrow-back-outline" size={24} color={Colors.textPrimary} />
    </TouchableOpacity>
  );
};

// Light Glassmorphism Theme for React Navigation (iOS/macOS style)
// WS-6: background 'transparent' supaya AppBackground (gradien + blob kaca
// di belakang NavigationContainer) terlihat di semua layar. Layar yang
// container root-nya masih solid menutupi gradien ini — itu disengaja
// sampai workstream pemilik layar itu ikut mengubahnya ke transparent.
const appNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: Colors.backgroundSecondary,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.primaryStart,
    notification: Colors.primaryStart,
  },
};

// WS-6 (26 Nov 2026): DIHAPUS — HeaderLogoutButton tidak pernah dipakai
// di mana pun (tidak ada header yang memanggilnya); tombol Keluar sudah
// ada di SidebarDrawer. Menghapusnya supaya tidak ada komponen mati.

// Notification button component for the header
const HeaderNotificationButton: React.FC = () => {
  const navigation = useNavigation<any>();
  const unreadCount = useNotificationCenterStore((state) => 
    state.notifications.filter(n => !n.isRead).length
  );

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('NotificationCenter')}
      style={{ marginRight: 16, padding: 4, position: 'relative' }}
    >
      <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute',
          top: 2,
          right: 2,
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
  );
};

// Tab Navigator for Authenticated User
const MainTabNavigator = () => {
  const allowedPages = useAuthStore((state) => state.allowedPages);
  const user = useAuthStore((state) => state.user);

  const isAllowed = (pageKey: string) => {
    if (user?.role === 'SUPER_ADMIN') return true;
    return allowedPages.includes(pageKey);
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'home';

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'POS') {
            iconName = focused ? 'calculator' : 'calculator-outline';
          } else if (route.name === 'Products') {
            iconName = focused ? 'cube' : 'cube-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName as any} size={size - 2} color={color} />;
        },
        tabBarActiveTintColor: Colors.primaryStart,
        tabBarInactiveTintColor: Colors.textTertiary,
        // WS-6: scene transparan supaya AppBackground terlihat; tab bar &
        // header putih TRANSLUCENT (0.88) — tetap terbaca, tapi gradien
        // kaca di belakangnya samar-samar tembus (efek kaca, bukan solid).
        sceneContainerStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.88)',  // WS-6: dulu Colors.surface solid
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
          // Shadow iOS halus
          shadowColor: '#64748B',  // WS-9: abu netral, dulu ungu #6C63FF
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 8,
        },
        headerStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.88)',  // WS-6: dulu Colors.surface solid
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
          elevation: 0,
          shadowColor: '#64748B',  // WS-9: abu netral, dulu ungu #6C63FF
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        },
        headerTitleStyle: {
          fontSize: FontSize.md,
          fontWeight: FontWeight.bold,
          color: Colors.textPrimary,
          letterSpacing: 0.5,
        },
        headerLeft: () => <HeaderBurgerButton />,
        headerRight: () => <HeaderNotificationButton />,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerTitle: 'BERANDA',
        }}
      />
      {isAllowed('pos') && (
        <Tab.Screen
          name="POS"
          component={POSScreen}
          options={{
            headerTitle: 'TERMINAL KASIR (POS)',
            headerLeft: () => <HeaderBackButton />,
          }}
        />
      )}
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          headerTitle: 'DAFTAR PRODUK',
        }}
      />
      <Tab.Screen
        name="History"
        component={TransactionHistoryScreen}
        options={{
          headerTitle: 'RIWAYAT TRANSAKSI',
        }}
      />
      {isAllowed('reports_settings') && (
        <Tab.Screen
          name="Reports"
          component={ReportsScreen}
          options={{
            headerTitle: 'LAPORAN KEUANGAN',
          }}
        />
      )}
      {isAllowed('reports_settings') && (
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerTitle: 'PENGATURAN',
          }}
        />
      )}
    </Tab.Navigator>
  );
};

export default function App() {
  const { isAuthenticated, isLoading, checkSession } = useAuthStore();
  usePushNotifications(); // Hook untuk inisialisasi push notification
  useDeepLinks(); // Hook untuk tautan aplikasi tbmasdarutama://... (email utang)

  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.4)).current;
  const textFadeAnim = React.useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;

  // WS-6 (26 Nov 2026): DIHAPUS — state currentRoute dulu hanya di-set di
  // onStateChange tapi tidak pernah dibaca di mana pun.
  const splashFadeAnim = React.useRef(new Animated.Value(1)).current;

  const playChime = async () => {
    try {
      Vibration.vibrate([100, 80, 100, 150]);
      const { createAudioPlayer } = require('expo-audio');
      const player = createAudioPlayer(require('./assets/masdar_utama.mp3'));
      player.play();

      // Release resource after 5 seconds to prevent memory leaks
      setTimeout(() => {
        try {
          player.release();
        } catch (e) { }
      }, 5000);
    } catch (error) {
      console.warn('Could not play startup chime:', error);
    }
  };

  useEffect(() => {
    checkSession();
    playChime();

    // ─── Drain notifikasi yang masuk saat app mati (background task) ───────
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_NOTIF_KEY);
        if (raw) {
          const pending: Array<{ id: string; title: string; body: string; data: Record<string, unknown>; date: string }> =
            JSON.parse(raw);
          if (Array.isArray(pending) && pending.length > 0) {
            const { addNotification } = useNotificationCenterStore.getState();
            // Masukkan dari yang terlama ke terbaru agar urutan benar di center
            [...pending].reverse().forEach((n) => {
              // Teruskan ID server + tanggal asli — dulu dibuang dan diganti
              // ID acak + "sekarang", jadi duplikat dan meloncat ke atas.
              addNotification({
                id: typeof (n as any).id === 'string' ? (n as any).id : undefined,
                dedupKey: (n.data as any)?.dedupKey,
                date: n.date,
                title: n.title, body: n.body, data: n.data || {},
              });
            });
            await AsyncStorage.removeItem(PENDING_NOTIF_KEY);
            console.log(`[App] Drain ${pending.length} notifikasi pending dari background.`);
          }
        }
      } catch (e) {
        console.warn('[App] Gagal drain pending notifications:', e);
      }
    })();
    // ────────────────────────────────────────────────────────────────────────

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 600,
        useNativeDriver: true,
      }),
      Animated.timing(textSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 600,
        useNativeDriver: true,
      }),
    ]).start();


  }, []);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }).start(() => {
          setShowSplash(false);
        });
      }, 1800); // minimum duration to show splash (1.8s)
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Start/stop polling based on authentication
  useEffect(() => {
    const { startPolling, stopPolling } = useNotificationStore.getState();
    if (isAuthenticated) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [isAuthenticated]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SidebarDrawer />

      {showSplash && (
        <Animated.View style={[styles.splashContainer, { opacity: splashFadeAnim }]}>
          <View style={styles.splashContent}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
              <Image
                source={require('./assets/logomasdarutama.png')}
                style={styles.splashLogo}
                resizeMode="contain"
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.splashTextContainer,
                { opacity: textFadeAnim, transform: [{ translateY: textSlideAnim }] },
              ]}
            >
              <Text style={styles.splashBrand}>MASDAR UTAMA</Text>
              <Text style={styles.splashSlogan}>Premium Building Materials</Text>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* Splash menutupi seluruh layar sampai animasi selesai — navigator
          baru dipasang setelah showSplash=false, supaya logo login TIDAK
          PERNAH tampil bersamaan dengan logo splash saat fade (PKG-D,
          perbaikan 7 item #5: logo bentrok). */}
      {!showSplash && (
      <View style={styles.appRoot}>
      {/* WS-6: AppBackground dipasang sekali di sini, di belakang seluruh
          navigator — jangan dipasang lagi di dalam tiap layar (nanti
          background menumpuk 2 lapis seperti kasus WS-9). */}
      <AppBackground />
      <NavigationContainer
        theme={appNavTheme}
        ref={navigationRef}
      >
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          {/* tsc-fix 26 Nov 2026: native-stack tidak mengenal `cardStyle`
              (itu milik @react-navigation/stack). Yang benar di native-stack
              adalah `contentStyle` — fungsinya sama: warna latar container
              layar supaya background kaca (AppBackground) terlihat. */}
          {!isAuthenticated ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              {/* OTP (24 Nov 2026): layar verifikasi email — HARUS di cabang
                  belum-login, karena akun yang belum terverifikasi memang
                  belum bisa login. LoginScreen mengarah ke sini kalau
                  backend mengembalikan code "unverified". */}
              <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabNavigator} />
              <Stack.Screen
                name="StockOpname"
                component={StockOpnameScreen}
                options={{
                  headerShown: true,
                  headerTitle: 'STOCK OPNAME',
                  headerStyle: { backgroundColor: 'rgba(255, 255, 255, 0.88)' },  // WS-6: dulu Colors.surface solid
                  headerTitleStyle: {
                    fontSize: FontSize.md,
                    fontWeight: FontWeight.bold,
                    color: Colors.textPrimary,
                  },
                }}
              />
              <Stack.Screen
                name="InvoiceLayout"
                component={InvoiceLayoutScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Delivery"
                component={DeliveryScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Purchase"
                component={PurchaseScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Debt"
                component={DebtScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="EditTransaction"
                component={EditTransactionScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Customers"
                component={CustomersScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="DeviceSettings"
                component={DeviceSettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="NotificationCenter"
                component={NotificationCenterScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="FleetTracking"
                component={FleetTrackingScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="AppUpdate"
                component={AppUpdateScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="StorageManager"
                component={StorageManagerScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Salesmen"
                component={SalesmenScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Points"
                component={PointsScreen}
                options={{ headerShown: false }}
              />
              {/* WS-9 (26 Nov 2026): layar Profil Akun — dibuka dari kartu
                  "Profil Akun" di SettingsScreen. */}
              <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ headerShown: false }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      </View>
      )}

      {isAuthenticated && <FloatingShortcut />}
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // WS-6: pembungkus NavigationContainer — AppBackground (absolute fill)
  // duduk di belakang navigator di dalam View ini.
  appRoot: {
    flex: 1,
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  splashContent: {
    alignItems: 'center',
    gap: 24,
  },
  splashLogo: {
    width: 140,
    height: 140,
    borderRadius: 16,
  },
  splashTextContainer: {
    alignItems: 'center',
    gap: 6,
  },
  splashBrand: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.primaryStart,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  splashSlogan: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
