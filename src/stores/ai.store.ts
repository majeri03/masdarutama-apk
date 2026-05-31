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
  isModelDownloaded: boolean;
  modelDownloadProgress: number;
  addMessage: (msg: Omit<AiMessage, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
  cleanupOldMessages: () => void;
  setModelDownloadStatus: (downloaded: boolean, progress?: number) => void;
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      messages: [],
      isModelDownloaded: false,
      modelDownloadProgress: 0,
      
      addMessage: (msg) => {
        const newMessage: AiMessage = {
          ...msg,
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        };
        set({ messages: [...get().messages, newMessage] });
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
    }),
    {
      name: 'ai-store-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Run cleanup when the store initializes
        if (state) {
          state.cleanupOldMessages();
        }
      },
    }
  )
);
