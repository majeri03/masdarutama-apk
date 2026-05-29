import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow } from '../../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { useNotificationStore } from '../../stores/notification.store';
import { navigationRef } from '../../utils/navigation';

export const FloatingShortcut: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const waOrdersPending = useNotificationStore((state) => state.waOrdersPending);

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    Animated.spring(animation, {
      toValue,
      friction: 5,
      useNativeDriver: true,
    }).start();
    setIsOpen(!isOpen);
  };

  const handleNavigate = (route: string) => {
    toggleMenu();
    setTimeout(() => {
      if (navigationRef.isReady()) {
        const tabRoutes = ['POS'];
        if (tabRoutes.includes(route)) {
          (navigationRef as any).navigate('Main', { screen: route });
        } else {
          (navigationRef as any).navigate(route);
        }
      }
    }, 200);
  };

  const rotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const posTranslateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -70],
  });

  const waTranslateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -140],
  });

  const opacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* WA Orders Shortcut */}
      <Animated.View style={[styles.subButtonContainer, { transform: [{ translateY: waTranslateY }], opacity }]}>
        <TouchableOpacity style={styles.subButton} onPress={() => handleNavigate('WaOrders')}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          {waOrdersPending > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{waOrdersPending > 99 ? '99+' : waOrdersPending}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.subButtonLabel}>Order WA</Text>
      </Animated.View>

      {/* POS Shortcut */}
      <Animated.View style={[styles.subButtonContainer, { transform: [{ translateY: posTranslateY }], opacity }]}>
        <TouchableOpacity style={[styles.subButton, { backgroundColor: Colors.info }]} onPress={() => handleNavigate('POS')}>
          <Ionicons name="calculator" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.subButtonLabel}>Kasir (POS)</Text>
      </Animated.View>

      {/* Main Toggle Button */}
      <TouchableOpacity style={styles.mainButton} onPress={toggleMenu} activeOpacity={0.8}>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Ionicons name="add" size={32} color="#fff" />
        </Animated.View>
        
        {/* Main Badge when menu is closed but has pending orders */}
        {!isOpen && waOrdersPending > 0 && (
          <View style={styles.mainBadge}>
            <Text style={styles.badgeText}>{waOrdersPending > 99 ? '99+' : waOrdersPending}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80, // slightly above bottom tabs
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  mainButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primaryStart,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.lg,
  },
  subButtonContainer: {
    position: 'absolute',
    alignItems: 'center',
    right: 6, // center with main button
  },
  subButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#25D366', // WA Green default
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  subButtonLabel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    position: 'absolute',
    right: 60,
    top: 14,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  mainBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.error,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.primaryStart,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
