import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated, PanResponder, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, FontSize, FontWeight } from '../../constants/theme';
import { navigationRef } from '../../utils/navigation';

const { width, height } = Dimensions.get('window');

export const FloatingShortcut: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  
  // Posisi tombol
  const pan = useRef(new Animated.ValueXY({ x: width - 70, y: height / 2 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Hanya responsif terhadap drag jika pergerakan cukup jauh (mencegah klik dianggap drag)
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        
        // Snap to nearest edge (kiri atau kanan)
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        
        // Batas atas dan bawah
        const boundedY = Math.max(100, Math.min(currentY, height - 150));
        
        // Snap ke kiri atau kanan
        const targetX = currentX > width / 2 ? width - 56 : 0; // 56 is button width, semi-hidden if 0 or width
        
        Animated.spring(pan, {
          toValue: { x: targetX, y: boundedY },
          useNativeDriver: false,
          friction: 6,
          tension: 40
        }).start();
      }
    })
  ).current;

  const toggleExpand = () => setExpanded(!expanded);

  const navigateTo = (screen: string) => {
    setExpanded(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate(screen);
    }
  };

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            // Sedikit transparan jika snap di ujung dan tidak sedang dibuka
            opacity: expanded ? 1 : 0.6 
          }
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity 
          style={styles.mainButton} 
          onPress={toggleExpand} 
          activeOpacity={0.8}
        >
          <Ionicons name="apps" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Overlay Modal untuk menu melingkar/grid mirip Assistive Touch */}
      <Modal visible={expanded} transparent animationType="fade" onRequestClose={toggleExpand}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={toggleExpand}>
          <View style={styles.menuBox}>
            {/* Row 1 */}
            <View style={styles.menuRow}>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('AiChat')}>
                <View style={[styles.iconCircle, { backgroundColor: '#6C63FF' }]}><Ionicons name="sparkles" size={24} color="#fff" /></View>
                <Text style={styles.menuText}>MIDA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('POS')}>
                <View style={styles.iconCircle}><Ionicons name="calculator" size={24} color="#fff" /></View>
                <Text style={styles.menuText}>Kasir</Text>
              </TouchableOpacity>
            </View>
            
            {/* Row 2 */}
            <View style={styles.menuRow}>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('Products')}>
                <View style={styles.iconCircle}><Ionicons name="cube" size={24} color="#fff" /></View>
                <Text style={styles.menuText}>Produk</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('WaOrders')}>
                <View style={styles.iconCircle}><Ionicons name="logo-whatsapp" size={24} color="#fff" /></View>
                <Text style={styles.menuText}>Orderan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  mainButton: {
    width: 50,
    height: 50,
    borderRadius: 12, // Kotak persegi empat bersudut melengkung sesuai request
    backgroundColor: Colors.textPrimary, // Gelap biar mirip assistive touch
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBox: {
    width: 260,
    height: 260,
    backgroundColor: Colors.surface,
    borderRadius: 30,
    padding: 20,
    justifyContent: 'center',
    gap: 24,
    ...Shadow.lg,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  menuItem: {
    alignItems: 'center',
    gap: 8,
    width: 80,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  menuText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  }
});
