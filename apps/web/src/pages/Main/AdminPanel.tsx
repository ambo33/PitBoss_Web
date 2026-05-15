import { useMemo, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Search, Shield, Trophy, Users } from 'lucide-react';
import { api, AccountTier, AdminUserSummary, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

type TierFilter = 'all' | AccountTier;

export default function AdminPanel() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'admins' | 'trial'>('all');
  const emailSearch = normalizeEmailSearch(search);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'users', emailSearch],
    queryFn: () => api.getAdminUsers(emailSearch || undefined),
  });

  const summary = useMemo(() => buildSummary(users), [users]);
  const filteredUsers = useMemo(
    () => filterUsers(users, emailSearch ? '' : search, tierFilter, flagFilter),
    [users, emailSearch, search, tierFilter, flagFilter]
  );
  const selectedUser = useMemo(
    () => filteredUsers.find((user) => user.userid === selectedUserId)
      ?? users.find((user) => user.userid === selectedUserId)
      ?? filteredUsers[0]
      ?? users[0]
      ?? null,
    [filteredUsers, selectedUserId, users]
  );

  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['admin', 'user', selectedUser?.userid],
    queryFn: () => api.getAdminUser(selectedUser!.userid),
    enabled: !!selectedUser?.userid,
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, tierid, issuperadmin }: { userId: string; tierid?: number; issuperadmin?: boolean }) =>
      api.updateAdminUser(userId, { tierid, issuperadmin }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', variables.userId] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  if (error) {
    return (
      <div className="card mx-auto mt-10 max-w-xl text-center">
        <h2 className="text-lg font-semibold text-white">Admin did not load</h2>
        <p className="mt-2 text-sm text-pit-text">{error.message}</p>
      </div>
    );
  }

  const upcoming = detail?.tournaments.filter((tournament) => classifyTournament(tournament) === 'Upcoming') ?? [];
  const history = detail?.tournaments.filter((tournament) => classifyTournament(tournament) !== 'Upcoming') ?? [];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile label="Users" value={summary.total} icon={Users} />
        <SummaryTile label="Host" value={summary.host} />
        <SummaryTile label="Club / Pro" value={`${summary.club} / ${summary.pro}`} />
        <SummaryTile label="Trials" value={summary.trials} />
        <SummaryTile label="Superadmins" value={summary.admins} icon={Shield} accent />
      </section>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="card flex min-h-[620px] flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Users</h2>
            <span className="text-sm text-pit-muted">
              {emailSearch ? `${filteredUsers.length} exact match${filteredUsers.length === 1 ? '' : 'es'}` : `${filteredUsers.length} of ${users.length}`}
            </span>
          </div>

          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pit-muted" />
            <input
              className="input pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email"
            />
          </label>

          <div className="grid grid-cols-4 gap-1 rounded-lg border border-pit-border bg-pit-bg/60 p-1">
            {(['all', 'host', 'club', 'pro'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold uppercase ${
                  tierFilter === tier ? 'bg-pit-teal text-white' : 'text-pit-muted hover:text-white'
                }`}
              >
                {tier === 'all' ? 'All' : formatTier(tier)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-pit-border bg-pit-bg/60 p-1">
            {([
              ['all', 'All'],
              ['admins', 'Admins'],
              ['trial', 'Trial'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFlagFilter(value)}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold uppercase ${
                  flagFilter === value ? 'bg-pit-teal text-white' : 'text-pit-muted hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {filteredUsers.length === 0 ? (
              <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-10 text-center text-sm text-pit-text">
                {emailSearch ? 'No account found for that email.' : 'No users match those filters.'}
              </div>
            ) : filteredUsers.map((user) => (
              <button
                key={user.userid}
                type="button"
                onClick={() => setSelectedUserId(user.userid)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedUser?.userid === user.userid
                    ? 'border-pit-teal bg-pit-teal/10'
                    : 'border-pit-border bg-pit-bg/40 hover:border-pit-muted'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{user.displayname ?? user.emailaddress}</p>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-pit-teal">{formatEmail(user.emailaddress)}</p>
                  </div>
                  <TierBadge tier={user.accounttier} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-pit-text">
                  <span>{numberValue(user.groupcount)} groups</span>
                  <span>{numberValue(user.upcominghostedcount)} upcoming</span>
                  <span>{numberValue(user.hostedtournamentcount)} hosted</span>
                  {user.trialactive && <span className="text-yellow-300">trial {numberValue(user.trialhostedremaining)} left</span>}
                  {user.issuperadmin && <span className="text-red-300">superadmin</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card min-h-[620px] space-y-4">
          {!selectedUser || detailLoading || !detail ? (
            detailError ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                {detailError.message}
              </div>
            ) : (
              <LoadingSpinner className="mt-12" />
            )
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-white">{detail.account.displayname}</h2>
                  <p className="mt-1 truncate font-mono text-sm text-pit-teal">{formatEmail(detail.account.emailaddress)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TierButton
                    label="Host"
                    active={detail.account.tierid === 1}
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 1 })}
                  />
                  <TierButton
                    label="Club"
                    active={detail.account.tierid === 2}
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 2 })}
                  />
                  <TierButton
                    label="Pro"
                    active={detail.account.tierid === 3}
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 3 })}
                  />
                  <TierButton
                    label={detail.account.issuperadmin ? 'Superadmin' : 'Make Superadmin'}
                    active={Boolean(detail.account.issuperadmin)}
                    disabled={updateMutation.isPending}
                    danger={Boolean(detail.account.issuperadmin)}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.userid, issuperadmin: !detail.account.issuperadmin })}
                  />
                </div>
              </div>

              {updateMutation.error && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                  {updateMutation.error.message}
                </div>
              )}

              <section className="rounded-lg border border-pit-border bg-pit-bg/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">Account</h3>
                  <span className="text-xs text-pit-muted">{detail.account.guid}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="Tier" value={formatTier(detail.account.accounttier)} />
                  <Stat label="Hosted Total" value={detail.account.hostedtournamentcount ?? 0} />
                  <Stat label="Trial Remaining" value={detail.account.trialhostedremaining ?? 0} />
                  <Stat label="Club Features" value={detail.account.canuseclubfeatures ? 'Enabled' : 'Locked'} accent={detail.account.canuseclubfeatures} />
                  <Stat label="Email" value={formatEmail(detail.account.emailaddress)} mono />
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <DetailSection title="Groups" empty={detail.groups.length === 0 ? 'No groups.' : null}>
                  {detail.groups.map((group) => (
                    <div key={group.groupid} className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-medium text-white">{group.name}</p>
                        <span className="shrink-0 text-xs text-pit-muted">{numberValue(group.membercount)} members</span>
                      </div>
                      <p className="mt-1 text-xs text-pit-text">
                        {group.isadmin ? 'Admin' : 'Member'} - {group.approved ? 'Approved' : 'Pending'}
                      </p>
                    </div>
                  ))}
                </DetailSection>

                <div className="space-y-4">
                  <DetailSection title="Upcoming Tournaments" empty={upcoming.length === 0 ? 'No upcoming tournaments.' : null}>
                    {upcoming.map((tournament) => <TournamentRow key={tournament.tournamentid} tournament={tournament} />)}
                  </DetailSection>
                  <DetailSection title="History" empty={history.length === 0 ? 'No tournament history.' : null}>
                    {history.slice(0, 8).map((tournament) => <TournamentRow key={tournament.tournamentid} tournament={tournament} />)}
                  </DetailSection>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
        {Icon ? <Icon size={15} className={accent ? 'text-pit-teal' : 'text-pit-muted'} /> : null}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function TierButton({
  label,
  active,
  disabled,
  danger = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const activeClass = danger
    ? 'border-red-300/40 bg-red-400/10 text-red-300'
    : 'border-pit-teal bg-pit-teal/15 text-pit-teal';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
        active ? activeClass : 'border-pit-border bg-pit-bg/40 text-pit-text hover:border-pit-muted hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function TierBadge({ tier }: { tier: AccountTier }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
      tier === 'host' ? 'bg-pit-border/40 text-pit-text' : 'bg-pit-teal/15 text-pit-teal'
    }`}>
      {formatTier(tier)}
    </span>
  );
}

