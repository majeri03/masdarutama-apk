/**
 * TB Masdar Utama - Premium Design System
 * Light Glassmorphism theme (iOS / macOS style)
 * Readable, elegant, and modern.
 */

export const Colors = {
  background: '#F5F5F4',           // abu terang netral (bukan biru-abu) — WS-9
  backgroundSecondary: '#FFFFFF',  // white for cards / bars
  surface: '#FFFFFF',
  surfaceLight: '#FAFAF9',  // abu hangat netral (stone-50) — WS-7: dulu #F8FAFC biru-abu slate

  glass: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  glassHighlight: 'rgba(255, 255, 255, 0.90)',

  textPrimary: '#111827',          // almost black — great readability
  textSecondary: '#374151',        // dark grey
  textTertiary: '#6B7280',         // medium grey
  textInverse: '#FFFFFF',          // white (for coloured badges)
  textMuted: '#9CA3AF',            // light grey placeholder text

  primaryStart: '#991B1B',         // merah merek (red-800) — WS-9
  primaryEnd: '#7F1D1D',           // merah gelap merek — WS-9
  primary: '#7F1D1D',              // merah gelap merek — WS-9

  secondaryStart: '#DC2626',       // merah (red-600) — WS-9
  secondaryEnd: '#7F1D1D',         // merah gelap merek — WS-9

  accentStart: '#B91C1C',          // merah (red-700) — WS-9
  accentEnd: '#7F1D1D',            // merah gelap merek — WS-9

  success: '#059669',
  successLight: 'rgba(5, 150, 105, 0.10)',
  warning: '#D97706',
  warningLight: 'rgba(217, 119, 6, 0.10)',
  error: '#DC2626',
  errorLight: 'rgba(220, 38, 38, 0.10)',
  info: '#2563EB',
  infoLight: 'rgba(37, 99, 235, 0.10)',

  cash: '#059669',
  transfer: '#2563EB',
  credit: '#D97706',
  debitCard: '#7F1D1D',  // merah gelap merek — WS-9
  qris: '#B91C1C',  // merah (red-700) — WS-9

  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.04)',

  // WS-6 (27 Nov 2026, kaca modal): dim di belakang modal dinaikkan 0.40
  // -> 0.60. Dipakai SEMUA overlay modal (POS, Produk, Delivery, Dashboard,
  // Riwayat, Fleet). Dengan dim 0.40, isi di belakang modal (mis. kartu
  // produk) masih terlalu jelas sehingga teks modal bercampur dengannya.
  overlay: 'rgba(0, 0, 0, 0.60)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',
} as const;

export const Gradients = {
  primary: [Colors.primaryStart, Colors.primaryEnd] as const,
  secondary: [Colors.secondaryStart, Colors.secondaryEnd] as const,
  accent: [Colors.accentStart, Colors.accentEnd] as const,
  light: ['#FFFFFF', '#F5F5F4'] as const,  // WS-9: samakan dengan Colors.background
  surface: ['rgba(255, 255, 255, 0.85)', 'rgba(245, 245, 244, 0.70)'] as const,  // WS-7: dulu rgba(248,250,252) biru-abu
  card: ['rgba(255, 255, 255, 0.80)', 'rgba(255, 255, 255, 0.50)'] as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadow = {
  sm: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  }),
  card: {
    shadowColor: '#A8A29E',  // WS-7: abu hangat netral (stone-400), dulu #94A3B8 slate kebiruan
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
