import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api/client';
import BrandLockup from '../../components/BrandLockup';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import { featureFlags } from '../../features';
import { useAuthStore } from '../../store/auth';
import BlindTimer from './BlindTimer';
import CheckIn from './CheckIn';
import Payouts from './Payouts';
import RunTournament from './RunTournament';
import Seating from './Seating';

type Tab = 'details' | 'players' | 'blinds' | 'seating' | 'results' | 'run';

export default function PreTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('details');
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

  const finishers = useMemo(
    () => players
      .filter((player) => player.placed != null)
      .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999))
      .slice(0, 5),
    [players]
  );

  const updateTournamentMutation = useMutation({
    mutationFn: (data: Partial<Awaited<ReturnType<typeof api.getTournament>>>) => api.updateTournament(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
  const deleteTournamentMutation = useMutation({
    mutationFn: () => api.deleteTournament(id!),
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

  if (isLoading) return <Layout back="/"><LoadingSpinner className="mt-24" /></Layout>;
  if (!tournament) return <Layout back="/"><p className="mt-24 text-center text-pit-text">Tournament not found.</p></Layout>;

  const canManage = tournament.canmanage ?? tournament.ownerid === user?.guid;
  const scheduleLocked = hasTournamentStarted(tournament.tourneydate, tournament.tourneytime);
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const pocketAdminUrl = `${window.location.origin}/pocket-admin/${id}`;
  const showPocketAdmin = canManage;
  const showTvBoard = featureFlags.tvBoard;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'players', label: 'Players' },
    { id: 'blinds', label: 'Blind Structure' },
    { id: 'seating', label: 'Seating' },
    { id: 'results', label: 'Results' },
    { id: 'run', label: 'Run Tournament' },
  ];

  return (
    <Layout
      title={tournament.name}
      back="/"
      compactSidebar
      hideSidebar={tab === 'run'}
      headerRight={<BrandLockup compact showSlogan={false} className="items-center gap-2" />}
      mainWidthClassName="max-w-[1800px]"
    >
      <div className="relative z-10 mb-6 mt-2 overflow-x-auto border-b border-pit-border md:mt-3">
        <div className="flex gap-1">
          {tabs.map((currentTab) => (
            <button
              key={currentTab.id}
              className={tab === currentTab.id ? 'tab-active whitespace-nowrap' : 'tab-inactive whitespace-nowrap'}
              onClick={() => setTab(currentTab.id)}
            >
              {currentTab.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'details' && (
        <div className="space-y-4">
          <TournamentDetailsCard
            tournament={tournament}
            totalRebuys={totalRebuys}
            totalAddons={totalAddons}
            canManage={canManage}
            scheduleLocked={scheduleLocked}
            saving={updateTournamentMutation.isPending}
            deleting={deleteTournamentMutation.isPending}
            error={updateTournamentMutation.error?.message}
            deleteError={deleteTournamentMutation.error?.message}
            onSave={(data) => updateTournamentMutation.mutate(data)}
            onDelete={() => deleteTournamentMutation.mutate()}
            pocketAdminUrl={showPocketAdmin ? pocketAdminUrl : null}
            showTvBoard={showTvBoard}
          />

          <Payouts tournamentId={id!} tournament={tournament} />
        </div>
      )}

      {tab === 'players' && <CheckIn tournamentId={id!} isOwner={canManage} tournament={tournament} />}
      {tab === 'blinds' && <BlindTimer tournamentId={id!} isOwner={canManage} playerCount={players.length} tournament={tournament} />}
      {tab === 'seating' && <Seating tournamentId={id!} isOwner={canManage} />}
      {tab === 'results' && <ResultsPanel finishers={finishers} />}
      {tab === 'run' && <RunTournament tournamentId={id!} isOwner={canManage} tournament={tournament} players={players} />}
    </Layout>
  );
}

function TournamentDetailsCard({
  tournament,
  totalRebuys,
  totalAddons,
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
  canManage: boolean;
  scheduleLocked: boolean;
  saving: boolean;
  deleting: boolean;
  error?: string;
  deleteError?: string;
  onSave: (data: Partial<Awaited<ReturnType<typeof api.getTournament>>>) => void;
  onDelete: () => void;
  pocketAdminUrl: string | null;
  showTvBoard: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState(() => ({
    name: tournament.name ?? '',
    tourneydate: normalizeDate(tournament.tourneydate) ?? '',
    tourneytime: normalizeTimeInput(tournament.tourneytime),
    buyin: String(toNumber(tournament.buyin)),
    maxplayers: tournament.maxplayers ? String(tournament.maxplayers) : '',
    rebuyprice: String(toNumber(tournament.rebuyprice)),
    rebuychips: String(toNumber(tournament.rebuychips)),
    addonprice: String(toNumber(tournament.addonprice)),
    addonchips: String(toNumber(tournament.addonchips)),
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
      addonprice: String(toNumber(tournament.addonprice)),
      addonchips: String(toNumber(tournament.addonchips)),
    });
    setEditing(true);
  }

  function saveDetails() {
    onSave({
      name: form.name.trim(),
      tourneydate: form.tourneydate || undefined,
      tourneytime: form.tourneytime || undefined,
      buyin: toNumber(form.buyin),
      maxplayers: Number(form.maxplayers) || 0,
      rebuyprice: toNumber(form.rebuyprice),
      rebuychips: Number(form.rebuychips) || 0,
      addonprice: toNumber(form.addonprice),
      addonchips: Number(form.addonchips) || 0,
    });
    setEditing(false);
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">{tournament.name}</h2>
        </div>
        <div className="flex flex-col items-end gap-3">
          {pocketAdminUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2">
              <div className="inline-block rounded-md bg-white p-1">
                <QRCodeSVG value={pocketAdminUrl} size={56} />
              </div>
              <a
                className="text-sm font-medium text-pit-teal hover:text-pit-teal/80"
                href={pocketAdminUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Pocket Admin
              </a>
            </div>
          )}
          {canManage && (
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => editing ? setEditing(false) : startEditing()}>
                {editing ? 'Cancel' : 'Edit Details'}
              </button>
              {scheduleLocked && (
                <button type="button" className="btn-danger text-sm" onClick={() => setConfirmDelete(true)}>
                  Delete Tournament
                </button>
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
                <input className="input" type="time" value={form.tourneytime} disabled={scheduleLocked} onChange={(e) => setForm((current) => ({ ...current, tourneytime: e.target.value }))} />
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
            <Field label="Add-on price">
              <input className="input" type="number" min="0" step="0.01" value={form.addonprice} onChange={(e) => setForm((current) => ({ ...current, addonprice: e.target.value }))} />
            </Field>
            <Field label="Add-on chips">
              <input className="input" type="number" min="0" value={form.addonchips} onChange={(e) => setForm((current) => ({ ...current, addonchips: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary text-sm" onClick={saveDetails} disabled={saving}>
              {saving ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Row label="Date" value={normalizeDate(tournament.tourneydate) ?? 'TBD'} />
          <Row label="Time" value={normalizeTime(tournament.tourneytime) ?? 'TBD'} />
          <Row label="Buy-in" value={formatMoney(tournament.buyin)} />
          <Row label="Rake" value={formatMoney(toNumber(tournament.rake))} />
          <Row label="Max players" value={tournament.maxplayers || 'Unlimited'} />
          <Row
            label="Rebuy"
            value={tournament.rebuyprice > 0 ? `${formatMoney(tournament.rebuyprice)} / ${tournament.rebuychips} chips` : 'Not enabled'}
          />
          <Row
            label="Add-on"
            value={tournament.addonprice > 0 ? `${formatMoney(tournament.addonprice)} / ${tournament.addonchips} chips` : 'Not enabled'}
          />
          <Row label="Rebuys taken" value={totalRebuys} />
          <Row label="Add-ons taken" value={totalAddons} />
          {showTvBoard && (
            <Row
              label="TV board"
              value={
                <div className="text-right space-y-2">
                  <div className="font-mono tracking-[0.2em] text-white">{tournament.tvdisplaycode ?? 'UNAVAILABLE'}</div>
                  {tournament.tvdisplaycode ? (
                    <a
                      className="text-xs text-pit-teal hover:text-pit-teal/80"
                      href={`/tv/${tournament.tvdisplaycode}`}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                onDelete();
              }}
            >
              {deleting ? 'Deleting...' : 'Delete Tournament'}
            </button>
          </>
        )}
      >
        <p className="text-sm text-pit-text">
          This will permanently delete <span className="font-medium text-white">{tournament.name}</span> and notify all registered player email addresses that the tournament was cancelled.
        </p>
      </Modal>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-pit-border/40 pt-3 text-sm first:border-0 first:pt-0">
      <span className="text-pit-muted">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function ResultsPanel({ finishers }: { finishers: { userid: string; displayname?: string; emailaddress: string; placed: number | null }[] }) {
  return (
    <section className="card">
      <h3 className="mb-3 text-lg font-semibold text-white">Results</h3>
      {finishers.length === 0 ? (
        <p className="text-sm text-pit-text">Results will appear here once players start finishing.</p>
      ) : (
        <div className="space-y-1.5">
          {finishers.map((player) => (
            <div key={player.userid} className="flex items-center justify-between rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{player.displayname ?? player.emailaddress ?? 'Guest Player'}</p>
                <p className="text-xs text-pit-text">Placed #{player.placed}</p>
              </div>
              <span className="badge bg-red-900/40 text-red-300">#{player.placed}</span>
            </div>
          ))}
        </div>
      )}
    </section>
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
  return nowInAppTimezone() >= `${tourneydate}T${effectiveTime}`;
}

function formatMoney(value: number) {
  return `$${toNumber(value).toFixed(2)}`;
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