function Stat({ label, value, accent = false, mono = false }: { label: string; value: string | number; accent?: boolean; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card/60 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
      <p className={`mt-1 break-words font-semibold ${mono ? 'font-mono text-sm' : 'text-lg'} ${accent || mono ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function DetailSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-pit-border bg-pit-bg/40 p-3">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white">{title}</h3>
      <div className="space-y-2">
        {empty ? <p className="text-sm text-pit-text">{empty}</p> : children}
      </div>
    </section>
  );
}

function TournamentRow({ tournament }: { tournament: Tournament }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{tournament.name}</p>
          <p className="mt-1 text-xs text-pit-text">
            {formatSchedule(tournament)} - {tournament.isowner ? 'Host' : tournament.isregistered ? 'Registered' : 'Viewer'} - {numberValue(tournament.playercount)} players
          </p>
          {tournament.groupname && <p className="mt-1 truncate text-xs text-pit-muted">{tournament.groupname}</p>}
        </div>
        <Link
          to={`/tournament/${tournament.tournamentid}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-pit-border px-2 py-1 text-xs font-semibold text-pit-teal hover:border-pit-teal/50"
        >
          <Trophy size={12} />
          Open
          <ExternalLink size={11} />
        </Link>
      </div>
    </div>
  );
}

function buildSummary(users: AdminUserSummary[]) {
  return users.reduce(
    (totals, user) => {
      totals.total += 1;
      totals[user.accounttier] += 1;
      if (user.trialactive) totals.trials += 1;
      if (user.issuperadmin) totals.admins += 1;
      return totals;
    },
    { total: 0, host: 0, club: 0, pro: 0, trials: 0, admins: 0 }
  );
}

function filterUsers(users: AdminUserSummary[], search: string, tierFilter: TierFilter, flagFilter: 'all' | 'admins' | 'trial') {
  const needle = search.trim().toLowerCase();
  return users.filter((user) => {
    const matchesSearch = !needle
      || (user.displayname ?? '').toLowerCase().includes(needle)
      || (user.emailaddress ?? '').toLowerCase().includes(needle);
    const matchesTier = tierFilter === 'all' || user.accounttier === tierFilter;
    const matchesFlag = flagFilter === 'all'
      || (flagFilter === 'admins' && user.issuperadmin)
      || (flagFilter === 'trial' && user.trialactive);
    return matchesSearch && matchesTier && matchesFlag;
  });
}

function normalizeEmailSearch(value: string) {
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}

function classifyTournament(tournament: Tournament) {
  if (tournament.completed) return 'History';
  if (!tournament.tourneydate) return 'Undated';
  const comparisonTime = normalizeTimeForComparison(tournament.tourneytime);
  const now = nowInAppTimezone();
  return `${String(tournament.tourneydate).slice(0, 10)}T${comparisonTime}` >= now ? 'Upcoming' : 'History';
}

function formatSchedule(tournament: Tournament) {
  const label = classifyTournament(tournament);
  if (!tournament.tourneydate) return label;
  const date = String(tournament.tourneydate).slice(0, 10);
  const time = normalizeTimeForDisplay(tournament.tourneytime);
  return time ? `${date} ${time}` : date;
}

function formatTier(tier: AccountTier | undefined) {
  if (tier === 'club') return 'Club';
  if (tier === 'pro') return 'Pro';
  return 'Host';
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function formatEmail(value: string | null | undefined) {
  return value || 'Email encrypted';
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
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeTimeForComparison(value: string | null | undefined): string {
  if (!value) return '23:59:59';
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return '23:59:59';
  const hours = String(Number(match[1])).padStart(2, '0');
  const minutes = match[2];
  const seconds = match[3] ?? '00';
  return `${hours}:${minutes}:${seconds}`;
}

function normalizeTimeForDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}
