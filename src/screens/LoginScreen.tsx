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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores/auth.store';
import { masterService } from '../services/master.service';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GradientButton } from '../components/ui';
import { AppToast } from '../utils/toast';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [storeName, setStoreName] = useState('TB Masdar Utama');
  // FIX (24 Nov 2026, APK OTP): true kalau login gagal karena akun belum
  // terverifikasi (backend mengembalikan code "unverified" — hanya kalau
  // passwordnya BENAR). Tampilkan kotak kuning + tombol ke layar OTP.
  const [isUnverified, setIsUnverified] = useState(false);
  const navigation = useNavigation<any>();
  const { login, isLoading } = useAuthStore();

  // FIX (25 Nov 2026, WS-5 logo OTP login): ukuran logo responsif —
  // 28% lebar layar, dibatasi 76–112. Sebelumnya logo 120x120 tetap,
  // sehingga di ponsel kecil seluruh isi layar (logo + card + link +
  // footer, ±730 kalau kotak kuning OTP muncul) melebihi tinggi layar
  // dan terpotong di atas/bawah karena tidak ada ScrollView.
  const { width: screenWidth } = useWindowDimensions();
  const logoSize = Math.round(Math.min(112, Math.max(76, screenWidth * 0.28)));

  const loadLogoAndSettings = async () => {
    try {
      const res = await masterService.getPublicSettings();
      if (res.success && res.data) {
        if (res.data.logoUrl) setLogoUrl(res.data.logoUrl);
        if (res.data.name) setStoreName(res.data.name);
      }
    } catch (e) {
      console.warn('[LOGIN] Error fetching public settings:', e);
    }
  };

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
    loadLogoAndSettings();
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
            if (loginResult.code === 'unverified') setIsUnverified(true);
            AppToast.error('Login Gagal', loginResult.error || 'Terjadi kesalahan saat masuk.');
          }
        }
      }
    } catch (e) {
      AppToast.error('Error', 'Gagal memverifikasi biometrik.');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      AppToast.info('Perhatian', 'Email dan password wajib diisi.');
      return;
    }

    setIsUnverified(false);
    const result = await login(email, password);
    if (result.success) {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('saved_email', email);
      await SecureStore.setItemAsync('saved_password', password);
      await SecureStore.setItemAsync('saved_remember', 'true');
    } else {
      // FIX (24 Nov 2026, APK OTP): kode "unverified" dari backend
      // (POST /api/auth/login, 403) berarti password BENAR tapi akun
      // belum terverifikasi — arahkan ke layar verifikasi OTP, bukan
      // sekadar "email atau password salah".
      if (result.code === 'unverified') {
        setIsUnverified(true);
        AppToast.error('Login Gagal', 'Akun belum terverifikasi. Masukkan kode OTP 6 digit yang dikirim ke email Anda.');
      } else {
        AppToast.error('Login Gagal', result.error || 'Terjadi kesalahan saat masuk.');
      }
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* FIX (25 Nov 2026, WS-5): ScrollView supaya seluruh isi layar
              bisa di-scroll di ponsel kecil / saat keyboard terbuka.
              Sebelumnya konten di-center tanpa ScrollView, jadi kalau
              tingginya melebihi layar (apalagi saat kotak kuning OTP
              muncul) bagian atas — logo — terpotong keluar layar. */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              {/* Form Login — kartu polos minimalis (tanpa efek kaca) */}
              <View style={styles.card}>
                {/* FIX (25 Nov 2026, WS-5): logo + nama toko PINDAH ke
                    DALAM card (sebelumnya di header di luar/atas card).
                    Laporan tes 25 Nov: logo terlihat keluar dari card.
                    Logo tampil langsung TANPA kotak/warna latar belakang
                    (PKG-D, perbaikan 7 item #5: logo harus jelas, tanpa
                    background). File logonya sendiri sudah transparan.
                    Logo toko dari Pengaturan dipakai kalau ada; kalau gagal
                    dimuat, pakai logo bawaan aplikasi (gambar yang sama).
                    Ukuran logo responsif (logoSize, 76–112) supaya muat
                    di card selebar apa pun — card sendiri maxWidth 400. */}
                <View style={styles.header}>
                  {logoUrl && !logoFailed ? (
                    <Image
                      source={{ uri: logoUrl }}
                      style={[styles.logo, { width: logoSize, height: logoSize }]}
                      resizeMode="contain"
                      onError={() => setLogoFailed(true)}
                    />
                  ) : (
                    <Image
                      source={require('../../assets/logomasdarutama.png')}
                      style={[styles.logo, { width: logoSize, height: logoSize }]}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={styles.title}>{storeName}</Text>
                  <Text style={styles.subtitle}>Point of Sale & Inventory Management</Text>
                </View>

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

                {/* FIX (24 Nov 2026, APK OTP): akun belum terverifikasi —
                    tunjukkan JELAS ke mana memasukkan kode OTP (email sudah
                    terisi di layar verifikasi). */}
                {isUnverified && (
                  <View style={styles.unverifiedBox}>
                    <Text style={styles.unverifiedTitle}>Akun Anda belum terverifikasi</Text>
                    <Text style={styles.unverifiedText}>
                      Kode 6 digit sudah dikirim ke email Anda. Masukkan kodenya untuk mengaktifkan akun, lalu login kembali.
                    </Text>
                    <TouchableOpacity
                      style={styles.unverifiedBtn}
                      onPress={() => navigation.navigate('VerifyOtp', { email: email.trim() })}
                    >
                      <Ionicons name="key-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.unverifiedBtnText}>Masukkan Kode OTP</Text>
                    </TouchableOpacity>
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
              </View>

              {/* Link verifikasi OTP — selalu tersedia untuk pemilik akun
                  baru yang belum menerima / belum memasukkan kodenya. */}
              <TouchableOpacity
                style={styles.verifyLink}
                onPress={() => navigation.navigate('VerifyOtp', { email: email.trim() })}
              >
                <Ionicons name="mail-outline" size={16} color={Colors.primaryStart} />
                <Text style={styles.verifyLinkText}>Belum terima kode? Verifikasi email / masukkan kode OTP</Text>
              </TouchableOpacity>

              {/* Footer */}
              <Text style={styles.footerText}>
                J Developer
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',  // WS-6: tembus ke AppBackground app-wide
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  content: {
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    width: '100%',
  },
  // Logo polos tanpa latar belakang — gambar tampil langsung di atas
  // warna latar card. Ukuran responsif (logoSize, 76–112) — lebar/tinggi
  // diisi dari useWindowDimensions, BUKAN 120 tetap seperti sebelumnya.
  logo: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  // Kartu polos minimalis — putih, garis tipis, tanpa efek kaca/blur.
  // overflow 'hidden' supaya isi (logo) tidak bisa keluar dari sudut
  // card yang membulat di Android.
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: 24,
    overflow: 'hidden',
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
  unverifiedBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: BorderRadius.md,
    padding: 16,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  unverifiedTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#92400E', textAlign: 'center' },
  unverifiedText: { fontSize: FontSize.sm, color: '#92400E', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  unverifiedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#D97706', borderRadius: BorderRadius.md,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  unverifiedBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#FFFFFF' },
  verifyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.lg, justifyContent: 'center' },
  verifyLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primaryStart, textAlign: 'center' },
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
  // WS-6: DIHAPUS — style checkboxWrapper & checkboxLabel tidak pernah
  // dipakai (checkbox "ingat saya" sudah tidak ada; ingat login diatur
  // otomatis lewat SecureStore 'saved_remember').
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
