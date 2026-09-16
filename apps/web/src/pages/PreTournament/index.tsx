import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Coins,
  Home,
  Layers3,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Pencil,
  Play,
  Settings,
  Shield,
  Skull,
  Timer,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api/client';
import Layout, { useAppShellActions, type DesktopSidebarConfig } from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import QuarterHourTimeSelect from '../../components/QuarterHourTimeSelect';
import { featureFlags } from '../../features';
import { useAuthStore } from '../../store/auth';
import { cleanupDemoSessionIfNeeded } from '../../utils/demoSession';
import { isEnabledFlag } from '../../utils/flags';
import { createDebugSocket } from '../../utils/socketDebug';
import type { BlindLevel, TimerSnapshot, Tournament, TournamentPlayer } from '../../api/client';
import BlindTimer from './BlindTimer';
import CheckIn from './CheckIn';
import Payouts from './Payouts';
import RunTournament from './RunTournament';

type Tab = 'details' | 'players' | 'blinds' | 'run';
type DemoCoachStep = 'start' | null;

const TOURNAMENT_DESKTOP_SIDEBAR = {
  active: 'games',
  canHost: false,
} satisfies DesktopSidebarConfig;

export default function PreTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTab = location.state && typeof location.state === 'object' && 'tab' in location.state
    ? location.state.tab
    : undefined;
  const requestedDemoCoach = location.state && typeof location.state === 'object' && 'demoCoach' in location.state
    ? location.state.demoCoach
    : undefined;
  const shouldOpenRunTab = requestedTab === 'run' || requestedDemoCoach === 'start' || requestedDemoCoach === 'run-tab';
  const [tab, setTab] = useState<Tab>(shouldOpenRunTab ? 'run' : 'details');
  const [demoCoachStep, setDemoCoachStep] = useState<DemoCoachStep>(
    requestedDemoCoach === 'run-tab' || requestedDemoCoach === 'start' ? 'start' : null
  );
  const handleDemoStartCoachDone = useCallback(() => setDemoCoachStep(null), []);
  const user = useAuthStore((state) => state.user);
  const qc = useQueryClient();

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id || tab === 'run') return;
    const socket = createDebugSocket('pre-tournament');
    const joinTournament = () => {
      socket.emit('join-tournament', id);
    };
    socket.on('connect', joinTournament);
    if (socket.connected) {
      joinTournament();
    }
    socket.on('tournament-updated', (payload?: { tournament?: boolean; players?: boolean; seating?: boolean }) => {
      const refreshAll = !payload;
      if (refreshAll || payload.tournament) {
        qc.invalidateQueries({ queryKey: ['tournament', id] });
      }
      if (refreshAll || payload.players) {
        qc.invalidateQueries({ queryKey: ['players', id] });
      }
      if (refreshAll || payload.seating) {
        qc.invalidateQueries({ queryKey: ['seating', id] });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc, tab]);

  const updateTournamentMutation = useMutation({
    mutationFn: (data: Partial<Awaited<ReturnType<typeof api.getTournament>>>) => api.updateTournament(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
  const deleteTournamentMutation = useMutation({
    mutationFn: (data?: { notifyPlayers?: boolean }) => api.deleteTournament(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      qc.invalidateQueries({ queryKey: ['players', id] });
      navigate('/', { replace: true });
    },
    onError: (err) => {
      if (err instanceof Error && /not found/i.test(err.message)) {
        qc.invalidateQueries({ queryKey: ['tournaments'] });
        navigate('/', { replace: true });
      }
    },
  });

  const { data: blinds = [] } = useQuery({
    queryKey: ['blinds', id],
    queryFn: () => api.getBlinds(id!),
    enabled: !!id,
  });

  const { data: timerState } = useQuery({
    queryKey: ['timer', id],
    queryFn: () => api.getTimer(id!),
    enabled: !!id,
    refetchInterval: tab === 'details' ? 15_000 : false,
  });

  const canManage = tournament ? isEnabledFlag(tournament.canmanage) || tournament.ownerid === user?.guid : false;

  useEffect(() => {
    if (tournament && !canManage && tab === 'run') setTab('details');
  }, [tournament, canManage, tab]);

  if (isLoading) return <Layout back="/" backIcon={<Home size={19} />} backAriaLabel="Home" desktopSidebar={TOURNAMENT_DESKTOP_SIDEBAR} hideFeedback><LoadingSpinner className="mt-24" /></Layout>;
  if (!tournament) return <Layout back="/" backIcon={<Home size={19} />} backAriaLabel="Home" desktopSidebar={TOURNAMENT_DESKTOP_SIDEBAR}><p className="mt-24 text-center text-pit-text">Tournament not found.</p></Layout>;

  const eventStarted = hasTournamentStarted(tournament.tourneydate, tournament.tourneytime);
  const scheduleLocked = eventStarted && !user?.issuperadmin;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const bountyTotal = players.reduce((sum, player) => sum + toNumber(player.bountyamount), 0);
  const pocketAdminUrl = `${window.location.origin}/pocket-admin/${id}`;
  const showPocketAdmin = canManage;
  const showTvBoard = featureFlags.tvBoard;
  const tabs: { id: Tab; label: string; mobileLabel: string; Icon: React.ElementType }[] = [
    { id: 'details', label: 'Details', mobileLabel: 'Details', Icon: ClipboardList },
    { id: 'players', label: 'Players', mobileLabel: 'Players', Icon: Users },
    { id: 'blinds', label: 'Blind Structure', mobileLabel: 'Blinds', Icon: Timer },
    ...(canManage ? [{ id: 'run' as const, label: 'Run Tournament', mobileLabel: 'Run', Icon: Play }] : []),
  ];

  return (
    <Layout
      back="/"
      backIcon={<Home size={19} />}
      backAriaLabel="Home"
      desktopSidebar={TOURNAMENT_DESKTOP_SIDEBAR}
      desktopSectionSidebar={{
        title: tournament.name || 'Tournament',
        description: tournament.groupname || 'Tournament workspace',
        items: tabs.map(({ id: tabId, label, Icon }) => ({
          id: tabId,
          label,
          Icon,
          active: tab === tabId,
          onClick: () => setTab(tabId),
        })),
      }}
      compactSidebar={tab === 'run' && canManage}
      hideMobileNav={tab === 'run' || tab === 'blinds'}
      hideHeader={tab === 'run'}
      headerRight={<TournamentAccountMenu />}
      mainWidthClassName={tab === 'run' ? 'max-w-none' : 'max-w-7xl'}
      mainPaddingClassName={tab === 'run' ? 'p-4 pb-24 md:p-6 md:pb-8' : undefined}
    >
      <TournamentDesktopHeader tournament={tournament} activeTab={tab} canManage={canManage} />
      <TournamentCommandHeader
        tournament={tournament}
        canManage={canManage}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        accountMenu={tab === 'run' ? <TournamentAccountMenu /> : null}
      />

      {tab === 'details' && (
        <TournamentDashboard
          tournament={tournament}
          players={players}
          blinds={blinds}
          timerState={timerState}
          canManage={canManage}
          onOpenBlinds={() => setTab('blinds')}
          onRun={() => setTab('run')}
          details={(
          <TournamentDetailsCard
            tournament={tournament}
            totalRebuys={totalRebuys}
            totalAddons={totalAddons}
            bountyTotal={bountyTotal}
            canManage={canManage}
            scheduleLocked={scheduleLocked}
            liveBountyStartPlace={players.filter((player) => player.checkedin && player.placed == null).length || null}
            saving={updateTournamentMutation.isPending}
            deleting={deleteTournamentMutation.isPending}
            error={updateTournamentMutation.error?.message}
            deleteError={deleteTournamentMutation.error?.message}
            onSave={(data) => updateTournamentMutation.mutate(data)}
            onDelete={(data) => deleteTournamentMutation.mutate(data)}
            pocketAdminUrl={showPocketAdmin ? pocketAdminUrl : null}
            showTvBoard={showTvBoard}
          />
          )}
          payouts={<Payouts tournamentId={id!} tournament={tournament} summaryOnly />}
        />
      )}

      {tab === 'players' && <CheckIn tournamentId={id!} isOwner={canManage} tournament={tournament} />}
      {tab === 'blinds' && <BlindTimer tournamentId={id!} isOwner={canManage} playerCount={players.length} tournament={tournament} />}
      {tab === 'run' && canManage && (
        <RunTournament
          tournamentId={id!}
          isOwner={canManage}
          tournament={tournament}
          players={players}
          onOpenBlinds={() => setTab('blinds')}
          demoStartCoachActive={demoCoachStep === 'start'}
          onDemoStartCoachDone={handleDemoStartCoachDone}
        />
      )}
    </Layout>
  );
}

const TOURNAMENT_SECTION_COPY: Record<Tab, { title: string; description: string }> = {
  details: { title: 'Overview', description: 'Tournament details, player activity, and payouts.' },
  players: { title: 'Players', description: 'Manage the roster and tournament check-in.' },
  blinds: { title: 'Blind Structure', description: 'Review levels, breaks, and the tournament clock.' },
  run: { title: 'Run Tournament', description: 'Live tournament controls' },
};

function TournamentDesktopHeader({ tournament, activeTab, canManage }: {
  tournament: Tournament;
  activeTab: Tab;
  canManage: boolean;
}) {
  const section = TOURNAMENT_SECTION_COPY[activeTab];
  const running = activeTab === 'run';

  return (
    <header
      className={`relative z-20 hidden min-w-0 items-start justify-between gap-4 bg-[#080d12] min-[1200px]:flex ${running ? '-mx-6 mb-6 border-b border-pit-border/70 px-6 pb-4' : 'mb-6'}`}
      data-tournament-workspace-header={activeTab}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className={`min-w-0 break-words font-bold tracking-tight text-white ${running ? 'text-xl' : 'text-[28px]'}`}>
            {running ? tournament.name : section.title}
          </h1>
          {canManage && <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Admin</span>}
        </div>
        <p className="mt-1 text-sm text-pit-text">{section.description}</p>
        {!running && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-pit-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" />{normalizeDate(tournament.tourneydate) ?? 'Date TBD'}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" />{normalizeTime(tournament.tourneytime) ?? 'Time TBD'}</span>
          </div>
        )}
      </div>
      {!running && tournament.tvdisplaycode && (
        <a
          href={`/tv/${tournament.tvdisplaycode}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-pit-border bg-black/20 px-3 py-2 font-mono text-xs tracking-[0.12em] text-pit-text transition hover:border-pit-teal/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal"
        >
          TV {tournament.tvdisplaycode}
        </a>
      )}
    </header>
  );
}

function TournamentAccountMenu() {
  const shellActions = useAppShellActions();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function goHome(state?: unknown) {
    setOpen(false);
    if (state) {
      navigate('/', { state });
    } else {
      navigate('/');
    }
  }

  function handleLogout() {
    const token = localStorage.getItem('pb_token');
    void cleanupDemoSessionIfNeeded(user, token);
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-pit-bg/55 text-pit-muted transition ${open ? 'border-pit-teal/70 bg-pit-teal/10 text-white' : 'border-pit-border/80 hover:border-pit-teal/50 hover:bg-pit-surface/70 hover:text-white'}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <div className="absolute right-0 top-[3.25rem] z-50 w-56 overflow-hidden rounded-2xl border border-pit-border bg-[#15171d]/[0.98] p-1.5 shadow-[0_22px_55px_rgba(0,0,0,0.48)] backdrop-blur-xl" role="menu">
          <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-pit-teal/10 hover:text-white" onClick={() => goHome()} role="menuitem">
            <Home size={15} />
            Home
          </button>
          <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-pit-teal/10 hover:text-white" onClick={() => goHome({ tab: 'profile' })} role="menuitem">
            <User size={15} />
            Profile
          </button>
          {user?.issuperadmin && (
            <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-200 transition hover:bg-red-500/10 hover:text-red-100" onClick={() => goHome({ tab: 'admin' })} role="menuitem">
              <Shield size={15} />
              Admin
            </button>
          )}
          <div className="my-1 border-t border-pit-border" />
          {shellActions && <button type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-pit-teal/10 hover:text-white" onClick={() => { setOpen(false); shellActions.openFeedback(buttonRef.current ?? undefined); }} role="menuitem"><MessageSquare size={15} />Help &amp; Feedback</button>}
          <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pit-muted transition hover:bg-red-500/10 hover:text-red-300" onClick={handleLogout} role="menuitem">
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function TournamentCommandHeader({
  tournament,
  canManage,
  tabs,
  activeTab,
  onTabChange,
  accountMenu,
}: {
  tournament: Tournament;
  canManage: boolean;
  tabs: { id: Tab; label: string; mobileLabel: string; Icon: React.ElementType }[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  accountMenu?: React.ReactNode;
}) {
  if (activeTab === 'run') {
    return (
      <section data-tournament-command-header className="relative z-30 -mx-4 mb-2 border-b border-pit-border/90 bg-[#0d1117] shadow-[0_10px_28px_rgba(0,0,0,0.34)] sm:-mx-6 lg:-mx-8 min-[1200px]:hidden">
        <div className="flex min-h-16 w-full items-center gap-2 px-3 py-2 sm:px-4 lg:px-5">
          <Link
            to="/"
            aria-label="Home"
            title="Home"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pit-teal/30 bg-pit-teal/10 text-pit-teal transition hover:border-pit-teal/65 hover:text-white"
          >
            <Home size={18} />
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pit-teal/45 bg-pit-teal/10 text-base font-black text-white">
              {tournament.name?.trim().charAt(0).toUpperCase() || 'T'}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-bold text-white sm:text-base">{tournament.name}</h1>
                {canManage && <span className="hidden rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300 sm:inline">Admin</span>}
              </div>
              <p className="hidden truncate text-[11px] text-pit-text sm:block">{tournament.groupname || 'Poker tournament'}</p>
            </div>
          </div>
          <nav className="ml-auto hidden min-w-0 flex-1 items-center justify-end gap-1 min-[768px]:flex" aria-label="Tournament navigation">
            {tabs.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id)}
                  className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? 'bg-pit-teal/18 text-white ring-1 ring-pit-teal/45' : 'text-pit-text hover:bg-white/5 hover:text-white'}`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="ml-auto shrink-0 min-[768px]:ml-1">{accountMenu}</div>
        </div>
        <nav
          className="mx-3 mb-2 grid rounded-xl border border-pit-border bg-black/25 p-1 min-[768px]:hidden"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          aria-label="Tournament navigation"
        >
          {tabs.map(({ id, mobileLabel, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-semibold transition ${active ? 'bg-pit-teal/18 text-white ring-1 ring-inset ring-pit-teal/45' : 'text-pit-text hover:bg-white/5 hover:text-white'}`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{mobileLabel}</span>
              </button>
            );
          })}
        </nav>
      </section>
    );
  }

  return (
    <section data-tournament-command-header className="relative z-20 -mx-4 mb-3 border-y border-pit-border/90 bg-[#0d1117] shadow-[0_10px_28px_rgba(0,0,0,0.28)] sm:-mx-6 lg:-mx-8 min-[1200px]:hidden">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pit-teal/45 bg-pit-teal/10 text-base font-black text-white sm:h-10 sm:w-10 sm:text-lg">
            {tournament.name?.trim().charAt(0).toUpperCase() || 'T'}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-bold text-white sm:text-lg">{tournament.name}</h1>
              {canManage && <span className="hidden rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300 sm:inline">Admin</span>}
            </div>
            <p className="truncate text-xs text-pit-text">{tournament.groupname || 'Poker tournament'}</p>
          </div>
        </div>
        {tournament.tvdisplaycode && (
          <a
            href={`/tv/${tournament.tvdisplaycode}`}
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 rounded-xl border border-pit-border bg-black/20 px-3 py-2 font-mono text-xs tracking-[0.16em] text-pit-text transition hover:border-pit-teal/50 hover:text-white sm:block"
          >
            TV {tournament.tvdisplaycode}
          </a>
        )}
      </div>
      <nav
        className="mx-3 mb-2 grid rounded-xl border border-pit-border bg-black/25 p-1 min-[768px]:mx-auto min-[768px]:mb-0 min-[768px]:max-w-[1600px] min-[768px]:rounded-none min-[768px]:border-x-0 min-[768px]:border-b-0 min-[768px]:bg-transparent min-[768px]:px-4 min-[768px]:pb-2 min-[768px]:pt-1.5 lg:px-8"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        aria-label="Tournament navigation"
      >
        {tabs.map(({ id, label, mobileLabel, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold transition min-[768px]:flex-row min-[768px]:gap-2 min-[768px]:rounded-xl min-[768px]:py-2 min-[768px]:text-sm ${
                active ? 'bg-pit-teal/18 text-white ring-1 ring-inset ring-pit-teal/45' : 'text-pit-text hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate min-[768px]:hidden">{mobileLabel}</span>
              <span className="hidden truncate min-[768px]:inline">{label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}

function TournamentDashboard({
  tournament,
  players,
  blinds,
  timerState,
  canManage,
  onOpenBlinds,
  onRun,
  details,
  payouts,
}: {
  tournament: Tournament;
  players: TournamentPlayer[];
  blinds: BlindLevel[];
  timerState?: TimerSnapshot;
  canManage: boolean;
  onOpenBlinds: () => void;
  onRun: () => void;
  details: React.ReactNode;
  payouts: React.ReactNode;
}) {
  const checkedIn = players.filter((player) => player.checkedin).length;
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const knockedOut = [...players]
    .filter((player) => player.placed != null)
    .sort((a, b) => Number(a.placed) - Number(b.placed));
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const sortedBlinds = [...blinds].sort((a, b) => Number(a.level) - Number(b.level));
  const currentLevel = timerState?.currentlevel ?? sortedBlinds[0]?.level ?? 1;
  const currentIndex = Math.max(0, sortedBlinds.findIndex((blind) => Number(blind.level) === Number(currentLevel)));
  const blindWindow = sortedBlinds.slice(Math.max(0, currentIndex - 2), Math.min(sortedBlinds.length, currentIndex + 4));
  const checkInUrl = `${window.location.origin}/checkin/${tournament.tournamentid}`;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(275px,.88fr)_minmax(420px,1.35fr)_minmax(260px,.82fr)]">
      <div className="contents xl:col-start-1 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
        <div className="order-1 min-w-0">{details}</div>
        <ArrivalCheckInCard url={checkInUrl} registered={players.length} checkedIn={checkedIn} />
      </div>
      <div className="contents xl:col-start-2 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
        <BlindStructureCard blinds={blindWindow} totalLevels={sortedBlinds.length} currentLevel={currentLevel} onEdit={canManage ? onOpenBlinds : undefined} />
        <div className="order-5 min-w-0">{payouts}</div>
      </div>
      <div className="contents xl:col-start-3 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
        <QuickStatsCard activePlayers={activePlayers} totalRebuys={totalRebuys} totalAddons={totalAddons} onRun={canManage ? onRun : undefined} />
        <KnockoutSummaryCard players={knockedOut} />
      </div>
    </div>
  );
}

function DashboardCard({ title, icon, action, className = '', children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border border-pit-border bg-pit-card ${className}`}>
      <div className="flex min-h-13 items-center justify-between gap-3 border-b border-pit-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">{icon}<h2>{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ArrivalCheckInCard({ url, registered, checkedIn }: { url: string; registered: number; checkedIn: number }) {
  return (
    <DashboardCard title="Arrival Check-In" icon={<UserCheck size={17} className="text-pit-teal" />} className="order-2">
      <div className="p-4">
        <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-pit-text">After payment, scan here to check in</p>
        <div className="mx-auto w-fit rounded-xl bg-white p-2"><QRCodeSVG value={url} size={112} /></div>
      </div>
      <div className="grid grid-cols-3 border-t border-pit-border">
        <DashboardMetric label="Registered" value={registered} />
        <DashboardMetric label="Checked In" value={checkedIn} />
        <DashboardMetric label="Not Arrived" value={Math.max(0, registered - checkedIn)} />
      </div>
    </DashboardCard>
  );
}

function BlindStructureCard({ blinds, totalLevels, currentLevel, onEdit }: { blinds: BlindLevel[]; totalLevels: number; currentLevel: number; onEdit?: () => void }) {
  return (
    <DashboardCard
      title="Blind Structure"
      icon={<Layers3 size={17} className="text-pit-teal" />}
      className="order-3"
      action={onEdit ? <button type="button" className="btn-ghost min-h-9 px-3 py-1.5 text-xs" onClick={onEdit}>Edit Structure</button> : undefined}
    >
      <div className="px-4 py-3">
        <p className="mb-2 text-xs text-pit-muted">{totalLevels} levels</p>
        {blinds.length ? (
          <div className="overflow-hidden rounded-lg border border-pit-border">
            <div className="grid grid-cols-[3rem_1fr_4rem] border-b border-pit-border bg-black/15 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.15em] text-pit-muted sm:grid-cols-[4rem_1fr_5rem]">
              <span>Level</span><span>Blinds / Ante</span><span className="hidden sm:block">Time</span><span className="text-right sm:hidden">Time</span>
            </div>
            {blinds.map((blind) => {
              const active = Number(blind.level) === Number(currentLevel);
              const isBreak = Number(blind.smallblind) === 0 && Number(blind.bigblind) === 0;
              return (
                <div key={blind.id} className={`grid grid-cols-[3rem_1fr_4rem] items-center px-3 py-2 text-xs sm:grid-cols-[4rem_1fr_5rem] ${active ? 'bg-pit-teal/15 text-white ring-1 ring-inset ring-pit-teal/40' : 'border-t border-pit-border/55 text-pit-text'}`}>
                  <span className="font-semibold">{blind.level}</span>
                  <span className="font-semibold">{isBreak ? (blind.label || 'Break') : `${formatCompactNumber(blind.smallblind)} / ${formatCompactNumber(blind.bigblind)}${blind.ante ? ` (${formatCompactNumber(blind.ante)})` : ''}`}</span>
                  <span className="hidden sm:block">{blind.minutes}m</span>
                  <span className="text-right sm:hidden">{blind.minutes}m</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-pit-border px-3 py-5 text-center">
            <p className="text-sm text-pit-muted">No blind structure saved yet.</p>
            {onEdit && (
              <button type="button" className="btn-primary mx-auto mt-3 min-h-10 gap-2 px-3 py-2 text-sm" onClick={onEdit}>
                <Timer size={15} />
                Build Structure
              </button>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function QuickStatsCard({ activePlayers, totalRebuys, totalAddons, onRun }: { activePlayers: number; totalRebuys: number; totalAddons: number; onRun?: () => void }) {
  return (
    <DashboardCard title="Quick Stats" icon={<Coins size={17} className="text-pit-teal" />} className="order-4">
      <div className="divide-y divide-pit-border px-4">
        <CompactStat label="Players Left" value={activePlayers} icon={<Users size={14} />} />
        <CompactStat label="Rebuys" value={totalRebuys} icon={<Clock3 size={14} />} />
        <CompactStat label="Add-ons" value={totalAddons} icon={<CheckCircle2 size={14} />} />
      </div>
      {onRun && <div className="p-3"><button type="button" className="btn-primary w-full gap-2" onClick={onRun}><Play size={15} /> Run Tournament</button></div>}
    </DashboardCard>
  );
}

function KnockoutSummaryCard({ players }: { players: TournamentPlayer[] }) {
  return (
    <DashboardCard title={`Knocked Out (${players.length})`} icon={<Skull size={17} className="text-pit-teal" />} className="order-6">
      {players.length ? (
        <div className="divide-y divide-pit-border px-4">
          {players.slice(0, 5).map((player) => (
            <div key={player.userid} className="grid grid-cols-[3rem_1fr] gap-2 py-2.5 text-sm">
              <span className="font-bold text-white">{formatOrdinal(Number(player.placed))}</span>
              <span className="truncate text-pit-text">{player.displayname || 'Player'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <Skull size={32} className="text-pit-muted/55" />
          <p className="font-semibold text-white">No players eliminated yet.</p>
          <p className="text-xs text-pit-muted">Knocked out players will appear here.</p>
        </div>
      )}
    </DashboardCard>
  );
}

function DashboardMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 border-r border-pit-border px-2 py-3 text-center last:border-r-0"><p className="truncate text-[9px] font-bold uppercase text-pit-muted">{label}</p><p className="mt-1 text-lg font-bold text-white">{value}</p></div>;
}

function CompactStat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-3 text-sm"><span className="flex items-center gap-2 text-pit-text">{icon}{label}</span><strong className="text-white">{value}</strong></div>;
}

function TournamentDetailsCard({
  tournament,
  totalRebuys,
  totalAddons,
  bountyTotal,
  canManage,
  scheduleLocked,
  liveBountyStartPlace,
  saving,
  deleting,
  error,
  deleteError,
  onSave,
  onDelete,
  pocketAdminUrl,
  showTvBoard,
}: {
  tournament: Awaited<ReturnType<typeof api.getTournament>>;
  totalRebuys: number;
  totalAddons: number;
  bountyTotal: number;
  canManage: boolean;
  scheduleLocked: boolean;
  liveBountyStartPlace: number | null;
  saving: boolean;
  deleting: boolean;
  error?: string;
  deleteError?: string;
  onSave: (data: Partial<Awaited<ReturnType<typeof api.getTournament>>>) => void;
  onDelete: (data?: { notifyPlayers?: boolean }) => void;
  pocketAdminUrl: string | null;
  showTvBoard: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notifyOnDelete, setNotifyOnDelete] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState(() => ({
    name: tournament.name ?? '',
    tourneydate: normalizeDate(tournament.tourneydate) ?? '',
    tourneytime: normalizeTimeInput(tournament.tourneytime),
    buyin: String(toNumber(tournament.buyin)),
    maxplayers: tournament.maxplayers ? String(tournament.maxplayers) : '',
    rebuyprice: String(toNumber(tournament.rebuyprice)),
    rebuychips: String(toNumber(tournament.rebuychips)),
    rebuylastlevel: tournament.rebuylastlevel ? String(tournament.rebuylastlevel) : '',
    addonprice: String(toNumber(tournament.addonprice)),
    addonchips: String(toNumber(tournament.addonchips)),
    bountyenabled: Boolean(tournament.bountyenabled),
    bountymode: tournament.bountymode ?? 'manual',
    bountyprizepool: String(toNumber(tournament.bountyprizepool)),
    bountypooltype: tournament.bountypooltype ?? 'amount',
    bountyroundingdenomination: String(toNumber(tournament.bountyroundingdenomination) || 5),
    bountystartplace: tournament.bountystartplace ? String(tournament.bountystartplace) : '',
    bountyminpayout: String(toNumber(tournament.bountyminpayout)),
  }));

  function startEditing() {
    setForm({
      name: tournament.name ?? '',
      tourneydate: normalizeDate(tournament.tourneydate) ?? '',
      tourneytime: normalizeTimeInput(tournament.tourneytime),
      buyin: String(toNumber(tournament.buyin)),
      maxplayers: tournament.maxplayers ? String(tournament.maxplayers) : '',
      rebuyprice: String(toNumber(tournament.rebuyprice)),
      rebuychips: String(toNumber(tournament.rebuychips)),
      rebuylastlevel: tournament.rebuylastlevel ? String(tournament.rebuylastlevel) : '',
      addonprice: String(toNumber(tournament.addonprice)),
      addonchips: String(toNumber(tournament.addonchips)),
      bountyenabled: Boolean(tournament.bountyenabled),
      bountymode: tournament.bountymode ?? 'manual',
      bountyprizepool: String(toNumber(tournament.bountyprizepool)),
      bountypooltype: tournament.bountypooltype ?? 'amount',
      bountyroundingdenomination: String(toNumber(tournament.bountyroundingdenomination) || 5),
      bountystartplace: tournament.bountystartplace ? String(tournament.bountystartplace) : '',
      bountyminpayout: String(toNumber(tournament.bountyminpayout)),
    });
    setEditing(true);
  }

  useEffect(() => {
    if (!actionsOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActionsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionsOpen]);

  function saveDetails() {
    if (bountyMinimumError) return;
    if (bountyCapError) return;
    if (rebuyCutoffError) return;
    const bountyMode = form.bountymode;
    const saveBountyStartPlace = form.bountyenabled && midGameBountyStartPlace && !form.bountystartplace
      ? midGameBountyStartPlace
      : form.bountystartplace
        ? Number(form.bountystartplace) || null
        : null;
    onSave({
      name: form.name.trim(),
      tourneydate: form.tourneydate || undefined,
      tourneytime: form.tourneytime || undefined,
      buyin: toNumber(form.buyin),
      maxplayers: Number(form.maxplayers) || 0,
      rebuyprice: toNumber(form.rebuyprice),
      rebuychips: Number(form.rebuychips) || 0,
      rebuylastlevel: detailsRebuysEnabled ? Number(form.rebuylastlevel) || null : null,
      addonprice: toNumber(form.addonprice),
      addonchips: Number(form.addonchips) || 0,
      bountyenabled: form.bountyenabled,
      bountymode: bountyMode,
      bountyprizepool: toNumber(form.bountyprizepool),
      bountypooltype: bountyMode === 'manual' ? 'amount' : form.bountypooltype,
      bountyroundingdenomination: toNumber(form.bountyroundingdenomination) || 5,
      bountystartplace: saveBountyStartPlace,
      bountyminpayout: toNumber(form.bountyminpayout),
    });
    setEditing(false);
  }

  const estimatedBountyField = Math.max(0, Math.floor(Number(form.maxplayers) || 0));
  const detailsRebuysEnabled = toNumber(form.rebuyprice) > 0 || Number(form.rebuychips) > 0;
  const rebuyCutoffError = detailsRebuysEnabled && !Number(form.rebuylastlevel)
    ? 'Set the final level where rebuys are allowed.'
    : '';
  const midGameBountyStartPlace = !tournament.bountyenabled && liveBountyStartPlace && liveBountyStartPlace > 1
    ? liveBountyStartPlace
    : null;
  const effectiveFormBountyStartPlace = form.bountyenabled && midGameBountyStartPlace && !form.bountystartplace
    ? midGameBountyStartPlace
    : form.bountystartplace ? Number(form.bountystartplace) || 0 : 0;
  const estimatedBountyEligibleCount = Math.max(
    0,
    (effectiveFormBountyStartPlace ? Math.min(effectiveFormBountyStartPlace, estimatedBountyField) : estimatedBountyField) - 1
  );
  const estimatedBountyGross = (toNumber(form.buyin) * estimatedBountyField)
    + (toNumber(form.rebuyprice) * totalRebuys)
    + (toNumber(form.addonprice) * totalAddons);
  const estimatedBountyPool = form.bountypooltype === 'percent'
    ? (estimatedBountyGross * Math.min(100, Math.max(0, toNumber(form.bountyprizepool)))) / 100
    : toNumber(form.bountyprizepool);
  const standardBountyTotal = toNumber(form.bountyprizepool) * estimatedBountyEligibleCount;
  const standardBountyCap = toNumber(form.buyin) * estimatedBountyField;
  const bountyCapError = form.bountyenabled
    ? estimatedBountyField <= 0
      ? 'Set max players before enabling bounties so the bounty cap is defined.'
      : midGameBountyStartPlace && form.bountystartplace && Number(form.bountystartplace) > midGameBountyStartPlace
        ? `Bounties can only start at ${formatOrdinal(midGameBountyStartPlace)} place or later because ${midGameBountyStartPlace} players are still active.`
      : form.bountymode === 'manual' && !effectiveFormBountyStartPlace && toNumber(form.bountyprizepool) > toNumber(form.buyin)
        ? `Bounty per knockout cannot exceed the ${formatMoney(toNumber(form.buyin))} buy-in when it applies to the whole field.`
        : form.bountymode === 'manual' && standardBountyTotal > standardBountyCap
          ? `Configured bounties can pay up to ${formatMoney(standardBountyTotal)}, but the expected cap is ${formatMoney(standardBountyCap)} from ${estimatedBountyField} players.`
          : form.bountymode === 'mystery' && estimatedBountyPool > standardBountyCap
            ? `Mystery bounty pool cannot exceed the expected cap of ${formatMoney(standardBountyCap)} from ${estimatedBountyField} players.`
            : ''
    : '';
  const bountyMinimumRequired = toNumber(form.bountyminpayout) * estimatedBountyEligibleCount;
  const bountyMinimumError = form.bountyenabled
    && form.bountymode === 'mystery'
    && toNumber(form.bountyminpayout) > 0
    && estimatedBountyEligibleCount > 0
    && bountyMinimumRequired > estimatedBountyPool
      ? `Minimum bounty payout is too high. ${estimatedBountyEligibleCount} eligible bounties at ${formatMoney(toNumber(form.bountyminpayout))} requires ${formatMoney(bountyMinimumRequired)}, but the bounty pool is ${formatMoney(estimatedBountyPool)}.`
      : '';
  const registeredPlayerCount = Number(tournament.playercount ?? 0);

  return (
    <section className="overflow-hidden rounded-xl border border-pit-border bg-pit-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-pit-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><ClipboardList size={17} className="text-pit-teal" /><h2>Tournament Details</h2></div>
        </div>
        <div className="flex min-w-0 flex-wrap items-start justify-end gap-2">
          {pocketAdminUrl && (
            <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-pit-border bg-pit-bg/50 px-2.5 py-2 2xl:flex">
              <div className="inline-block rounded-md bg-white p-1">
                <QRCodeSVG value={pocketAdminUrl} size={42} />
              </div>
              <a
                className="min-w-0 text-xs font-semibold text-pit-teal hover:text-pit-teal/80"
                href={pocketAdminUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Pocket Admin
              </a>
            </div>
          )}
          {canManage && (
            <div ref={actionsMenuRef} className="relative">
              <button
                type="button"
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${actionsOpen ? 'border-pit-teal/55 bg-pit-teal/15 text-white shadow-[0_0_18px_rgba(20,184,166,0.18)]' : 'border-pit-border bg-pit-bg/55 text-pit-text hover:border-pit-teal/45 hover:text-white'}`}
                onClick={() => setActionsOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                aria-label="Tournament actions"
              >
                <Settings size={17} />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-pit-border bg-pit-card shadow-[0_20px_60px_rgba(0,0,0,0.45)]" role="menu">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      setActionsOpen(false);
                      if (editing) {
                        setEditing(false);
                      } else {
                        startEditing();
                      }
                    }}
                    role="menuitem"
                  >
                    <Pencil size={15} className="text-pit-teal" />
                    {editing ? 'Cancel edit' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => {
                      setActionsOpen(false);
                      setNotifyOnDelete(registeredPlayerCount > 0);
                      setConfirmDelete(true);
                    }}
                    role="menuitem"
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      {deleteError && <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{deleteError}</p>}

      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </Field>
            <Field label="">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-pit-text">Date</span>
                  {scheduleLocked && <LockHint />}
                </div>
                <input className="input" type="date" value={form.tourneydate} disabled={scheduleLocked} onChange={(e) => setForm((current) => ({ ...current, tourneydate: e.target.value }))} />
              </div>
            </Field>
            <Field label="">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-pit-text">Time</span>
                  {scheduleLocked && <LockHint />}
                </div>
                <QuarterHourTimeSelect value={form.tourneytime} disabled={scheduleLocked} onChange={(value) => setForm((current) => ({ ...current, tourneytime: value }))} />
              </div>
            </Field>
            <Field label="Buy-in">
              <input className="input" type="number" min="0" step="0.01" value={form.buyin} onChange={(e) => setForm((current) => ({ ...current, buyin: e.target.value }))} />
            </Field>
            <Field label="Max players">
              <input className="input" type="number" min="0" value={form.maxplayers} onChange={(e) => setForm((current) => ({ ...current, maxplayers: e.target.value }))} />
            </Field>
            <Field label="Rebuy price">
              <input className="input" type="number" min="0" step="0.01" value={form.rebuyprice} onChange={(e) => setForm((current) => ({ ...current, rebuyprice: e.target.value }))} />
            </Field>
            <Field label="Rebuy chips">
              <input className="input" type="number" min="0" value={form.rebuychips} onChange={(e) => setForm((current) => ({ ...current, rebuychips: e.target.value }))} />
            </Field>
            {detailsRebuysEnabled && (
              <Field label="Rebuys good through level">
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={form.rebuylastlevel}
                  onChange={(e) => setForm((current) => ({ ...current, rebuylastlevel: e.target.value }))}
                />
              </Field>
            )}
            {rebuyCutoffError && (
              <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100 sm:col-span-2">
                {rebuyCutoffError}
              </p>
            )}
            <Field label="Add-on price">
              <input className="input" type="number" min="0" step="0.01" value={form.addonprice} onChange={(e) => setForm((current) => ({ ...current, addonprice: e.target.value }))} />
            </Field>
            <Field label="Add-on chips">
              <input className="input" type="number" min="0" value={form.addonchips} onChange={(e) => setForm((current) => ({ ...current, addonchips: e.target.value }))} />
            </Field>
            <div className="space-y-3 rounded-xl border border-pit-teal/30 bg-gradient-to-r from-pit-teal/10 via-pit-bg/70 to-pit-bg/50 p-4 sm:col-span-2">
              <label className="flex items-start gap-3">
                <input
                  className="mt-1 h-4 w-4 accent-pit-teal"
                  type="checkbox"
                  checked={form.bountyenabled}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    bountyenabled: e.target.checked,
                  }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-white">Enable Knockout/Mystery Bounties</span>
                  <span className="mt-1 block text-xs leading-5 text-pit-text">
                    {midGameBountyStartPlace
                      ? `Mid-game bounties start no earlier than ${formatOrdinal(midGameBountyStartPlace)} place, so already-eliminated players stay untouched.`
                      : 'Set bounties before play or start them from a future knockout spot.'}
                  </span>
                </span>
              </label>
              {form.bountyenabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bounty mode">
                    <select
                      className="input"
                      value={form.bountymode}
                      onChange={(e) => setForm((current) => ({
                        ...current,
                        bountymode: e.target.value as 'manual' | 'mystery',
                        bountypooltype: e.target.value === 'manual' ? 'amount' : current.bountypooltype,
                      }))}
                    >
                      <option value="manual">Standard Knockout</option>
                      <option value="mystery">Mystery bounty pool</option>
                    </select>
                  </Field>
                  {form.bountymode === 'mystery' && (
                    <Field label="Pool basis">
                      <select className="input" value={form.bountypooltype} onChange={(e) => setForm((current) => ({ ...current, bountypooltype: e.target.value as 'amount' | 'percent' }))}>
                        <option value="amount">Fixed dollar amount</option>
                        <option value="percent">% of gross pot</option>
                      </select>
                    </Field>
                  )}
                  <Field label={form.bountymode === 'manual' ? 'Bounty per knockout' : form.bountypooltype === 'percent' ? 'Mystery bounty pool percent' : 'Mystery bounty pool'}>
                    <div className="relative">
                      <input
                        className={`input ${form.bountymode === 'mystery' && form.bountypooltype === 'percent' ? 'pr-8' : 'pl-7'}`}
                        type="number"
                        min="0"
                        max={form.bountymode === 'mystery' && form.bountypooltype === 'percent' ? '100' : undefined}
                        step="0.01"
                        value={form.bountyprizepool}
                        onChange={(e) => setForm((current) => ({ ...current, bountyprizepool: e.target.value }))}
                      />
                      <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-pit-muted ${form.bountymode === 'mystery' && form.bountypooltype === 'percent' ? 'right-3' : 'left-3'}`}>
                        {form.bountymode === 'mystery' && form.bountypooltype === 'percent' ? '%' : '$'}
                      </span>
                    </div>
                  </Field>
                  {form.bountymode === 'mystery' && (
                    <>
                      <Field label="Round bounties to">
                        <div className="relative">
                          <input
                            className="input pl-7"
                            type="number"
                            min="1"
                            step="1"
                            value={form.bountyroundingdenomination}
                            onChange={(e) => setForm((current) => ({ ...current, bountyroundingdenomination: e.target.value }))}
                          />
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-pit-muted">$</span>
                        </div>
                      </Field>
                      <Field label="Minimum bounty">
                        <div className="relative">
                          <input
                            className="input pl-7"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.bountyminpayout}
                            onChange={(e) => setForm((current) => ({ ...current, bountyminpayout: e.target.value }))}
                          />
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-pit-muted">$</span>
                        </div>
                      </Field>
                    </>
                  )}
                  <Field label="Bounties start">
                    <select
                      className="input"
                      value={form.bountystartplace ? 'placement' : 'field'}
                      onChange={(e) => setForm((current) => ({
                        ...current,
                        bountystartplace: e.target.value === 'placement'
                          ? (current.bountystartplace || String(midGameBountyStartPlace || 10))
                          : '',
                      }))}
                    >
                      <option value="field">{midGameBountyStartPlace ? `Remaining field (${formatOrdinal(midGameBountyStartPlace)} place on)` : 'Whole field'}</option>
                      <option value="placement">At a specific knockout</option>
                    </select>
                  </Field>
                  {form.bountystartplace && (
                    <Field label="Start at placement">
                      <input
                        className="input"
                        type="number"
                        min="2"
                        max={midGameBountyStartPlace ?? undefined}
                        step="1"
                        value={form.bountystartplace}
                        onChange={(e) => setForm((current) => ({ ...current, bountystartplace: e.target.value }))}
                      />
                    </Field>
                  )}
                  {form.bountymode === 'manual' && estimatedBountyField > 0 && (
                    <p className="rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2 text-xs leading-5 text-pit-text sm:col-span-2">
                      Expected bounty liability: {formatMoney(standardBountyTotal)} across {estimatedBountyEligibleCount} eligible knockout{estimatedBountyEligibleCount === 1 ? '' : 's'}.
                      Cap: {formatMoney(standardBountyCap)} from {estimatedBountyField} max player{estimatedBountyField === 1 ? '' : 's'}.
                    </p>
                  )}
                  {(bountyCapError || bountyMinimumError) && (
                    <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300 sm:col-span-2">
                      {bountyCapError || bountyMinimumError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary text-sm" onClick={saveDetails} disabled={saving || Boolean(bountyMinimumError) || Boolean(bountyCapError) || Boolean(rebuyCutoffError)}>
              {saving ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-pit-border">
          <DetailRow icon={<CalendarDays size={14} />} label="Date" value={normalizeDate(tournament.tourneydate) ?? 'TBD'} />
          <DetailRow icon={<Clock3 size={14} />} label="Time" value={normalizeTime(tournament.tourneytime) ?? 'TBD'} />
          <DetailRow icon={<Coins size={14} />} label="Buy-in" value={formatMoney(tournament.buyin)} accent />
          <DetailRow icon={<Users size={14} />} label="Max players" value={tournament.maxplayers || 'Unlimited'} />
          <DetailRow label="Rake" value={formatMoney(toNumber(tournament.rake))} />
          <DetailRow label="Rebuy" value={tournament.rebuyprice > 0 ? `${formatMoney(tournament.rebuyprice)} / ${tournament.rebuychips} chips${tournament.rebuylastlevel ? ` through L${tournament.rebuylastlevel}` : ''}` : 'Not enabled'} />
          <DetailRow label="Add-on" value={tournament.addonprice > 0 ? `${formatMoney(tournament.addonprice)} / ${tournament.addonchips} chips` : 'Not enabled'} />
          <DetailRow label="Bounties" value={tournament.bountyenabled ? `${tournament.bountymode === 'mystery' ? 'Mystery' : 'Standard Knockout'} - ${formatBountyPool(tournament, bountyTotal)}${formatBountyStart(tournament)}${formatBountyMinimum(tournament)}` : 'Not enabled'} />
          {showTvBoard && <DetailRow label="TV board" value={tournament.tvdisplaycode ?? 'Unavailable'} />}
        </div>
      )}

      <Modal
        title="Delete Tournament"
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        footer={(
          <>
            <button type="button" className="btn-ghost text-sm" onClick={() => setConfirmDelete(false)}>Keep Tournament</button>
            <button
              type="button"
              className="btn-danger text-sm"
              disabled={deleting}
              onClick={() => {
                setConfirmDelete(false);
                onDelete({ notifyPlayers: registeredPlayerCount > 0 && notifyOnDelete });
              }}
            >
              {deleting ? 'Deleting...' : 'Delete Tournament'}
            </button>
          </>
        )}
      >
        <div className="space-y-4 text-sm text-pit-text">
          <p>
            This will permanently delete <span className="font-medium text-white">{tournament.name}</span>.
          </p>
          {registeredPlayerCount > 0 ? (
            <label className="flex items-start gap-3 rounded-xl border border-pit-border bg-pit-bg/40 p-3">
              <input
                className="mt-1 h-4 w-4 accent-pit-teal"
                type="checkbox"
                checked={notifyOnDelete}
                onChange={(event) => setNotifyOnDelete(event.target.checked)}
              />
              <span>
                <span className="block font-semibold text-white">Notify registered players</span>
                <span className="block text-xs text-pit-muted">
                  Send cancellation email and push alerts to {registeredPlayerCount} registered player{registeredPlayerCount === 1 ? '' : 's'}.
                </span>
              </span>
            </label>
          ) : (
            <p className="rounded-xl border border-pit-border bg-pit-bg/40 p-3 text-xs text-pit-muted">
              No players are registered, so no cancellation notifications will be sent.
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
  accent = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(90px,.8fr)_minmax(0,1.2fr)] items-start gap-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-pit-text">{icon}<span>{label}</span></div>
      <div className={`min-w-0 break-words text-right font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function normalizeTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function nowInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return `${date}T${time}`;
}

function hasTournamentStarted(tourneydate: string | null | undefined, tourneytime: string | null | undefined) {
  if (!tourneydate) return false;
  const effectiveTime = (tourneytime?.slice(0, 8) ?? '00:00:00').padEnd(8, ':00').slice(0, 8);
  return nowInAppTimezone() >= `${String(tourneydate).slice(0, 10)}T${effectiveTime}`;
}

function formatMoney(value: number) {
  return `$${toNumber(value).toFixed(2)}`;
}

function formatCompactNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0';
  if (Math.abs(numeric) < 1000) return numeric.toLocaleString();
  const compact = numeric / 1000;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}K`;
}

function formatOrdinal(value: number) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatBountyPool(tournament: Awaited<ReturnType<typeof api.getTournament>>, _bountyTotal: number) {
  if (tournament.bountymode === 'manual') {
    return `${formatMoney(toNumber(tournament.bountyprizepool))} per knockout`;
  }
  const configured = toNumber(tournament.bountyprizepool);
  const pool = tournament.bountypooltype === 'percent'
    ? `${configured.toFixed(2).replace(/\.00$/, '')}% of gross pot`
    : `${formatMoney(configured)} pool`;
  return `${pool}, rounded to ${formatMoney(toNumber(tournament.bountyroundingdenomination) || 5)}`;
}

function formatBountyStart(tournament: Awaited<ReturnType<typeof api.getTournament>>) {
  const startPlace = Number(tournament.bountystartplace);
  if (!Number.isFinite(startPlace) || startPlace <= 1) return '';
  return `, starts at ${ordinal(Math.round(startPlace))}`;
}

function formatBountyMinimum(tournament: Awaited<ReturnType<typeof api.getTournament>>) {
  const minPayout = toNumber(tournament.bountyminpayout);
  if (tournament.bountymode !== 'mystery' || minPayout <= 0) return '';
  return `, min ${formatMoney(minPayout)}`;
}

function ordinal(value: number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = value % 100;
  return `${value}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-2 ${className}`.trim()}>
      {label ? <span className="text-sm font-medium text-pit-text">{label}</span> : null}
      {children}
    </label>
  );
}

function LockHint() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-red-400"
      title="Locked. Too close to start time."
      aria-label="Locked. Too close to start time."
    >
      <Lock size={12} />
      Locked
    </span>
  );
}
