import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CircleDollarSign, Clock3 } from 'lucide-react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';
import BlindTimer from './BlindTimer';
import CheckIn from './CheckIn';
import Payouts from './Payouts';
import RunTournament from './RunTournament';
import Seating from './Seating';

type Tab = 'details' | 'players' | 'blinds' | 'seating' | 'results' | 'run';

export default function PreTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('details');
  const user = useAuthStore((state) => state.user);
  const qc = useQueryClient();

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
    refetchInterval: 30_000,
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  });

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

  if (isLoading) return <Layout back="/"><LoadingSpinner className="mt-24" /></Layout>;
  if (!tournament) return <Layout back="/"><p className="mt-24 text-center text-pit-text">Tournament not found.</p></Layout>;

  const canManage = tournament.canmanage ?? tournament.ownerid === user?.guid;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'players', label: 'Players' },
    { id: 'blinds', label: 'Blind Structure' },
    { id: 'seating', label: 'Seating' },
    { id: 'results', label: 'Results' },
    { id: 'run', label: 'Run Tournament' },
  ];

  return (
    <Layout title={tournament.name} back="/" compactSidebar mainWidthClassName="max-w-[1800px]">
      <div className="mb-6 overflow-x-auto border-b border-pit-border">
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
            saving={updateTournamentMutation.isPending}
            error={updateTournamentMutation.error?.message}
            onSave={(data) => updateTournamentMutation.mutate(data)}
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
  saving,
  error,
  onSave,
}: {
  tournament: Awaited<ReturnType<typeof api.getTournament>>;
  totalRebuys: number;
  totalAddons: number;
  canManage: boolean;
  saving: boolean;
  error?: string;
  onSave: (data: Partial<Awaited<ReturnType<typeof api.getTournament>>>) => void;
}) {
  const [editing, setEditing] = useState(false);
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
          <div className="flex flex-wrap gap-2">
            <InfoChip icon={<CalendarDays size={14} />} label={normalizeDate(tournament.tourneydate) ?? 'Date TBD'} />
            <InfoChip icon={<Clock3 size={14} />} label={normalizeTime(tournament.tourneytime) ?? 'Time TBD'} />
            <InfoChip icon={<CircleDollarSign size={14} />} label={formatMoney(tournament.buyin)} />
          </div>
          <h2 className="text-2xl font-semibold text-white">{tournament.name}</h2>
        </div>
        {canManage && (
          <button type="button" className="btn-ghost text-sm" onClick={() => editing ? setEditing(false) : startEditing()}>
            {editing ? 'Cancel' : 'Edit Details'}
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={form.tourneydate} onChange={(e) => setForm((current) => ({ ...current, tourneydate: e.target.value }))} />
            </Field>
            <Field label="Time">
              <input className="input" type="time" value={form.tourneytime} onChange={(e) => setForm((current) => ({ ...current, tourneytime: e.target.value }))} />
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
        </div>
      )}
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

function InfoChip({ icon, label }: { icon: React.ReactNode; label: string | number }) {
  return (
    <span className="chip">
      <span className="text-pit-teal">{icon}</span>
      <span>{label}</span>
    </span>
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
      <span className="text-sm font-medium text-pit-text">{label}</span>
      {children}
    </label>
  );
}
