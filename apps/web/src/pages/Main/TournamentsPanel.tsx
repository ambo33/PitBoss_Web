import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, DollarSign, ListOrdered, Medal, PlayCircle, Trophy, Users, X } from 'lucide-react';
import { api, Group, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

const SETUP_CARD_DISMISSED_KEY = 'thepokerplanner.dashboard.setup.dismissed';

export default function TournamentsPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [scheduleView, setScheduleView] = useState<'upcoming' | 'history'>('upcoming');
  const [setupCardDismissed, setSetupCardDismissed] = useState(() => {
    try {
      return localStorage.getItem(SETUP_CARD_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ['tournaments', 'mine'],
    queryFn: api.getTournaments,
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Tournament>) => api.createTournament(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      setShowCreate(false);
      navigate(`/tournament/${(res as { tournamentid: string }).tournamentid}`);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (tournament: Tournament) => (
      tournament.groupid ? api.groupRegister(tournament.tournamentid) : api.selfRegister(tournament.tournamentid)
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (tid: string) => api.leaveTournament(tid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const upcoming = mine.filter((t) => {
    return isUpcomingTournament(t);
  });

  const history = mine.filter((t) => !upcoming.some((future) => future.tournamentid === t.tournamentid));
  const scheduleList = useMemo(
    () => (scheduleView === 'history' ? [...history].sort(compareTournamentSchedule).reverse() : [...upcoming].sort(compareTournamentSchedule)),
    [history, scheduleView, upcoming]
  );
  const hostedUpcomingCount = upcoming.filter((tournament) => tournament.ownerid === me?.guid).length;
  const hostedTournamentLimitReached = !me?.issuperadmin && !me?.canuseclubfeatures && hostedUpcomingCount >= 1;
  const registeredUpcomingCount = upcoming.filter((tournament) => tournament.isregistered).length;
  const adminGroupCount = groups.filter((group) => group.isadmin).length;

  if (showCreate) {
    return (
      <CreateTournamentComposer
        groups={groups}
        me={me}
        onBack={() => setShowCreate(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error?.message}
      />
    );
  }

  return (
    <>
      <DashboardOverview
        me={me}
        groups={groups}
        upcomingCount={upcoming.length}
        historyCount={history.length}
        registeredUpcomingCount={registeredUpcomingCount}
        adminGroupCount={adminGroupCount}
        createDisabled={hostedTournamentLimitReached}
        setupCardDismissed={setupCardDismissed}
        scheduleView={scheduleView}
        onScheduleViewChange={setScheduleView}
        onCreate={() => setShowCreate(true)}
        onOpenGroups={() => navigate('/', { state: { tab: 'groups' } })}
        onDismissSetup={() => {
          setSetupCardDismissed(true);
          try {
            localStorage.setItem(SETUP_CARD_DISMISSED_KEY, 'true');
          } catch {
            // Best effort only. The visible state still dismisses for this session.
          }
        }}
      />

      {hostedTournamentLimitReached && (
        <p className="mb-4 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
          Host tier can host 1 upcoming tournament at a time. Move this event into history or upgrade to Club or Pro to host more.
        </p>
      )}

      {(loadingMine || scheduleList.length > 0 || scheduleView === 'upcoming' || scheduleView === 'history') && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-muted">
                {scheduleView === 'history' ? 'Tournament history' : 'Upcoming games'}
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                {scheduleView === 'history' ? 'Past games' : 'Your schedule'}
              </h2>
            </div>
            {(scheduleView === 'history' ? history.length : upcoming.length) > 0 && (
              <span className="rounded-full border border-pit-border bg-pit-surface px-2.5 py-1 text-xs font-semibold text-pit-text">
                {scheduleView === 'history' ? `${history.length} history` : `${upcoming.length} upcoming`}
              </span>
            )}
          </div>

          {loadingMine ? (
            <LoadingSpinner className="mt-16" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scheduleList.map((t) => (
                <TournamentCard
                  key={t.tournamentid}
                  t={t}
                  isUpcoming={scheduleView === 'upcoming'}
                  loading={registerMutation.isPending || leaveMutation.isPending}
                  onClick={() => navigate(`/tournament/${t.tournamentid}`)}
                  onRegister={() => registerMutation.mutate(t)}
                  onLeave={() => leaveMutation.mutate(t.tournamentid)}
                />
              ))}
              {scheduleList.length === 0 && <EmptyState view={scheduleView} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function DashboardOverview({
  me,
  groups,
  upcomingCount,
  historyCount,
  registeredUpcomingCount,
  adminGroupCount,
  createDisabled,
  setupCardDismissed,
  scheduleView,
  onScheduleViewChange,
  onCreate,
  onOpenGroups,
  onDismissSetup,
}: {
  me?: Awaited<ReturnType<typeof api.me>>;
  groups: Group[];
  upcomingCount: number;
  historyCount: number;
  registeredUpcomingCount: number;
  adminGroupCount: number;
  createDisabled: boolean;
  setupCardDismissed: boolean;
  scheduleView: 'upcoming' | 'history';
  onScheduleViewChange: (view: 'upcoming' | 'history') => void;
  onCreate: () => void;
  onOpenGroups: () => void;
  onDismissSetup: () => void;
}) {
  const firstName = getFirstName(me?.displayname);
  const showSupportCard = upcomingCount === 0 && !setupCardDismissed;
  const setupItems = [
    { label: 'Create a host group', complete: adminGroupCount > 0 },
    { label: 'Schedule a game', complete: upcomingCount > 0 },
    { label: 'Get players registered', complete: registeredUpcomingCount > 0 },
  ];

  return (
    <section className={`mb-5 grid gap-3 ${showSupportCard ? 'md:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
      <div className="overflow-hidden rounded-xl border border-pit-teal/25 bg-[radial-gradient(circle_at_top_left,rgba(20,184,181,0.16),transparent_34%),linear-gradient(135deg,rgba(18,46,48,0.96),rgba(24,24,30,0.96))] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-pit-teal">Command center</p>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {typeof me?.aicreditsremaining === 'number' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-pit-text">
                {me.aicreditsremaining} voice credits
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DashboardStat icon={Calendar} label="Upcoming" value={upcomingCount} active={scheduleView === 'upcoming'} onClick={() => onScheduleViewChange('upcoming')} />
          <DashboardStat icon={Users} label="Groups" value={groups.length} onClick={onOpenGroups} />
          <DashboardStat icon={Medal} label="History" value={historyCount} active={scheduleView === 'history'} onClick={() => onScheduleViewChange('history')} />
          <DashboardStat icon={ListOrdered} label="Leagues" value="Soon" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {adminGroupCount > 0 ? (
            <button
              type="button"
              className="btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onCreate}
              disabled={createDisabled}
              title={createDisabled ? 'Host tier can host 1 upcoming tournament at a time.' : undefined}
            >
              Create tournament
            </button>
          ) : (
            <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={onOpenGroups}>
              Set up group
            </button>
          )}
        </div>
      </div>

      {showSupportCard && (
        <div className="rounded-xl border border-pit-border bg-pit-surface/80 p-3 sm:p-4">
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-pit-muted">Ready when you are</p>
                <h2 className="mt-1 text-lg font-bold text-white">Set up the next poker night.</h2>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pit-border text-pit-muted transition hover:border-pit-teal/50 hover:text-white"
                onClick={onDismissSetup}
                aria-label="Hide setup tutorial"
                title="Hide setup tutorial"
              >
                <X size={15} />
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-pit-muted">
              Start with a group, then schedule the tournament and let ThePokerPlanner handle the boring parts.
            </p>
            <div className="mt-3 space-y-1.5">
              {setupItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-pit-border/70 bg-pit-bg/40 px-2.5 py-2">
                  <span className="text-xs text-pit-text">{item.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.complete ? 'bg-pit-teal/15 text-pit-teal' : 'bg-white/5 text-pit-muted'
                  }`}>
                    {item.complete ? 'Done' : 'Next'}
                  </span>
                </div>
              ))}
            </div>
          </>
        </div>
      )}
    </section>
  );
}

function DashboardStat({
  icon: Icon,
  label,
  value,
  active = false,
  onClick,
}: {
  icon: typeof Trophy;
  label: string;
  value: number | string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-pit-muted">
        <Icon size={12} />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold text-white">{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg border px-2.5 py-2 text-left transition ${
          active
            ? 'border-pit-teal/45 bg-pit-teal/10'
            : 'border-white/10 bg-black/18 hover:border-pit-teal/40 hover:bg-pit-teal/5'
        }`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-black/18 px-2.5 py-2">
      {content}
    </div>
  );
}

function TournamentCard({
  t,
  isUpcoming,
  loading,
  onClick,
  onRegister,
  onLeave,
}: {
  t: Tournament;
  isUpcoming: boolean;
  loading: boolean;
  onClick: () => void;
  onRegister: () => void;
  onLeave: () => void;
}) {
  const dateLabel = getDateKey(t.tourneydate);
  const hasDate = !!dateLabel;
  const hasBuyin = t.buyin > 0;
  const canOpen = !t.groupid || t.canmanage;
  const adminActionLabel = isUpcoming ? 'Run tournament' : 'Open tournament';
  const showAdminAction = canOpen;
  const showRegistrationAction = isUpcoming && !!t.groupid && !canOpen;

  return (
    <div
      onClick={canOpen ? onClick : undefined}
      className={`${canOpen ? 'card-hover cursor-pointer' : 'card cursor-default'} group ${
        t.isregistered ? 'border-pit-teal/45 bg-pit-teal/5' : ''
      }`}
    >
      <div className={`mb-4 h-0.5 -mx-4 -mt-4 rounded-t-xl ${
        t.isregistered
          ? 'bg-gradient-to-r from-pit-teal via-pit-teal/45 to-transparent'
          : 'bg-gradient-to-r from-pit-teal/60 via-pit-teal/20 to-transparent'
      }`} />

      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="line-clamp-2 font-bold leading-snug text-white">{t.name}</p>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {t.isregistered && (
            <span className="inline-flex items-center gap-1 rounded-full border border-pit-teal/40 bg-pit-teal/15 px-2 py-0.5 text-[11px] font-semibold text-pit-teal">
              <CheckCircle2 size={12} strokeWidth={2.5} />
              Registered
            </span>
          )}
          {hasBuyin && (
            <span className="flex items-center gap-0.5 text-sm font-bold text-pit-gold">
              <DollarSign size={13} strokeWidth={2.5} />
              {Number(t.buyin).toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {t.groupname && (
          <span className="chip">
            <Users size={10} />
            {t.groupname}
          </span>
        )}
        {hasDate && (
          <span className="chip">
            <Calendar size={10} />
            {dateLabel}
          </span>
        )}
        {t.tourneytime && (
          <span className="chip">
            <Clock size={10} />
            {formatTime12Hour(t.tourneytime)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-pit-border/60 pt-2.5">
        <span className="flex items-center gap-1 text-xs text-pit-text">
          <Users size={11} />
          {t.playercount ?? 0} registered
        </span>
        {(t.checkedincount ?? 0) > 0 && (
          <span className="text-xs font-medium text-pit-teal">{t.checkedincount} checked in</span>
        )}
      </div>

      {(showAdminAction || showRegistrationAction) && (
        <div className="mt-3 border-t border-pit-border/60 pt-3">
          {showAdminAction ? (
            <button
              type="button"
              className="btn-primary w-full gap-2"
              onClick={(event) => {
                event.stopPropagation();
                onClick();
              }}
            >
              {isUpcoming && <PlayCircle size={15} />}
              {adminActionLabel}
            </button>
          ) : (
            <button
              type="button"
              className={t.isregistered ? 'btn-ghost w-full' : 'btn-primary w-full'}
              disabled={loading}
              onClick={(event) => {
                event.stopPropagation();
                if (t.isregistered) {
                  onLeave();
                  return;
                }
                onRegister();
              }}
            >
              {t.isregistered ? 'Leave tournament' : 'Register'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view }: { view: 'upcoming' | 'history' }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-pit-border bg-pit-surface/45 px-4 py-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-pit-border bg-pit-bg/60">
        <Trophy size={21} className="text-pit-muted" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-white">{view === 'history' ? 'No history yet' : 'No tournaments yet'}</p>
        <p className="mt-1 text-sm text-pit-muted">
          {view === 'history' ? 'Completed and past-dated tournaments will appear here.' : 'Create one from the command center when you are ready.'}
        </p>
      </div>
    </div>
  );
}

function CreateTournamentComposer({
  groups,
  me,
  onBack,
  onSubmit,
  loading,
  error,
}: {
  groups: Group[];
  me?: Awaited<ReturnType<typeof api.me>>;
  onBack: () => void;
  onSubmit: (data: Partial<Tournament>) => void;
  loading: boolean;
  error?: string;
}) {
  const steps = ['Basics', 'Game', 'Options', 'Review'] as const;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    tourneydate: '',
    tourneytime: '',
    buyin: '',
    rake: '',
    rebuyprice: '',
    rebuychips: '',
    rebuylastlevel: '',
    addonprice: '',
    addonchips: '',
    maxplayers: '',
    maxplayersmode: '',
    registerself: true,
    playerselftracking: false,
    groupid: '',
    savedstructureid: '',
    notifygroup: true,
  });

  const selectedGroup = useMemo(
    () => groups.find((group) => group.groupid === form.groupid) ?? null,
    [groups, form.groupid]
  );
  const selectedGroupName = selectedGroup?.name ?? '';
  const canUseClubFeatures = Boolean(me?.issuperadmin || me?.canuseclubfeatures || me?.tierid === 2 || me?.tierid === 3);
  const maxPlayersCap = !me?.issuperadmin && !me?.canuseclubfeatures ? 8 : null;
  const { data: savedStructures = [] } = useQuery({
    queryKey: ['group', form.groupid, 'blind-structures'],
    queryFn: () => api.getGroupBlindStructures(form.groupid),
    enabled: Boolean(form.groupid),
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      playerselftracking: canUseClubFeatures && selectedGroup?.defaulttrackingmode === 'player',
      notifygroup: Boolean(selectedGroup),
      savedstructureid: '',
    }));
  }, [canUseClubFeatures, selectedGroup?.defaulttrackingmode, selectedGroup?.groupid]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({
      ...current,
      [key]:
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      name: form.name.trim(),
      tourneydate: form.tourneydate || undefined,
      tourneytime: form.tourneytime || undefined,
      buyin: Number(form.buyin) || 0,
      rake: Number(form.rake) || 0,
      rebuyprice: Number(form.rebuyprice) || 0,
      rebuychips: Number(form.rebuychips) || 0,
      rebuylastlevel: rebuysActive ? Number(form.rebuylastlevel) || null : null,
      addonprice: Number(form.addonprice) || 0,
      addonchips: Number(form.addonchips) || 0,
      maxplayers: form.maxplayersmode === 'unlimited' ? 0 : Number(form.maxplayers) || 0,
      registerself: form.registerself,
      playerselftracking: canUseClubFeatures ? form.playerselftracking : false,
      groupid: form.groupid || undefined,
      savedstructureid: form.savedstructureid || undefined,
      notifygroup: Boolean(form.groupid) && form.notifygroup,
    });
  }

  const basicsComplete = Boolean(form.name.trim() && form.tourneydate && form.tourneytime && form.groupid);
  const rebuysActive = Number(form.rebuyprice) > 0 || Number(form.rebuychips) > 0;
  const rebuyCutoffComplete = !rebuysActive || Number(form.rebuylastlevel) > 0;
  const maxPlayersComplete = form.maxplayersmode === 'unlimited' || (form.maxplayersmode === 'capped' && Number(form.maxplayers) > 0);
  const canAdvance = step === 0 ? basicsComplete : step === 1 ? maxPlayersComplete && rebuyCutoffComplete : true;
  const selectedStructure = savedStructures.find((structure) => structure.id === form.savedstructureid);
  const maxPlayersReview = form.maxplayersmode === 'unlimited' ? 'Unlimited' : form.maxplayers;
  const canOpenStep = (targetStep: number) => {
    if (targetStep <= step) return true;
    if (targetStep >= 1 && !basicsComplete) return false;
    if (targetStep >= 2 && !maxPlayersComplete) return false;
    return true;
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" className="btn-ghost gap-2 px-3 py-2" onClick={onBack}>
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (canOpenStep(index)) setStep(index);
              }}
              disabled={!canOpenStep(index)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                step === index ? 'border-pit-teal bg-pit-teal/15 text-pit-teal' : 'border-pit-border text-pit-muted'
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
      </div>

      <form id="create-tourney" onSubmit={submit} className="space-y-5 pb-24 sm:pb-6">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        <section className="rounded-xl border border-pit-border bg-pit-surface/70 p-4 sm:p-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-teal">Step {step + 1} of {steps.length}</p>
            <h2 className="text-xl font-semibold text-white">{steps[step]}</h2>
            <p className="text-sm text-pit-muted">
              {step === 0 && 'Name it, schedule it, and connect it to a group.'}
              {step === 1 && 'Set the buy-in, field size, rebuys, and add-ons.'}
              {step === 2 && 'Choose tracking, blind structure, registration, and notifications.'}
              {step === 3 && 'Confirm the tournament details before creating it.'}
            </p>
          </div>

          <div className="mt-5">
            {step === 0 && (
              <div className="space-y-4">
                <input className="input text-lg" placeholder="Tournament name" value={form.name} onChange={set('name')} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date"><input className="input" type="date" value={form.tourneydate} onChange={set('tourneydate')} required /></Field>
                  <Field label="Time"><input className="input" type="time" value={form.tourneytime} onChange={set('tourneytime')} required /></Field>
                </div>
                <Field label="Group">
                  <select className="input" value={form.groupid} onChange={set('groupid')} required>
                    <option value="">Choose a group</option>
                    {groups.map((group) => (
                      <option key={group.groupid} value={group.groupid}>{group.name}</option>
                    ))}
                  </select>
                </Field>
                {!basicsComplete && (
                  <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                    Add a tournament name, date, time, and group before continuing.
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Buy-in"><input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={form.buyin} onChange={set('buyin')} /></Field>
                <Field label="Rake"><input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={form.rake} onChange={set('rake')} /></Field>
                <Field label="Max players">
                  <select
                    className="input"
                    value={form.maxplayersmode}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      maxplayersmode: event.target.value,
                      maxplayers: event.target.value === 'unlimited' ? '' : current.maxplayers,
                    }))}
                    required
                  >
                    <option value="">Choose max players</option>
                    <option value="unlimited">Unlimited</option>
                    <option value="capped">Set a player cap</option>
                  </select>
                </Field>
                {form.maxplayersmode === 'capped' && (
                  <Field label="Player cap">
                    <input
                      className="input"
                      type="number"
                      placeholder="e.g. 16"
                      min="1"
                      max={maxPlayersCap ?? undefined}
                      value={form.maxplayers}
                      onChange={set('maxplayers')}
                      required
                    />
                  </Field>
                )}
                <Field label="Rebuy price"><input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={form.rebuyprice} onChange={set('rebuyprice')} /></Field>
                <Field label="Rebuy chips"><input className="input" type="number" placeholder="0" min="0" value={form.rebuychips} onChange={set('rebuychips')} /></Field>
                {rebuysActive && (
                  <Field label="Rebuys good through level">
                    <input
                      className="input"
                      type="number"
                      placeholder="e.g. 4"
                      min="1"
                      step="1"
                      value={form.rebuylastlevel}
                      onChange={set('rebuylastlevel')}
                      required
                    />
                  </Field>
                )}
                <Field label="Add-on price"><input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={form.addonprice} onChange={set('addonprice')} /></Field>
                <Field label="Add-on chips"><input className="input" type="number" placeholder="0" min="0" value={form.addonchips} onChange={set('addonchips')} /></Field>
                {!maxPlayersComplete && (
                  <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100 sm:col-span-2">
                    Choose Unlimited or set a max player count before continuing.
                  </p>
                )}
                {!rebuyCutoffComplete && (
                  <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100 sm:col-span-2">
                    Set the final level where rebuys are allowed.
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Stats tracking">
                    <select
                      className="input"
                      value={form.playerselftracking ? 'player' : 'standard'}
                      onChange={(event) => setForm((current) => ({ ...current, playerselftracking: canUseClubFeatures && event.target.value === 'player' }))}
                      disabled={!canUseClubFeatures}
                    >
                      <option value="standard">Standard tracking</option>
                      <option value="player">Player tracked stats</option>
                    </select>
                  </Field>
                  <Field label="Blind structure">
                    <select className="input" value={form.savedstructureid} onChange={set('savedstructureid')} disabled={!form.groupid}>
                      <option value="">Use calculator after creation</option>
                      {savedStructures.map((structure) => (
                        <option key={structure.id} value={structure.id}>{structure.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <ToggleRow
                  checked={form.registerself}
                  onChange={set('registerself')}
                  title="Register me"
                  description={selectedGroupName ? `Add me to ${selectedGroupName} right away.` : 'Add me as soon as it is created.'}
                />
                <ToggleRow
                  checked={Boolean(form.groupid) && form.notifygroup}
                  disabled={!form.groupid}
                  onChange={set('notifygroup')}
                  title="Email group members"
                  description={form.groupid ? 'Send a polished tournament announcement to approved group members.' : 'Choose a group first to email its members.'}
                  icon={<Bell size={16} />}
                />
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewItem label="Tournament" value={form.name || 'Untitled'} />
                <ReviewItem label="Group" value={selectedGroupName || 'Private'} />
                <ReviewItem label="Date and time" value={`${form.tourneydate || 'Date TBD'} ${form.tourneytime || ''}`.trim()} />
                <ReviewItem label="Buy-in" value={`$${Number(form.buyin || 0).toFixed(2)}`} />
                <ReviewItem label="Max players" value={maxPlayersReview || 'Not set'} />
                <ReviewItem label="Rebuys" value={rebuysActive ? `Through level ${form.rebuylastlevel || 'not set'}` : 'Not enabled'} />
                <ReviewItem label="Tracking" value={form.playerselftracking ? 'Player tracked stats' : 'Standard'} />
                <ReviewItem label="Blind structure" value={selectedStructure?.name || 'Calculator after creation'} />
                <ReviewItem label="Notifications" value={form.groupid && form.notifygroup ? 'Email group members' : 'No group email'} />
              </div>
            )}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-pit-border bg-pit-bg/95 px-4 py-3 backdrop-blur sm:static sm:rounded-xl sm:border sm:bg-pit-surface/90 sm:px-5">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <button type="button" className="btn-ghost gap-2 px-3 py-2" onClick={() => step === 0 ? onBack() : setStep((current) => current - 1)}>
              {step === 0 ? 'Cancel' : <><ChevronLeft size={15} /> Back</>}
            </button>
            {step < steps.length - 1 ? (
              <button type="button" className="btn-primary gap-2 px-4 py-2.5" disabled={!canAdvance} onClick={() => setStep((current) => current + 1)}>
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button type="submit" className="btn-primary px-4 py-2.5" disabled={loading || !basicsComplete || !maxPlayersComplete}>
                {loading ? 'Creating...' : 'Create tournament'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
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

function ToggleRow({
  checked,
  disabled,
  onChange,
  title,
  description,
  icon,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-3 ${disabled ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3">
        {icon && <div className="text-pit-teal">{icon}</div>}
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-pit-muted">{description}</p>
        </div>
      </div>
      <div className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors duration-150 ${checked ? 'bg-pit-teal' : 'bg-pit-border'}`}>
        <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-bg/45 px-3 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-pit-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function getDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function compareTournamentSchedule(a: Tournament, b: Tournament) {
  return getTournamentScheduleSortValue(a) - getTournamentScheduleSortValue(b);
}

function getTournamentScheduleSortValue(tournament: Tournament) {
  const date = getDateKey(tournament.tourneydate) ?? '9999-12-31';
  const time = tournament.tourneytime || '23:59';
  return new Date(`${date}T${time}`).getTime();
}

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] ?? '';
}

function isUpcomingTournament(tournament: Tournament): boolean {
  if (!tournament.tourneydate) return false;
  return String(tournament.tourneydate).slice(0, 10) >= todayInAppTimezone();
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

function formatTime12Hour(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}
