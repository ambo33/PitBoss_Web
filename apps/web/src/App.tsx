import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/Login';
import MainPage from './pages/Main';
import PreTournamentPage from './pages/PreTournament';
import PlayerLobbyPage from './pages/PlayerLobby';
import KnockoutLobbyPage from './pages/KnockoutLobby';
import AddonLobbyPage from './pages/AddonLobby';
import TvBoardPage from './pages/TvBoard';
import TvBoardEntryPage from './pages/TvBoard/Entry';
import PaymentTrackerPage from './pages/PaymentTracker';
import JoinGroupPage from './pages/JoinGroup';
import RouteErrorBoundary from './components/RouteErrorBoundary';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
        <Route path="/tournament/:id" element={<RequireAuth><RouteErrorBoundary title="Tournament page error"><PreTournamentPage /></RouteErrorBoundary></RequireAuth>} />
        <Route path="/join/:inviteCode" element={<JoinGroupPage />} />
        <Route path="/lobby/:id" element={<PlayerLobbyPage />} />
        <Route path="/bust/:id" element={<KnockoutLobbyPage />} />
        <Route path="/addon/:id" element={<AddonLobbyPage />} />
        <Route path="/tv" element={<TvBoardEntryPage />} />
        <Route path="/tv/:code" element={<TvBoardPage />} />
        <Route path="/pay/:id" element={<RequireAuth><PaymentTrackerPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
