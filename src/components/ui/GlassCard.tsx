/**
 * GlassCard — Light Glassmorphism card (iOS/macOS style)
 * Putih translucent + blur halus + shadow lembut + border glass
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, Shadow } from '../../constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  // FIX tsc (26 Nov 2026): dulu `ViewStyle` saja — pemakaian style berupa
  // array (mis. [styles.x, kondisi && styles.y] di DashboardScreen) tidak
  // bisa masuk ke tipe itu dan tsc menolaknya (TS2322). StyleProp menerima
  // objek tunggal, array, maupun entri falsy — sesuai perilaku runtime
  // (StyleSheet.flatten di splitStyles sudah menangani array).
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  gradient?: boolean;
  padding?: number;
  noBorder?: boolean;
  tinted?: boolean; // Tinted merah merek lembut untuk highlight — WS-9 (dulu ungu)
}

const splitStyles = (style: ViewStyle | any) => {
  if (!style) return { containerStyle: {}, contentStyle: {} };

  // WS-9: 'backgroundColor' WAJIB di container (lapis luar), bukan di dalam
  // LinearGradient/BlurView — kalau tidak, background menumpuk 2 lapis
  // (putih solid di atas gradien putih translusen) dan terlihat "numpuk".
  const containerKeys = [
    'backgroundColor',
    'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginVertical', 'marginHorizontal',
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'flex', 'flexGrow', 'flexShrink',
    'position', 'top', 'bottom', 'left', 'right', 'zIndex',
    'alignSelf', 'opacity', 'elevation'
  ];

  const containerStyle: any = {};
  const contentStyle: any = {};

  const flatStyle = StyleSheet.flatten(style);

  Object.keys(flatStyle).forEach((key) => {
    const val = flatStyle[key];
    if (containerKeys.includes(key)) {
      containerStyle[key] = val;
    } else {
      contentStyle[key] = val;
    }
  });

  return { containerStyle, contentStyle };
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 30,          // Lebih tinggi = lebih frosted
  gradient = true,
  padding = Spacing.lg,
  noBorder = false,
  tinted = false,
}) => {
  const { containerStyle, contentStyle } = splitStyles(style);

  // Gradien glass iOS: putih 82% → 60%
  const glassColors = tinted
    ? (['rgba(127, 29, 29, 0.08)', 'rgba(127, 29, 29, 0.04)'] as const)  // WS-9: merah merek, dulu ungu
    : (['rgba(255, 255, 255, 0.82)', 'rgba(255, 255, 255, 0.60)'] as const);

  return (
    <View style={[styles.container, Shadow.card, containerStyle]}>
      <BlurView
        intensity={intensity}
        tint="light"          // ← light tint untuk background putih
        style={[styles.blur, containerStyle.height ? { height: '100%' } : null]}
      >
        {gradient ? (
          <LinearGradient
            colors={glassColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.gradient,
              { padding },
              !noBorder && styles.border,
              contentStyle,
            ]}
          >
            {children}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.content,
              { padding },
              !noBorder && styles.border,
              contentStyle,
            ]}
          >
            {children}
          </View>
        )}
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    flexGrow: 1,
  },
  gradient: {
    borderRadius: BorderRadius.lg,
    flexGrow: 1,
  },
  content: {
    // Fallback tanpa gradient — tetap putih translucent
    backgroundColor: Colors.glass,  // rgba(255,255,255,0.72)
    borderRadius: BorderRadius.lg,
    flexGrow: 1,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.glassBorder, // rgba(0,0,0,0.08) — soft dark border for light mode
  },
});
