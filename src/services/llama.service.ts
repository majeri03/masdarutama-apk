/**
 * llama.service.ts — True On-Device LLM Engine (llama.rn wrapper)
 *
 * Manages LlamaContext lifecycle: init, completion (streaming), and release.
 * Uses Qwen2.5-0.5B-Chat with a System Prompt that teaches MIDA to call tools.
 */
import { initLlama, LlamaContext } from 'llama.rn';

// ==================== TYPES ====================
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbackData {
  token: string;
  accumulated_text: string;
}

// ==================== CONSTANTS ====================
const MODEL_FILENAME = 'qwen2.5-3b-instruct-q4_k_m.gguf';

// Daftar mirror URL
export const MODEL_MIRROR_URLS = [
  'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
];
const MODEL_URL = MODEL_MIRROR_URLS[0];

export const LLAMA_CONFIG = {
  modelFilename: MODEL_FILENAME,
  modelUrl: MODEL_URL,
  modelDir: 'models',           // relative to documentDirectory
  n_ctx: 2048,                  // context window (token budget)
  n_predict: 256,               // max output tokens — keep fast
  temperature: 0.1,             // low = more deterministic tool calls
  top_p: 0.9,
  stop: ['<|im_end|>', '<|endoftext|>'],
};

// ==================== SYSTEM PROMPT ====================
export const MIDA_SYSTEM_PROMPT = `Kamu adalah MIDA (Masdar Intelligent Digital Assistant), AI asisten cerdas untuk Toko Masdar Utama (toko bangunan).

ATURAN KETAT:
1. Jawab dalam Bahasa Indonesia, singkat dan jelas.
2. Jika user meminta AKSI (cek stok, lihat pesanan, buat nota, dll), kamu WAJIB output JSON tool_call seperti contoh di bawah.
3. Jika user hanya menyapa atau bertanya umum, jawab dengan teks biasa.
4. JANGAN mengarang data. Gunakan tool untuk mengambil data nyata.

FORMAT TOOL CALL (output JSON mentah, tanpa markdown):
{"type":"tool_call","tool":"NAMA_TOOL","params":{...}}

DAFTAR TOOL YANG TERSEDIA:
- searchProduct: params {keyword}. Cari produk berdasarkan nama/kode.
- getProductDetail: params {productId}. Detail produk.
- getLowStockProducts: params {}. Produk stok rendah.
- getPendingWaOrders: params {}. Pesanan WA pending.
- confirmWaOrder: params {orderId, parsedItems}. Konfirmasi order WA.
- rejectWaOrder: params {orderId, reason}. Tolak order WA.
- createDraftTransaction: params {customerName, paymentMethod, items, notes}. Buat draft nota.
- getSaleDetail: params {invoiceNumber}. Detail nota/invoice.
- getCustomerDebts: params {search?}. Hutang pelanggan.
- getSupplierDebts: params {search?}. Hutang supplier.
- createDraftDebtPayment: params {debtType, debtId, amount}. Bayar hutang.
- getPurchases: params {search?}. Daftar PO.
- createDraftPurchase: params {supplierName, notes}. Buat PO.
- getDeliveryOrders: params {search?}. Daftar surat jalan.
- createDraftDelivery: params {customerName, notes}. Buat surat jalan.
- getStockMovements: params {search?}. Riwayat stok.
- createDraftStockAdjustment: params {productCode, type, qty}. Adjust stok.
- searchCustomer: params {keyword}. Cari pelanggan.
- searchSupplier: params {keyword}. Cari supplier.
- getStoreSettings: params {}. Profil toko.
- getFinancialReport: params {dateFrom?, dateTo?}. Laporan keuangan.
- getInventoryReport: params {}. Laporan inventaris.
- deleteConfirmation: params {target, id, name}. Hapus data (SUPER ADMIN).
- editConfirmation: params {target, id, name, changes}. Edit data (SUPER ADMIN).

CONTOH:
User: "berapa harga semen tiga roda?"
Output: {"type":"tool_call","tool":"searchProduct","params":{"keyword":"semen tiga roda"}}

User: "lihat orderan WA"
Output: {"type":"tool_call","tool":"getPendingWaOrders","params":{}}

User: "halo"
Output: Halo! Saya MIDA, asisten cerdas Toko Masdar Utama. Ada yang bisa saya bantu?`;

// ==================== SERVICE SINGLETON ====================
let _context: LlamaContext | null = null;
let _isInitializing = false;

/**
 * Build ChatML prompt from messages (Qwen uses ChatML format).
 */
const buildChatMLPrompt = (messages: ChatMessage[]): string => {
  let prompt = '';
  for (const msg of messages) {
    prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }
  // Add the opening tag for the assistant's response
  prompt += '<|im_start|>assistant\n';
  return prompt;
};

/**
 * Initialize the LlamaContext from a local model file.
 * @param modelPath Full path to the .gguf file (e.g. file:///data/.../models/qwen.gguf)
 */
export const initializeLlama = async (modelPath: string): Promise<LlamaContext> => {
  if (_context) return _context;
  if (_isInitializing) throw new Error('LLM sedang dimuat, tunggu sebentar...');

  _isInitializing = true;
  try {
    // llama.rn di Android butuh path tanpa "file://" prefix
    const cleanPath = modelPath.startsWith('file://') ? modelPath.slice(7) : modelPath;
    _context = await initLlama({
      model: cleanPath,
      n_ctx: LLAMA_CONFIG.n_ctx,
      n_gpu_layers: 0,     // CPU only on most Android phones
      use_mlock: false,    // false = lebih aman, hindari crash di HP RAM kecil
    });
    return _context;
  } finally {
    _isInitializing = false;
  }
};

/**
 * Generate a response using the loaded LLM.
 * Streams tokens via onToken callback.
 *
 * @param userMessages  Array of chat messages (without system prompt — it's prepended here)
 * @param onToken       Streaming callback per token
 * @returns             Full response text
 */
export const generateResponse = async (
  userMessages: ChatMessage[],
  onToken?: (data: StreamCallbackData) => void,
): Promise<string> => {
  if (!_context) throw new Error('LLM belum dimuat. Silakan download dan muat model terlebih dahulu.');

  // Build the full message chain with system prompt
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: MIDA_SYSTEM_PROMPT },
    ...userMessages,
  ];

  const prompt = buildChatMLPrompt(fullMessages);

  const result = await _context.completion(
    {
      prompt,
      n_predict: LLAMA_CONFIG.n_predict,
      temperature: LLAMA_CONFIG.temperature,
      top_p: LLAMA_CONFIG.top_p,
      stop: LLAMA_CONFIG.stop,
    },
    onToken
      ? (data: any) => {
        onToken({
          token: data.token || '',
          accumulated_text: data.accumulated_text || '',
        });
      }
      : undefined,
  );

  return (result?.text || '').trim();
};

/**
 * Release the LlamaContext to free RAM.
 */
export const releaseLlama = async (): Promise<void> => {
  if (_context) {
    await _context.release();
    _context = null;
  }
};

/**
 * Check if context is loaded.
 */
export const isLlamaReady = (): boolean => !!_context;
