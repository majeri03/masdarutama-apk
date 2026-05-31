/**
 * AiChatScreen — Premium AI Chat Interface for MIDA (Masdar Intelligent Digital Assistant)
 *
 * v3 — True On-Device LLM Integration:
 * - Real model download from HuggingFace via expo-file-system
 * - Streaming per-token output via llama.rn
 * - Fallback to regex pattern matching if model not downloaded
 * - Draft confirmation compact & responsive
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
import { useAiStore, AiMessage } from '../stores/ai.store';
import { executeAiToolCall, ToolCallPayload } from '../services/ai-executor.service';
import {
  initializeLlama, generateResponse, releaseLlama, isLlamaReady,
  LLAMA_CONFIG, ChatMessage,
} from '../services/llama.service';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { Colors, FontSize, FontWeight, Shadow, Spacing, BorderRadius, Gradients } from '../constants/theme';
import { debtService } from '../services/debt.service';
import { stockService } from '../services/stock.service';
import api from '../services/api';
import { API_ENDPOINTS } from '../constants/api';

// ==================== TYPES ====================
interface DraftData {
  type: string;
  action: string;
  data: any;
  executeEndpoint?: string;
}

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
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed?.type === 'tool_call' && parsed?.tool) return parsed;
  } catch { }
  const jsonMatch = text.match(/\{[\s\S]*"type"\s*:\s*"tool_call"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.type === 'tool_call' && parsed?.tool) return parsed;
    } catch { }
  }
  return null;
};

const isDraftResponse = (r: any): boolean => typeof r?.type === 'string' && r.type.startsWith('draft_');

// ==================== MOCK LLM (pattern matching fallback) ====================
const simulateLlmResponse = (userText: string): string => {
  const lower = userText.toLowerCase();
  const tc = (tool: string, params: any) => JSON.stringify({ type: 'tool_call', tool, params });

  // A: WA Orders
  if (/(konfirmasi|terima|acc|setuju).*(order|pesanan)/i.test(lower))
    return tc('confirmWaOrder', { orderId: 'O-123', parsedItems: [] });
  if (/(tolak|batal|reject).*(order|pesanan)/i.test(lower))
    return tc('rejectWaOrder', { orderId: 'O-123', reason: 'Ditolak via MIDA' });
  if (/(orderan|pesanan).*(wa|whatsapp|pending)/i.test(lower) || lower.includes('lihat order'))
    return tc('getPendingWaOrders', {});

  // B: Produk & Transaksi
  if (/(stok|stock).*(rendah|habis|kosong|minimum|menipis)/i.test(lower))
    return tc('getLowStockProducts', {});
  if (/(detail|info|spesifikasi).*(produk|barang)/i.test(lower))
    return tc('getProductDetail', { productId: 'unknown' });

  if (/(harga|stok|cari|ada|jual|beli|berapa|produk)/i.test(lower) && !/(nota|transaksi|surat jalan|po|purchase|laporan|setting)/i.test(lower)) {
    let kw = lower.replace(/(berapa|harga|stok|cari|ada|jual|beli|tolong|carikan|produk|cek|info)\s*/gi, '').trim();
    if (!kw || kw.length < 2) kw = lower;
    return tc('searchProduct', { keyword: kw });
  }

  if (/(detail|info).*(nota|transaksi|invoice|struk)/i.test(lower))
    return tc('getSaleDetail', { invoiceNumber: 'INV-UNKNOWN' });
  if (/(buat|bikin|tambah).*(nota|transaksi|penjualan)/i.test(lower))
    return tc('createDraftTransaction', { customerName: 'UMUM', paymentMethod: 'CASH', items: [], notes: userText });

  // C: Hutang & Piutang
  if (/(bayar|pembayaran|lunas).*(utang|hutang|piutang|bon)/i.test(lower))
    return tc('createDraftDebtPayment', { debtType: 'customer', debtId: 'unknown', amount: 0 });
  if (/(utang|hutang|piutang|bon)/i.test(lower))
    return lower.includes('supplier') ? tc('getSupplierDebts', {}) : tc('getCustomerDebts', {});

  // D: Surat Jalan & PO
  if (/(buat|bikin|tambah).*(surat jalan|do|delivery)/i.test(lower))
    return tc('createDraftDelivery', { customerName: 'UMUM', notes: userText });
  if (/(surat jalan|delivery|pengiriman)/i.test(lower))
    return tc('getDeliveryOrders', {});
  if (/(buat|bikin|tambah).*(po|purchase order|pesanan ke supplier)/i.test(lower))
    return tc('createDraftPurchase', { supplierName: 'UMUM', notes: userText });
  if (/(po|purchase order|pembelian)/i.test(lower))
    return tc('getPurchases', {});

  // E: Stock Opname
  if (/(sesuaikan|ubah|edit|ganti).*(stok|stock)/i.test(lower))
    return tc('createDraftStockAdjustment', { productCode: 'unknown', type: 'ADJUSTMENT', qty: 0 });
  if (/(pergerakan|riwayat|histori|opname).*(stok|stock)/i.test(lower))
    return tc('getStockMovements', {});

  // F: Master & Laporan
  if (/(setting|pengaturan|profil|toko)/i.test(lower))
    return tc('getStoreSettings', {});
  if (/(laporan|omzet|profit|pendapatan|revenue|keuntungan)/i.test(lower))
    return tc('getFinancialReport', {});
  if (/(inventaris|inventory|aset|asset)/i.test(lower))
    return tc('getInventoryReport', {});
  if (/(cari|lihat|daftar).*(customer|pelanggan)/i.test(lower))
    return tc('searchCustomer', { keyword: lower.replace(/(cari|lihat|daftar|customer|pelanggan)\s*/gi, '').trim() });
  if (/(cari|lihat|daftar).*(supplier|pabrik)/i.test(lower))
    return tc('searchSupplier', { keyword: lower.replace(/(cari|lihat|daftar|supplier|pabrik)\s*/gi, '').trim() });

  // G: Aksi Berbahaya
  if (/(hapus|buang|delete)/i.test(lower))
    return tc('deleteConfirmation', { target: 'product', id: 'unknown', name: userText });
  if (/(ubah|edit|ganti)/i.test(lower))
    return tc('editConfirmation', { target: 'product', id: 'unknown', name: userText, changes: {} });

  // Greetings
  const greetings = ['halo', 'hai', 'hi', 'pagi', 'siang', 'sore', 'malam', 'assalamualaikum'];
  if (greetings.some(g => lower.startsWith(g))) {
    return `Halo! Saya **MIDA** (didukung oleh Qwen 2.5), asisten cerdas Toko Masdar Utama 🏪\n\nSaya siap mengeksekusi perintah apa pun, mulai dari cek stok, membuat surat jalan, hingga merekap laporan keuangan. Apa yang bisa saya bantu hari ini?`;
  }

  if (lower.includes('siapa kamu') || lower.includes('apa yang bisa kamu lakukan')) {
    return `Saya adalah **MIDA**, AI cerdas yang memiliki akses penuh ke seluruh fitur Masdar Utama. Saya bisa mengeksekusi semua hal yang Anda butuhkan:\n\n• **Transaksi:** Buat nota, cek utang/piutang\n• **Inventaris:** Cek stok, cari barang, stock opname\n• **Operasional:** Konfirmasi pesanan WA, buat PO, buat Surat Jalan\n• **Analisis:** Buka laporan omzet, profit, dan data pelanggan\n\nTinggal berikan perintah dalam bahasa sehari-hari, dan saya akan mengeksekusinya!`;
  }

  if (lower.includes('terima kasih') || lower.includes('makasih')) {
    return 'Sama-sama! Selalu siap membantu Anda kapan saja. Ada hal lain yang perlu dieksekusi?';
  }

  return `Saya mengerti Anda ingin membahas tentang "${userText.length > 20 ? userText.substring(0, 20) + '...' : userText}".\n\nSebagai asisten cerdas, saya punya akses penuh ke sistem. Apakah Anda ingin saya **Mencarikan data spesifik**, **Membuat dokumen baru (Nota/DO/PO)**, atau **Menganalisis laporan** terkait hal tersebut? Sebutkan saja perintah spesifiknya!`;
};

