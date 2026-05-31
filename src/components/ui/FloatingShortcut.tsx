import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow } from '../../constants/theme';
import { navigationRef } from '../../utils/navigation';

export const FloatingShortcut: React.FC = () => {
  const handleNavigate = () => {
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('AiChat');
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity style={styles.mainButton} onPress={handleNavigate} activeOpacity={0.8}>
        <Ionicons name="sparkles" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
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
});
