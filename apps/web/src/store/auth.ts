import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  guid: string;
  emailaddress: string;
  displayname: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        localStorage.setItem('pb_token', token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem('pb_token');
        set({ token: null, user: null });
      },
    }),
    { name: 'pitboss-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
