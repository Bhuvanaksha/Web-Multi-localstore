import { create } from 'zustand';

interface ComposerState {
  title: string;
  content: string;
  category: string;
  tags: string[];
  featuredImage?: string;
  setField: <K extends keyof Omit<ComposerState, 'setField' | 'reset'>>(
    field: K,
    value: ComposerState[K],
  ) => void;
  reset: () => void;
}

const initial = { title: '', content: '', category: '', tags: [], featuredImage: undefined };

export const useComposerStore = create<ComposerState>((set) => ({
  ...initial,
  setField: (field, value) => set({ [field]: value } as Partial<ComposerState>),
  reset: () => set({ ...initial }),
}));