// ==================== FORMAT TOOL RESULTS ====================
const formatToolResult = (toolName: string, result: any): string => {
  const data = result.data;
  if (!data) return result.message || 'Tidak ada data.';

  if (Array.isArray(data)) {
    if (data.length === 0) return result.message || '📭 Data kosong / tidak ditemukan.';
    switch (toolName) {
      case 'searchProduct':
      case 'getLowStockProducts':
        return `📦 Ditemukan **${data.length}** produk:\n\n` + data.slice(0, 10).map((p: any, i: number) =>
          `${i + 1}. **${p.name}** (${p.code})\n   Stok: ${p.currentStock} | Min: ${p.minStock || '-'}\n   ${p.units?.map((u: any) => `${u.unitName}: Rp${u.sellPrice?.toLocaleString('id-ID')}`).join(', ') || ''}`
        ).join('\n\n');
      case 'searchCustomer':
        return `👥 Ditemukan **${data.length}** pelanggan:\n\n` + data.slice(0, 10).map((c: any, i: number) =>
          `${i + 1}. **${c.name}** (${c.code}) — ${c.type || 'REGULER'}\n   📱 ${c.phone || '-'} | 📍 ${c.address || '-'}`
        ).join('\n\n');
      case 'searchSupplier':
        return `🏭 Ditemukan **${data.length}** supplier:\n\n` + data.slice(0, 10).map((s: any, i: number) =>
          `${i + 1}. **${s.name}** (${s.code})\n   📱 ${s.phone || '-'} | 📍 ${s.address || '-'}`
        ).join('\n\n');
      default:
        return `📋 Ditemukan **${data.length}** data.`;
    }
  }

  if (typeof data === 'object') {
    switch (toolName) {
      case 'getProductDetail':
        return `📦 **Detail Produk: ${data.name}**\n\n• Kode: ${data.code}\n• Kategori: ${data.category?.name || '-'}\n• Stok Saat Ini: **${data.currentStock}** (Min: ${data.minStock})\n\n**Satuan & Harga:**\n${data.productUnits?.map((u: any) => `- ${u.unit?.name}: Beli Rp${u.buyPrice?.toLocaleString('id-ID')} | Jual Rp${u.sellPrice?.toLocaleString('id-ID')}`).join('\n') || '- -'}`;
      case 'getSaleDetail':
        return `🧾 **Detail Nota: ${data.invoiceNumber}**\n\n• Tanggal: ${new Date(data.date).toLocaleDateString('id-ID')}\n• Pelanggan: ${data.customer?.name || 'UMUM'}\n• Total: **Rp${(data.finalTotal || 0).toLocaleString('id-ID')}**\n• Status: ${data.paymentStatus}\n\n**Item Pembelian:**\n${data.saleItems?.map((item: any) => `- ${item.quantity} ${item.unit?.name} ${item.product?.name} (Rp${item.price?.toLocaleString('id-ID')})`).join('\n') || '- -'}`;
      case 'getStoreSettings':
        return `🏪 **Profil Toko**\n\n• Nama: **${data.name || '-'}**\n• Tagline: ${data.tagline || '-'}\n• Alamat: ${data.address || '-'}, ${data.city || ''}\n• Telepon: ${data.phone || '-'}\n• Email: ${data.email || '-'}\n• Bank: ${data.bankName || '-'} a.n. ${data.bankHolder || '-'}`;
      case 'getFinancialReport':
        return `📊 **Laporan Keuangan**\n\n• Omzet: **Rp${(data.totalRevenue || 0).toLocaleString('id-ID')}**\n• Profit: **Rp${(data.totalProfit || 0).toLocaleString('id-ID')}**\n• Transaksi: **${data.totalTransactions || 0}x**\n• Rata-rata: Rp${(data.averageTransaction || 0).toLocaleString('id-ID')}`;
      case 'getInventoryReport':
        return `📦 **Inventaris**\n\n• Total Produk: **${data.totalProducts || 0}**\n• Nilai Stok: **Rp${(data.totalStockValue || 0).toLocaleString('id-ID')}**\n• Stok Rendah: ${data.lowStockProducts?.length || 0}\n• Stok Habis: ${data.outOfStockProducts?.length || 0}`;
      default:
        return `📋 Data berhasil dimuat.`;
    }
  }
  return result.message || String(data);
};

