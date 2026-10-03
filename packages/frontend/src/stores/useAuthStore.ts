import type { User } from '@alpha/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  accessToken: string;
  isHydrated: boolean;
  setSession: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: '',
      isHydrated: false,
      setSession: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: '' }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'alpha-auth',
      // CRITICAL: persist only user + accessToken. The refresh token lives in
      // an httpOnly cookie and must never touch localStorage.
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
