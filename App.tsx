import React, { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, Animated, Easing, Vibration, Image, LogBox } from 'react-native';
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
import { WaOrdersScreen } from './src/screens/WaOrdersScreen';
import { WaOrderConfirmScreen } from './src/screens/WaOrderConfirmScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { DeviceSettingsScreen } from './src/screens/DeviceSettingsScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import AiChatScreen from './src/screens/AiChatScreen';

// Import Sidebar Drawer
import { SidebarDrawer } from './src/components/ui/SidebarDrawer';
import { FloatingShortcut } from './src/components/ui/FloatingShortcut';

// Design Theme
import { Colors, FontWeight, FontSize } from './src/constants/theme';
import { useNotificationStore } from './src/stores/notification.store';
import { useNotificationCenterStore } from './src/stores/notificationCenter.store';
import { usePushNotifications } from './src/hooks/usePushNotifications';

import { navigationRef } from './src/utils/navigation';

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
const appNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.background,
    card: Colors.backgroundSecondary,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.primaryStart,
    notification: Colors.primaryStart,
  },
};

// Logout button component for the header
const HeaderLogoutButton: React.FC = () => {
  const logout = useAuthStore((state) => state.logout);
  return (
    <TouchableOpacity
      onPress={logout}
      style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <Ionicons name="log-out-outline" size={20} color={Colors.error} />
      <Text style={{ color: Colors.error, fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>Keluar</Text>
    </TouchableOpacity>
  );
};

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
        tabBarStyle: {
          backgroundColor: Colors.surface,       // putih solid iOS
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
          // Shadow iOS halus
          shadowColor: '#6C63FF',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 8,
        },
        headerStyle: {
          backgroundColor: Colors.surface,       // putih solid
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
          elevation: 0,
          shadowColor: '#6C63FF',
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
      <Tab.Screen
        name="POS"
        component={POSScreen}
        options={{
          headerTitle: 'TERMINAL KASIR (POS)',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
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
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          headerTitle: 'LAPORAN KEUANGAN',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerTitle: 'PENGATURAN',
        }}
      />
    </Tab.Navigator>
  );
};

export default function App() {
  const { isAuthenticated, isLoading, checkSession } = useAuthStore();
  usePushNotifications(); // Hook untuk inisialisasi push notification

  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.4)).current;
  const textFadeAnim = React.useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;

  // Track current route for global components visibility
  const [currentRoute, setCurrentRoute] = useState<string | undefined>(undefined);
  const splashFadeAnim = React.useRef(new Animated.Value(1)).current;

  const playChime = async () => {
    try {
      Vibration.vibrate([100, 80, 100, 150]);
      const { createAudioPlayer } = require('expo-audio');
      const player = createAudioPlayer(require('./assets/Masdar_Utama.mp3'));
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

      <NavigationContainer 
        theme={appNavTheme} 
        ref={navigationRef}
        onStateChange={() => {
          const current = navigationRef.getCurrentRoute()?.name;
          setCurrentRoute(current);
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabNavigator} />
              <Stack.Screen
                name="StockOpname"
                component={StockOpnameScreen}
                options={{
                  headerShown: true,
                  headerTitle: 'STOCK OPNAME',
                  headerStyle: { backgroundColor: Colors.surface },
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
                name="WaOrders"
                component={WaOrdersScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="WaOrderConfirm"
                component={WaOrderConfirmScreen}
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
                name="AiChat"
                component={AiChatScreen}
                options={{ headerShown: false }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {isAuthenticated && currentRoute !== 'AiChat' && <FloatingShortcut />}
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
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
