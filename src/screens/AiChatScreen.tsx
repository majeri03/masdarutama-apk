/**
 * AiChatScreen — MIDA True Autonomous Agent Interface
 *
 * v4 — ReAct Agent Edition:
 * - Hybrid ReAct Loop: Dynamic Context Injection + Multi-Turn ReAct
 * - Dynamic Context: Top-20 produk relevan disuntik ke system prompt (0 hallucination)
 * - ReAct Loop: AI bisa iterasi (Thought → Action → Observation) di background
 * - UI bersih: hanya tampilkan hasil akhir / Draft Card ke user
 * - Fallback deterministik (tanpa LLM): intent detect → pre-fetch → eksekusi
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Animated, Easing, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { useAiStore, AiMessage } from '../stores/ai.store';
import { useCartStore } from '../stores/cart.store';
import {
  executeAiToolCall, ToolCallPayload, ToolResult,
} from '../services/ai-executor.service';
import {
  initializeLlama, generateResponseWithContext,
  releaseLlama, isLlamaReady, LLAMA_CONFIG, ChatMessage, MODEL_MIRROR_URLS,
} from '../services/llama.service';
import {
  buildDynamicSystemPrompt, classifyFallbackIntent, ContextProduct,
} from '../utils/ai-prompts';
import { Colors, FontSize, FontWeight, Shadow, Spacing, BorderRadius, Gradients } from '../constants/theme';
import { debtService } from '../services/debt.service';
import { stockService } from '../services/stock.service';
import { productService } from '../services/product.service';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';

// ==================== TYPES ====================
interface DraftData {
  type: string;
  action: string;
  data: any;
  executeEndpoint?: string;
}

// Max ReAct loop iterations — cegah infinite loop & hemat RAM HP
const REACT_MAX_ITERATIONS = 4;

// ==================== MODEL FILE PATH ====================
const getModelDir = () => `${FileSystem.documentDirectory}${LLAMA_CONFIG.modelDir}/`;
const getModelPath = () => `${getModelDir()}${LLAMA_CONFIG.modelFilename}`;

// ==================== DRAFT EXECUTION ====================
const executeDraft = async (draftData: DraftData): Promise<{ success: boolean; message: string }> => {
  try {
    switch (draftData.type) {
      case 'draft_transaction':
        return { success: true, message: 'Silakan lanjutkan transaksi di layar POS dengan data yang sudah diisi.' };

      case 'draft_debt_payment': {
        const d = draftData.data;
        const res = await debtService.payDebt({
          type: d.debtType || 'customer', debtId: d.debtId,
          amount: d.amount, paymentMethod: d.paymentMethod || 'CASH',
          notes: d.notes || 'Pembayaran via AI MIDA',
        });
        if (!res.success) return { success: false, message: res.error || 'Gagal memproses pembayaran.' };
        return { success: true, message: `Pembayaran Rp${d.amount?.toLocaleString('id-ID')} berhasil dicatat!` };
      }

      case 'draft_delivery':
        return { success: true, message: 'Silakan lanjutkan pembuatan Surat Jalan di layar Delivery.' };

      case 'draft_purchase':
        return { success: true, message: 'Silakan lanjutkan pembuatan PO di layar Purchase.' };

      case 'draft_stock_adjustment': {
        const d = draftData.data;
        const res = await stockService.createAdjustment({
          productId: d.productId || d.productCode, type: d.type || 'ADJUSTMENT',
          quantity: d.qty || d.quantity, notes: d.notes || 'Penyesuaian via AI MIDA',
        });
        if (!res.success) return { success: false, message: res.error || 'Gagal menyesuaikan stok.' };
        return { success: true, message: `Stok berhasil disesuaikan: ${d.type} ${d.qty} unit.` };
      }

      case 'draft_wa_confirm': {
        const d = draftData.data;
        const res = await api.post(API_ENDPOINTS.WA_ORDER_CONFIRM(d.orderId), { parsedItems: d.parsedItems });
        if (res.data?.success === false) return { success: false, message: 'Gagal mengkonfirmasi order WA.' };
        return { success: true, message: `Order WA ${d.orderId} berhasil dikonfirmasi!` };
      }

      case 'draft_delete': {
        const d = draftData.data;
        const endpoints: Record<string, string> = {
          product: `/api/products/${d.id}`, customer: `/api/customers/${d.id}`,
          supplier: `/api/suppliers/${d.id}`, purchase: `/api/purchases/${d.id}`,
          delivery: `/api/delivery-orders/${d.id}`,
        };
        const ep = endpoints[d.target];
        if (!ep) return { success: false, message: `Target hapus "${d.target}" tidak dikenali.` };
        const res = await api.delete(ep);
        if (res.data?.success === false) return { success: false, message: res.data?.error || 'Gagal menghapus.' };
        return { success: true, message: `${d.name || d.target} berhasil dihapus!` };
      }

      case 'draft_edit': {
        const d = draftData.data;
        const endpoints: Record<string, string> = {
          product: `/api/products/${d.id}`, customer: `/api/customers/${d.id}`,
          supplier: `/api/suppliers/${d.id}`,
        };
        const ep = endpoints[d.target];
        if (!ep) return { success: false, message: `Target edit "${d.target}" tidak dikenali.` };
        const res = await api.put(ep, d.changes || {});
        if (res.data?.success === false) return { success: false, message: res.data?.error || 'Gagal mengubah.' };
        return { success: true, message: `${d.name || d.target} berhasil diperbarui!` };
      }

      default:
        return { success: false, message: `Tipe draf "${draftData.type}" tidak dikenali.` };
    }
  } catch (error: any) {
    return { success: false, message: error?.response?.data?.error || error?.message || 'Terjadi kesalahan.' };
  }
};

// ==================== TOOL CALL PARSER ====================
const extractToolCall = (text: string): ToolCallPayload | null => {
  // Try exact JSON first
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed?.type === 'tool_call' && parsed?.tool) return parsed;
  } catch { }
  // Extract embedded JSON from mixed text
  const jsonMatch = text.match(/\{[\s\S]*?"type"\s*:\s*"tool_call"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.type === 'tool_call' && parsed?.tool) return parsed;
    } catch { }
  }
  return null;
};

// ==================== DYNAMIC CONTEXT PRE-FETCH ====================
/**
 * Fetch top-20 produk yang paling relevan dengan keyword user.
 * Hasil diinjeksikan ke system prompt sebagai Quick Reference.
 * Ini yang membuat AI tidak perlu "tebak" nama/kode produk.
 */
