/**
 * GradientButton - Premium gradient button with press animations
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight, Shadow } from '../../constants/theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const GRADIENTS: Record<string, readonly [string, string]> = {
  primary: [Colors.primaryStart, Colors.primaryEnd],
  secondary: [Colors.secondaryStart, Colors.secondaryEnd],
  accent: [Colors.accentStart, Colors.accentEnd],
  danger: ['#EF4444', '#DC2626'],
  success: ['#10B981', '#059669'],
};

const SIZES = {
  sm: { height: 36, paddingH: 14, fontSize: FontSize.sm },
  md: { height: 48, paddingH: 20, fontSize: FontSize.md },
  lg: { height: 56, paddingH: 28, fontSize: FontSize.lg },
};

export const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  textStyle,
  fullWidth = false,
}) => {
  const sizeConfig = SIZES[size];
  const isOutline = variant === 'outline';

  if (isOutline) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
        style={[
          styles.outlineButton,
          {
            height: sizeConfig.height,
            paddingHorizontal: sizeConfig.paddingH,
          },
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.outlineText,
                { fontSize: sizeConfig.fontSize },
                textStyle,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={GRADIENTS[variant] || GRADIENTS.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          Shadow.sm,
          {
            height: sizeConfig.height,
            paddingHorizontal: sizeConfig.paddingH,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.text,
                { fontSize: sizeConfig.fontSize },
                textStyle,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  text: {
    color: '#FFF',
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    gap: Spacing.sm,
  },
  outlineText: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
