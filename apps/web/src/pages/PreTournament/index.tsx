import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Home, Lock, LogOut, Menu, Play, Shield, Timer, User, Users } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import QuarterHourTimeSelect from '../../components/QuarterHourTimeSelect';
import { featureFlags } from '../../features';
import { useAuthStore } from '../../store/auth';
import { isEnabledFlag } from '../../utils/flags';
import BlindTimer from './BlindTimer';
import CheckIn from './CheckIn';
import Payouts from './Payouts';
import RunTournament from './RunTournament';

type Tab = 'details' | 'players' | 'blinds' | 'run';

export default function PreTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTab = location.state && typeof location.state === 'object' && 'tab' in location.state
    ? location.state.tab
    : undefined;
  const [tab, setTab] = useState<Tab>(requestedTab === 'run' ? 'run' : 'details');
  const user = useAuthStore((state) => state.user);
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

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
    if (!id) return;
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    const joinTournament = () => {
      socket.emit('join-tournament', id);
    };
    socket.on('connect', joinTournament);
    if (socket.connected) {
      joinTournament();
    }
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['players', id] });
      qc.invalidateQueries({ queryKey: ['seating', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc]);

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

  const canManage = tournament ? isEnabledFlag(tournament.canmanage) || tournament.ownerid === user?.guid : false;

  useEffect(() => {
    if (!canManage && tab === 'run') setTab('details');
  }, [canManage, tab]);

  if (isLoading) return <Layout back="/" hideMobileNav hideFeedback><LoadingSpinner className="mt-24" /></Layout>;
  if (!tournament) return <Layout back="/" hideMobileNav><p className="mt-24 text-center text-pit-text">Tournament not found.</p></Layout>;

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
      title={tournament.name}
      back="/"
      backLabel="Return to Command Center"
      hideSidebar
      hideMobileNav
      headerRight={<TournamentAccountMenu />}
      mainWidthClassName="max-w-7xl"
    >
      <div className="relative z-10 mb-5 mt-2 hidden border-b border-pit-border md:block md:mt-3">
        <div className="flex gap-1">
          {tabs.map((currentTab) => {
            const Icon = currentTab.Icon;
            return (
            <button
              key={currentTab.id}
              className={`flex min-w-0 items-center justify-center gap-1.5 border-b-2 px-1.5 py-3 text-[11px] font-semibold transition-colors sm:px-3 sm:text-sm md:min-w-36 md:justify-start ${
                tab === currentTab.id
                  ? 'border-pit-teal text-white'
                  : 'border-transparent text-pit-muted hover:text-pit-text'
              }`}
              onClick={() => setTab(currentTab.id)}
            >
              <Icon size={15} className="shrink-0" />
              <span className="truncate md:hidden">{currentTab.mobileLabel}</span>
              <span className="hidden md:inline">{currentTab.label}</span>
            </button>
          );
          })}
        </div>
      </div>

      {tab === 'details' && (
        <div className="space-y-4">
          <TournamentDetailsCard
            tournament={tournament}
            totalRebuys={totalRebuys}
            totalAddons={totalAddons}
            bountyTotal={bountyTotal}
            canManage={canManage}
            scheduleLocked={scheduleLocked}
            saving={updateTournamentMutation.isPending}
            deleting={deleteTournamentMutation.isPending}
            error={updateTournamentMutation.error?.message}
            deleteError={deleteTournamentMutation.error?.message}
            onSave={(data) => updateTournamentMutation.mutate(data)}
            onDelete={(data) => deleteTournamentMutation.mutate(data)}
            pocketAdminUrl={showPocketAdmin ? pocketAdminUrl : null}
            showTvBoard={showTvBoard}
          />

          <Payouts tournamentId={id!} tournament={tournament} />
        </div>
      )}

      {tab === 'players' && <CheckIn tournamentId={id!} isOwner={canManage} tournament={tournament} />}
      {tab === 'blinds' && <BlindTimer tournamentId={id!} isOwner={canManage} playerCount={players.length} tournament={tournament} />}
      {tab === 'run' && canManage && <RunTournament tournamentId={id!} isOwner={canManage} tournament={tournament} players={players} />}
      <div className="h-20 md:hidden" />
      <TournamentMobileNav tabs={tabs} activeTab={tab} onTabChange={setTab} dockToBottom />
    </Layout>
  );
}

