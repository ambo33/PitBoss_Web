import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, AccountTier, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function AdminPanel() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.getAdminUsers,
  });

  const selectedUser = useMemo(
    () => users.find((user) => user.userid === selectedUserId) ?? users[0] ?? null,
    [users, selectedUserId]
  );

  const { data: detail, isLoading: detailLoading } = useQuery({
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

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <span className="text-sm text-pit-muted">{users.length} accounts</span>
        </div>
        <div className="space-y-2">
          {users.map((user) => (
            <button
              key={user.userid}
              type="button"
              onClick={() => setSelectedUserId(user.userid)}
              className={`w-full rounded-lg border px-3 py-3 text-left ${
                selectedUser?.userid === user.userid
                  ? 'border-pit-teal bg-pit-teal/10'
                  : 'border-pit-border bg-pit-bg/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{user.displayname ?? user.emailaddress}</p>
                  <p className="truncate text-xs text-pit-muted">{user.emailaddress}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  user.accounttier === 'host' ? 'bg-pit-border/40 text-pit-text' : 'bg-pit-teal/15 text-pit-teal'
                }`}>
                  {formatTier(user.accounttier)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-pit-text">
                <span>{user.groupcount} groups</span>
                <span>{user.upcominghostedcount} upcoming hosted</span>
                <span>{user.hostedtournamentcount} hosted total</span>
                {user.trialactive && <span className="text-yellow-300">trial {user.trialhostedremaining} left</span>}
                {user.issuperadmin && <span className="text-red-300">admin</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        {!selectedUser || detailLoading || !detail ? (
          <LoadingSpinner className="mt-12" />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{detail.account.displayname}</h2>
                <p className="text-sm text-pit-muted">{detail.account.emailaddress}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <TierButton
                  label="Host"
                  active={detail.account.tierid === 1}
                  onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 1 })}
                />
                <TierButton
                  label="Club"
                  active={detail.account.tierid === 2}
                  onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 2 })}
                />
                <TierButton
                  label="Pro"
                  active={detail.account.tierid === 3}
                  onClick={() => updateMutation.mutate({ userId: selectedUser.userid, tierid: 3 })}
                />
                <TierButton
                  label={detail.account.issuperadmin ? 'Revoke Admin' : 'Make Admin'}
                  active={Boolean(detail.account.issuperadmin)}
                  onClick={() => updateMutation.mutate({ userId: selectedUser.userid, issuperadmin: !detail.account.issuperadmin })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Tier" value={formatTier(detail.account.accounttier)} />
              <Stat label="Hosted Total" value={detail.account.hostedtournamentcount ?? 0} />
              <Stat label="Trial Remaining" value={detail.account.trialhostedremaining ?? 0} />
              <Stat label="Club Features" value={detail.account.canuseclubfeatures ? 'Enabled' : 'Locked'} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Groups</h3>
                <div className="space-y-2">
                  {detail.groups.length === 0 ? (
                    <p className="text-sm text-pit-text">No groups.</p>
                  ) : detail.groups.map((group) => (
                    <div key={group.groupid} className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{group.name}</p>
                        <span className="text-xs text-pit-muted">{group.membercount ?? 0} members</span>
                      </div>
                      <p className="mt-1 text-xs text-pit-text">
                        {group.isadmin ? 'Admin' : 'Member'} - {group.approved ? 'Approved' : 'Pending'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Tournaments</h3>
                <div className="space-y-2">
                  {detail.tournaments.length === 0 ? (
                    <p className="text-sm text-pit-text">No tournaments.</p>
                  ) : detail.tournaments.map((tournament) => (
                    <div key={tournament.tournamentid} className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{tournament.name}</p>
                        <span className="text-xs text-pit-muted">{classifyTournament(tournament)}</span>
                      </div>
                      <p className="mt-1 text-xs text-pit-text">
                        {tournament.isowner ? 'Host' : tournament.isregistered ? 'Registered' : 'Viewer'} - {tournament.playercount ?? 0} players
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TierButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
        active
          ? 'border-pit-teal bg-pit-teal/15 text-pit-teal'
          : 'border-pit-border bg-pit-bg/40 text-pit-text'
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function classifyTournament(tournament: Tournament) {
  if (tournament.completed) return 'History';
  if (!tournament.tourneydate) return 'Undated';
  const comparisonTime = normalizeTimeForComparison(tournament.tourneytime);
  const now = nowInAppTimezone();
  return `${tournament.tourneydate.slice(0, 10)}T${comparisonTime}` >= now ? 'Upcoming' : 'History';
}

function formatTier(tier: AccountTier | undefined) {
  if (tier === 'club') return 'Club';
  if (tier === 'pro') return 'Pro';
  return 'Host';
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
