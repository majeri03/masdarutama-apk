/**
 * llama.service.ts — Dynamic On-Device LLM Engine (llama.rn wrapper)
 * Terintegrasi penuh dengan AiChatScreen.tsx tanpa error compile!
 */
import { initLlama, LlamaContext } from 'llama.rn';
import { AI_SYSTEM_PROMPT } from '../utils/ai-prompts'; 

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbackData {
  token: string;
  accumulated_text: string;
}

// ==================== CONSTANTS & CONFIG (Wajib untuk UI) ====================
export const MODEL_MIRROR_URLS = [
  'https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
];

export const LLAMA_CONFIG = {
  modelFilename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', // Model 400MB super ringan & cepat
  modelUrl: MODEL_MIRROR_URLS[0],
  modelDir: 'models',           
  n_ctx: 2048,                  
  n_predict: 150,               
  temperature: 0.0,             // Deteministik untuk keakuratan JSON Tool Call
  top_p: 0.9,
  stop: ['<|im_end|>', '<|endoftext|>', '```json', '```'],
};

// ==================== RUNTIME STATE ====================
let _context: LlamaContext | null = null;
let _isInitializing = false;
let _loadedModelName = ''; 

const buildChatMLPrompt = (messages: ChatMessage[]): string => {
  let prompt = '';
  for (const msg of messages) {
    prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }
  prompt += '<|im_start|>assistant\n';
  return prompt;
};

/**
 * Inisialisasi LlamaContext secara fleksibel.
 * @param modelPath Path lengkap ke file .gguf lokal
 * @param filename Nama file untuk pencatatan sistem
 */
export const initializeLlama = async (modelPath: string, filename: string = LLAMA_CONFIG.modelFilename): Promise<LlamaContext> => {
  if (_context && _loadedModelName === filename) {
    return _context; 
  }

  if (_isInitializing) throw new Error('LLM sedang dimuat, tunggu sebentar...');

  if (_context) {
    await releaseLlama();
  }

  _isInitializing = true;
  try {
    const cleanPath = modelPath.startsWith('file://') ? modelPath.slice(7) : modelPath;
    _context = await initLlama({
      model: cleanPath,
      n_ctx: LLAMA_CONFIG.n_ctx,
      n_gpu_layers: 0, // CPU Only untuk stabilitas RAM HP
      use_mlock: false,    
    });

    _loadedModelName = filename;
    console.log(`[MIDA AI] Berhasil memuat model: ${filename}`);
    return _context;
  } finally {
    _isInitializing = false;
  }
};

export const generateResponse = async (
  userMessages: ChatMessage[],
  onToken?: (data: StreamCallbackData) => void,
): Promise<string> => {
  if (!_context) throw new Error('Model AI belum dimuat di perangkat.');

  const fullMessages: ChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
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