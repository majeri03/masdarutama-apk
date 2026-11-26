/**
 * AppBackground — WS-6 (26 Nov 2026): background kaca app-wide, SATU tempat.
 *
 * Satu komponen ini dipasang SEKALI di App.tsx, tepat di belakang
 * NavigationContainer, sehingga SELURUH layar aplikasi mendapat corak yang
 * sama tanpa tiap layar mengatur background-nya sendiri.
 *
 * Cara kerja:
 * - LinearGradient vertikal SANGAT halus (hampir sama terangnya dengan
 *   Colors.background #F5F5F4) + dua blob bundar merah merek yang sangat
 *   samar (opacity 5-6%) di kanan atas dan kiri bawah. Hasilnya: layar
 *   terlihat seperti kaca buram yang hangat, selaras dengan GlassCard dan
 *   sidebar kaca web — bukan warna baru yang mencolok.
 * - Komponen ini pointerEvents="none" dan TIDAK menumpuk di atas konten,
 *   jadi tidak bisa menabrak GlassCard (pelajaran WS-9: background jangan
 *   sampai 2 lapis). Syaratnya: container root tiap layar harus
 *   backgroundColor 'transparent' — kalau masih solid #F5F5F4, gradien ini
 *   tertutup dan tidak terlihat. Layar-layar yang masih solid (yang sedang
 *   dikerjakan workstream lain) tetap tampil seperti sebelumnya.
 * - Teks tetap terbaca: gradiennya terang (luminansi ≈ #F5F5F4), kontras
 *   teks Colors.textPrimary (#111827) tidak berubah.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Putih hangat → abu netral tema → putih hangat kemerahan yang sangat samar.
const APP_GRADIENT = ['#FCFAF7', '#F5F5F4', '#F7F0EB'] as const;

export const AppBackground: React.FC = () => {
  return (
    <View style={styles.root} pointerEvents="none">
      <LinearGradient
        colors={APP_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Blob merah merek, sangat samar — memberi kesan kaca, bukan blok warna. */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blobTop: {
    position: 'absolute',
    top: -110,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(127, 29, 29, 0.06)',
  },
  blobBottom: {
    position: 'absolute',
    bottom: -120,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(127, 29, 29, 0.05)',
  },
});
