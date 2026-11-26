# README — CARA PASANG PAKET PERBAIKAN APK KE-2 + FITUR PROFIL (26 Nov 2026)

Paket perbaikan 8 masalah dari tes APK Jery (26 Nov 2026, 20:29 WITA) + 1 fitur
Profil (web + APK):
1. Login KASIR gagal padahal password benar; 2. Pengaturan Perangkat blank;
3. UI Salesman/Customer/Poin jadi tabel ala History; 4. Buat Surat Jalan
(paste invoice + plat otomatis dari sopir); 5. UI Utang & Piutang jadi tabel
ala History; 6. Bersihkan sisa sampah UI + background kaca app-wide;
7. Tombol/kartu masih berbackground abu-ungu; 8. Error hapus gambar R2
(`olderThanDays wajib diisi bilangan bulat 1–365`); 9. Fitur Profil (lihat
profil + ubah password dipindah ke sini + foto profil, batas ukuran).

- Repo web: `https://github.com/majeri03/tbmasdarutama`, HEAD **`7cebf8f7`**
  ("final version").
- Repo APK: `https://github.com/majeri03/masdarutama-apk`, HEAD **`e6e38abe`**
  ("final version").

> **BACA DULU — STATUS PAKET INI**
>
> Paket ini **BELUM terverifikasi / BELUM final**. Yang sudah dicek di sini:
> ke-4 patch web lolos `git apply --check` + full apply **berurutan dalam
> satu fresh clone `7cebf8f7`**, dan ke-9 patch APK (8 workstream + 1
> koordinator) lolos `git apply --check` + full apply **berurutan dalam satu
> fresh clone `e6e38abe`** (32 file, +1934/−1241). Sweep file `"use server"`
> di pohon web hasil rakitan bersih (tidak ada export fungsi non-async).
> Yang **TIDAK BISA** jalan di environment pembuat paket ini: `npx tsc`,
> `npm run build`, dan EAS build (tidak ada `node_modules` / toolchain di
> sana). **Laptop Jery yang memutuskan: `npx tsc --noEmit` dan
> `npm run build` (web) HARUS lolos sebelum commit + push, dan EAS build
> HARUS sukses sebelum install APK.** Kalau gagal, JANGAN push/install —
> kirim baris error paling bawah ke Jett.
>
> **URUTAN DEPLOY WAJIB: web dulu, baru APK.** Patch web membawa migrasi
> avatar (item 9) + endpoint yang dibutuhkan APK, dan validasi cleanup R2
> yang baru (item 8): sampai backend baru tayang, APK baru yang mengirim
> `olderThanDays: 0` masih ditolak 400 oleh backend lama.

---

## 0. Sebelum mulai — cek posisi repo

```powershell
cd D:\laragon\www\proyekmasdarutama\tbmasdarutama
git status
git log --oneline -1
cd D:\laragon\www\proyekmasdarutama\masdarutamaapk
git status
git log --oneline -1
```

Pastikan: tidak ada perubahan yang belum di-commit, HEAD web `7cebf8f7`,
HEAD APK `e6e38abe`. Kalau HEAD sudah bukan itu (ada push baru),
**berhenti** dan tanya Jett dulu.

**Download-first:** simpan file `.patch` ke dalam folder repo dulu, baru
jalankan `git apply`. Jangan apply dari folder lain.

---

## 1. BAGIAN A — Patch web (4 patch, HARUS berurutan)

