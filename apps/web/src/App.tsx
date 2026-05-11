import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/Login';
import MainPage from './pages/Main';
import PreTournamentPage from './pages/PreTournament';
import PlayerLobbyPage from './pages/PlayerLobby';
import PaymentTrackerPage from './pages/PaymentTracker';
import JoinGroupPage from './pages/JoinGroup';

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
        <Route path="/tournament/:id" element={<RequireAuth><PreTournamentPage /></RequireAuth>} />
        <Route path="/join/:inviteCode" element={<JoinGroupPage />} />
        <Route path="/lobby/:id" element={<PlayerLobbyPage />} />
        <Route path="/pay/:id" element={<PaymentTrackerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
