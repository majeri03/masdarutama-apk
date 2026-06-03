/**
 * llama.service.ts — MIDA On-Device LLM Engine (llama.rn)
 *
 * v6 — Flexible Multi-Model Edition:
 * ─────────────────────────────────────────────────────────────────
 * - Auto-detect model family dari nama file (Qwen, Llama 3, Phi, Mistral, Gemma, dll)
 * - Setiap model family punya format prompt, stop tokens, dan config yang berbeda
 * - User bebas import model GGUF apapun — sistem akan menyesuaikan otomatis
 * - Price Guard & ReAct loop tetap berjalan di lapisan executor (tidak terpengaruh model)
 * ─────────────────────────────────────────────────────────────────
 */
import { initLlama, LlamaContext } from 'llama.rn';
import { AI_SYSTEM_PROMPT } from '../utils/ai-prompts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface StreamCallbackData {
  token: string;
  accumulated_text: string;
}

// ==================== MODEL PROFILES ====================

/**
 * ModelFamily — jenis arsitektur model yang menentukan format prompt.
 * Setiap keluarga model punya chat template yang berbeda-beda.
 */
export type ModelFamily =
  | 'qwen'       // Qwen 2.x, Qwen 2.5 → ChatML (<|im_start|>)
  | 'llama3'     // Llama 3, 3.1, 3.2, 3.3 → Llama-3 header format
  | 'phi'        // Phi-3, Phi-3.5, Phi-4 → ChatML-like (<|system|>)
  | 'mistral'    // Mistral, Mixtral → [INST] format
  | 'gemma'      // Gemma, Gemma 2 → <start_of_turn> format
  | 'chatml'     // Generic ChatML (fallback untuk model yang pakai ChatML)
  | 'unknown';   // Fallback — coba ChatML standar

export interface ModelProfile {
  family: ModelFamily;
  displayName: string;         // Nama tampil di UI, contoh: "Llama 3.2 3B"
  n_ctx: number;               // Context window yang optimal
  n_predict: number;           // Max output tokens
  temperature: number;         // Suhu — lebih rendah = lebih deterministik
  top_p: number;
  stop: string[];              // Stop tokens spesifik model
  formatPrompt: (messages: ChatMessage[]) => string; // Fungsi builder prompt
}

// ==================== PROMPT FORMAT BUILDERS ====================

/** ChatML — dipakai Qwen 2.x, Qwen 2.5, beberapa model lain */
const buildChatML = (messages: ChatMessage[]): string => {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const convMsgs = messages.filter(m => m.role !== 'system').slice(-10);
  let prompt = '';
  for (const msg of systemMsgs) {
    prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
  }
  for (const msg of convMsgs) {
    const role = msg.role === 'tool' ? 'system' : msg.role;
    prompt += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
  }
  prompt += '<|im_start|>assistant\n';
  return prompt;
};