const fetchContextProducts = async (userText: string): Promise<ContextProduct[]> => {
  try {
    // Ekstrak 1-3 kata kunci dari kalimat user (buang kata bantu)
    const stopWords = /^(buat|bikin|buatkan|tolong|minta|carikan|cek|cari|ada|berapa|harga|stok|lihat|tampil|orderan|nota|transaksi|surat|jalan|untuk|atas|nama|kepada|ke|dari|dengan|dan|atau|yang|ini|itu|saya|kami|kita|mau|ingin|perlu|butuh)$/i;
    const words = userText
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.test(w))
      .slice(0, 3);

    if (words.length === 0) return [];
    const keyword = words.join(' ');

    const res = await productService.getProducts({ search: keyword, limit: 20 });
    const products = (res.data as any)?.products || [];

    return products.map((p: any): ContextProduct => ({
      code: p.code,
      name: p.name,
      currentStock: p.currentStock,
      category: p.category?.name,
      units: p.productUnits?.map((pu: any) => ({
        unitName: pu.unit?.name,
        sellPrice: pu.sellPrice,
        buyPrice: pu.buyPrice,
        isPrimary: pu.isPrimary,
      })) || [],
    }));
  } catch {
    return [];
  }
};

// ==================== FORMAT TOOL RESULT FOR UI ====================
/**
 * Converts a DATA_RESPONSE ToolResult into human-readable markdown text.
 * DRAFT_RESPONSE is handled separately by DraftCard component.
 */
const formatToolResultForUI = (toolName: string, result: ToolResult): string => {
  if (result.resultType === 'ERROR_RESPONSE') return `⚠️ ${result.error}`;
  if (result.resultType === 'DRAFT_RESPONSE') return JSON.stringify(result.draft);

  const data = result.data;
  const msg = result.message;

  if (!data) return msg || 'Tidak ada data.';

  if (Array.isArray(data)) {
    if (data.length === 0) return msg || '📭 Data kosong / tidak ditemukan.';
    switch (toolName) {
      case 'searchProduct':
      case 'getLowStockProducts':
        return `📦 Ditemukan **${data.length}** produk:\n\n` +
          data.slice(0, 10).map((p: any, i: number) =>
            `${i + 1}. **${p.name}** (${p.code})\n   Stok: ${p.currentStock} | Min: ${p.minStock || '-'}\n   ${p.units?.map((u: any) => `${u.unitName}: Rp${u.sellPrice?.toLocaleString('id-ID')}`).join(', ') || ''}`
          ).join('\n\n');
      case 'searchCustomer':
        return `👥 Ditemukan **${data.length}** pelanggan:\n\n` +
          data.slice(0, 10).map((c: any, i: number) =>
            `${i + 1}. **${c.name}** (${c.code}) — ${c.type || 'REGULER'}\n   📱 ${c.phone || '-'} | 📍 ${c.address || '-'}`
          ).join('\n\n');
      case 'searchSupplier':
        return `🏭 Ditemukan **${data.length}** supplier:\n\n` +
          data.slice(0, 10).map((s: any, i: number) =>
            `${i + 1}. **${s.name}** (${s.code})\n   📱 ${s.phone || '-'} | 📍 ${s.address || '-'}`
          ).join('\n\n');
      case 'getCustomerDebts':
        return `💰 Data Piutang Pelanggan:\n\n` +
          data.slice(0, 10).map((d: any, i: number) =>
            `${i + 1}. **${d.customerName || d.customer?.name || '-'}**\n   Sisa: Rp${(d.remainingAmount || d.amount || 0).toLocaleString('id-ID')} | Status: ${d.status || '-'}`
          ).join('\n\n');
      case 'getSupplierDebts':
        return `🏭 Data Utang Supplier:\n\n` +
          data.slice(0, 10).map((d: any, i: number) =>
            `${i + 1}. **${d.supplierName || d.supplier?.name || '-'}**\n   Sisa: Rp${(d.remainingAmount || d.amount || 0).toLocaleString('id-ID')} | Status: ${d.status || '-'}`
          ).join('\n\n');
      default:
        return msg || `📋 Ditemukan **${data.length}** data.`;
    }
  }

  if (typeof data === 'object') {
    switch (toolName) {
      case 'getProductDetail':
        return `📦 **Detail Produk: ${data.name}**\n\n• Kode: ${data.code}\n• Kategori: ${data.category?.name || '-'}\n• Stok Saat Ini: **${data.currentStock}** (Min: ${data.minStock})\n\n**Satuan & Harga:**\n${data.productUnits?.map((u: any) => `- ${u.unit?.name}: Beli Rp${u.buyPrice?.toLocaleString('id-ID')} | Jual Rp${u.sellPrice?.toLocaleString('id-ID')}`).join('\n') || '- -'}`;
      case 'getSaleDetail':
        return `🧾 **Detail Nota: ${data.invoiceNumber}**\n\n• Tanggal: ${new Date(data.date).toLocaleDateString('id-ID')}\n• Pelanggan: ${data.customer?.name || 'UMUM'}\n• Total: **Rp${(data.finalTotal || 0).toLocaleString('id-ID')}**\n• Status: ${data.paymentStatus}\n\n**Item:**\n${data.saleItems?.map((item: any) => `- ${item.quantity} ${item.unit?.name} ${item.product?.name} (Rp${item.price?.toLocaleString('id-ID')})`).join('\n') || '- -'}`;
      case 'getStoreSettings':
        return `🏪 **Profil Toko**\n\n• Nama: **${data.name || '-'}**\n• Tagline: ${data.tagline || '-'}\n• Alamat: ${data.address || '-'}, ${data.city || ''}\n• Telepon: ${data.phone || '-'}\n• Bank: ${data.bankName || '-'} a.n. ${data.bankHolder || '-'}`;
      case 'getFinancialReport':
        return `📊 **Laporan Keuangan**\n\n• Omzet: **Rp${(data.totalRevenue || 0).toLocaleString('id-ID')}**\n• Profit: **Rp${(data.totalProfit || 0).toLocaleString('id-ID')}**\n• Transaksi: **${data.totalTransactions || 0}x**\n• Rata-rata: Rp${(data.averageTransaction || 0).toLocaleString('id-ID')}`;
      case 'getInventoryReport':
        return `📦 **Inventaris**\n\n• Total Produk: **${data.totalProducts || 0}**\n• Nilai Stok: **Rp${(data.totalStockValue || 0).toLocaleString('id-ID')}**\n• Stok Rendah: ${data.lowStockProducts?.length || 0}\n• Stok Habis: ${data.outOfStockProducts?.length || 0}`;
      default:
        return msg || `📋 Data berhasil dimuat.`;
    }
  }
  return msg || String(data);
};