Pasang di repo backend (`D:\laragon\www\proyekmasdarutama\tbmasdarutama`).
Download dulu file zip `patch-web.zip`, extract ke folder repo sehingga ada
folder `patch-web\` berisi 4 file patch.

```powershell
cd D:\laragon\www\proyekmasdarutama\tbmasdarutama
git apply patch-web\ws-1-login-kasir-lockout-message.patch
git apply patch-web\ws-4-surat-jalan-web.patch
git apply patch-web\ws-8-r2-hapus-web.patch
git apply patch-web\ws-9-profil-web.patch
```

| No | File patch | Isi singkat |
|----|-----------|-------------|
| 1 | `ws-1-login-kasir-lockout-message.patch` | Pesan lockout login web tidak lagi disamakan dengan "password salah" (item 1, bug kode nyata — lihat §5) |
| 2 | `ws-4-surat-jalan-web.patch` | Backend memvalidasi pasangan sopir–plat saat buat/ubah DO (item 4) |
| 3 | `ws-8-r2-hapus-web.patch` | Validasi cleanup R2: `olderThanDays` 0–365 (0 = semua umur) (item 8) |
| 4 | `ws-9-profil-web.patch` | Tab Profil web + form ubah password pindah ke sini + endpoint avatar R2 + migrasi `20261126210000_user_avatar` (item 9) |

Migrasi database WAJIB (patch nomor 4 membawa migrasi baru):

```powershell
npx prisma migrate deploy
npx prisma generate
```

Lanjut type check + build:

```powershell
npx tsc --noEmit
npm run build
```

- Kalau `tsc` gagal: kirim errornya ke Jett, jangan lanjut.
- Kalau `npm run build` gagal: yang penting **satu error di baris paling
  bawah** log — kirim baris itu. Pelajaran lama: `tsc` lolos TIDAK menjamin
  build lolos.
- Kalau keduanya lolos, baru commit + push:

```powershell
git add -A
git commit -m "perbaikan apk ke-2 + fitur profil 26 nov 2026"
git push
```

Vercel akan deploy otomatis. **Tunggu deploy selesai (status Success) sebelum
lanjut ke Bagian B.**

---

## 2. BAGIAN B — Patch APK (9 patch, HARUS berurutan)

Pasang di repo APK (`D:\laragon\www\proyekmasdarutama\masdarutamaapk`).
Download dulu file zip `patch-apk.zip`, extract ke folder repo sehingga ada
folder `patch-apk\` berisi 9 file patch.

```powershell
cd D:\laragon\www\proyekmasdarutama\masdarutamaapk
git apply patch-apk\ws-2-device-settings.patch
git apply patch-apk\ws-3-tabel-salesman-customer-poin.patch
git apply patch-apk\ws-4-surat-jalan-apk.patch
git apply patch-apk\ws-5-tabel-utang-piutang.patch
git apply patch-apk\ws-6-bersih-ui-glass.patch
git apply patch-apk\ws-7-sisa-warna-lama.patch
git apply patch-apk\ws-8-r2-hapus-apk.patch
git apply patch-apk\ws-9-profil-apk.patch
git apply patch-apk\koordinator.patch
```

| No | File patch | Isi singkat |
|----|-----------|-------------|
| 1 | `ws-2-device-settings.patch` | Layar Pengaturan Perangkat tidak blank lagi (USB diblokir di Android 14+, init paralel) (item 2) |
| 2 | `ws-3-tabel-salesman-customer-poin.patch` | Salesman/Customer/Poin jadi tabel ala History, info lengkap di modal detail (item 3) |
| 3 | `ws-4-surat-jalan-apk.patch` | Paste nomor invoice menautkan penjualan; plat otomatis dari sopir (item 4) |
| 4 | `ws-5-tabel-utang-piutang.patch` | Utang & Piutang jadi tabel ala History, info lengkap di modal detail (item 5) |
| 5 | `ws-6-bersih-ui-glass.patch` | Bersihkan import/style/kode mati + background kaca app-wide `AppBackground` (item 6) |
| 6 | `ws-7-sisa-warna-lama.patch` | Kartu info toko jadi kaca putih bersih + sisa biru/pink di tema (item 7) |
| 7 | `ws-8-r2-hapus-apk.patch` | Tombol hapus R2 mengirim `olderThanDays` yang benar + pesan error manusiawi (item 8) |
| 8 | `ws-9-profil-apk.patch` | Kartu Profil Akun bisa diketuk → layar Profil baru (foto + ubah password) (item 9) |
| 9 | `koordinator.patch` | Container 9 layar jadi transparan supaya background kaca terlihat di semua layar (item 6) |

Lalu type check + commit + push:

```powershell
npx tsc --noEmit
git add -A
git commit -m "perbaikan apk ke-2 + fitur profil 26 nov 2026"
git push
```

Kalau `tsc` gagal, kirim errornya ke Jett, jangan lanjut.

---

## 3. EAS BUILD BARU — WAJIB (perubahan APK tidak terlihat tanpa ini)

Setelah Bagian B di-push:

```powershell
cd D:\laragon\www\proyekmasdarutama\masdarutamaapk
eas build --platform android --profile production
```

Download file `.apk` hasil build, install di HP (timpa APK lama). **Tanpa
build + install baru, semua perbaikan APK di atas TIDAK akan terlihat.**

---

## 4. LANGKAH MANUAL — LOGIN KASIR (item 1, PENTING)

Patch web nomor 1 memperbaiki pesan lockout, tapi **penyebab login kasir
gagal kemungkinan besar BUKAN bug kode — melainkan data akun kasir itu
sendiri** (hash password di DB tidak cocok). Bukti: log yang dikirim Jery
berasal dari `authorize()` **web** (APK login lewat rute mobile
`POST /api/auth/login` yang tidak pernah memanggil `authorize`), dan di
`authorize` pesan "Email atau password salah" hanya dilempar kalau
kredensial kosong, email tidak terdaftar, `bcrypt.compare` gagal, atau akun
dinonaktifkan — tidak ada jalur yang menolak khusus role KASIR. Peringatan
Turnstile di log **bukan** penyebab (fail open = dilewati, dan rute mobile
bahkan tidak memanggil Turnstile).

Langkah reset untuk akun kasir (lakukan setelah Bagian A deploy):

1. Ketik ulang password secara manual di HP (jangan pakai autofill/password
   tersimpan — spasi tersembunyi dari autofill adalah kemungkinan yang
   tersisa di sisi APK).
2. Tunggu 15 menit tanpa mencoba login (kalau lockout sempat terpicu).
3. Sebagai Super Admin, buka Manajemen Akun di web: periksa akun kasir
   (email persis, status verifikasi/OTP, aktif/nonaktif).
4. **Reset password kasir lewat Super Admin** — ini perbaikan yang benar
   untuk hash password yang tidak cocok.
5. Pastikan Vercel sudah redeploy HEAD terbaru (deploy lama sebelum
   perbaikan OTP 24 Nov 2026 menolak akun belum terverifikasi dengan pesan
   generik).
6. Bila masih gagal, catat hasil `POST /api/auth/login` saat login APK:
   401 (password salah) vs 429 (terkunci 15 menit) vs 403 (belum
   terverifikasi) vs 500 — kirim hasilnya ke Jett.

---

## 5. Yang diputuskan / diubah perilakunya (sudah diterapkan di patch)

- **Item 1 (login):** pesan error login kini dibedakan — web: "password
  salah" vs "Terlalu banyak percobaan login. Coba lagi 15 menit lagi."
  (terkunci) vs "Akun belum terverifikasi" (kotak OTP). APK sudah
  menampilkan 429/403 apa adanya, tidak diubah.
- **Item 2 (perangkat):** modul USB **tidak pernah disentuh di Android API
  ≥ 34** (targetSdk aplikasi 36). Kartu USB menampilkan penjelasan
  ("gunakan Bluetooth atau Printer Sistem"). Ini perlindungan dari JS —
  kode native library ada di `node_modules` dan tidak bisa di-patch dari
  repo. Perbaikan permanen (USB OTG aktif lagi di Android 14+) butuh
  config plugin Expo yang memanggil `registerReceiver` dengan
  `RECEIVER_NOT_EXPORTED` — di luar paket ini.
- **Item 4 (surat jalan):** plat menjadi TURUNAN sopir yang dipilih
  (terkunci/terisi otomatis). Sopir 1 kendaraan → plat terisi otomatis;
  >1 kendaraan → hanya tampil kendaraan sopir itu; 0 kendaraan → pesan
  jelas. Sopir luar (tidak ada di armada) tetap bisa isi plat manual.
  Backend menolak pasangan sopir–plat yang salah dengan pesan jelas.
  Catatan: form DO di **web** masih menampilkan pilih kendaraan bebas —
  pasangan salah dari web kini ditolak server, tapi UI web belum
  diselaraskan (di luar lingkup paket ini).
- **Item 6 (kaca app-wide):** `AppBackground` dipasang sekali di `App.tsx`
  (gradien halus + 2 blob merah samar, tanpa BlurView). Modal layar penuh,
  header bar/kartu/input tetap solid — hanya container root layar yang
  transparan. Patch koordinator menutup 9 layar yang tidak disentuh WS-6.
- **Item 7 (warna):** biru semantik dipertahankan (info, transfer, status
  Servis). Yang diganti: kartu info toko (lepas dari `tinted`), ikon tombol
  cepat biru/pink, token `surfaceLight`/`Shadow.card` biru-abu → abu hangat.
- **Item 8 (R2):** tombol hapus-semua kini mengirim `olderThanDays: 0`
  (semua umur, eksplisit); tombol "> 30 Hari" tetap `30`. Validasi backend
  0–365; tanpa parameter tetap ditolak 400 (pagar pentest tetap berdiri).
- **Item 9 (profil):** batas avatar **maks 2 MB, hanya JPG/PNG/WebP**,
  ditegakkan di client DAN server (cek MIME + ukuran + magic byte) dan
  ditampilkan di UI. Avatar lama dihapus dari R2 saat diganti/dihapus.
  Form ubah password **pindah** dari tab "Ganti Password" ke tab Profil —
  tidak ada dua tempat ganti password. Upload logo toko tidak disentuh.

---

## 6. Yang TIDAK diperbaiki (dengan alasan)

- **Item 1:** bila reset password kasir tidak menyelesaikan, penyebabnya
  ada di data/DB yang tidak bisa dilihat dari sini (lihat §4 langkah 6).
- **Item 2:** USB OTG di Android 14+ tetap nonaktif (butuh config plugin
  Expo — lihat §5). Konfirmasi definitif butuh logcat saat membuka layar
  (cari `FATAL EXCEPTION: mqt_native_modules` + `SecurityException ...
  registerReceiver` + `USBPrinterAdapter`) dan versi Android HP Jery —
  kalau HP-nya Android 13 ke bawah, jalur ini tidak aktif.
- **Item 3:** chip filter tipe di CustomersScreen adalah tambahan baru
  (sebelumnya hanya pencarian) — kalau tidak mau, penghapusannya satu blok
  kecil (lihat NOTES WS-3 §4).
- **Item 4:** UI pilih kendaraan di form DO web belum diselaraskan.
- **Item 6:** kandidat sampah di layar workstream lain (import tak terpakai
  di Salesmen/Customers/Points/Debt/Settings/DeviceSettings/Delivery/
  StorageManager) hanya didaftar di NOTES WS-6, tidak dihapus — tidak
  berbahaya, hanya kebersihan.
- **Item 7:** bila kartu info toko di HP masih abu, penyebabnya mungkin
  `BlurView` Android itu sendiri — solusinya nanti menaikkan opasitas
  gradien kaca atau menurunkan `intensity` BlurView khusus kartu itu
  (lihat NOTES WS-7 §6, jangan diubah dulu sebelum bukti visual).
- **Item 8:** tipe APK tidak memuat `olderThan60Days`/`fotoLokasi`/
  `heroImages` dari backend; layar APK tidak punya seksi hero.
- **Item 9:** upload nyata ke R2 (upload/ganti/hapus + hapus avatar lama)
  belum dites end-to-end; tampilan visual tab/layar Profil belum dilihat.

---

## 7. Follow-up yang butuh keputusan Jery

1. **Item 2:** buat config plugin Expo untuk `registerReceiver` dengan
   `RECEIVER_NOT_EXPORTED` supaya USB OTG bisa aktif lagi di Android 14+?
2. **Item 4:** selaraskan UI pilih kendaraan di form DO web (ikuti aturan
   plat-otomatis-dari-sopir seperti APK)?
3. **Item 6:** hapus juga kandidat import tak terpakai di layar lain
   (daftar di NOTES WS-6)?
4. **Item 7:** bila kartu info toko masih abu di HP, naikkan opasitas
   gradien kaca atau turunkan `intensity` BlurView kartu itu?
5. Masih terbuka dari paket sebelumnya: apakah API location juga harus
   menolak ADMIN memulai GPS? Tetap Google Drive atau pindah hosting
   APK+manifest? Apakah rilis 1.1.1 wajib (`mandatory: true`) atau tetap
   opsional? Definisi "Total Belanja (Lunas)" — mau mencakup CREDIT juga?
   Total fee salesman — mau mengeluarkan CANCELLED/RETURN?

---

## 8. Setelah deploy + install — yang harus dites ulang

- Login kasir: ikuti §4 (ketik manual → tunggu 15 menit → cek akun →
  reset password bila perlu). Login web yang terkunci harus menampilkan
  pesan "Terlalu banyak percobaan login. Coba lagi 15 menit lagi."
  (bukan "Email atau password salah").
- Perangkat: buka Pengaturan → Pengaturan Perangkat — layar tidak boleh
  blank abu-abu; kartu USB menampilkan penjelasan Android 14+.
- Salesman/Customer/Poin: tabel ala History, ketuk baris → modal detail
  lengkap; filter tetap jalan; angka total sama seperti sebelum patch.
- Surat jalan: paste `INV/20261125-0002` → penjualan menaut otomatis;
  pilih sopir 1 kendaraan → plat terisi otomatis; sopir >1 kendaraan →
  hanya kendaraannya yang tampil; sopir 0 kendaraan → pesan jelas.
- Utang & Piutang: tabel ala History di kedua tab; ketuk baris → modal
  detail (termasuk riwayat cicilan); angka tidak berubah.
- Background: buka semua layar — gradien kaca terlihat, tidak ada layar
  yang masih solid menutupi; modal tetap menutupi dengan benar.
- Settings: kartu info toko putih bersih (bukan abu-ungu).
- R2: "Hapus yang > 30 Hari" jalan; "Hapus Semua Bukti/Foto" jalan
  (butuh backend baru sudah deploy — lihat §1).
- Profil: ketuk kartu Profil Akun di Settings → layar Profil; upload foto
  (coba file > 2 MB — harus ditolak dengan pesan jelas); ganti foto (foto
  lama terhapus); hapus foto; ubah password dari Profil (tab "Ganti
  Password" di Settings sudah tidak ada).

---

## 9. Isi paket

```
perbaikan-apk-2-20261126/
├── README-CARA-PASANG.md            ← file ini
├── patch-apk.zip                    ← 9 patch APK (siap extract ke repo APK)
├── patch-web.zip                    ← 4 patch web (siap extract ke repo backend)
├── patch-apk/                       ← isi zip APK (folder datar)
├── patch-web/                       ← isi zip web (folder datar)
├── ws-1-login-kasir/                (patch web + NOTES — diagnosis item 1)
├── ws-2-device-settings/            (patch APK + NOTES)
├── ws-3-tabel-salesman-customer-poin/ (patch APK + NOTES)
├── ws-4-surat-jalan/                (patch APK + web + NOTES)
├── ws-5-tabel-utang-piutang/        (patch APK + NOTES)
├── ws-6-bersih-ui-glass/            (patch APK + NOTES)
├── ws-7-sisa-warna-lama/            (patch APK + NOTES)
├── ws-8-r2-hapus/                   (patch APK + web + NOTES)
├── ws-9-profil/                     (patch APK + web + NOTES)
└── 10-koordinator/                  (patch koordinator + NOTES)
```

Tiap folder berisi file `.patch` + `NOTES.md` (apa yang diubah, kenapa, apa
yang TIDAK diubah, dan apa yang belum terverifikasi di sini). Baca NOTES
folder yang bersangkutan kalau ada yang kurang jelas sebelum memasang.
