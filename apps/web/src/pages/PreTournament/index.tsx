import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CircleDollarSign, Clock3, QrCode, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';
import BlindTimer from './BlindTimer';
import CheckIn from './CheckIn';
import Payouts from './Payouts';
import Seating from './Seating';

type Tab = 'overview' | 'players' | 'blinds' | 'seating';

export default function PreTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const user = useAuthStore((state) => state.user);

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

  if (isLoading) return <Layout back="/"><LoadingSpinner className="mt-24" /></Layout>;
  if (!tournament) return <Layout back="/"><p className="mt-24 text-center text-pit-text">Tournament not found.</p></Layout>;

  const isOwner = tournament.ownerid === user?.guid;
  const lobbyUrl = `${window.location.origin}/lobby/${id}`;
  const payUrl = `${window.location.origin}/pay/${id}`;

  const checkedIn = players.filter((player) => player.checkedin).length;
  const knockedOut = players.filter((player) => player.placed != null).length;
  const activePlayers = Math.max(checkedIn - knockedOut, 0);
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length;
  const grossPot = (toNumber(tournament.buyin) * checkedIn)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const totalPot = Math.max(grossPot - toNumber(tournament.rake), 0);

  const finishers = useMemo(
    () => players
      .filter((player) => player.placed != null)
      .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999))
      .slice(0, 5),
    [players]
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'players', label: 'Players' },
    { id: 'blinds', label: 'Blind Timer' },
    { id: 'seating', label: 'Seating' },
  ];

  return (
    <Layout title={tournament.name} back="/">
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

      {tab === 'overview' && (
        <div className="space-y-4">
          <section className="card overflow-hidden p-0">
            <div className="border-b border-pit-border bg-pit-surface/70 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <InfoChip icon={<CalendarDays size={14} />} label={normalizeDate(tournament.tourneydate) ?? 'Date TBD'} />
                    <InfoChip icon={<Clock3 size={14} />} label={normalizeTime(tournament.tourneytime) ?? 'Time TBD'} />
                    <InfoChip icon={<CircleDollarSign size={14} />} label={formatMoney(tournament.buyin)} />
                    <InfoChip icon={<Users size={14} />} label={`${players.length} registered`} />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">{tournament.name}</h2>
                </div>
                {isOwner && (
                  <div className="rounded-xl border border-pit-border bg-pit-bg/60 px-3 py-2.5 text-sm text-pit-text">
                    QR links below
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewStat label="Registered" value={players.length} />
              <OverviewStat label="Checked In" value={checkedIn} accent />
              <OverviewStat label="Still Playing" value={activePlayers} />
              <OverviewStat label="Current Pot" value={formatMoney(totalPot)} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
            <div className="space-y-4">
              <section className="card">
                <h3 className="mb-3 text-center text-lg font-semibold text-white">Field status</h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryTile label="Registered players" value={players.length} />
                  <SummaryTile label="Checked in" value={checkedIn} />
                  <SummaryTile label="Knocked out" value={knockedOut} />
                  <SummaryTile label="Still playing" value={activePlayers} />
                </div>
              </section>

              <Payouts tournamentId={id!} tournament={tournament} />
            </div>

            <div className="space-y-4">
              <section className="card">
                <h3 className="mb-3 text-lg font-semibold text-white">Tournament Details</h3>
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
              </section>

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

              {isOwner && (
                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <QRCard title="Player Lobby" subtitle="Share this for self-registration and event details." url={lobbyUrl} />
                  <QRCard title="Payment Tracker" subtitle="Use this to capture buy-ins, rebuys, and add-ons." url={payUrl} />
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'players' && <CheckIn tournamentId={id!} isOwner={isOwner} tournament={tournament} />}
      {tab === 'blinds' && <BlindTimer tournamentId={id!} isOwner={isOwner} />}
      {tab === 'seating' && <Seating tournamentId={id!} isOwner={isOwner} />}
    </Layout>
  );
}

function OverviewStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/70 px-3 py-3">
      <p className={`text-2xl font-bold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-pit-text">{label}</p>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/50 px-3 py-3 text-center">
      <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-white">{value}</p>
    </div>
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

function QRCard({ title, subtitle, url }: { title: string; subtitle: string; url: string }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-pit-text">{subtitle}</p>
        </div>
        <div className="rounded-lg border border-pit-border bg-pit-bg/70 p-2 text-pit-teal">
          <QrCode size={18} />
        </div>
      </div>
      <p className="mb-2 break-all font-mono text-xs text-pit-muted">{url}</p>
      <div className="inline-block rounded-xl bg-white p-3">
        <QRCodeSVG value={url} size={140} />
      </div>
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

function formatMoney(value: number) {
  return `$${toNumber(value).toFixed(2)}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
