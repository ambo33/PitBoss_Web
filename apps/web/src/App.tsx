import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/Login';
import MainPage from './pages/Main';
import LandingPage from './pages/Landing';
import PricingPage from './pages/Pricing';
import TermsPage from './pages/Terms';
import VoiceLabPage from './pages/VoiceLab';
import PublicBlindTimerPage from './pages/PublicBlindTimer';
import UnsubscribePage from './pages/Unsubscribe';
import PreTournamentPage from './pages/PreTournament';
import PlayerLobbyPage from './pages/PlayerLobby';
import KnockoutLobbyPage from './pages/KnockoutLobby';
import AddonLobbyPage from './pages/AddonLobby';
import LeagueEventLobbyPage from './pages/LeagueEventLobby';
import LeagueGuestClaimPage from './pages/LeagueGuestClaim';
import TvBoardPage from './pages/TvBoard';
import TvBoardEntryPage from './pages/TvBoard/Entry';
import PaymentTrackerPage from './pages/PaymentTracker';
import PocketAdminPage from './pages/PocketAdmin';
import CashGameAdminPage from './pages/CashGameAdmin';
import JoinGroupPage from './pages/JoinGroup';
import RouteErrorBoundary from './components/RouteErrorBoundary';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;
  return token ? <>{children}</> : <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

function HomeRoute() {
  const token = useAuthStore((s) => s.token);
  return token ? <MainPage /> : <LandingPage />;
}

function AppSubdomainRedirect({ mode }: { mode?: 'register' }) {
  const location = useLocation();
  const isPublicDomain = typeof window !== 'undefined'
    && ['thepokerplanner.com', 'www.thepokerplanner.com'].includes(window.location.hostname);
  const isStandalonePwa = typeof window !== 'undefined'
    && (
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );

  if (isPublicDomain && !isStandalonePwa) {
    const target = new URL('https://app.thepokerplanner.com');
    if (location.pathname === '/app') {
      target.pathname = '/';
    } else if (mode === 'register') {
      target.pathname = '/login';
      target.search = '?mode=register';
    } else {
      target.pathname = location.pathname;
      target.search = location.search;
    }
    target.hash = location.hash;
    window.location.replace(target.toString());
    return null;
  }

  if (mode === 'register') {
    return <Navigate to="/login?mode=register" replace />;
  }
  if (location.pathname === '/app') {
    return <Navigate to="/" replace />;
  }
  return <LoginPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AppSubdomainRedirect />} />
        <Route path="/register" element={<AppSubdomainRedirect mode="register" />} />
        <Route path="/app" element={<AppSubdomainRedirect />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/admin/voice-lab" element={<RequireAuth><VoiceLabPage /></RequireAuth>} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/blind-timer" element={<PublicBlindTimerPage />} />
        <Route path="/blind-timer/:code" element={<PublicBlindTimerPage />} />
        <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
        <Route path="/reset-password" element={<AppSubdomainRedirect />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/tournament/:id" element={<RequireAuth><RouteErrorBoundary title="Tournament page error"><PreTournamentPage /></RouteErrorBoundary></RequireAuth>} />
        <Route path="/join/:inviteCode" element={<JoinGroupPage />} />
        <Route path="/lobby/:id" element={<PlayerLobbyPage />} />
        <Route path="/checkin/:id" element={<PlayerLobbyPage mode="checkin" />} />
        <Route path="/bust/:id" element={<KnockoutLobbyPage />} />
        <Route path="/addon/:id" element={<AddonLobbyPage />} />
        <Route path="/league/:leagueId/event/:eventId" element={<RequireAuth><LeagueEventLobbyPage /></RequireAuth>} />
        <Route path="/league-guest-claim" element={<RequireAuth><LeagueGuestClaimPage /></RequireAuth>} />
        <Route path="/tv" element={<TvBoardEntryPage />} />
        <Route path="/tv/:code" element={<TvBoardPage />} />
        <Route path="/pay/:id" element={<RequireAuth><PaymentTrackerPage /></RequireAuth>} />
        <Route path="/pocket-admin/:id" element={<RequireAuth><PocketAdminPage /></RequireAuth>} />
        <Route path="/cash-games/:id/admin" element={<RequireAuth><RouteErrorBoundary title="Cash game page error"><CashGameAdminPage /></RouteErrorBoundary></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