// ==================== TYPING INDICATOR ====================
const TypingIndicator = () => {
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
      <Text style={s.typingText}>MIDA sedang berpikir...</Text>
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
  try { draftData = JSON.parse(msg.text); } catch { return null; }

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

  const handleDownloadModel = async () => {
    Alert.alert(
      '📥 Download Model AI',
      `Model AI offline (Qwen 2.5 0.5B, ~395MB) akan diunduh dari HuggingFace.\n\nPastikan koneksi WiFi stabil dan storage tersedia.\nProses download membutuhkan waktu 5-15 menit.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Mulai Download',
          onPress: async () => {
            setIsDownloading(true);
            setModelDownloadStatus(false, 0);
            try {
              // Ensure model directory exists
              const dirInfo = await FileSystem.getInfoAsync(getModelDir());
              if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(getModelDir(), { intermediates: true });
              }

              const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
                const pct = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
                setModelDownloadStatus(false, Math.min(pct, 99));
              };

              downloadRef.current = FileSystem.createDownloadResumable(
                LLAMA_CONFIG.modelUrl,
                getModelPath(),
                {},
                callback,
              );

              const result = await downloadRef.current.downloadAsync();
              if (result?.uri) {
                setModelDownloadStatus(true, 100);
                Alert.alert('✅ Selesai', 'Model AI offline berhasil diunduh! MIDA kini menggunakan True On-Device AI.');
              } else {
                throw new Error('Download gagal — tidak ada file.');
              }
            } catch (err: any) {
              setModelDownloadStatus(false, 0);
              Alert.alert('❌ Gagal', `Download gagal: ${err.message}`);
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
            <View style={s.modelCard}>
              <View style={s.modelInfo}>
                <Text style={s.modelName}>🧠 Qwen 2.5 0.5B Chat</Text>
                <Text style={s.modelDesc}>Ringan & cepat · ~395 MB · Q4_K_M quantized</Text>
                <Text style={s.modelDesc}>Berjalan 100% offline di memori HP</Text>
              </View>

              {isModelDownloaded ? (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <View style={s.modelInstalled}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={[s.modelInstallText, { color: Colors.success }]}>Terpasang</Text>
                  </View>
                  <TouchableOpacity onPress={handleDeleteModel}>
                    <Text style={{ fontSize: 10, color: Colors.error }}>Hapus</Text>
                  </TouchableOpacity>
                </View>
              ) : isDownloading || (modelDownloadProgress > 0 && modelDownloadProgress < 100) ? (
                <View style={s.downloadProgress}>
                  <View style={s.progressBar}>
                    <View style={[s.progressFill, { width: `${modelDownloadProgress}%` as any }]} />
                  </View>
                  <Text style={s.progressText}>{Math.round(modelDownloadProgress)}%</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.downloadBtn} onPress={handleDownloadModel} activeOpacity={0.8}>
                  <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                  <Text style={s.downloadBtnText}>Download</Text>
                </TouchableOpacity>
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
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const {
    messages, addMessage, updateLastAssistantMessage,
    isModelDownloaded, isModelReady,
    setModelLoading, setModelReady, setModelLoadError, setModelDownloadStatus,
  } = useAiStore();

  // Scroll to bottom when new message or streaming
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length, isLoading, streamingText]);

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

  // ==================== SEND MESSAGE ====================
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    const userText = inputText.trim();
    setInputText('');
    addMessage({ role: 'user', text: userText });
    setIsLoading(true);
    setStreamingText(null);

    try {
      let llmResponse: string;

      if (isModelReady && isLlamaReady()) {
        // ===== TRUE ON-DEVICE LLM =====
        // Build chat history (last 6 messages for context, save tokens)
        const recentMsgs = messages.slice(-6);
        const chatMsgs: ChatMessage[] = recentMsgs
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));
        chatMsgs.push({ role: 'user', content: userText });

        // Add placeholder for streaming
        addMessage({ role: 'assistant', text: '...' });

        llmResponse = await generateResponse(chatMsgs, (data) => {
          setStreamingText(data.accumulated_text);
          updateLastAssistantMessage(data.accumulated_text);
        });

        setStreamingText(null);
        // Update with final text
        updateLastAssistantMessage(llmResponse);
      } else {
        // ===== FALLBACK: PATTERN MATCHING =====
        await new Promise(r => setTimeout(r, 500));
        llmResponse = simulateLlmResponse(userText);
      }

      // Try to extract tool call from the response
      const toolCall = extractToolCall(llmResponse);

      if (toolCall) {
        // If we used streaming, remove the raw JSON placeholder
        if (isModelReady) {
          updateLastAssistantMessage('⚙️ Mengeksekusi perintah...');
        }

        const toolResult = await executeAiToolCall(toolCall);
        if (isDraftResponse(toolResult)) {
          if (isModelReady) {
            updateLastAssistantMessage(JSON.stringify(toolResult));
          } else {
            addMessage({ role: 'assistant', text: JSON.stringify(toolResult) });
          }
        } else if (toolResult.error) {
          const errMsg = `⚠️ ${toolResult.error}`;
          if (isModelReady) {
            updateLastAssistantMessage(errMsg);
          } else {
            addMessage({ role: 'assistant', text: errMsg });
          }
        } else {
          const formatted = formatToolResult(toolCall.tool, toolResult);
          if (isModelReady) {
            updateLastAssistantMessage(formatted);
          } else {
            addMessage({ role: 'assistant', text: formatted });
          }
        }
      } else if (!isModelReady) {
        // Fallback: non-tool response
        addMessage({ role: 'assistant', text: llmResponse });
      }
      // If isModelReady && no toolCall, the streamed text is already in messages
    } catch (err: any) {
      const errMsg = '❌ Maaf, terjadi kesalahan.';
      if (isModelReady) {
        updateLastAssistantMessage(errMsg);
      } else {
        addMessage({ role: 'assistant', text: errMsg });
      }
    } finally {
      setIsLoading(false);
      setStreamingText(null);
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
            const result = await executeDraft(draftData);
            addMessage({ role: 'assistant', text: result.success ? `✅ ${result.message}` : `❌ ${result.message}` });
            setIsLoading(false);
          },
        },
      ]
    );
  }, [addMessage]);

  // ==================== RENDER MESSAGE ====================
  const renderMessage = (msg: AiMessage) => {
    const isUser = msg.role === 'user';

    // Draft card (compact)
    if (msg.role === 'assistant' && msg.text.startsWith('{') && msg.text.includes('"type":"draft_')) {
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
              {isLoading && !streamingText && <TypingIndicator />}
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
