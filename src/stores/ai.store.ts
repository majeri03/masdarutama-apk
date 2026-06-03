import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RoleAction = 'READ' | 'CREATE' | 'EDIT' | 'DELETE';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
}

export interface AiState {
  messages: AiMessage[];
  // Model download
  isModelDownloaded: boolean;
  modelDownloadProgress: number;
  // LLM runtime
  isModelLoading: boolean;
  isModelReady: boolean;
  modelLoadError: string | null;
  // Info model offline yang aktif (diisi saat model berhasil dimuat)
  localModelFileName: string;
  localModelFamily: string;
  // Multi-Engine Settings
  aiEngine: 'local' | 'groq';
  groqApiKeys: string[];
  groqModel: string;
  currentGroqKeyIndex: number;
  
  // Actions
  setAiEngine: (engine: 'local' | 'groq') => void;
  setGroqApiKeys: (keys: string[]) => void;
  setGroqModel: (model: string) => void;
  setCurrentGroqKeyIndex: (index: number) => void;
  rotateGroqKey: () => void;
  setLocalModelInfo: (fileName: string, family: string) => void;
  addMessage: (msg: Omit<AiMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearHistory: () => void;
  cleanupOldMessages: () => void;
  setModelDownloadStatus: (downloaded: boolean, progress?: number) => void;
  setModelLoading: (loading: boolean) => void;
  setModelReady: (ready: boolean) => void;
  setModelLoadError: (error: string | null) => void;
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      messages: [],
      isModelDownloaded: false,
      modelDownloadProgress: 0,
      isModelLoading: false,
      isModelReady: false,
      modelLoadError: null,
      localModelFileName: '',
      localModelFamily: '',

      // Multi-Engine Settings defaults
      // Fallback to env vars if available, otherwise empty/defaults
      aiEngine: 'groq', // default to groq for better performance
      groqApiKeys: process.env.EXPO_PUBLIC_GROQ_API_KEYS 
        ? process.env.EXPO_PUBLIC_GROQ_API_KEYS.split(',').map((k: string) => k.trim()) 
        : [],
      groqModel: process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.3-70b-versatile',
      currentGroqKeyIndex: 0,

      setAiEngine: (engine) => set({ aiEngine: engine }),
      setGroqApiKeys: (keys) => set({ groqApiKeys: keys }),
      setGroqModel: (model) => set({ groqModel: model }),
      setCurrentGroqKeyIndex: (index) => set({ currentGroqKeyIndex: index }),
      rotateGroqKey: () => {
        const state = get();
        if (state.groqApiKeys.length > 0) {
          const nextIndex = (state.currentGroqKeyIndex + 1) % state.groqApiKeys.length;
          set({ currentGroqKeyIndex: nextIndex });
          console.log(`[MIDA] Groq API Key rotated to index ${nextIndex}`);
        }
      },
      setLocalModelInfo: (fileName, family) => set({ localModelFileName: fileName, localModelFamily: family }),

      addMessage: (msg) => {
        const newMessage: AiMessage = {
          ...msg,
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        };
        set({ messages: [...get().messages, newMessage] });
      },

      updateLastAssistantMessage: (text: string) => {
        const msgs = [...get().messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], text };
            break;
          }
        }
        set({ messages: msgs });
      },

      clearHistory: () => set({ messages: [] }),

      cleanupOldMessages: () => {
        const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        set({
          messages: get().messages.filter((msg) => now - msg.timestamp < fiveDaysMs),
        });
      },

      setModelDownloadStatus: (downloaded, progress = 0) => {
        set({ isModelDownloaded: downloaded, modelDownloadProgress: progress });
      },

      setModelLoading: (loading) => set({ isModelLoading: loading }),
      setModelReady: (ready) => set({ isModelReady: ready }),
      setModelLoadError: (error) => set({ modelLoadError: error }),
    }),
    {
      name: 'ai-store-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        messages: state.messages,
        isModelDownloaded: state.isModelDownloaded,
        modelDownloadProgress: state.modelDownloadProgress,
        aiEngine: state.aiEngine,
        groqApiKeys: state.groqApiKeys,
        groqModel: state.groqModel,
        currentGroqKeyIndex: state.currentGroqKeyIndex,
        localModelFileName: state.localModelFileName,
        localModelFamily: state.localModelFamily,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.cleanupOldMessages();
        }
      },
    }
  )
);
