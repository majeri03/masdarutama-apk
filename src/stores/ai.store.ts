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
  // Actions
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.cleanupOldMessages();
        }
      },
    }
  )
);
