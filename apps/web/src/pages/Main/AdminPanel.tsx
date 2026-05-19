import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, MessageSquare, Mic2, Search, Shield, Trophy, Users } from 'lucide-react';
import { api, AccountTier, AdminFeedback, AdminFeedbackStatus, AdminUserSummary, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

type TierFilter = 'all' | AccountTier;
type FeedbackTypeFilter = 'all' | 'issue' | 'idea' | 'question';
type FeedbackSort = 'newest' | 'oldest' | 'unread';
type FeedbackView = 'active' | 'closed';

export default function AdminPanel() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'admins' | 'trial'>('all');
  const [defaultAiCreditsInput, setDefaultAiCreditsInput] = useState('');
  const [userAiCreditsInput, setUserAiCreditsInput] = useState('');
  const emailSearch = normalizeEmailSearch(search);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'users', emailSearch],
    queryFn: () => api.getAdminUsers(emailSearch || undefined),
  });
  const { data: feedbackData } = useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn: api.getAdminFeedback,
  });
  const { data: aiCreditSettings } = useQuery({
    queryKey: ['admin', 'settings', 'ai-credits'],
    queryFn: api.getAdminAiCreditSettings,
  });

  const summary = useMemo(() => buildSummary(users), [users]);
  const filteredUsers = useMemo(
    () => filterUsers(users, emailSearch ? '' : search, tierFilter, flagFilter, !emailSearch),
    [users, emailSearch, search, tierFilter, flagFilter]
  );
  const selectedUser = useMemo(
    () => filteredUsers.find((user) => user.userid === selectedUserId)
      ?? (emailSearch ? users.find((user) => user.userid === selectedUserId) : null)
      ?? filteredUsers[0]
      ?? (emailSearch ? users[0] : null)
      ?? null,
    [filteredUsers, selectedUserId, users]
  );

  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['admin', 'user', selectedUser?.userid],
    queryFn: () => api.getAdminUser(selectedUser!.userid),
    enabled: !!selectedUser?.userid,
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, tierid, issuperadmin, aicreditsremaining }: { userId: string; tierid?: number; issuperadmin?: boolean; aicreditsremaining?: number }) =>
      api.updateAdminUser(userId, { tierid, issuperadmin, aicreditsremaining }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', variables.userId] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const defaultAiCreditsMutation = useMutation({
    mutationFn: (defaultaicredits: number) => api.updateAdminAiCreditSettings({ defaultaicredits }),
    onSuccess: (result) => {
      qc.setQueryData(['admin', 'settings', 'ai-credits'], result);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const feedbackMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminFeedbackStatus }) =>
      api.updateAdminFeedback(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feedback'] });
      qc.invalidateQueries({ queryKey: ['admin', 'feedback', 'summary'] });
    },
  });

  const upcoming = detail?.tournaments.filter((tournament) => classifyTournament(tournament) === 'Upcoming') ?? [];
  const history = detail?.tournaments.filter((tournament) => classifyTournament(tournament) !== 'Upcoming') ?? [];
  const feedbackItems = feedbackData?.feedback ?? [];
  const feedbackNewCount = feedbackData?.newcount ?? 0;
  const defaultAiCredits = aiCreditSettings?.defaultaicredits ?? detail?.account.defaultaicredits ?? 0;

  useEffect(() => {
    if (aiCreditSettings) setDefaultAiCreditsInput(String(aiCreditSettings.defaultaicredits));
  }, [aiCreditSettings]);

  useEffect(() => {
    setUserAiCreditsInput(selectedUser ? String(detail?.account.aicreditsremaining ?? '') : '');
  }, [selectedUser?.userid, detail?.account.aicreditsremaining]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  if (error) {
    return (
      <div className="card mx-auto mt-10 max-w-xl text-center">
        <h2 className="text-lg font-semibold text-white">Admin did not load</h2>
        <p className="mt-2 text-sm text-pit-text">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase text-red-200">Superadmin tools</p>
          <h2 className="mt-1 text-lg font-semibold text-white">AI voice clip lab</h2>
          <p className="mt-1 text-sm text-pit-text">Generate reusable landing-page MP3 examples without charging visitors per click.</p>
        </div>
        <Link className="btn-primary px-4 py-2" to="/admin/voice-lab">
          <Mic2 size={16} />
          Open Voice Lab
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="Users" value={summary.total} icon={Users} />
        <SummaryTile label="Host" value={summary.host} />
        <SummaryTile label="Club / Pro" value={`${summary.club} / ${summary.pro}`} />
        <SummaryTile label="Trials" value={summary.trials} />
        <SummaryTile label="Superadmins" value={summary.admins} icon={Shield} accent />
        <SummaryTile label="New Feedback" value={feedbackNewCount} icon={MessageSquare} danger={feedbackNewCount > 0} />
      </section>

      <section className="rounded-xl border border-pit-border bg-pit-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-pit-muted">AI Credits</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Default allotment</h2>
            <p className="mt-1 text-sm text-pit-text">Used when a user has no manual credit override yet.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64 sm:flex-row">
            <input
              className="input"
              type="number"
              min="0"
              value={defaultAiCreditsInput}
              onChange={(event) => setDefaultAiCreditsInput(event.target.value)}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={defaultAiCreditsMutation.isPending}
              onClick={() => defaultAiCreditsMutation.mutate(toWholeNumber(defaultAiCreditsInput))}
            >
              Save Default
            </button>
          </div>
        </div>
        {defaultAiCreditsMutation.error && <p className="mt-2 text-sm text-red-300">{defaultAiCreditsMutation.error.message}</p>}
        <p className="mt-2 text-xs text-pit-muted">Current default: {defaultAiCredits}</p>
      </section>

      <FeedbackPanel
        feedback={feedbackItems}
        newCount={feedbackNewCount}
        pendingId={feedbackMutation.variables?.id}
        isPending={feedbackMutation.isPending}
        error={feedbackMutation.error?.message}
        onStatusChange={(id, status) => feedbackMutation.mutate({ id, status })}
      />

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
                className={userRowClass(user, selectedUser?.userid === user.userid)}
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
                  <Stat label="AI Credits" value={detail.account.aicreditsremaining ?? 0} accent={(detail.account.aicreditsremaining ?? 0) > 0} />
                  <Stat label="Club Features" value={detail.account.canuseclubfeatures ? 'Enabled' : 'Locked'} accent={detail.account.canuseclubfeatures} />
                  <Stat label="Email" value={formatEmail(detail.account.emailaddress)} mono />
                </div>
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-pit-border bg-pit-card/60 p-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-pit-muted">Adjust AI credits</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={userAiCreditsInput}
                      onChange={(event) => setUserAiCreditsInput(event.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary shrink-0"
                      disabled={updateMutation.isPending || !selectedUser}
                      onClick={() => updateMutation.mutate({ userId: selectedUser.userid, aicreditsremaining: toWholeNumber(userAiCreditsInput) })}
                    >
                      Save Credits
                    </button>
                    <button
                      type="button"
                      className="btn-ghost shrink-0"
                      disabled={updateMutation.isPending || !selectedUser}
                      onClick={() => {
                        setUserAiCreditsInput(String(defaultAiCredits));
                        updateMutation.mutate({ userId: selectedUser.userid, aicreditsremaining: defaultAiCredits });
                      }}
                    >
                      Reset to Default
                    </button>
                  </div>
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
  danger = false,
}: {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  accent?: boolean;
  danger?: boolean;
}) {
  const valueClass = danger ? 'text-red-300' : accent ? 'text-pit-teal' : 'text-white';
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
        {Icon ? <Icon size={15} className={danger ? 'text-red-300' : accent ? 'text-pit-teal' : 'text-pit-muted'} /> : null}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function FeedbackPanel({
  feedback,
  newCount,
  pendingId,
  isPending,
  error,
  onStatusChange,
}: {
  feedback: AdminFeedback[];
  newCount: number;
  pendingId?: string;
  isPending: boolean;
  error?: string;
  onStatusChange: (id: string, status: AdminFeedbackStatus) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<FeedbackTypeFilter>('all');
  const [view, setView] = useState<FeedbackView>('active');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<FeedbackSort>('unread');
  const activeFeedback = useMemo(() => feedback.filter((item) => item.status !== 'closed'), [feedback]);
  const closedFeedback = useMemo(() => feedback.filter((item) => item.status === 'closed'), [feedback]);
  const scopedFeedback = view === 'closed' ? closedFeedback : activeFeedback;
  const counts = useMemo(() => buildFeedbackCounts(scopedFeedback), [scopedFeedback]);
  const visibleFeedback = useMemo(
    () => sortFeedback(
      scopedFeedback.filter((item) => {
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        const matchesStatus = !unreadOnly || item.status === 'new';
        return matchesType && matchesStatus;
      }),
      sort
    ),
    [scopedFeedback, sort, typeFilter, unreadOnly]
  );
  const grouped = useMemo(() => groupFeedbackByType(visibleFeedback), [visibleFeedback]);
  const showingLabel = unreadOnly ? `${visibleFeedback.length} unread shown` : `${visibleFeedback.length} shown`;

  return (
    <section className="rounded-lg border border-pit-border bg-pit-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={17} className={newCount > 0 ? 'text-red-300' : 'text-pit-teal'} />
          <h2 className="text-lg font-semibold text-white">Feedback</h2>
          {newCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
              {newCount} new
            </span>
          )}
        </div>
        <p className="text-xs text-pit-muted">{showingLabel} - {activeFeedback.length} active / {closedFeedback.length} closed</p>
      </div>

      <div className="mt-3 grid gap-2 xl:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-pit-border bg-pit-bg/60 p-1">
          {([
            ['active', `Active ${activeFeedback.length}`],
            ['closed', `Closed ${closedFeedback.length}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setView(value);
                if (value === 'closed') setUnreadOnly(false);
              }}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                view === value ? 'bg-pit-teal text-white' : 'text-pit-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-lg border border-pit-border bg-pit-bg/60 p-1">
          {([
            ['all', `All ${scopedFeedback.length}`],
            ['issue', `Issues ${counts.issue}`],
            ['idea', `Ideas ${counts.idea}`],
            ['question', `Questions ${counts.question}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                typeFilter === value ? 'bg-pit-teal text-white' : 'text-pit-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setUnreadOnly((value) => !value)}
          disabled={view === 'closed'}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            unreadOnly
              ? 'border-red-300/30 bg-red-500/10 text-red-200'
              : view === 'closed'
                ? 'cursor-not-allowed border-pit-border bg-pit-bg/40 text-pit-muted/60'
                : 'border-pit-border bg-pit-bg/60 text-pit-text hover:border-pit-muted hover:text-white'
          }`}
        >
          Unread only {newCount > 0 ? `(${newCount})` : ''}
        </button>

        <select
          className="input h-full min-h-10 text-xs"
          value={sort}
          onChange={(event) => setSort(event.target.value as FeedbackSort)}
        >
          <option value="unread">Unread first</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {feedback.length === 0 ? (
        <div className="mt-3 rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-8 text-center text-sm text-pit-text">
          No feedback yet.
        </div>
      ) : visibleFeedback.length === 0 ? (
        <div className="mt-3 rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-8 text-center text-sm text-pit-text">
          No feedback matches those filters.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {grouped.map((group) => (
            <section key={group.type} className="rounded-lg border border-pit-border bg-pit-bg/30 p-2">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  {feedbackTypeLabel(group.type)}
                </h3>
                <span className="text-xs text-pit-muted">
                  {group.items.filter((item) => item.status === 'new').length} unread / {group.items.length} total
                </span>
              </div>
              <div className="grid gap-2 xl:grid-cols-2">
                {group.items.map((item) => (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    busy={isPending && pendingId === item.id}
                    onStatusChange={onStatusChange}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function FeedbackCard({
  item,
  busy,
  onStatusChange,
}: {
  item: AdminFeedback;
  busy: boolean;
  onStatusChange: (id: string, status: AdminFeedbackStatus) => void;
}) {
  const isNew = item.status === 'new';
  const isClosed = item.status === 'closed';
  return (
    <article
      className={`rounded-lg border px-3 py-3 ${
        isNew ? 'border-red-400/30 bg-red-500/5' : isClosed ? 'border-pit-border bg-pit-bg/25 opacity-80' : 'border-pit-border bg-pit-bg/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${feedbackTypeClass(item.type)}`}>
              {item.type}
            </span>
            {isNew ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                New
              </span>
            ) : isClosed ? (
              <span className="rounded-full bg-pit-border/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pit-muted">
                Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                <CheckCircle2 size={11} />
                Looked at
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-white">{item.message}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {!isClosed && (
            <button
              type="button"
              className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                isNew
                  ? 'border-red-300/30 text-red-200 hover:bg-red-500/10'
                  : 'border-pit-border text-pit-muted hover:border-pit-muted hover:text-white'
              }`}
              disabled={busy}
              onClick={() => onStatusChange(item.id, isNew ? 'looked_at' : 'new')}
            >
              {isNew ? 'Mark looked at' : 'Mark new'}
            </button>
          )}
          <button
            type="button"
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
              isClosed
                ? 'border-pit-border text-pit-muted hover:border-pit-muted hover:text-white'
                : 'border-pit-border text-pit-muted hover:border-red-300/30 hover:text-red-200'
            }`}
            disabled={busy}
            onClick={() => onStatusChange(item.id, isClosed ? 'looked_at' : 'closed')}
          >
            {isClosed ? 'Reopen' : 'Close'}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-pit-muted">
        <span>{item.displayname || 'Unknown user'}</span>
        <span>{formatEmail(item.emailaddress)}</span>
        <span>{formatDateTime(item.createdat)}</span>
        {item.pageurl && (
          <a href={item.pageurl} target="_blank" rel="noreferrer" className="text-pit-teal hover:text-white">
            {compactUrl(item.pageurl)}
          </a>
        )}
      </div>
    </article>
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
      tier === 'pro'
        ? 'bg-purple-400/15 text-purple-200'
        : tier === 'club'
          ? 'bg-pit-teal/15 text-pit-teal'
          : 'bg-pit-border/40 text-pit-text'
    }`}>
      {formatTier(tier)}
    </span>
  );
}

function userRowClass(user: AdminUserSummary, active: boolean) {
  const base = 'w-full rounded-lg border px-3 py-2.5 text-left transition-colors';
  if (active) {
    if (user.accounttier === 'pro') return `${base} border-purple-300/60 bg-purple-500/15 shadow-[0_0_0_1px_rgba(216,180,254,0.16)]`;
    if (user.accounttier === 'club') return `${base} border-pit-teal bg-pit-teal/12 shadow-[0_0_0_1px_rgba(20,184,166,0.16)]`;
    return `${base} border-pit-teal bg-pit-teal/10`;
  }
  if (user.accounttier === 'pro') return `${base} border-purple-300/25 bg-purple-500/8 hover:border-purple-300/50`;
  if (user.accounttier === 'club') return `${base} border-pit-teal/25 bg-pit-teal/7 hover:border-pit-teal/50`;
  return `${base} border-pit-border bg-pit-bg/40 hover:border-pit-muted`;
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

function filterUsers(users: AdminUserSummary[], search: string, tierFilter: TierFilter, flagFilter: 'all' | 'admins' | 'trial', hideUnnamed: boolean) {
  const needle = search.trim().toLowerCase();
  return users
    .filter((user) => {
      if (hideUnnamed && !hasUsableDisplayName(user)) return false;
      const matchesSearch = !needle
        || (user.displayname ?? '').toLowerCase().includes(needle)
        || (user.emailaddress ?? '').toLowerCase().includes(needle);
      const matchesTier = tierFilter === 'all' || user.accounttier === tierFilter;
      const matchesFlag = flagFilter === 'all'
        || (flagFilter === 'admins' && user.issuperadmin)
        || (flagFilter === 'trial' && user.trialactive);
      return matchesSearch && matchesTier && matchesFlag;
    })
    .sort((a, b) => {
      const tierDiff = tierRank(b.accounttier) - tierRank(a.accounttier);
      if (tierDiff !== 0) return tierDiff;
      if (a.issuperadmin !== b.issuperadmin) return a.issuperadmin ? -1 : 1;
      return String(a.displayname ?? a.emailaddress ?? '').localeCompare(String(b.displayname ?? b.emailaddress ?? ''));
    });
}

function hasUsableDisplayName(user: AdminUserSummary) {
  const name = String(user.displayname ?? '').trim();
  if (!name) return false;
  if (name === user.emailaddress) return false;
  if (name.toLowerCase() === 'email encrypted') return false;
  return true;
}

function tierRank(tier: AccountTier | undefined) {
  if (tier === 'pro') return 3;
  if (tier === 'club') return 2;
  return 1;
}

function normalizeEmailSearch(value: string) {
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}

function classifyTournament(tournament: Tournament) {
  if (!tournament.tourneydate) return 'Undated';
  if (String(tournament.tourneydate).slice(0, 10) >= todayInAppTimezone()) return 'Upcoming';
  return 'History';
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

function toWholeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function formatEmail(value: string | null | undefined) {
  return value || 'Email encrypted';
}

function buildFeedbackCounts(feedback: AdminFeedback[]) {
  return feedback.reduce(
    (counts, item) => {
      if (item.type === 'idea' || item.type === 'question' || item.type === 'issue') {
        counts[item.type] += 1;
      }
      return counts;
    },
    { issue: 0, idea: 0, question: 0 }
  );
}

function sortFeedback(feedback: AdminFeedback[], sort: FeedbackSort) {
  const copy = [...feedback];
  copy.sort((a, b) => {
    if (sort === 'unread' && a.status !== b.status) {
      return a.status === 'new' ? -1 : 1;
    }
    const aTime = new Date(a.createdat).getTime();
    const bTime = new Date(b.createdat).getTime();
    if (sort === 'oldest') return aTime - bTime;
    return bTime - aTime;
  });
  return copy;
}

function groupFeedbackByType(feedback: AdminFeedback[]) {
  const order = ['issue', 'question', 'idea'] as const;
  return order
    .map((type) => ({
      type,
      items: feedback.filter((item) => item.type === type),
    }))
    .filter((group) => group.items.length > 0);
}

function feedbackTypeLabel(type: string) {
  if (type === 'idea') return 'Ideas';
  if (type === 'question') return 'Questions';
  return 'Issues';
}

function feedbackTypeClass(type: string) {
  if (type === 'idea') return 'bg-pit-teal/15 text-pit-teal';
  if (type === 'question') return 'bg-yellow-300/15 text-yellow-200';
  return 'bg-red-400/15 text-red-300';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function todayInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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