/** Llama 3 format — dipakai Meta Llama 3, 3.1, 3.2, 3.3 */
const buildLlama3 = (messages: ChatMessage[]): string => {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const convMsgs = messages.filter(m => m.role !== 'system').slice(-10);
  let prompt = '<|begin_of_text|>';
  for (const msg of systemMsgs) {
    prompt += `<|start_header_id|>system<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
  }
  for (const msg of convMsgs) {
    const role = msg.role === 'tool' ? 'user' : msg.role;
    prompt += `<|start_header_id|>${role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
  }
  prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
  return prompt;
};

/** Phi-3 / Phi-3.5 / Phi-4 format */
const buildPhi = (messages: ChatMessage[]): string => {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const convMsgs = messages.filter(m => m.role !== 'system').slice(-10);
  let prompt = '';
  for (const msg of systemMsgs) {
    prompt += `<|system|>\n${msg.content}<|end|>\n`;
  }
  for (const msg of convMsgs) {
    const role = msg.role === 'tool' ? 'system' : msg.role;
    prompt += `<|${role}|>\n${msg.content}<|end|>\n`;
  }
  prompt += '<|assistant|>\n';
  return prompt;
};

/** Mistral / Mixtral — hanya mendukung user+assistant, system di-embed ke user pertama */
const buildMistral = (messages: ChatMessage[]): string => {
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const convMsgs = messages.filter(m => m.role !== 'system').slice(-10);
  let prompt = '<s>';
  let firstUser = true;
  for (const msg of convMsgs) {
    if (msg.role === 'user' || msg.role === 'tool') {
      const content = firstUser && systemMsg ? `${systemMsg}\n\n${msg.content}` : msg.content;
      prompt += `[INST] ${content} [/INST]`;
      firstUser = false;
    } else if (msg.role === 'assistant') {
      prompt += ` ${msg.content}</s>`;
    }
  }
  return prompt;
};

/** Gemma / Gemma 2 format */
const buildGemma = (messages: ChatMessage[]): string => {
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const convMsgs = messages.filter(m => m.role !== 'system').slice(-10);
  let prompt = '<bos>';
  let firstUser = true;
  for (const msg of convMsgs) {
    if (msg.role === 'user' || msg.role === 'tool') {
      const content = firstUser && systemMsg ? `${systemMsg}\n\n${msg.content}` : msg.content;
      prompt += `<start_of_turn>user\n${content}<end_of_turn>\n`;
      firstUser = false;
    } else if (msg.role === 'assistant') {
      prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
    }
  }
  prompt += '<start_of_turn>model\n';
  return prompt;
};

// ==================== MODEL DETECTION ====================

/**
 * detectModelFamily — Auto-detect keluarga model dari nama file GGUF.
 *
 * Membaca nama file dan mencocokkan dengan pola yang dikenal.
 * Contoh:
 *   "llama-3.2-3b-instruct-q4_k_m.gguf"  → 'llama3'
 *   "qwen2.5-0.5b-instruct-q4_k_m.gguf"  → 'qwen'
 *   "phi-4-q4_k_m.gguf"                  → 'phi'
 *   "mistral-7b-instruct-v0.3.gguf"       → 'mistral'
 *   "gemma-2-9b-it-q4_k_m.gguf"          → 'gemma'
 */
export const detectModelFamily = (filename: string): ModelFamily => {
  const lower = filename.toLowerCase();

  if (lower.includes('llama-3') || lower.includes('llama3') || lower.includes('meta-llama-3')) {
    return 'llama3';
  }
  if (lower.includes('qwen2') || lower.includes('qwen-2') || lower.includes('qwen_2')) {
    return 'qwen';
  }
  if (lower.includes('phi-4') || lower.includes('phi-3') || lower.includes('phi3') || lower.includes('phi4')) {
    return 'phi';
  }
  if (lower.includes('mistral') || lower.includes('mixtral')) {
    return 'mistral';
  }
  if (lower.includes('gemma')) {
    return 'gemma';
  }
  // Banyak model modern pakai ChatML — jadikan fallback yang aman
  if (lower.includes('chatml') || lower.includes('instruct')) {
    return 'chatml';
  }

  return 'unknown';
};

/**
 * getModelProfile — Buat profil lengkap untuk model berdasarkan nama file.
 *
 * Profil menentukan:
 * - Format prompt (ChatML, Llama-3, Phi, Mistral, Gemma)
 * - Context window (n_ctx)
 * - Max output tokens (n_predict)
 * - Temperature
 * - Stop tokens
 */
export const getModelProfile = (filename: string): ModelProfile => {
  const lower = filename.toLowerCase();
  const family = detectModelFamily(filename);

  // Estimasi ukuran model dari nama file untuk set n_ctx yang tepat
  const isLarge = lower.includes('7b') || lower.includes('8b') || lower.includes('13b') ||
                  lower.includes('14b') || lower.includes('70b') || lower.includes('9b') ||
                  lower.includes('12b') || lower.includes('11b');
  const isMedium = lower.includes('3b') || lower.includes('4b') || lower.includes('2b') ||
                   lower.includes('3.8b');
  // small = 0.5B, 1B, 1.5B → default

  // Context window: model besar bisa handle lebih banyak
  const n_ctx = isLarge ? 4096 : isMedium ? 8192 : 8192;
  // Output: model besar boleh lebih panjang
  const n_predict = isLarge ? 1024 : 768;

  const baseConfig = {
    n_ctx,
    n_predict,
    temperature: 0.05, // Rendah = deterministik untuk semua model
    top_p: 0.9,
  };

  switch (family) {
    case 'qwen':
      return {
        ...baseConfig,
        family: 'qwen',
        displayName: extractDisplayName(filename, 'Qwen'),
        stop: ['<|im_end|>', '<|endoftext|>', '\nObservation', '\nUser:', '\nUSER:', '\n\nUser'],
        formatPrompt: buildChatML,
      };

    case 'llama3':
      return {
        ...baseConfig,
        family: 'llama3',
        displayName: extractDisplayName(filename, 'Llama 3'),
        stop: ['<|eot_id|>', '<|end_of_text|>', '\nObservation', '\nUser:', '\n\nUser'],
        formatPrompt: buildLlama3,
      };

    case 'phi':
      return {
        ...baseConfig,
        family: 'phi',
        displayName: extractDisplayName(filename, 'Phi'),
        stop: ['<|end|>', '<|endoftext|>', '\nObservation', '\nUser:', '\n\nUser'],
        formatPrompt: buildPhi,
      };

    case 'mistral':
      return {
        ...baseConfig,
        family: 'mistral',
        displayName: extractDisplayName(filename, 'Mistral'),
        stop: ['</s>', '[INST]', '\nObservation', '\nUser:'],
        formatPrompt: buildMistral,
      };

    case 'gemma':
      return {
        ...baseConfig,
        family: 'gemma',
        displayName: extractDisplayName(filename, 'Gemma'),
        stop: ['<end_of_turn>', '<eos>', '\nObservation', '\nUser:'],
        formatPrompt: buildGemma,
      };

    case 'chatml':
    case 'unknown':
    default:
      return {
        ...baseConfig,
        family: 'chatml',
        displayName: extractDisplayName(filename, 'Custom Model'),
        stop: ['<|im_end|>', '<|endoftext|>', '</s>', '\nObservation', '\nUser:'],
        formatPrompt: buildChatML, // ChatML sebagai safe fallback
      };
  }
};

/** Ekstrak nama model yang bisa dibaca manusia dari nama file */
const extractDisplayName = (filename: string, fallback: string): string => {
  // Hilangkan ekstensi dan kuantisasi
  const clean = filename
    .replace(/\.gguf$/i, '')
    .replace(/[-_](q[0-9]_[km]|q[0-9]|fp[0-9]+|bf[0-9]+|f[0-9]+)$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  if (!clean || clean.length < 3) return fallback;

  // Title case
  return clean.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ==================== CONSTANTS & DEFAULTS ====================

/** Default model config — Qwen 2.5 0.5B yang biasa dipakai */
export const LLAMA_CONFIG = {
  modelFilename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  modelUrl: 'https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  modelDir: 'models',
  // Nilai default — akan di-override oleh profil model yang terdeteksi
  n_ctx: 8192,
  n_predict: 768,
  temperature: 0.05,
  top_p: 0.9,
  stop: ['<|im_end|>', '<|endoftext|>', '\nObservation', '\nUser:'],
};

export const MODEL_MIRROR_URLS = [
  LLAMA_CONFIG.modelUrl,
];

// ==================== RUNTIME STATE ====================
let _context: LlamaContext | null = null;
let _isInitializing = false;
let _loadedModelName = '';
let _activeProfile: ModelProfile | null = null;

/**
 * Dapatkan profil model yang sedang aktif.
 * Berguna untuk ditampilkan di UI (nama model, family, context size).
 */
export const getActiveModelProfile = (): ModelProfile | null => _activeProfile;

/**
 * initializeLlama — Muat model GGUF apapun.
 *
 * Sistem akan otomatis:
 * 1. Deteksi keluarga model dari nama file
 * 2. Pilih format prompt yang sesuai
 * 3. Set context window dan parameter optimal
 *
 * @param modelPath  Path absolut ke file .gguf
 * @param filename   Nama file (untuk deteksi model family)
 */
export const initializeLlama = async (
  modelPath: string,
  filename: string = LLAMA_CONFIG.modelFilename,
): Promise<LlamaContext> => {
  if (_context && _loadedModelName === filename) return _context;
  if (_isInitializing) throw new Error('Model sedang dimuat, tunggu sebentar...');
  if (_context) await releaseLlama();

  _isInitializing = true;
  try {
    // Deteksi profil model dari nama file
    const profile = getModelProfile(filename);
    _activeProfile = profile;

    const cleanPath = modelPath.startsWith('file://') ? modelPath.slice(7) : modelPath;
    _context = await initLlama({
      model: cleanPath,
      n_ctx: profile.n_ctx,
      n_gpu_layers: 0, // CPU-only: kompatibel semua HP Android
      use_mlock: false,
    });
    _loadedModelName = filename;

    console.log(
      `[MIDA AI Offline] Model dimuat: "${profile.displayName}"` +
      ` | Family: ${profile.family}` +
      ` | ctx: ${profile.n_ctx}` +
      ` | predict: ${profile.n_predict}`
    );

    return _context;
  } finally {
    _isInitializing = false;
  }
};

/**
 * generateResponseWithContext — Fungsi inti ReAct Agent (Offline Mode).
 *
 * Menggunakan profil model yang terdeteksi untuk memformat prompt dengan benar.
 * Berjalan untuk model GGUF apapun (Qwen, Llama, Phi, Mistral, Gemma, dll).
 */
export const generateResponseWithContext = async (
  messages: ChatMessage[],
  onToken?: (data: StreamCallbackData) => void,
): Promise<string> => {
  if (!_context) {
    throw new Error('Model AI offline belum dimuat. Harap download atau import model GGUF di Pengaturan AI.');
  }

  // Gunakan profil model yang terdeteksi, atau fallback ke Qwen jika belum ada
  const profile = _activeProfile || getModelProfile(LLAMA_CONFIG.modelFilename);
  const prompt = profile.formatPrompt(messages);

  const result = await _context.completion(
    {
      prompt,
      n_predict: profile.n_predict,
      temperature: profile.temperature,
      top_p: profile.top_p,
      stop: profile.stop,
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
 * generateResponse — Backward-compatible wrapper.
 */
export const generateResponse = async (
  userMessages: ChatMessage[],
  onToken?: (data: StreamCallbackData) => void,
): Promise<string> => {
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...userMessages,
  ];
  return generateResponseWithContext(fullMessages, onToken);
};

export const releaseLlama = async (): Promise<void> => {
  if (_context) {
    await _context.release();
    _context = null;
    _loadedModelName = '';
    _activeProfile = null;
    console.log('[MIDA AI Offline] Model dilepas dari RAM.');
  }
};

export const isLlamaReady = (): boolean => !!_context;
export const getActiveModelName = (): string => _loadedModelName;