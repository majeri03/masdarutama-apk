/**
 * llama.service.ts — MIDA On-Device LLM Engine (llama.rn)
 *
 * v4 — ReAct Agent Edition:
 * - generateResponseWithContext() menerima full ChatMessage[] (termasuk tool results)
 * - n_predict dinaikkan ke 512 agar cukup ruang untuk Thought + Action JSON
 * - Stop tokens diperbarui untuk ReAct format
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

// ==================== CONSTANTS & CONFIG ====================
export const MODEL_MIRROR_URLS = [
  'https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
];

export const LLAMA_CONFIG = {
  modelFilename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  modelUrl: MODEL_MIRROR_URLS[0],
  modelDir: 'models',
  n_ctx: 4096,      // Dinaikkan untuk menampung ReAct context (history + injected data)
  n_predict: 512,   // Dinaikkan: butuh ruang untuk Thought + Action JSON
  temperature: 0.1, // Sedikit di atas 0 agar tidak terlalu rigid, tapi tetap deterministik
  top_p: 0.9,
  // Stop saat AI selesai generate tool_call JSON atau teks biasa
  stop: ['<|im_end|>', '<|endoftext|>', '\nObservation:', '\nUser:', '\nUSER:'],
};

// ==================== RUNTIME STATE ====================
let _context: LlamaContext | null = null;
let _isInitializing = false;
let _loadedModelName = '';

/**
 * Build ChatML prompt dari array messages.
 * Mendukung role 'tool' (di-map sebagai 'system' karena Qwen 0.5B tidak kenal role tool).
 */
const buildChatMLPrompt = (messages: ChatMessage[]): string => {
  let prompt = '';
  for (const msg of messages) {
    // Map 'tool' role → 'system' agar compatible dengan ChatML spec Qwen
    const role = msg.role === 'tool' ? 'system' : msg.role;
    prompt += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
  }
  prompt += '<|im_start|>assistant\n';
  return prompt;
};

/**
 * Inisialisasi LlamaContext. Idempotent — hanya load sekali.
 */
export const initializeLlama = async (
  modelPath: string,
  filename: string = LLAMA_CONFIG.modelFilename,
): Promise<LlamaContext> => {
  if (_context && _loadedModelName === filename) return _context;
  if (_isInitializing) throw new Error('LLM sedang dimuat, tunggu sebentar...');
  if (_context) await releaseLlama();

  _isInitializing = true;
  try {
    const cleanPath = modelPath.startsWith('file://') ? modelPath.slice(7) : modelPath;
    _context = await initLlama({
      model: cleanPath,
      n_ctx: LLAMA_CONFIG.n_ctx,
      n_gpu_layers: 0,
      use_mlock: false,
    });
    _loadedModelName = filename;
    console.log(`[MIDA AI] Model dimuat: ${filename}`);
    return _context;
  } finally {
    _isInitializing = false;
  }
};

/**
 * generateResponseWithContext — Fungsi inti ReAct Agent.
 *
 * Menerima FULL messages array termasuk:
 * - System prompt (dengan dynamic context)
 * - Riwayat percakapan
 * - Tool results yang sudah di-inject sebagai role 'tool'
 *
 * Ini yang membuat ReAct loop bisa berjalan: setiap iterasi, messages bertambah
 * dengan hasil tool sebelumnya, lalu LLM "berpikir lagi".
 *
 * @param messages    Full conversation including tool results
 * @param onToken     Optional streaming callback
 */
export const generateResponseWithContext = async (
  messages: ChatMessage[],
  onToken?: (data: StreamCallbackData) => void,
): Promise<string> => {
  if (!_context) throw new Error('Model AI belum dimuat di perangkat.');

  const prompt = buildChatMLPrompt(messages);

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
 * generateResponse — Backward-compatible wrapper.
 * Digunakan oleh kode lama yang masih memakai signature (userMessages, onToken).
 * Otomatis menambahkan system prompt default.
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
    console.log('[MIDA AI] Model dilepas dari RAM.');
  }
};

export const isLlamaReady = (): boolean => !!_context;
export const getActiveModelName = (): string => _loadedModelName;