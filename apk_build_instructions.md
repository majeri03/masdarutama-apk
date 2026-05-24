# Panduan Lengkap Build APK Gratis - TB Masdar Utama

Dokumen ini berisi panduan langkah demi langkah untuk membangun (build) aplikasi Android APK secara **100% gratis** menggunakan Expo.

---

## Persiapan Logo Aplikasi
Untuk memastikan logo aplikasi menggunakan berkas logo yang sudah disiapkan:
`D:\laragon\www\proyekmasdarutama\masdarutamaapk\assets\logomasdarutama.png`

Pastikan berkas `app.json` di dalam root project Anda (`d:\laragon\www\proyekmasdarutama\masdarutamaapk\app.json`) merujuk ke logo tersebut pada opsi `"icon"` dan `"adaptiveIcon"`:
```json
{
  "expo": {
    "name": "Masdar Utama",
    "slug": "masdarutamaapk",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/logomasdarutama.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/logomasdarutama.png",
      "resizeMode": "contain",
      "backgroundColor": "#111827"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/logomasdarutama.png",
        "backgroundColor": "#111827"
      },
      "package": "com.masdarutama.app"
    }
  }
}
```

---

## Opsi 1: EAS Build (Cloud - Gratis & Paling Mudah)
Expo menyediakan layanan cloud gratis bernama **EAS (Expo Application Services)**. Anda dapat membuat build APK di server cloud mereka tanpa perlu mengunduh Android Studio atau SDK di komputer lokal Anda.

### Langkah-langkah:
1. **Daftar Akun Expo**
   Jika belum punya, daftar akun gratis di [expo.dev](https://expo.dev).
2. **Pasang EAS CLI secara Global**
   Buka terminal di komputer Anda, lalu jalankan:
   ```bash
   npm install -g eas-cli
   ```
3. **Login ke Akun Expo via Terminal**
   Jalankan perintah berikut dan masukkan email & password akun Expo Anda:
   ```bash
   eas login
   ```
4. **Inisialisasi Konfigurasi EAS**
   Jalankan perintah inisialisasi berikut di root folder project (`masdarutamaapk`):
   ```bash
   eas build:configure
   ```
5. **Konfigurasi format build ke APK**
   Buka berkas `eas.json` yang baru terbentuk di root directory Anda. Pastikan pada bagian `preview` ditambahkan konfigurasi `"buildType": "apk"` agar menghasilkan APK yang siap di-install (bukan berkas `.aab` untuk Play Store).
   Contoh isi `eas.json`:
   ```json
   {
     "cli": {
       "version": ">= 10.0.0"
     },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "production": {}
     }
   }
   ```
6. **Jalankan Perintah Build APK**
   Jalankan perintah berikut untuk memulai proses kompilasi cloud:
   ```bash
   eas build -p android --profile preview
   ```
7. **Unduh APK**
   Setelah proses build selesai (sekitar 5-10 menit), terminal akan menampilkan tautan (link) unduhan dan kode QR. Pindai kode QR tersebut menggunakan HP Anda atau klik link-nya untuk mengunduh berkas APK secara gratis!

---

## Opsi 2: Build Lokal Menggunakan Komputer Sendiri (100% Offline & Gratis)
Jika Anda tidak ingin mengunggah project ke cloud Expo, Anda bisa melakukan kompilasi lokal secara offline gratis di komputer Anda. Namun, ini membutuhkan konfigurasi software tambahan.

### Persyaratan di Komputer:
1. **Java Development Kit (JDK)**: Pasang JDK 17 (versi yang direkomendasikan untuk React Native terbaru).
2. **Android Studio**: Unduh dan pasang Android Studio. Pastikan Anda memasang **Android SDK** dan **Android Virtual Device (AVD)** jika ingin menggunakan emulator.
3. **Environment Variables**: Daftarkan lokasi SDK Anda (misal `ANDROID_HOME`) ke system path OS Windows Anda.

### Langkah-langkah:
1. **Pre-build Project (Membuat folder native android)**
   Di terminal root project Anda, jalankan:
   ```bash
   npx expo prebuild
   ```
   Perintah ini akan membuat folder `android` di dalam project Anda yang berisi project Android asli lengkap dengan konfigurasinya.
2. **Kompilasi Lokal APK**
   Masuk ke folder `android` dan jalankan Gradle untuk mengompilasi APK rilis:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   *(Untuk Windows PowerShell, jalankan `.\gradlew assembleRelease`)*
3. **Lokasi Berkas APK**
   Setelah proses selesai, berkas APK rilis lokal gratis Anda akan berada di:
   `android/app/build/outputs/apk/release/app-release.apk`
   Salin berkas tersebut ke HP Anda dan pasang secara langsung!
