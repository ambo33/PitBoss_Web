import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CreditCard, Gamepad2, Music4, Shield, Trophy, UserCheck } from 'lucide-react';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/Login';
import MainPage from './pages/Main';
import LandingPage from './pages/Landing';
import QuickStartTournamentPage from './pages/QuickStart';
import QuickStartRunPage from './pages/QuickStart/Run';
import DemoPage from './pages/Demo';
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
import LeagueGuestKnockoutPage from './pages/LeagueGuestKnockout';
import TvBoardPage from './pages/TvBoard';
import TvBoardEntryPage from './pages/TvBoard/Entry';
import PaymentTrackerPage from './pages/PaymentTracker';
import PocketAdminPage from './pages/PocketAdmin';
import CashGameAdminPage from './pages/CashGameAdmin';
import JoinGroupPage from './pages/JoinGroup';
import JoinLeaguePage from './pages/JoinLeague';
import JoinCodePage from './pages/JoinCode';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import Layout, { type DesktopSectionSidebarConfig, type DesktopSidebarConfig, type HomeShellDestination } from './components/Layout';
import { featureFlags } from './features';

const DemoShowcasePage = lazy(() => import('./pages/DemoShowcase'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;
  return token ? <>{children}</> : <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

const STANDALONE_SIDEBARS: Record<HomeShellDestination, DesktopSidebarConfig> = {
  home: { active: 'home', canHost: false },
  games: { active: 'games', canHost: false },
  communities: { active: 'communities', canHost: false },
  history: { active: 'history', canHost: false },
  profile: { active: 'profile', canHost: false },
  admin: { active: 'admin', canHost: false },
};

function AuthenticatedAppPage({
  children,
  active,
}: {
  children: React.ReactNode;
  active: HomeShellDestination;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tournamentId = pathname.match(/^\/(?:pay|pocket-admin)\/([^/]+)/)?.[1];
  const leagueId = pathname.match(/^\/league\/([^/]+)\/event\//)?.[1];
  const isPaymentTracker = pathname.startsWith('/pay/');
  const isVoiceLab = pathname === '/admin/voice-lab';
  const sectionSidebar: DesktopSectionSidebarConfig = tournamentId ? {
    title: isPaymentTracker ? 'Tournament payments' : 'Pocket Admin',
    description: 'Tournament management',
    items: [
      { id: 'tournament', label: 'Back to tournament', Icon: ArrowLeft, onClick: () => navigate(`/tournament/${tournamentId}`) },
      { id: 'current', label: isPaymentTracker ? 'Payment tracker' : 'Pocket Admin', Icon: isPaymentTracker ? CreditCard : Gamepad2, active: true, onClick: () => window.scrollTo(0, 0) },
    ],
  } : leagueId ? {
    title: 'League event', description: 'Event lobby and participation', items: [
      { id: 'league', label: 'Back to league', Icon: ArrowLeft, onClick: () => navigate(`/?section=leagues&league=${leagueId}`) },
      { id: 'current', label: 'Event lobby', Icon: Calendar, active: true, onClick: () => window.scrollTo(0, 0) },
    ],
  } : isVoiceLab ? {
    title: 'Administration', description: 'Platform tools', items: [
      { id: 'admin', label: 'Superadmin tools', Icon: Shield, onClick: () => navigate('/?view=admin') },
      { id: 'current', label: 'Voice Lab', Icon: Music4, active: true, onClick: () => window.scrollTo(0, 0) },
    ],
  } : pathname === '/league-guest-claim' ? {
    title: 'League membership', description: 'Connect your league participation', items: [
      { id: 'leagues', label: 'My leagues', Icon: Trophy, onClick: () => navigate('/?section=leagues') },
      { id: 'current', label: 'Claim league spot', Icon: UserCheck, active: true, onClick: () => window.scrollTo(0, 0) },
    ],
  } : {
    title: 'Cash game', description: 'Players, buy-ins, and payouts', items: [
      { id: 'games', label: 'Back to games', Icon: ArrowLeft, onClick: () => navigate('/?section=upcoming&schedule=games') },
      { id: 'current', label: 'Game administration', Icon: Gamepad2, active: true, onClick: () => window.scrollTo(0, 0) },
    ],
  };
  return (
    <RequireAuth>
      <Layout
        desktopSidebar={STANDALONE_SIDEBARS[active]}
        desktopSectionSidebar={sectionSidebar}
        hideSidebar
        hideFeedback
        shellMode="standard"
        contentElement="div"
        mainWidthClassName="max-w-none"
        mainPaddingClassName="p-0"
      >
        {children}
      </Layout>
    </RequireAuth>
  );
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
        <Route path="/quick-start" element={featureFlags.deferredAuthQuickStart ? <QuickStartTournamentPage /> : <Navigate to="/" replace />} />
        <Route path="/quick-start/run" element={featureFlags.deferredAuthQuickStart ? <QuickStartRunPage /> : <Navigate to="/" replace />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route
          path="/demo-showcase"
          element={(
            <Suspense fallback={<div className="min-h-screen bg-pit-bg" role="status"><span className="sr-only">Loading showcase</span></div>}>
              <DemoShowcasePage />
            </Suspense>
          )}
        />
        <Route path="/admin/voice-lab" element={<AuthenticatedAppPage active="admin"><VoiceLabPage /></AuthenticatedAppPage>} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/blind-timer" element={<PublicBlindTimerPage />} />
        <Route path="/blind-timer/:code" element={<PublicBlindTimerPage />} />
        <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
        <Route path="/reset-password" element={<AppSubdomainRedirect />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/tournament/:id" element={<RequireAuth><RouteErrorBoundary title="Tournament page error"><PreTournamentPage /></RouteErrorBoundary></RequireAuth>} />
        <Route path="/join/group/:inviteCode" element={<JoinGroupPage />} />
        <Route path="/join/league/:inviteCode" element={<JoinLeaguePage />} />
        <Route path="/join/:inviteCode" element={<JoinCodePage />} />
        <Route path="/lobby/:id" element={<RouteErrorBoundary title="Lobby page error"><PlayerLobbyPage /></RouteErrorBoundary>} />
        <Route path="/checkin/:id" element={<RouteErrorBoundary title="Check-in page error"><PlayerLobbyPage mode="checkin" /></RouteErrorBoundary>} />
        <Route path="/bust/:id" element={<KnockoutLobbyPage />} />
        <Route path="/addon/:id" element={<AddonLobbyPage />} />
        <Route path="/league/:leagueId/event/:eventId" element={<AuthenticatedAppPage active="communities"><LeagueEventLobbyPage /></AuthenticatedAppPage>} />
        <Route path="/league-knockout/:token" element={<LeagueGuestKnockoutPage />} />
        <Route path="/league-guest-claim" element={<AuthenticatedAppPage active="communities"><LeagueGuestClaimPage /></AuthenticatedAppPage>} />
        <Route path="/tv" element={<TvBoardEntryPage />} />
        <Route path="/tv/:code" element={<TvBoardPage />} />
        <Route path="/pay/:id" element={<AuthenticatedAppPage active="games"><PaymentTrackerPage /></AuthenticatedAppPage>} />
        <Route path="/pocket-admin/:id" element={<AuthenticatedAppPage active="games"><PocketAdminPage /></AuthenticatedAppPage>} />
        <Route path="/cash-games/:id/admin" element={<AuthenticatedAppPage active="games"><RouteErrorBoundary title="Cash game page error"><CashGameAdminPage /></RouteErrorBoundary></AuthenticatedAppPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