// ==================== TYPING INDICATOR ====================
const TypingIndicator = ({ statusText }: { statusText?: string }) => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.ease }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true, easing: Easing.ease }),
        ])
      );
    const a1 = animate(dot1, 0); const a2 = animate(dot2, 150); const a3 = animate(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={s.typingRow}>
      <View style={s.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[s.typingDot, { opacity: dot }]} />
        ))}
      </View>
      <Text style={s.typingText}>{statusText || 'MIDA sedang berpikir...'}</Text>
    </View>
  );
};

// ==================== MARKDOWN RENDERER (per-line, clean) ====================
const renderMarkdownText = (text: string, isUser: boolean): React.ReactNode[] => {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    if (line.trim() === '') {
      return <View key={lineIdx} style={{ height: 4 }} />;
    }

    const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().match(/^\d+\./);

    const renderInlineBold = (raw: string): React.ReactNode[] => {
      const parts = raw.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={pIdx} style={[s.msgText, isUser ? s.userText : s.aiText, { fontWeight: '700' }]}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part ? (
          <Text key={pIdx} style={[s.msgText, isUser ? s.userText : s.aiText]}>{part}</Text>
        ) : null;
      });
    };

    return (
      <View key={lineIdx} style={[s.msgLine, isBullet && s.bulletLine]}>
        <Text style={[s.msgText, isUser ? s.userText : s.aiText]}>
          {renderInlineBold(line) as any}
        </Text>
      </View>
    );
  });
};

