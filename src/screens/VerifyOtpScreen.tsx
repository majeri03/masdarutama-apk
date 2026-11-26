/**
 * VerifyOtpScreen — verifikasi email dengan kode OTP 6 digit (24 Nov 2026, APK OTP).
 *
 * Dipakai akun baru yang belum terverifikasi: login APK gagal dengan kode
 * "unverified" (POST /api/auth/login, patch backend-apk-routes) lalu
 * LoginScreen mengarahkan ke sini dengan email sudah terisi.
 *
 * Alur OTP-nya SAMA seperti halaman web /verify-email (PKG-I 23 Nov 2026):
 * kode 6 digit, hash SHA-256 di server, kedaluwarsa 15 menit, maks 5x
 * salah (setelah itu minta kode baru), rate limit kirim ulang 1x/menit
 * dan 5x/jam per email. Route yang dipakai di sini publik (tanpa login):
 * POST /api/auth/verify-email dan POST /api/auth/resend-otp — route tipis
 * di atas server action web verifyEmailOtp / resendVerificationOtp, TIDAK
 * ada skema OTP baru.
 *
 * Perbaikan bypass edit-akun (patch web OTP 24 Nov 2026) ada di SERVER
 * (updateUser di user.actions.ts memaksa isActive=false untuk akun yang
 * emailnya belum terverifikasi) — jadi otomatis melindungi APK juga:
 * tidak ada jalan mengaktifkan akun dari APK selain memasukkan kode OTP
 * yang benar di layar ini. Layar ini TIDAK mengubah status akun apa pun
 * selain lewat kode OTP.
 *
 * Layar ini terdaftar di Stack yang BELUM login (App.tsx), supaya bisa
 * dibuka sebelum ada sesi. Setelah verifikasi sukses, pengguna kembali
 * ke Login dan masuk dengan passwordnya.
 */
import React, { useState, useEffect, useRef } from 'react';
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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSize, FontWeight } from '../constants/theme';
import { GradientButton } from '../components/ui';
import { authService } from '../services/auth.service';
import { AppToast } from '../utils/toast';

// Jeda kirim ulang di UI (60 detik). Batas sebenarnya ditegakkan server
// (1x/menit); angka ini hanya supaya tombol tidak bisa ditekan bertubi-tubi.
const RESEND_COOLDOWN_SECONDS = 60;

