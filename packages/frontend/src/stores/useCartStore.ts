import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  listingId: string;
  title: string;
  price: number;
  currency: string;
  unit?: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (listingId: string) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  clear: () => void;
  totalCount: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.listingId === item.listingId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.listingId === item.listingId
                  ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, quantity: item.quantity ?? 1 }] };
        }),
      removeItem: (listingId) =>
        set((s) => ({ items: s.items.filter((i) => i.listingId !== listingId) })),
      setQuantity: (listingId, quantity) =>
        set((s) => ({
          items:
            quantity <= 0
              ? s.items.filter((i) => i.listingId !== listingId)
              : s.items.map((i) => (i.listingId === listingId ? { ...i, quantity } : i)),
        })),
      clear: () => set({ items: [] }),
      totalCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      totalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    { name: 'alpha-cart' },
  ),
);
