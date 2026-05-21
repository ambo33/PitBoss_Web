import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  guid: string;
  emailaddress: string;
  displayname: string;
  tierid?: number;
  accounttier?: 'host' | 'club' | 'pro';
  issuperadmin?: boolean;
  hostedtournamentcount?: number;
  trialhostedremaining?: number;
  trialactive?: boolean;
  canuseclubfeatures?: boolean;
  aicreditsremaining?: number;
  defaultaicredits?: number;
  avatarimagedata?: string | null;
  hasavatarimage?: boolean;
  phonenumber?: string | null;
  smsoptedin?: boolean;
  onboardingcomplete?: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
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
      updateUser: (updates) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : state.user,
        }));
      },
      logout: () => {
        localStorage.removeItem('pb_token');
        set({ token: null, user: null });
      },
    }),
    { name: 'pitboss-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
