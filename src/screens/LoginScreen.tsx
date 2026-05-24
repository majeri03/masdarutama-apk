import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Keyboard,
  Image,
  Alert,
} from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const { login, isLoading } = useAuthStore();

  const checkBiometricsAndCredentials = async () => {
    try {
      const { hasHardwareAsync, isEnrolledAsync } = require('expo-local-authentication');
      const hasHardware = await hasHardwareAsync();
      const isEnrolled = await isEnrolledAsync();
      setIsBiometricSupported(hasHardware && isEnrolled);

      const SecureStore = require('expo-secure-store');
      const savedEmail = await SecureStore.getItemAsync('saved_email');
      const savedPassword = await SecureStore.getItemAsync('saved_password');
      const savedRemember = await SecureStore.getItemAsync('saved_remember');

      if (savedRemember === 'true' && savedEmail && savedPassword) {
        setEmail(savedEmail);
        setPassword(savedPassword);
        setHasSavedCredentials(true);

        // Auto-trigger biometric prompt
        if (hasHardware && isEnrolled) {
          setTimeout(() => {
            triggerBiometricAuth(savedEmail, savedPassword);
          }, 300);
        }
      }
    } catch (e) {
      console.warn('[BIOMETRICS] Initialization error:', e);
    }
  };

  React.useEffect(() => {
    checkBiometricsAndCredentials();
  }, []);

  const triggerBiometricAuth = async (targetEmail = email, targetPassword = password) => {
    try {
      const LocalAuthentication = require('expo-local-authentication');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Masuk dengan Biometrik (Sidik Jari / Wajah)',
        fallbackLabel: 'Gunakan Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        if (targetEmail && targetPassword) {
          const loginResult = await login(targetEmail, targetPassword);
          if (!loginResult.success) {
            Alert.alert('Login Gagal', loginResult.error || 'Terjadi kesalahan saat masuk.');
          }
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Gagal memverifikasi biometrik.');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Perhatian', 'Email dan password wajib diisi.');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('saved_email', email);
      await SecureStore.setItemAsync('saved_password', password);
      await SecureStore.setItemAsync('saved_remember', 'true');
    } else {
      Alert.alert('Login Gagal', result.error || 'Terjadi kesalahan saat masuk.');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {/* Background Decorative Blobs */}
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            {/* Logo and Header text */}
            <View style={styles.header}>
              <View style={styles.logoBg}>
                <Ionicons name="storefront-outline" size={40} color="#FFFFFF" />
              </View>
              <Text style={styles.title}>TB Masdar Utama</Text>
              <Text style={styles.subtitle}>Point of Sale & Inventory Management</Text>
            </View>

            {/* Login Card */}
            <GlassCard padding={24} style={styles.card}>
              <Text style={styles.cardTitle}>Masuk Kasir</Text>
              <Text style={styles.cardSubtitle}>Silakan masuk untuk memulai transaksi Anda</Text>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Masukkan email Anda"
                    placeholderTextColor={Colors.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Masukkan password Anda"
                    placeholderTextColor={Colors.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                  />
                  <TouchableWithoutFeedback onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textTertiary}
                    />
                  </TouchableWithoutFeedback>
                </View>
              </View>

              {/* Biometric Option Row */}
              {isBiometricSupported && hasSavedCredentials && (
                <View style={styles.optionsRow}>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={styles.biometricBtn}
                    onPress={() => triggerBiometricAuth()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="finger-print-outline" size={20} color={Colors.primaryStart} />
                    <Text style={styles.biometricBtnText}>Masuk dengan Sidik Jari</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                </View>
              )}

              {/* Login Button */}
              <GradientButton
                title="Masuk Sekarang"
                onPress={handleLogin}
                loading={isLoading}
                variant="primary"
                fullWidth
                style={styles.button}
              />
            </GlassCard>

            {/* Footer */}
            <Text style={styles.footerText}>
              J Developer
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.12,
  },
  blob1: {
    width: 250,
    height: 250,
    backgroundColor: Colors.primaryStart,
    top: '10%',
    left: '-20%',
  },
  blob2: {
    width: 300,
    height: 300,
    backgroundColor: Colors.secondaryStart,
    bottom: '15%',
    right: '-30%',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  logoBg: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    // Soft glowing border
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
    width: '100%',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    height: '100%',
  },
  button: {
    marginTop: Spacing.md,
  },
  footerText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing['2xl'],
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
    width: '100%',
  },
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryStart + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primaryStart + '30',
  },
  biometricBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primaryStart,
  },
});
