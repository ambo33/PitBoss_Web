import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/Login';
import MainPage from './pages/Main';
import LandingPage from './pages/Landing';
import PricingPage from './pages/Pricing';
import TermsPage from './pages/Terms';
import PreTournamentPage from './pages/PreTournament';
import PlayerLobbyPage from './pages/PlayerLobby';
import KnockoutLobbyPage from './pages/KnockoutLobby';
import AddonLobbyPage from './pages/AddonLobby';
import TvBoardPage from './pages/TvBoard';
import TvBoardEntryPage from './pages/TvBoard/Entry';
import PaymentTrackerPage from './pages/PaymentTracker';
import PocketAdminPage from './pages/PocketAdmin';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/reset-password" element={<LoginPage />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/tournament/:id" element={<RequireAuth><RouteErrorBoundary title="Tournament page error"><PreTournamentPage /></RouteErrorBoundary></RequireAuth>} />
        <Route path="/join/:inviteCode" element={<JoinGroupPage />} />
        <Route path="/lobby/:id" element={<PlayerLobbyPage />} />
        <Route path="/checkin/:id" element={<PlayerLobbyPage mode="checkin" />} />
        <Route path="/bust/:id" element={<KnockoutLobbyPage />} />
        <Route path="/addon/:id" element={<AddonLobbyPage />} />
        <Route path="/tv" element={<TvBoardEntryPage />} />
        <Route path="/tv/:code" element={<TvBoardPage />} />
        <Route path="/pay/:id" element={<RequireAuth><PaymentTrackerPage /></RequireAuth>} />
        <Route path="/pocket-admin/:id" element={<RequireAuth><PocketAdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
