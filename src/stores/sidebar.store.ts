import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  openSidebar: () => set({ isOpen: true }),
  closeSidebar: () => set({ isOpen: false }),
}));
