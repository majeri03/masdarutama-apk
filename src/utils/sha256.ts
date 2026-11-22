/**
 * SHA-256 murni JavaScript (tanpa dependensi baru).
 * Dipakai untuk memverifikasi integritas APK yang diunduh dari Google Drive
 * sebelum dipasang (lihat update.service.ts).
 *
 * Implementasi incremental: file dibaca per chunk (1 MB) supaya APK puluhan
 * MB tidak perlu dimuat utuh ke memori. Diuji terhadap vektor resmi NIST:
 * sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
 * sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
 */

import * as FileSystem from 'expo-file-system/legacy';

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export class Sha256 {
  private h: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  private buffer = new Uint8Array(64);
  private bufferLen = 0;
  private totalLen = 0;

  update(data: Uint8Array): void {
    this.totalLen += data.length;
    let offset = 0;
    if (this.bufferLen > 0) {
      const take = Math.min(64 - this.bufferLen, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLen);
      this.bufferLen += take;
      offset = take;
      if (this.bufferLen === 64) {
        this.compress(this.buffer);
        this.bufferLen = 0;
      }
    }
    while (offset + 64 <= data.length) {
      this.compress(data.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0);
      this.bufferLen = data.length - offset;
    }
  }

  digest(): string {
    // Panjang pesan (bit) ditangkap SEBELUM padding — update() di bawah
    // mengubah totalLen, tapi nilai bit-length sudah diamankan di sini.
    const bitLen = this.totalLen * 8;
    const padLen = this.bufferLen < 56 ? 56 - this.bufferLen : 120 - this.bufferLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    const high = Math.floor(bitLen / 0x100000000);
    const low = bitLen >>> 0;
    pad[padLen + 0] = (high >>> 24) & 0xff;
    pad[padLen + 1] = (high >>> 16) & 0xff;
    pad[padLen + 2] = (high >>> 8) & 0xff;
    pad[padLen + 3] = high & 0xff;
    pad[padLen + 4] = (low >>> 24) & 0xff;
    pad[padLen + 5] = (low >>> 16) & 0xff;
    pad[padLen + 6] = (low >>> 8) & 0xff;
    pad[padLen + 7] = low & 0xff;
    this.update(pad);
    let hex = '';
    for (const word of this.h) {
      hex += ('00000000' + (word >>> 0).toString(16)).slice(-8);
    }
    return hex;
  }

  private compress(block: Uint8Array): void {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) {
      w[i] = ((block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let h = this.h[7];
    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REVERSE: Record<string, number> = {};
for (let i = 0; i < B64_ALPHABET.length; i++) {
  B64_REVERSE[B64_ALPHABET[i]] = i;
}

/** Decode string base64 menjadi Uint8Array (tanpa Buffer — tidak ada di Hermes). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padCount = (clean.match(/=/g) || []).length;
  const len = Math.floor((clean.length * 3) / 4) - padCount;
  const out = new Uint8Array(len);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64_REVERSE[clean[i]] << 18) |
      (B64_REVERSE[clean[i + 1]] << 12) |
      ((B64_REVERSE[clean[i + 2]] || 0) << 6) |
      (B64_REVERSE[clean[i + 3]] || 0);
    if (outIdx < len) out[outIdx++] = (n >> 16) & 0xff;
    if (outIdx < len) out[outIdx++] = (n >> 8) & 0xff;
    if (outIdx < len) out[outIdx++] = n & 0xff;
  }
  return out;
}

const CHUNK_BYTES = 1024 * 1024; // 1 MB per baca

/**
 * Hitung SHA-256 (hex, huruf kecil) dari sebuah file lokal.
 * Membaca file per chunk supaya tidak memakan memori untuk file besar.
 * Throw kalau file tidak ada / ukuran yang terbaca tidak cocok.
 */
export async function sha256FileAsync(fileUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.size === undefined) {
    throw new Error('File tidak ditemukan untuk verifikasi hash.');
  }
  const totalSize = info.size;
  const hasher = new Sha256();
  let bytesRead = 0;
  while (bytesRead < totalSize) {
    const length = Math.min(CHUNK_BYTES, totalSize - bytesRead);
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: bytesRead,
      length,
    });
    const bytes = base64ToBytes(b64);
    hasher.update(bytes);
    bytesRead += bytes.length;
    // Pengaman: kalau `position`/`length` tidak dihormati runtime, jumlah
    // byte yang terbaca tidak akan cocok dengan ukuran file.
    if (bytes.length === 0) break;
  }
  if (bytesRead !== totalSize) {
    throw new Error(
      `Verifikasi hash gagal: hanya terbaca ${bytesRead} dari ${totalSize} byte.`,
    );
  }
  return hasher.digest();
}