function TournamentAccountMenu() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-pit-border bg-pit-card text-pit-text transition hover:border-pit-teal/50 hover:text-white"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open account menu"
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-pit-border bg-pit-card py-1 shadow-2xl">
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white" onClick={() => goHome()}>
            <Home size={15} />
            Command Center
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white" onClick={() => goHome({ tab: 'profile' })}>
            <User size={15} />
            Profile
          </button>
          {user?.issuperadmin && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-200 transition hover:bg-red-500/10 hover:text-red-100" onClick={() => goHome({ tab: 'admin' })}>
              <Shield size={15} />
              Admin
            </button>
          )}
          <div className="my-1 border-t border-pit-border" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-muted transition hover:bg-red-500/10 hover:text-red-300" onClick={handleLogout}>
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function TournamentMobileNav({
  tabs,
  activeTab,
  onTabChange,
  dockToBottom = false,
}: {
  tabs: { id: Tab; label: string; mobileLabel: string; Icon: React.ElementType }[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  dockToBottom?: boolean;
}) {
  return (
    <nav
      className={`fixed inset-x-0 z-40 grid border-t border-pit-teal/30 bg-[#122E30]/96 shadow-[0_-12px_32px_rgba(0,0,0,0.42)] backdrop-blur-md md:hidden ${dockToBottom ? 'bottom-0' : 'bottom-[4.75rem]'}`}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ id, mobileLabel, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`flex min-w-0 flex-col items-center gap-1 px-1 pt-2.5 pb-3 text-[10px] font-semibold tracking-wide transition-colors duration-150 ${
              active ? 'text-white' : 'text-teal-100/65 hover:text-white'
            }`}
          >
            <div className={`flex h-7 w-11 items-center justify-center rounded-full transition-all duration-150 ${
              active ? 'bg-pit-teal/25 shadow-[0_0_24px_rgba(20,184,166,0.36)] ring-1 ring-pit-teal/40' : 'bg-black/15'
            }`}>
              <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
            </div>
            <span className="max-w-full truncate">{mobileLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TournamentDetailsCard({
  tournament,
  totalRebuys,
  totalAddons,
  bountyTotal,
  canManage,
  scheduleLocked,
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

  function saveDetails() {
    if (bountyMinimumError) return;
    if (rebuyCutoffError) return;
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
      bountymode: form.bountymode,
      bountyprizepool: toNumber(form.bountyprizepool),
      bountypooltype: form.bountypooltype,
      bountyroundingdenomination: toNumber(form.bountyroundingdenomination) || 5,
      bountystartplace: form.bountystartplace ? Number(form.bountystartplace) || null : null,
      bountyminpayout: toNumber(form.bountyminpayout),
    });
    setEditing(false);
  }

  const estimatedBountyField = Math.max(0, Number(form.maxplayers) || 0);
  const detailsRebuysEnabled = toNumber(form.rebuyprice) > 0 || Number(form.rebuychips) > 0;
  const rebuyCutoffError = detailsRebuysEnabled && !Number(form.rebuylastlevel)
    ? 'Set the final level where rebuys are allowed.'
    : '';
  const estimatedBountyEligibleCount = form.bountystartplace
    ? Math.min(Number(form.bountystartplace) || 0, estimatedBountyField)
    : estimatedBountyField;
  const estimatedBountyGross = (toNumber(form.buyin) * estimatedBountyField)
    + (toNumber(form.rebuyprice) * totalRebuys)
    + (toNumber(form.addonprice) * totalAddons);
  const estimatedBountyPool = form.bountypooltype === 'percent'
    ? (estimatedBountyGross * Math.min(100, Math.max(0, toNumber(form.bountyprizepool)))) / 100
    : toNumber(form.bountyprizepool);
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
    <section className="card overflow-hidden p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Tournament details</p>
          <h2 className="mt-1 truncate text-xl font-bold text-white sm:text-2xl">{tournament.name}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:items-end">
          {pocketAdminUrl && (
            <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-pit-border bg-pit-bg/50 px-2.5 py-2 lg:w-auto">
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
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => editing ? setEditing(false) : startEditing()}>
                {editing ? 'Cancel' : 'Edit Details'}
              </button>
              <button
                type="button"
                className="btn-danger px-3 py-2 text-xs"
                onClick={() => {
                  setNotifyOnDelete(registeredPlayerCount > 0);
                  setConfirmDelete(true);
                }}
              >
                Delete Tournament
              </button>
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
            <div className="space-y-3 rounded-xl border border-pit-border bg-pit-bg/50 p-3 sm:col-span-2">
              <label className="flex items-start gap-3">
                <input
                  className="mt-1 h-4 w-4 accent-pit-teal"
                  type="checkbox"
                  checked={form.bountyenabled}
                  onChange={(e) => setForm((current) => ({ ...current, bountyenabled: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-white">Enable bounties</span>
                </span>
              </label>
              {form.bountyenabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bounty mode">
                    <select className="input" value={form.bountymode} onChange={(e) => setForm((current) => ({ ...current, bountymode: e.target.value as 'manual' | 'mystery' }))}>
                      <option value="manual">Manual player bounties</option>
                      <option value="mystery">Mystery bounty pool</option>
                    </select>
                  </Field>
                  <Field label="Pool basis">
                    <select className="input" value={form.bountypooltype} onChange={(e) => setForm((current) => ({ ...current, bountypooltype: e.target.value as 'amount' | 'percent' }))}>
                      <option value="amount">Fixed dollar amount</option>
                      <option value="percent">% of gross pot</option>
                    </select>
                  </Field>
                  <Field label={form.bountypooltype === 'percent' ? 'Bounty pool percent' : form.bountymode === 'mystery' ? 'Mystery bounty pool' : 'Bounty pool'}>
                    <div className="relative">
                      <input
                        className={`input ${form.bountypooltype === 'percent' ? 'pr-8' : 'pl-7'}`}
                        type="number"
                        min="0"
                        max={form.bountypooltype === 'percent' ? '100' : undefined}
                        step="0.01"
                        value={form.bountyprizepool}
                        onChange={(e) => setForm((current) => ({ ...current, bountyprizepool: e.target.value }))}
                      />
                      <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-pit-muted ${form.bountypooltype === 'percent' ? 'right-3' : 'left-3'}`}>
                        {form.bountypooltype === 'percent' ? '%' : '$'}
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
                      onChange={(e) => setForm((current) => ({ ...current, bountystartplace: e.target.value === 'placement' ? (current.bountystartplace || '10') : '' }))}
                    >
                      <option value="field">Whole field</option>
                      <option value="placement">At a specific knockout</option>
                    </select>
                  </Field>
                  {form.bountystartplace && (
                    <Field label="Start at placement">
                      <input
                        className="input"
                        type="number"
                        min="2"
                        step="1"
                        value={form.bountystartplace}
                        onChange={(e) => setForm((current) => ({ ...current, bountystartplace: e.target.value }))}
                      />
                    </Field>
                  )}
                  {bountyMinimumError && (
                    <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300 sm:col-span-2">
                      {bountyMinimumError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary text-sm" onClick={saveDetails} disabled={saving || Boolean(bountyMinimumError) || Boolean(rebuyCutoffError)}>
              {saving ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <DetailTile label="Date" value={normalizeDate(tournament.tourneydate) ?? 'TBD'} />
          <DetailTile label="Time" value={normalizeTime(tournament.tourneytime) ?? 'TBD'} />
          <DetailTile label="Buy-in" value={formatMoney(tournament.buyin)} accent />
          <DetailTile label="Max players" value={tournament.maxplayers || 'Unlimited'} />
          <DetailTile label="Rake" value={formatMoney(toNumber(tournament.rake))} />
          <DetailTile
            label="Rebuy"
            value={tournament.rebuyprice > 0
              ? `${formatMoney(tournament.rebuyprice)} / ${tournament.rebuychips} chips${tournament.rebuylastlevel ? ` through L${tournament.rebuylastlevel}` : ''}`
              : 'Not enabled'}
          />
          <DetailTile label="Rebuys taken" value={totalRebuys} />
          <DetailTile
            label="Add-on"
            value={tournament.addonprice > 0 ? `${formatMoney(tournament.addonprice)} / ${tournament.addonchips} chips` : 'Not enabled'}
          />
          <DetailTile label="Add-ons taken" value={totalAddons} />
          <DetailTile
            label="Bounties"
            className="sm:col-span-2 xl:col-span-2"
            value={tournament.bountyenabled
              ? `${tournament.bountymode === 'mystery' ? 'Mystery' : 'Manual'} - ${formatBountyPool(tournament, bountyTotal)}${formatBountyStart(tournament)}${formatBountyMinimum(tournament)}`
              : 'Not enabled'}
          />
          {showTvBoard && (
            <DetailTile
              label="TV board"
              className="sm:col-span-2 xl:col-span-1"
              value={
                <div className="space-y-1">
                  <div className="font-mono tracking-[0.18em] text-white">{tournament.tvdisplaycode ?? 'UNAVAILABLE'}</div>
                  {tournament.tvdisplaycode ? (
                    <a className="text-xs text-pit-teal hover:text-pit-teal/80" href={`/tv/${tournament.tvdisplaycode}`} target="_blank" rel="noreferrer">
                      Open TV board
                    </a>
                  ) : (
                    <div className="text-xs text-pit-muted">Refresh if code is still generating</div>
                  )}
                </div>
              }
            />
          )}
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

function DetailTile({
  label,
  value,
  accent = false,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-pit-border bg-pit-bg/40 px-3 py-2.5 ${className}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted">{label}</div>
      <div className={`mt-1 min-w-0 break-words text-sm font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</div>
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

function formatBountyPool(tournament: Awaited<ReturnType<typeof api.getTournament>>, bountyTotal: number) {
  if (tournament.bountymode === 'manual') {
    return `${formatMoney(bountyTotal)} assigned`;
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
