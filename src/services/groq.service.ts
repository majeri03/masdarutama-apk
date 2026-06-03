import { useAiStore } from '../stores/ai.store';
import { ChatMessage } from './llama.service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Filter out placeholder keys that haven't been filled in yet
const getValidKeys = (keys: string[]): string[] =>
  keys.filter(k => k && k.startsWith('gsk_') && k.length > 20);

export const generateResponseWithGroq = async (messages: ChatMessage[]): Promise<string> => {
  const store = useAiStore.getState();
  const allKeys = store.groqApiKeys || [];
  const model = store.groqModel || 'llama-3.3-70b-versatile';

  const apiKeys = getValidKeys(allKeys);

  if (apiKeys.length === 0) {
    throw new Error(
      'API Key Groq tidak tersedia atau belum diisi.\n\nSilakan buka Pengaturan AI (⚙️) lalu tambahkan API Key Groq yang valid (format: gsk_xxx...).'
    );
  }

  // Groq bekerja optimal dengan max_tokens yang cukup besar untuk multi-turn ReAct
  // Batasi context agar tidak melebihi token limit Groq free tier
  const limitedMessages = messages.slice(-12); // Max 12 pesan terakhir

  let lastError: Error | null = null;
  let currentIndex = store.currentGroqKeyIndex % apiKeys.length;

  // Coba semua key yang valid, rotasi otomatis jika gagal
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    // Pastikan index tidak melebihi batas array apiKeys (bukan allKeys)
    const currentKey = apiKeys[currentIndex % apiKeys.length];

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: limitedMessages,
          temperature: 0.1,  // Rendah = deterministik, cocok untuk agent
          max_tokens: 1024,
          stop: null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${response.status}`;

        // Rate limit atau key tidak valid → rotasi ke key berikutnya
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          console.warn(`[MIDA Groq] Key ${currentIndex} (${currentKey.slice(0, 12)}...) gagal [${response.status}]. Mencoba key berikutnya...`);
          useAiStore.getState().rotateGroqKey();
          currentIndex = (currentIndex + 1) % apiKeys.length;
          lastError = new Error(`Key ${currentIndex} gagal: ${errMsg}`);
          continue;
        }

        // Error lain (400 bad request, 500 server error) → langsung lempar, tidak perlu rotasi
        throw new Error(`Groq API Error: ${errMsg}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Groq mengembalikan respons kosong. Coba lagi.');
      }

      return content;

    } catch (error: any) {
      // Hanya rotasi jika bukan error yang kita throw sendiri (network error dll)
      if (!error.message.startsWith('Groq API Error:') && !error.message.includes('Groq mengembalikan')) {
        console.warn(`[MIDA Groq] Network error pada key ${currentIndex}: ${error.message}. Mencoba key berikutnya...`);
        currentIndex = (currentIndex + 1) % apiKeys.length;
        lastError = error;
        continue;
      }
      // Error fatal, langsung lempar
      throw error;
    }
  }

  // Semua key sudah dicoba dan gagal
  throw new Error(
    `Semua ${apiKeys.length} API Key Groq gagal.\n\n` +
    `Error terakhir: ${lastError?.message || 'Unknown'}\n\n` +
    `Kemungkinan penyebab:\n` +
    `• Semua key sudah mencapai batas token harian\n` +
    `• Koneksi internet bermasalah\n\n` +
    `Solusi: Tambahkan API Key baru di Pengaturan AI, atau tunggu limit reset besok.`
  );
};
