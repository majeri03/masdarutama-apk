/**
 * TB Masdar Utama - Premium Design System
 * Light Glassmorphism theme (iOS / macOS style)
 * Readable, elegant, and modern.
 */

export const Colors = {
  // ─── Base Light Palette ─────────────────────────────────
  background: '#F0F4F8',           // very light blue-grey (not pure white)
  backgroundSecondary: '#FFFFFF',  // white for cards / bars
  surface: '#FFFFFF',
  surfaceLight: '#F8FAFC',

  // ─── Glass Effects (iOS-style) ───────────────────────────
  glass: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  glassHighlight: 'rgba(255, 255, 255, 0.90)',

  // ─── Text (dark on light backgrounds) ───────────────────
  textPrimary: '#111827',          // almost black — great readability
  textSecondary: '#374151',        // dark grey
  textTertiary: '#6B7280',         // medium grey
  textInverse: '#FFFFFF',          // white (for coloured badges)
  textMuted: '#9CA3AF',            // light grey placeholder text

  // ─── Primary Brand Accents ───────────────────────────────
  primaryStart: '#2563EB',         // blue-600
  primaryEnd: '#7C3AED',           // violet-700
  primary: '#2563EB',              // main blue

  secondaryStart: '#DB2777',       // pink-600
  secondaryEnd: '#E11D48',         // rose-600

  accentStart: '#0891B2',          // cyan-600
  accentEnd: '#1D4ED8',            // blue-700

  // ─── Status Colors ───────────────────────────────────────
  success: '#059669',
  successLight: 'rgba(5, 150, 105, 0.10)',
  warning: '#D97706',
  warningLight: 'rgba(217, 119, 6, 0.10)',
  error: '#DC2626',
  errorLight: 'rgba(220, 38, 38, 0.10)',
  info: '#2563EB',
  infoLight: 'rgba(37, 99, 235, 0.10)',

  // ─── Payment method colors ───────────────────────────────
  cash: '#059669',
  transfer: '#2563EB',
  credit: '#D97706',
  debitCard: '#7C3AED',
  qris: '#DB2777',

  // ─── Border ──────────────────────────────────────────────
  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.04)',

  // ─── Overlay ─────────────────────────────────────────────
  overlay: 'rgba(0, 0, 0, 0.40)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',
} as const;

export const Gradients = {
  primary: [Colors.primaryStart, Colors.primaryEnd] as const,
  secondary: [Colors.secondaryStart, Colors.secondaryEnd] as const,
  accent: [Colors.accentStart, Colors.accentEnd] as const,
  light: ['#FFFFFF', '#F0F4F8'] as const,
  surface: ['rgba(255, 255, 255, 0.85)', 'rgba(248, 250, 252, 0.70)'] as const,
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
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