// ==================== COMPACT DRAFT CARD ====================
const DraftCard = ({ msg, onConfirm }: { msg: AiMessage; onConfirm: (d: DraftData) => void }) => {
  const [expanded, setExpanded] = useState(false);
  let draftData: DraftData;
  try {
    const raw = JSON.parse(msg.text);
    // Support both old format { type, action, data } and new ToolResult.draft format
    draftData = raw.draft ?? raw;
  } catch { return null; }

  const isDanger = draftData.type === 'draft_delete';
  const isEdit = draftData.type === 'draft_edit';
  const iconName = isDanger ? 'trash-outline' : isEdit ? 'create-outline' : 'document-text-outline';
  const iconColor = isDanger ? Colors.error : Colors.primaryStart;

  const entries = Object.entries(draftData.data || {});
  const visibleEntries = expanded ? entries : entries.slice(0, 3);
  const hasMore = entries.length > 3;

  return (
    <View style={s.alignLeft}>
      <View style={s.draftCardCompact}>
        <View style={s.draftHeaderCompact}>
          <View style={[s.draftIconSmall, isDanger && { backgroundColor: Colors.errorLight }]}>
            <Ionicons name={iconName as any} size={12} color={iconColor} />
          </View>
          <Text style={[s.draftTitleCompact, isDanger && { color: Colors.error }]} numberOfLines={1}>
            {draftData.action}
          </Text>
        </View>

        <View style={s.draftFieldsCompact}>
          {visibleEntries.map(([key, val]) => (
            <View key={key} style={s.draftFieldRowCompact}>
              <Text style={s.draftFieldLabelCompact}>{key}</Text>
              <Text style={s.draftFieldValueCompact}>
                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
              </Text>
            </View>
          ))}
          {hasMore && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)}>
              <Text style={s.expandToggle}>{expanded ? '▲ Sembunyikan' : `▼ +${entries.length - 3} lainnya`}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.draftActionsRow}>
          <TouchableOpacity
            style={[s.draftActionBtn, isDanger ? s.draftActionDanger : s.draftActionPrimary]}
            onPress={() => onConfirm(draftData)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isDanger ? 'trash-outline' : isEdit ? 'pencil-outline' : 'checkmark-outline'}
              size={13}
              color="#fff"
            />
            <Text style={s.draftActionBtnText}>
              {isDanger ? 'Hapus' : isEdit ? 'Edit' : 'Konfirmasi'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ==================== AI SETTINGS MODAL ====================
const AiSettingsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const {
    isModelDownloaded, modelDownloadProgress, setModelDownloadStatus,
    isModelLoading, isModelReady,
  } = useAiStore();
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  // Auto-detect file if placed manually by user via USB
  useEffect(() => {
    const checkFile = async () => {
      if (isModelDownloaded) return;
      try {
        const info = await FileSystem.getInfoAsync(getModelPath());
        if (info.exists && (info as any).size > 100 * 1024 * 1024) {
          setModelDownloadStatus(true, 100);
        }
      } catch (e) {}
    };
    if (visible) checkFile();
  }, [visible, isModelDownloaded]);

  const handleImportModel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (file.size && file.size < 100 * 1024 * 1024) {
        Alert.alert('❌ File Terlalu Kecil', 'Pastikan Anda memilih file model GGUF yang benar (ukuran ~395 MB).');
        return;
      }

      setIsDownloading(true);
      setModelDownloadStatus(false, 0);

      const dirInfo = await FileSystem.getInfoAsync(getModelDir());
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(getModelDir(), { intermediates: true });
      }

      await FileSystem.copyAsync({
        from: file.uri,
        to: getModelPath()
      });

      setModelDownloadStatus(true, 100);
      Alert.alert('✅ Selesai!', 'Model AI berhasil di-import dari penyimpanan Anda!\n\nTutup pengaturan untuk mulai menggunakan AI.');
    } catch (err: any) {
      Alert.alert('❌ Import Gagal', err.message);
      setModelDownloadStatus(false, 0);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadModel = async () => {
    // Peringatan jika masih di Expo Go
    if (typeof (global as any).__expo !== 'undefined' || typeof (global as any).__expoDebugChannel !== 'undefined') {
      Alert.alert(
        '⚠️ Expo Go Terdeteksi',
        'True On-Device AI membutuhkan APK native (EAS Build).\n\nExpo Go tidak bisa menjalankan llama.rn.\n\nSilakan build APK dulu dengan:\neas build -p android --profile preview',
        [{ text: 'Mengerti', style: 'default' }]
      );
      return;
    }

    Alert.alert(
      '📥 Download Model AI',
      `Model AI offline (Qwen 2.5 0.5B, ~395MB) akan diunduh.\n\nPastikan:\n• Koneksi WiFi stabil (bukan data seluler)\n• Storage tersedia minimal 500MB\n• Proses butuh 5-20 menit\n\nJangan tutup aplikasi selama download.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Mulai Download',
          onPress: async () => {
            setIsDownloading(true);
            setModelDownloadStatus(false, 0);
            try {
              // Hapus file lama jika ada (mungkin corrupt)
              const existingInfo = await FileSystem.getInfoAsync(getModelPath());
              if (existingInfo.exists) {
                await FileSystem.deleteAsync(getModelPath(), { idempotent: true });
              }

              // Buat folder jika belum ada
              const dirInfo = await FileSystem.getInfoAsync(getModelDir());
              if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(getModelDir(), { intermediates: true });
              }

              const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
                const total = downloadProgress.totalBytesExpectedToWrite;
                const written = downloadProgress.totalBytesWritten;
                if (total > 0) {
                  const pct = (written / total) * 100;
                  setModelDownloadStatus(false, Math.min(pct, 99));
                } else {
                  const estimatedPct = Math.min((written / (395 * 1024 * 1024)) * 100, 98);
                  setModelDownloadStatus(false, estimatedPct);
                }
              };

              // === SINGLE DOWNLOAD URL ===
              let downloadSuccess = false;
              let lastError = '';

              const mirrorUrl = MODEL_MIRROR_URLS[0];
              const mirrorName = 'hf-mirror.com';
              console.log(`[MIDA] Mencoba download dari ${mirrorName}...`);
              setModelDownloadStatus(false, 0);

              try {
                downloadRef.current = FileSystem.createDownloadResumable(
                  mirrorUrl,
                  getModelPath(),
                  {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                      'Accept': 'application/octet-stream, */*',
                    },
                  },
                  callback,
                );

                const result = await downloadRef.current.downloadAsync();
                downloadRef.current = null;

                if (!result?.uri) {
                  lastError = `${mirrorName}: tidak ada file diterima.`;
                  throw new Error(lastError);
                }

                // Validasi ukuran file
                const fileInfo = await FileSystem.getInfoAsync(result.uri);
                const fileSizeBytes = (fileInfo as any).size || 0;
                const fileSizeMB = fileSizeBytes / (1024 * 1024);

                if (fileSizeMB < 100) {
                  // File terlalu kecil — bukan model asli
                  await FileSystem.deleteAsync(result.uri, { idempotent: true });
                  lastError = `${mirrorName}: file terlalu kecil (${fileSizeMB.toFixed(1)}MB — bukan model GGUF).`;
                  throw new Error(lastError);
                }

                // ✅ Berhasil!
                downloadSuccess = true;
                setModelDownloadStatus(true, 100);
                Alert.alert(
                  '✅ Selesai!',
                  `Model AI (${fileSizeMB.toFixed(0)}MB) berhasil diunduh!\n\nMIDA kini menggunakan True On-Device AI 🧠\n\nTutup dan buka kembali layar chat untuk mengaktifkan.`
                );

              } catch (mirrorErr: any) {
                downloadRef.current = null;
                lastError = `${mirrorName}: ${mirrorErr.message || 'error tidak diketahui'}`;
                console.warn(`[MIDA] Download gagal: ${lastError}`);
                try {
                  const partial = await FileSystem.getInfoAsync(getModelPath());
                  if (partial.exists) await FileSystem.deleteAsync(getModelPath(), { idempotent: true });
                } catch {}
              }

              if (!downloadSuccess) {
                throw new Error(
                  `Download gagal.\n\nError: ${lastError}\n\n💡 Solusi: Gunakan tombol "Import File" untuk memilih model secara manual.`
                );
              }

            } catch (err: any) {
              setModelDownloadStatus(false, 0);
              Alert.alert('❌ Download Gagal', err.message || 'Terjadi kesalahan saat mendownload.', [
                { text: 'Tutup', style: 'cancel' },
              ]);
            } finally {
              setIsDownloading(false);
              downloadRef.current = null;
            }
          }
        },
      ]
    );
  };

  const handleDeleteModel = async () => {
    Alert.alert(
      '🗑️ Hapus Model AI',
      'Yakin ingin menghapus model AI offline? Anda harus download ulang untuk menggunakan True AI.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await releaseLlama();
              useAiStore.getState().setModelReady(false);
              const info = await FileSystem.getInfoAsync(getModelPath());
              if (info.exists) await FileSystem.deleteAsync(getModelPath());
              setModelDownloadStatus(false, 0);
              Alert.alert('✅', 'Model AI berhasil dihapus. MIDA kembali ke mode Pattern Matching.');
            } catch (err: any) {
              Alert.alert('❌', `Gagal menghapus: ${err.message}`);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.settingsOverlay}>
        <View style={s.settingsSheet}>
          <View style={s.settingsHandle} />
          <Text style={s.settingsTitle}>⚙️ Pengaturan AI MIDA</Text>

          {/* Status saat ini */}
          <View style={s.settingsSection}>
            <Text style={s.settingsSectionLabel}>STATUS SAAT INI</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, {
                backgroundColor: isModelReady
                  ? Colors.success
                  : isModelLoading
                    ? Colors.warning
                    : isModelDownloaded
                      ? Colors.info
                      : Colors.error,
              }]} />
              <Text style={s.statusLabel}>
                {isModelReady
                  ? 'On-Device AI Aktif ✨'
                  : isModelLoading
                    ? 'Memuat model ke RAM...'
                    : isModelDownloaded
                      ? 'Model tersedia — belum dimuat'
                      : 'Pattern Matching (Fallback)'}
              </Text>
            </View>
          </View>

          {/* Model offline */}
          <View style={s.settingsSection}>
            <Text style={s.settingsSectionLabel}>MODEL AI OFFLINE (LOKAL)</Text>
            <View style={[s.modelCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={s.modelInfo}>
                <Text style={s.modelName}>🧠 MIDA AI Engine (Qwen 2.5 0.5B)</Text>
                <Text style={s.modelDesc}>Super Kilat & Ringan · ~395 MB · Optimized Quantized</Text>
                <Text style={s.modelDesc}>Berjalan 100% offline tanpa menguras RAM HP</Text>
              </View>

              {isModelDownloaded ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 }}>
                  <View style={s.modelInstalled}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={[s.modelInstallText, { color: Colors.success }]}>Terpasang</Text>
                  </View>
                  <TouchableOpacity onPress={handleDeleteModel} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.error + '10', borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, color: Colors.error, fontWeight: 'bold' }}>Hapus</Text>
                  </TouchableOpacity>
                </View>
              ) : isDownloading || (modelDownloadProgress > 0 && modelDownloadProgress < 100) ? (
                <View style={[s.downloadProgress, { marginTop: 8, width: '100%', alignItems: 'stretch' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, color: Colors.textSecondary }}>Mengunduh model...</Text>
                    <Text style={s.progressText}>{Math.round(modelDownloadProgress)}%</Text>
                  </View>
                  <View style={[s.progressBar, { width: '100%', height: 8, borderRadius: 4 }]}>
                    <View style={[s.progressFill, { width: `${modelDownloadProgress}%` as any, borderRadius: 4 }]} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
                  <TouchableOpacity style={[s.downloadBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10 }]} onPress={handleDownloadModel} activeOpacity={0.8}>
                    <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                    <Text style={[s.downloadBtnText, { fontSize: 13 }]}>Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.downloadBtn, { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primaryStart, justifyContent: 'center', paddingVertical: 10 }]} onPress={handleImportModel} activeOpacity={0.8}>
                    <Ionicons name="folder-open-outline" size={18} color={Colors.primaryStart} />
                    <Text style={[s.downloadBtnText, { color: Colors.primaryStart, fontSize: 13 }]}>Import File</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Info cara kerja */}
          <View style={s.settingsSection}>
            <Text style={s.settingsSectionLabel}>CARA KERJA</Text>
            <View style={s.infoBox}>
              <Text style={s.infoText}>
                {'• Jika model offline terpasang → AI berjalan di perangkat Anda tanpa internet\n'}
                {'• Jika belum → MIDA menggunakan pattern matching pintar (offline, cepat)\n'}
                {'• Semua data & tools tetap terhubung ke server toko Anda\n'}
                {'• Model dimuat ke RAM saat membuka chat (~5-15 detik pertama)'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={s.settingsCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.settingsCloseBtnText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ==================== MAIN COMPONENT ====================
export const AiChatScreen = () => {
  const navigation = useNavigation<any>();
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>('MIDA sedang berpikir...');
  const [showSettings, setShowSettings] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const {
    messages, addMessage, updateLastAssistantMessage,
    isModelDownloaded, isModelReady,
    setModelLoading, setModelReady, setModelLoadError, setModelDownloadStatus,
  } = useAiStore();

  // Scroll to bottom when messages or loading state changes
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length, isLoading]);

  // Auto-load LLM context when model is downloaded
  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      if (!isModelDownloaded || isModelReady || isLlamaReady()) return;

      // Verify file exists on disk
      try {
        const info = await FileSystem.getInfoAsync(getModelPath());
        if (!info.exists) {
          setModelDownloadStatus(false, 0);
          return;
        }
      } catch {
        return;
      }

      setModelLoading(true);
      setModelLoadError(null);
      try {
        await initializeLlama(getModelPath());
        if (!cancelled) {
          setModelReady(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setModelLoadError(err.message || 'Gagal memuat model');
          console.warn('[MIDA] LLM load error:', err);
        }
      } finally {
        if (!cancelled) setModelLoading(false);
      }
    };

    loadModel();
    return () => { cancelled = true; };
  }, [isModelDownloaded]);

  // Cleanup LLM context on unmount
  useEffect(() => {
    return () => {
      releaseLlama().catch(() => {});
      useAiStore.getState().setModelReady(false);
    };
  }, []);

  // ==================== REACT AGENT ENGINE ====================

  /**
   * handleSend — Hybrid ReAct Agent Loop
   *
   * Mode A (LLM Ready): Dynamic Context → ReAct Loop (max 4 turns) di background
   * Mode B (Fallback):  Intent Classify → Optional Pre-fetch → Direct Execute
   *
   * UI HANYA melihat hasil akhir — Draft Card atau teks jawaban.
   * Semua proses Thought→Action→Observation terjadi di background.
   */
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    const userText = inputText.trim();
    setInputText('');
    addMessage({ role: 'user', text: userText });
    setIsLoading(true);
    setAgentStatus('MIDA sedang berpikir...');

    try {
      if (isModelReady && isLlamaReady()) {
        // ================================================================
        // MODE A: TRUE REACT AGENT (On-Device LLM)
        // ================================================================

        // Step 1: Dynamic Context — fetch produk relevan dari DB
        setAgentStatus('Menyiapkan konteks data...');
        const contextProducts = await fetchContextProducts(userText);

        // Step 2: Build initial messages array
        const recentHistory = messages
          .slice(-6)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));

        const agentMessages: ChatMessage[] = [
          { role: 'system', content: buildDynamicSystemPrompt(contextProducts) },
          ...recentHistory,
          { role: 'user', content: userText },
        ];

        // Step 3: Tambahkan placeholder pesan di UI
        addMessage({ role: 'assistant', text: '...' });

        // Step 4: ReAct Loop
        let iteration = 0;
        let agentDone = false;

        while (iteration < REACT_MAX_ITERATIONS && !agentDone) {
          iteration++;

          // LLM berpikir — update status tapi TIDAK tampilkan ke chat
          if (iteration === 1) {
            setAgentStatus('MIDA sedang menganalisis perintah...');
            updateLastAssistantMessage('...');
          } else {
            setAgentStatus(`Mengambil data (langkah ${iteration})...`);
          }

          // LLM inference — tidak streaming di iteration > 1 agar bersih
          const llmResponse = await generateResponseWithContext(agentMessages);

          const toolCall = extractToolCall(llmResponse);

          if (!toolCall) {
            // AI sudah selesai → tampilkan teks jawaban ke UI
            updateLastAssistantMessage(llmResponse || 'Maaf, saya tidak bisa memproses perintah tersebut.');
            agentDone = true;
            break;
          }

          // Ada tool call → eksekusi di background
          setAgentStatus(`Mengeksekusi: ${toolCall.tool}...`);
          updateLastAssistantMessage('⏳ Sedang memproses...');

          const toolResult = await executeAiToolCall(toolCall);

          if (toolResult.resultType === 'DRAFT_RESPONSE') {
            // Draft siap → tampilkan DraftCard ke UI → loop selesai
            updateLastAssistantMessage(JSON.stringify(toolResult.draft));
            agentDone = true;
            break;
          }

          if (toolResult.resultType === 'ERROR_RESPONSE') {
            // Error dari backend → sampaikan ke user → loop selesai
            updateLastAssistantMessage(`⚠️ ${toolResult.error}`);
            agentDone = true;
            break;
          }

          // DATA_RESPONSE → inject sebagai Observation ke context, lanjut loop
          agentMessages.push({ role: 'assistant', content: llmResponse });
          agentMessages.push({
            role: 'tool',
            content: `Observation: ${JSON.stringify(toolResult.data).slice(0, 2000)}`, // limit agar context tidak meledak
          });
          // Loop kembali → LLM baca data dan ambil keputusan
        }

        // Jika loop habis tanpa selesai (edge case)
        if (!agentDone) {
          updateLastAssistantMessage('Saya memerlukan informasi lebih spesifik untuk melanjutkan. Bisa Anda jelaskan lebih detail?');
        }

      } else {
        // ================================================================
        // MODE B: FALLBACK DETERMINISTIK (Tanpa LLM)
        // Pre-fetch data yang diperlukan → eksekusi langsung
        // ================================================================
        setAgentStatus('Menganalisis perintah...');
        await new Promise(r => setTimeout(r, 300));

        // Cek greeting & pertanyaan umum
        const lower = userText.toLowerCase();
        const greetings = ['halo', 'hai', 'hi', 'pagi', 'siang', 'sore', 'malam', 'assalamualaikum'];
        if (greetings.some(g => lower.startsWith(g))) {
          addMessage({ role: 'assistant', text: `Halo! Saya **MIDA** 👋, asisten cerdas Toko Masdar Utama.\n\nSaya bisa membantu:\n• 📦 Cek stok & harga produk\n• 🧾 Buat nota transaksi & PO\n• 🚚 Buat surat jalan\n• 💰 Cek hutang/piutang\n• 📊 Laporan keuangan\n\nApa yang perlu dieksekusi hari ini?` });
          return;
        }
        if (lower.includes('siapa kamu') || lower.includes('apa yang bisa kamu lakukan')) {
          addMessage({ role: 'assistant', text: `Saya **MIDA** (Masdar Intelligent Digital Assistant) 🤖\n\nSaya adalah agent AI otonom yang punya akses penuh ke:\n• **Transaksi:** Buat nota, kasir, piutang\n• **Inventaris:** Stok, harga, opname\n• **Operasional:** PO, Surat Jalan, WA Order\n• **Laporan:** Keuangan, inventaris, pergerakan stok\n\nCukup perintah dalam bahasa Indonesia — saya yang eksekusi!` });
          return;
        }
        if (lower.includes('terima kasih') || lower.includes('makasih')) {
          addMessage({ role: 'assistant', text: 'Sama-sama! Siap membantu kapan saja 😊' });
          return;
        }

        // Klasifikasi intent & eksekusi
        const intent = classifyFallbackIntent(userText);

        if (!intent) {
          addMessage({
            role: 'assistant',
            text: `Saya belum bisa memahami perintah tersebut. Coba lebih spesifik, misalnya:\n\n• "Cek stok semen merah"\n• "Buat PO cat tembok ke supplier Avian"\n• "Lihat hutang pelanggan Pak Budi"\n• "Laporan keuangan bulan ini"`,
          });
          return;
        }

        // Pre-fetch jika intent memerlukan data sebelum eksekusi final
        let finalParams = intent.params;
        if (intent.needsPreFetch) {
          setAgentStatus('Mengambil data produk...');
          const preFetchResult = await executeAiToolCall({
            type: 'tool_call',
            tool: intent.needsPreFetch.tool,
            params: intent.needsPreFetch.params,
          });
          if (preFetchResult.resultType === 'DATA_RESPONSE' && preFetchResult.data) {
            // Map hasil pencarian ke params final
            finalParams = intent.needsPreFetch.mapResult(preFetchResult, intent.params);
          }
        }

        // Eksekusi tool final
        setAgentStatus(`Mengeksekusi: ${intent.tool}...`);
        const result = await executeAiToolCall({
          type: 'tool_call',
          tool: intent.tool,
          params: finalParams,
        });

        if (result.resultType === 'DRAFT_RESPONSE') {
          addMessage({ role: 'assistant', text: JSON.stringify(result.draft) });
        } else if (result.resultType === 'ERROR_RESPONSE') {
          addMessage({ role: 'assistant', text: `⚠️ ${result.error}` });
        } else {
          // DATA_RESPONSE → format untuk tampilan
          const formatted = formatToolResultForUI(intent.tool, result);
          addMessage({ role: 'assistant', text: formatted });
        }
      }
    } catch (err: any) {
      const errMsg = `❌ Maaf, terjadi kesalahan: ${err?.message || 'Error tidak diketahui.'}`;
      if (isModelReady) {
        updateLastAssistantMessage(errMsg);
      } else {
        addMessage({ role: 'assistant', text: errMsg });
      }
    } finally {
      setIsLoading(false);
      setAgentStatus('MIDA sedang berpikir...');
    }
  }, [inputText, isLoading, addMessage, updateLastAssistantMessage, isModelReady, messages]);

  const handleDraftConfirm = useCallback(async (draftData: DraftData) => {
    const isDanger = draftData.type === 'draft_delete';
    Alert.alert(
      isDanger ? '⚠️ Konfirmasi Hapus' : '✅ Konfirmasi',
      `Apakah Anda yakin ingin ${draftData.action}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: isDanger ? 'Ya, Hapus!' : 'Ya, Lanjutkan',
          style: isDanger ? 'destructive' : 'default',
          onPress: async () => {
            setIsLoading(true);

            // === NAVIGASI CERDAS BERDASARKAN TIPE DRAFT ===
            if (draftData.type === 'draft_transaction') {
              // Pre-fill cart dengan data dari AI
              const d = draftData.data;
              const cartStore = useCartStore.getState();
              // Set catatan dan pelanggan (jika ada customerId)
              cartStore.setNotes(d.notes || `Pesanan: ${d.customerName || 'UMUM'}`);
              if (d.paymentMethod === 'CREDIT') {
                // Hutang — bisa ditambahkan cart.setPaymentMethod nantinya
              }
              addMessage({
                role: 'assistant',
                text: `✅ Draft transaksi untuk **${d.customerName || 'UMUM'}** disiapkan!\n\nMembuka layar POS... Tambahkan produk di sana dan selesaikan pembayaran.`,
              });
              setIsLoading(false);
              // Navigasi ke POS
              setTimeout(() => navigation.navigate('POS' as never), 600);
              return;
            }

            if (draftData.type === 'draft_delivery') {
              addMessage({
                role: 'assistant',
                text: `✅ Membuka layar Surat Jalan untuk **${draftData.data.customerName || 'UMUM'}**...`,
              });
              setIsLoading(false);
              setTimeout(() => navigation.navigate('Delivery' as never), 600);
              return;
            }

            if (draftData.type === 'draft_purchase') {
              addMessage({
                role: 'assistant',
                text: `✅ Membuka layar Purchase Order untuk supplier **${draftData.data.supplierName || 'UMUM'}**...`,
              });
              setIsLoading(false);
              setTimeout(() => navigation.navigate('Purchase' as never), 600);
              return;
            }

            // Untuk tipe lain (hapus, edit, bayar hutang, dll) — eksekusi langsung
            const result = await executeDraft(draftData);
            addMessage({ role: 'assistant', text: result.success ? `✅ ${result.message}` : `❌ ${result.message}` });
            setIsLoading(false);
          },
        },
      ]
    );
  }, [addMessage, navigation]);

  // ==================== RENDER MESSAGE ====================
  const renderMessage = (msg: AiMessage) => {
    const isUser = msg.role === 'user';

    // Draft card — support both old { type:"draft_*" } and new { draft: { type } }
    if (msg.role === 'assistant' && msg.text.startsWith('{') &&
      (msg.text.includes('"type":"draft_') || msg.text.includes('"draft":{"type":"draft_'))) {
      return <DraftCard key={msg.id} msg={msg} onConfirm={handleDraftConfirm} />;
    }

    // Check if text contains a markdown link
    const hasLink = /\[([^\]]+)\]\(([^)]+)\)/.test(msg.text);

    if (hasLink) {
      const parts = msg.text.split(/(\[[^\]]+\]\([^)]+\))/g);
      return (
        <View key={msg.id} style={isUser ? s.alignRight : s.alignLeft}>
          <View style={[s.messageBubble, isUser ? s.userBubble : s.aiBubble]}>
            {!isUser && (
              <View style={s.aiAvatarSmall}>
                <Ionicons name="sparkles" size={10} color={Colors.primaryStart} />
              </View>
            )}
            <View style={s.messageTextContainer}>
              {parts.map((part, idx) => {
                const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (linkMatch) {
                  const [, linkText, linkRoute] = linkMatch;
                  return (
                    <TouchableOpacity key={idx} onPress={() => {
                      const route = linkRoute.replace(/^\//, '');
                      const segs = route.split('/');
                      segs.length >= 2 ? navigation.navigate(segs[0], { id: segs[1] }) : navigation.navigate(route);
                    }} style={s.linkButton}>
                      <Ionicons name="open-outline" size={12} color={Colors.primaryStart} />
                      <Text style={s.linkText}>{linkText}</Text>
                    </TouchableOpacity>
                  );
                }
                return renderMarkdownText(part, isUser);
              })}
            </View>
          </View>
        </View>
      );
    }

    // Normal message with clean per-line rendering
    return (
      <View key={msg.id} style={isUser ? s.alignRight : s.alignLeft}>
        <View style={[s.messageBubble, isUser ? s.userBubble : s.aiBubble]}>
          {!isUser && (
            <View style={s.aiAvatarSmall}>
              <Ionicons name="sparkles" size={10} color={Colors.primaryStart} />
            </View>
          )}
          <View style={s.messageTextContainer}>
            {renderMarkdownText(msg.text, isUser)}
          </View>
        </View>
      </View>
    );
  };

  // ==================== RENDER ====================
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.headerAvatar}>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={s.headerTitle}>MIDA</Text>
            <Text style={s.headerSubtitle}>
              {isModelReady ? '🟢 On-Device AI (Qwen 2.5)' : isModelDownloaded ? '🟡 Model tersedia' : '⚪ Pattern Matching'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={s.clearBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Hapus Riwayat', 'Hapus semua riwayat chat AI?', [
              { text: 'Batal', style: 'cancel' },
              { text: 'Hapus', style: 'destructive', onPress: () => useAiStore.getState().clearHistory() },
            ])}
            style={s.clearBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== CHAT MESSAGES (ScrollView, no inverted) ===== */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={s.emptyState}>
              <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.emptyAvatar}>
                <Ionicons name="sparkles" size={32} color="#fff" />
              </LinearGradient>
              <Text style={s.emptyTitle}>Halo! Saya MIDA 👋</Text>
              <Text style={s.emptySubtitle}>
                {isModelReady
                  ? 'AI On-Device aktif! Saya berjalan langsung di HP Anda tanpa internet.'
                  : 'Asisten AI Toko Masdar Utama.\nSaya bisa bantu cek stok, buat nota, lihat laporan, dan banyak lagi!'}
              </Text>
              <View style={s.chipContainer}>
                {[
                  { icon: 'cube-outline', label: 'Cek stok semen' },
                  { icon: 'logo-whatsapp', label: 'Lihat pesanan WA' },
                  { icon: 'bar-chart-outline', label: 'Laporan keuangan' },
                  { icon: 'wallet-outline', label: 'Cek hutang pelanggan' },
                  { icon: 'alert-circle-outline', label: 'Stok rendah' },
                  { icon: 'storefront-outline', label: 'Profil toko' },
                ].map(({ icon, label }) => (
                  <TouchableOpacity key={label} style={s.chip} onPress={() => setInputText(label)} activeOpacity={0.7}>
                    <Ionicons name={icon as any} size={14} color={Colors.primaryStart} />
                    <Text style={s.chipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <>
            {messages.map(renderMessage)}
            {isLoading && <TypingIndicator statusText={agentStatus} />}
          </>
          )}
        </ScrollView>

        {/* ===== INPUT BAR ===== */}
        <View style={s.inputBar}>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="Ketik perintah ke MIDA..."
              placeholderTextColor={Colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              multiline
              maxLength={1000}
              editable={!isLoading}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, (!inputText.trim() || isLoading) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={(!inputText.trim() || isLoading) ? ['#CBD5E1', '#CBD5E1'] : Gradients.primary}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.sendBtnGradient}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* AI Settings Modal */}
      <AiSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </SafeAreaView>
  );
};

