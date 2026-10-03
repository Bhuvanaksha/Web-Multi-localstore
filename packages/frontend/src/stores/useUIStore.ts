import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type CommentSort = 'newest' | 'top';

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  commentSort: CommentSort;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCommentSort: (sort: CommentSort) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: false,
      commentSort: 'newest',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setCommentSort: (commentSort) => set({ commentSort }),
    }),
    { name: 'alpha-ui' },
  ),
);