export const VerifyOtpScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialEmail = typeof route.params?.email === 'string' ? route.params.email : '';

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [infoMessage, setInfoMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX (25 Nov 2026, WS-5 logo OTP login): ikon mail (logo layar OTP)
  // responsif — 18% lebar layar, dibatasi 56–72, ikon di dalamnya 55%
  // dari kotaknya. Sebelumnya iconBox 72x72 tetap di luar card.
  const { width: screenWidth } = useWindowDimensions();
  const iconBoxSize = Math.round(Math.min(72, Math.max(56, screenWidth * 0.18)));
  const iconSize = Math.round(iconBoxSize * 0.55);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerify = async () => {
    if (!email.trim()) {
      AppToast.info('Perhatian', 'Email wajib diisi.');
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      AppToast.info('Perhatian', 'Kode verifikasi harus 6 digit angka.');
      return;
    }
    setVerifying(true);
    setInfoMessage('');
    try {
      const res = await authService.verifyEmail(email.trim(), code.trim());
      if (res.success) {
        AppToast.success('Sukses', res.message || 'Email berhasil diverifikasi. Akun Anda sudah aktif — silakan login.');
        setCode('');
        // Kembali ke Login — akun sudah aktif, tinggal masuk.
        navigation.navigate('Login');
      } else {
        AppToast.error('Verifikasi Gagal', res.error || 'Kode tidak valid atau sudah kedaluwarsa');
      }
    } catch {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      AppToast.info('Perhatian', 'Email wajib diisi.');
      return;
    }
    if (cooldown > 0 || resending) return;
    setResending(true);
    setInfoMessage('');
    try {
      const res = await authService.resendOtp(email.trim());
      if (res.success) {
        // Pesan server sengaja generik (sama untuk email terdaftar/tidak
        // terdaftar) supaya tidak membocorkan email mana yang punya akun.
        setInfoMessage(res.message || 'Jika email terdaftar dan belum terverifikasi, kode baru telah dikirim ke email Anda');
        startCooldown();
      } else {
        AppToast.error('Gagal', res.error || 'Gagal mengirim ulang kode verifikasi');
      }
    } catch {
      AppToast.error('Error', 'Terjadi kesalahan sistem');
    } finally {
      setResending(false);
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
              tingginya melebihi layar, bagian atas terpotong. */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Login')}>
                <Ionicons name="arrow-back-outline" size={20} color={Colors.primaryStart} />
                <Text style={styles.backText}>Kembali ke Login</Text>
              </TouchableOpacity>

              <View style={styles.card}>
                {/* FIX (25 Nov 2026, WS-5): ikon mail + judul + penjelasan
                    PINDAH ke DALAM card (sebelumnya iconBox 72x72, judul,
                    dan subtitle berada di luar/atas card). Laporan tes
                    25 Nov: logo OTP email posisinya keluar dari card. */}
                <View style={[styles.iconBox, { width: iconBoxSize, height: iconBoxSize, borderRadius: iconBoxSize / 2 }]}>
                  <Ionicons name="mail-open-outline" size={iconSize} color={Colors.primaryStart} />
                </View>
                <Text style={styles.title}>Verifikasi Email</Text>
                <Text style={styles.subtitle}>
                  Masukkan kode 6 digit yang dikirim ke email Anda. Kode berlaku 15 menit.
                </Text>

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

                <Text style={styles.label}>Kode OTP (6 digit)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="key-outline" size={20} color={Colors.textTertiary} />
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="123456"
                    placeholderTextColor={Colors.textTertiary}
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </View>

                {infoMessage ? (
                  <Text style={styles.infoText}>{infoMessage}</Text>
                ) : null}

                <GradientButton
                  title={verifying ? 'Memverifikasi…' : 'Verifikasi Kode'}
                  onPress={handleVerify}
                  loading={verifying}
                  variant="primary"
                  fullWidth
                  style={styles.button}
                />

                <TouchableOpacity
                  style={[styles.resendBtn, (cooldown > 0 || resending) && styles.resendBtnDisabled]}
                  onPress={handleResend}
                  disabled={cooldown > 0 || resending}
                >
                  <Text style={styles.resendText}>
                    {resending
                      ? 'Mengirim…'
                      : cooldown > 0
                        ? `Kirim ulang kode (${cooldown} detik)`
                        : 'Belum terima kode? Kirim ulang'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.note}>
                  Kode salah 5 kali berturut-turut membuat kode hangus — minta kirim ulang kode baru.
                  Akun hanya bisa aktif lewat kode OTP ini.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center' },  // WS-6: tembus ke AppBackground app-wide
  keyboardView: { flex: 1, justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.xl },
  content: { paddingHorizontal: Spacing['2xl'], alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: Spacing.lg },
  backText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primaryStart },
  // Ukuran responsif (iconBoxSize, 56–72) — lebar/tinggi/borderRadius
  // diisi dari useWindowDimensions, BUKAN 72 tetap seperti sebelumnya.
  // alignSelf 'center' karena card tidak memakai alignItems 'center'
  // (isi form rata kiri) — ikon harus tetap di tengah card.
  iconBox: {
    backgroundColor: Colors.primaryStart + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    alignSelf: 'center',
  },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, textAlign: 'center', marginBottom: Spacing.xl },
  // overflow 'hidden' supaya isi tidak bisa keluar dari sudut card
  // yang membulat di Android.
  card: {
    width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg, padding: 24,
    overflow: 'hidden',
  },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    height: 48, paddingHorizontal: Spacing.md, gap: Spacing.sm,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, height: '100%' },
  codeInput: { letterSpacing: 6, fontWeight: FontWeight.bold },
  infoText: { fontSize: FontSize.sm, color: Colors.primaryStart, marginTop: Spacing.md, textAlign: 'center' },
  button: { marginTop: Spacing.xl },
  resendBtn: { marginTop: Spacing.md, alignItems: 'center', paddingVertical: 8 },
  resendBtnDisabled: { opacity: 0.5 },
  resendText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primaryStart },
  note: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: Spacing.md, textAlign: 'center', lineHeight: 18 },
});