// ==================== STYLES ====================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  backBtn: { padding: 4 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginLeft: 8 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 10, color: Colors.textTertiary, marginTop: 1 },
  clearBtn: { padding: 4 },

  // Chat
  chatContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 12, flexGrow: 1 },
  alignRight: { alignItems: 'flex-end', marginBottom: 10 },
  alignLeft: { alignItems: 'flex-start', marginBottom: 10 },

  // Bubbles
  messageBubble: {
    maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18, flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  userBubble: { backgroundColor: Colors.primaryStart, borderBottomRightRadius: 4, ...Shadow.sm },
  aiBubble: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  aiAvatarSmall: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.infoLight,
    justifyContent: 'center', alignItems: 'center', marginTop: 2, flexShrink: 0,
  },
  messageTextContainer: { flex: 1, flexDirection: 'column' },

  // Per-line message rendering
  msgLine: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 1 },
  bulletLine: { paddingLeft: 4 },
  msgText: { fontSize: 14, lineHeight: 21 },
  userText: { color: '#fff' },
  aiText: { color: Colors.textPrimary },

  // Links
  linkButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.infoLight, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 6, alignSelf: 'flex-start',
  },
  linkText: { color: Colors.primaryStart, fontSize: 12, fontWeight: FontWeight.semibold },

  // COMPACT DRAFT CARD
  draftCardCompact: {
    width: '95%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  draftHeaderCompact: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  draftIconSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.infoLight,
    justifyContent: 'center', alignItems: 'center',
  },
  draftTitleCompact: { fontSize: 13, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1 },
  draftFieldsCompact: { paddingHorizontal: 16, paddingVertical: 12 },
  draftFieldRowCompact: { flexDirection: 'column', marginBottom: 8, gap: 4 },
  draftFieldLabelCompact: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textTertiary, textTransform: 'capitalize' },
  draftFieldValueCompact: { fontSize: 13, color: Colors.textPrimary },
  expandToggle: { fontSize: 12, color: Colors.primaryStart, fontWeight: FontWeight.semibold, textAlign: 'center', marginTop: 8 },
  draftActionsRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 12,
  },
  draftActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: BorderRadius.sm,
  },
  draftActionPrimary: { backgroundColor: Colors.primaryStart },
  draftActionDanger: { backgroundColor: Colors.error },
  draftActionBtnText: { color: '#fff', fontSize: 13, fontWeight: FontWeight.bold },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  typingBubble: {
    flexDirection: 'row', gap: 4, backgroundColor: Colors.surface,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primaryStart },
  typingText: { fontSize: 11, color: Colors.textTertiary, fontStyle: 'italic' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  inputWrapper: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.lg,
  },
  input: { fontSize: 14, color: Colors.textPrimary, paddingVertical: 10, maxHeight: 100, minHeight: 40 },
  sendBtn: {},
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnGradient: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.sm,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, flex: 1, justifyContent: 'center',
  },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: Spacing.xl, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  chipText: { fontSize: 12, color: Colors.textPrimary, fontWeight: FontWeight.medium },

  // AI Settings Modal
  settingsOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  settingsSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 32, paddingTop: 12,
    maxHeight: '85%',
  },
  settingsHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  settingsTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary,
    marginBottom: Spacing.lg, textAlign: 'center',
  },
  settingsSection: { marginBottom: Spacing.lg },
  settingsSectionLabel: {
    fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textTertiary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, padding: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  modelCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  modelInfo: { flex: 1 },
  modelName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modelDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  modelInstalled: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modelInstallText: { fontSize: 11, fontWeight: FontWeight.bold },
  downloadProgress: { alignItems: 'center', gap: 4, minWidth: 72 },
  progressBar: { width: 72, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primaryStart, borderRadius: 3 },
  progressText: { fontSize: 10, color: Colors.primaryStart, fontWeight: FontWeight.bold },
  downloadBtn: {
    backgroundColor: Colors.primaryStart, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.sm, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  downloadBtnText: { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },
  infoBox: { backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: 12, borderWidth: 1, borderColor: Colors.border },
  infoText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  settingsCloseBtn: {
    backgroundColor: Colors.primaryStart, paddingVertical: 14, borderRadius: BorderRadius.md,
    alignItems: 'center', marginTop: Spacing.md,
  },
  settingsCloseBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});

export default AiChatScreen;
