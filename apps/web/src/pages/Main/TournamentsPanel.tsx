import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, ListOrdered, Medal, PlayCircle, Trophy, Users, X } from 'lucide-react';
import { api, CreateGameRequest, GameListItem, Group, League, LeagueScheduleEvent, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import QuarterHourTimeSelect from '../../components/QuarterHourTimeSelect';
import { isEnabledFlag } from '../../utils/flags';

const SETUP_CARD_DISMISSED_KEY = 'thepokerplanner.dashboard.setup.dismissed';

export type CommandCenterSection = 'upcoming' | 'groups' | 'history' | 'leagues';

interface TournamentsPanelProps {
  section?: CommandCenterSection;
  onSectionChange?: (section: CommandCenterSection) => void;
  renderSection?: (section: Extract<CommandCenterSection, 'groups' | 'leagues'>) => React.ReactNode;
  hideDashboard?: boolean;
  onCreateFlowChange?: (open: boolean) => void;
  onboardingActive?: boolean;
  createGameRequestId?: number;
  onStartGroupCreate?: () => void;
  onStartGroupInvite?: (groupId: string) => void;
  onStartFirstGame?: () => void;
  onCompleteOnboarding?: () => void;
}

export default function TournamentsPanel({
  section,
  onSectionChange,
  renderSection,
  hideDashboard = false,
  onCreateFlowChange,
  onboardingActive = false,
  createGameRequestId = 0,
  onStartGroupCreate,
  onStartGroupInvite,
  onStartFirstGame,
  onCompleteOnboarding,
}: TournamentsPanelProps = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [localSection, setLocalSection] = useState<CommandCenterSection>('upcoming');
  const lastCreateGameRequestRef = useRef(createGameRequestId);
  const activeSection = section ?? localSection;
  const scheduleView = activeSection === 'history' ? 'history' : 'upcoming';
  const [setupCardDismissed, setSetupCardDismissed] = useState(() => {
    try {
      return localStorage.getItem(SETUP_CARD_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [inviteSkipped, setInviteSkipped] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ['tournaments', 'mine'],
    queryFn: api.getTournaments,
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const { data: leagues = [], isLoading: loadingLeagues } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: api.getLeagues,
  });
  const { data: games = [], isLoading: loadingGames } = useQuery<GameListItem[]>({
    queryKey: ['games'],
    queryFn: api.getGames,
  });
  const { data: leagueEvents = [], isLoading: loadingLeagueEvents, error: leagueScheduleError } = useQuery({
    queryKey: ['leagues', 'schedule'],
    queryFn: api.getLeagueSchedule,
    enabled: leagues.length > 0,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Tournament>) => api.createTournament(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      setShowCreate(false);
      navigate(`/tournament/${(res as { tournamentid: string }).tournamentid}`);
    },
  });

  const createGameMutation = useMutation({
    mutationFn: (data: CreateGameRequest) => api.createGame(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['games'] });
      setShowCreate(false);
      navigate(`/cash-games/${res.gameid}/admin`);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (tournament: Tournament) => (
      tournament.groupid ? api.groupRegister(tournament.tournamentid) : api.selfRegister(tournament.tournamentid)
    ),
    onSuccess: (_result, tournament) => {
      qc.setQueryData<Tournament[]>(['tournaments', 'mine'], (current) => (
        current?.map((item) => item.tournamentid === tournament.tournamentid
          ? {
              ...item,
              isregistered: true,
              isdeclined: false,
              playercount: Math.max(0, Number(item.playercount ?? 0) + (item.isregistered ? 0 : 1)),
            }
          : item
        )
      ));
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (tid: string) => api.declineTournament(tid),
    onSuccess: (_result, tid) => {
      qc.setQueryData<Tournament[]>(['tournaments', 'mine'], (current) => (
        current?.map((tournament) => tournament.tournamentid === tid
          ? {
              ...tournament,
              isregistered: false,
              isdeclined: true,
              playercount: Math.max(0, Number(tournament.playercount ?? 0) - (tournament.isregistered ? 1 : 0)),
            }
          : tournament
        )
      ));
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
  const leagueRsvpMutation = useMutation({
    mutationFn: ({ leagueId, eventId, status }: { leagueId: string; eventId: string; status: 'going' | 'not_going' }) =>
      api.rsvpLeagueEvent(leagueId, eventId, status),
    onSuccess: (_result, variables) => {
      qc.setQueryData<LeagueScheduleEvent[]>(['leagues', 'schedule'], (current) => (
        current?.map((event) => event.leagueid === variables.leagueId && event.eventid === variables.eventId
          ? { ...event, rsvpstatus: variables.status }
          : event
        )
      ));
      qc.invalidateQueries({ queryKey: ['leagues', 'schedule'] });
    },
  });
  const cashRsvpMutation = useMutation({
    mutationFn: ({ gameId, status }: { gameId: string; status: 'going' | 'not_going' }) =>
      api.rsvpCashGame(gameId, status),
    onSuccess: (_result, variables) => {
      qc.setQueryData<GameListItem[]>(['games'], (current) => (
        current?.map((game) => game.id === variables.gameId
          ? {
              ...game,
              rsvpstatus: variables.status,
              isregistered: variables.status === 'going',
              playercount: Math.max(0, Number(game.playercount ?? 0) + (variables.status === 'going' && !game.isregistered ? 1 : variables.status === 'not_going' && game.isregistered ? -1 : 0)),
            }
          : game
        )
      ));
      qc.invalidateQueries({ queryKey: ['games'] });
    },
  });
  const rsvpError = registerMutation.error?.message || declineMutation.error?.message || leagueRsvpMutation.error?.message || cashRsvpMutation.error?.message;

  const upcoming = mine.filter((t) => {
    return isUpcomingTournament(t);
  });

  const history = mine.filter((t) => !upcoming.some((future) => future.tournamentid === t.tournamentid));
  const leagueScheduleItems = useMemo(() => buildLeagueScheduleItems(leagueEvents), [leagueEvents]);
  const gameScheduleItems = useMemo(() => games.map(gameToScheduleItem), [games]);
  const upcomingScheduleItems = useMemo(
    () => [
      ...upcoming.map(tournamentToScheduleItem),
      ...leagueScheduleItems.filter((item) => item.date && item.date >= todayInAppTimezone()),
      ...gameScheduleItems.filter((item) => item.game.status !== 'completed' && item.game.status !== 'cancelled' && (!item.date || item.date >= todayInAppTimezone())),
    ].sort(compareScheduleItems),
    [gameScheduleItems, leagueScheduleItems, upcoming]
  );
  const historyScheduleItems = useMemo(
    () => [
      ...history.map(tournamentToScheduleItem),
      ...leagueScheduleItems.filter((item) => item.date && item.date < todayInAppTimezone()),
      ...gameScheduleItems.filter((item) => item.game.status === 'completed' || item.game.status === 'cancelled' || (item.date && item.date < todayInAppTimezone())),
    ].sort(compareScheduleItems).reverse(),
    [gameScheduleItems, history, leagueScheduleItems]
  );
  const scheduleList = scheduleView === 'history' ? historyScheduleItems : upcomingScheduleItems;
  const hostedUpcomingCount = upcoming.filter((tournament) => tournament.ownerid === me?.guid).length;
  const firstHostedTournament = upcoming.find((tournament) => tournament.ownerid === me?.guid) ?? upcoming[0] ?? null;
  const hostedTournamentLimitReached = !me?.issuperadmin && !me?.canuseclubfeatures && hostedUpcomingCount >= 1;
  const registeredUpcomingCount = upcoming.filter((tournament) => tournament.isregistered).length;
  const adminGroupCount = groups.filter((group) => group.isadmin).length;
  const hostableGroups = useMemo(() => groups.filter((group) => group.isadmin && group.approved), [groups]);
  const loadingSchedule = loadingMine || loadingGames || (loadingLeagueEvents && scheduleList.length === 0);
  const dashboardDataReady = !loadingMine && !loadingGroups && !loadingLeagues && !loadingLeagueEvents && !loadingGames;
  const showSetupCard = dashboardDataReady && !leagueScheduleError && upcomingScheduleItems.length === 0 && !setupCardDismissed;
  const externalSection = activeSection === 'groups' || activeSection === 'leagues'
    ? renderSection?.(activeSection)
    : null;

  useEffect(() => {
    if (!createGameRequestId || createGameRequestId === lastCreateGameRequestRef.current) return;
    lastCreateGameRequestRef.current = createGameRequestId;
    setShowCreate(true);
  }, [createGameRequestId]);

  useEffect(() => {
    onCreateFlowChange?.(showCreate);
    return () => onCreateFlowChange?.(false);
  }, [onCreateFlowChange, showCreate]);

  function changeSection(nextSection: CommandCenterSection) {
    setLocalSection(nextSection);
    onSectionChange?.(nextSection);
  }

  if (showCreate) {
    return (
      <CreateTournamentComposer
        groups={hostableGroups}
        me={me}
        onboardingActive={onboardingActive}
        onBack={() => setShowCreate(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        onSubmitCash={(data) => createGameMutation.mutate(data)}
        loading={createMutation.isPending || createGameMutation.isPending}
        error={createMutation.error?.message || createGameMutation.error?.message}
      />
    );
  }

  return (
    <>
      {!hideDashboard && (
        <DashboardOverview
          me={me}
          groups={groups}
          leagueCount={leagues.length}
          upcomingCount={upcomingScheduleItems.length}
          historyCount={historyScheduleItems.length}
          firstHostedTournament={firstHostedTournament}
          registeredUpcomingCount={registeredUpcomingCount}
          adminGroupCount={adminGroupCount}
          createDisabled={false}
          showSetupCard={onboardingActive ? false : showSetupCard}
          onboardingActive={onboardingActive}
          activeSection={activeSection}
          onSectionChange={changeSection}
          onCreate={() => setShowCreate(true)}
          onStartGroupCreate={onStartGroupCreate ?? (() => changeSection('groups'))}
          onStartGroupInvite={(groupId) => {
            if (onStartGroupInvite) {
              onStartGroupInvite(groupId);
            } else {
              changeSection('groups');
            }
          }}
          onStartFirstGame={onStartFirstGame ?? (() => setShowCreate(true))}
          onCompleteOnboarding={onCompleteOnboarding}
          inviteSkipped={inviteSkipped}
          onSkipInvite={() => setInviteSkipped(true)}
          onOpenFirstGame={(tournamentId) => {
            onCompleteOnboarding?.();
            navigate(`/tournament/${tournamentId}`, { state: { tab: 'players' } });
          }}
          onDismissSetup={() => {
            setSetupCardDismissed(true);
            try {
              localStorage.setItem(SETUP_CARD_DISMISSED_KEY, 'true');
            } catch {
              // Best effort only. The visible state still dismisses for this session.
            }
          }}
        />
      )}

      {!hideDashboard && hostedTournamentLimitReached && (
        <p className="mb-4 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
          Host tier can host 1 upcoming tournament at a time. Move this event into history or upgrade to Club or Pro to host more.
        </p>
      )}

      {externalSection ? (
        <div className="min-w-0">{externalSection}</div>
      ) : (loadingSchedule || scheduleList.length > 0 || scheduleView === 'upcoming' || scheduleView === 'history') && (
        <>
          {rsvpError && (
            <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {rsvpError}
            </p>
          )}
          {leagueScheduleError && (
            <p className="mb-3 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
              League games could not load yet. Tournament rows are still shown.
            </p>
          )}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-muted">
                {scheduleView === 'history' ? 'Tournament history' : 'Upcoming games'}
              </p>
            </div>
            {scheduleList.length > 0 && (
              <span className="rounded-full border border-pit-border bg-pit-surface px-2.5 py-1 text-xs font-semibold text-pit-text">
                {scheduleView === 'history' ? `${scheduleList.length} history` : `${scheduleList.length} upcoming`}
              </span>
            )}
          </div>

          {loadingSchedule ? (
            <LoadingSpinner className="mt-16" />
          ) : (
            <ScheduleList
              items={scheduleList}
              view={scheduleView}
              loading={registerMutation.isPending || declineMutation.isPending || leagueRsvpMutation.isPending || cashRsvpMutation.isPending}
              onOpen={(item) => {
                if (item.kind === 'tournament') {
                  navigate(
                    item.canManage ? `/tournament/${item.tournament.tournamentid}` : `/lobby/${item.tournament.tournamentid}`,
                    item.canManage ? { state: { tab: 'run' } } : undefined
                  );
                  return;
                }
                if (item.kind === 'cash') {
                  navigate(`/cash-games/${item.game.id}/admin`);
                  return;
                }
                navigate('/', { state: { tab: 'leagues', leagueId: item.leagueId } });
              }}
              onRegister={(tournament) => registerMutation.mutate(tournament)}
              onDecline={(tournament) => declineMutation.mutate(tournament.tournamentid)}
              onLeagueRsvp={(item, status) => leagueRsvpMutation.mutate({ leagueId: item.leagueId, eventId: item.eventId, status })}
              onCashRsvp={(item, status) => cashRsvpMutation.mutate({ gameId: item.game.id, status })}
            />
          )}
        </>
      )}
    </>
  );
}

function DashboardOverview({
  me,
  groups,
  leagueCount,
  upcomingCount,
  historyCount,
  firstHostedTournament,
  registeredUpcomingCount,
  adminGroupCount,
  createDisabled,
  showSetupCard,
  onboardingActive,
  activeSection,
  onSectionChange,
  onCreate,
  onStartGroupCreate,
  onStartGroupInvite,
  onStartFirstGame,
  onCompleteOnboarding,
  inviteSkipped,
  onSkipInvite,
  onOpenFirstGame,
  onDismissSetup,
}: {
  me?: Awaited<ReturnType<typeof api.me>>;
  groups: Group[];
  leagueCount: number;
  upcomingCount: number;
  historyCount: number;
  firstHostedTournament: Tournament | null;
  registeredUpcomingCount: number;
  adminGroupCount: number;
  createDisabled: boolean;
  showSetupCard: boolean;
  onboardingActive: boolean;
  activeSection: CommandCenterSection;
  onSectionChange: (section: CommandCenterSection) => void;
  onCreate: () => void;
  onStartGroupCreate: () => void;
  onStartGroupInvite: (groupId: string) => void;
  onStartFirstGame: () => void;
  onCompleteOnboarding?: () => void;
  inviteSkipped: boolean;
  onSkipInvite: () => void;
  onOpenFirstGame: (tournamentId: string) => void;
  onDismissSetup: () => void;
}) {
  const firstName = getFirstName(me?.displayname);
  const adminGroups = groups.filter((group) => group.isadmin && group.approved);
  const primaryAdminGroup = adminGroups[0] ?? null;
  const hasInvitedPlayer = adminGroups.some((group) => Number(group.membercount ?? 0) > 1);
  const showOnboardingCard = onboardingActive && Boolean(me);
  const setupItems = [
    { label: 'Create a host group', complete: adminGroupCount > 0 },
    { label: 'Schedule a game', complete: upcomingCount > 0 },
    { label: 'Get players registered', complete: registeredUpcomingCount > 0 },
  ];

  return (
    <section className={`mb-5 grid min-w-0 max-w-full gap-3 ${showSetupCard || showOnboardingCard ? 'md:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
      <div className="min-w-0 overflow-hidden rounded-xl border border-pit-teal/25 bg-[radial-gradient(circle_at_top_left,rgba(20,184,181,0.16),transparent_34%),linear-gradient(135deg,rgba(18,46,48,0.96),rgba(24,24,30,0.96))] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] sm:p-4">
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

        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 max-[380px]:grid-cols-1 sm:grid-cols-4">
          <DashboardStat icon={Calendar} label="Upcoming" value={upcomingCount} active={activeSection === 'upcoming'} onClick={() => onSectionChange('upcoming')} />
          <DashboardStat icon={Users} label="Groups" value={groups.length} active={activeSection === 'groups'} onClick={() => onSectionChange('groups')} />
          <DashboardStat icon={Medal} label="History" value={historyCount} active={activeSection === 'history'} onClick={() => onSectionChange('history')} />
          <DashboardStat icon={ListOrdered} label="Leagues" value={leagueCount} active={activeSection === 'leagues'} onClick={() => onSectionChange('leagues')} />
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
              + Host Game
            </button>
          ) : (
            <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => onSectionChange('groups')}>
              Set up group
            </button>
          )}
        </div>
      </div>

      {showOnboardingCard && (
        <FirstRunSetupCard
          primaryGroup={primaryAdminGroup}
          hasInvitedPlayer={hasInvitedPlayer}
          inviteSkipped={inviteSkipped}
          hasFirstGame={Boolean(firstHostedTournament)}
          firstGameName={firstHostedTournament?.name}
          onCreateGroup={onStartGroupCreate}
          onInvitePlayer={() => primaryAdminGroup && onStartGroupInvite(primaryAdminGroup.groupid)}
          onSkipInvite={onSkipInvite}
          onCreateGame={onStartFirstGame}
          onOpenFirstGame={() => firstHostedTournament && onOpenFirstGame(firstHostedTournament.tournamentid)}
          onFinish={() => onCompleteOnboarding?.()}
        />
      )}

      {!showOnboardingCard && showSetupCard && (
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

function FirstRunSetupCard({
  primaryGroup,
  hasInvitedPlayer,
  inviteSkipped,
  hasFirstGame,
  firstGameName,
  onCreateGroup,
  onInvitePlayer,
  onSkipInvite,
  onCreateGame,
  onOpenFirstGame,
  onFinish,
}: {
  primaryGroup: Group | null;
  hasInvitedPlayer: boolean;
  inviteSkipped: boolean;
  hasFirstGame: boolean;
  firstGameName?: string | null;
  onCreateGroup: () => void;
  onInvitePlayer: () => void;
  onSkipInvite: () => void;
  onCreateGame: () => void;
  onOpenFirstGame: () => void;
  onFinish: () => void;
}) {
  const inviteComplete = hasInvitedPlayer || inviteSkipped;
  const steps = [
    {
      title: 'Create your group',
      body: 'Your group keeps players, invites, announcements, and future games in one place.',
      complete: Boolean(primaryGroup),
    },
    {
      title: 'Invite one player',
      body: 'Send an invite now or skip it and keep building the first game.',
      complete: Boolean(primaryGroup) && inviteComplete,
    },
    {
      title: 'Host your first game',
      body: 'Set the name, date, group, field size, buy-in, and blind structure from the guided creator.',
      complete: hasFirstGame,
    },
    {
      title: 'Run the night',
      body: 'Use Players to register and check people in, then Run Tournament to start the clock.',
      complete: hasFirstGame,
    },
  ];

  const nextAction = !primaryGroup
    ? { label: 'Create your group', onClick: onCreateGroup }
    : !inviteComplete
      ? { label: 'Invite a player', onClick: onInvitePlayer }
      : !hasFirstGame
        ? { label: '+ Host Game', onClick: onCreateGame }
        : { label: 'Open first game', onClick: onOpenFirstGame };

  return (
    <aside className="rounded-xl border border-pit-teal/25 bg-[radial-gradient(circle_at_top_left,rgba(20,184,181,0.18),transparent_38%),linear-gradient(150deg,rgba(18,46,48,0.92),rgba(24,24,30,0.96))] p-3 shadow-[0_16px_42px_rgba(0,0,0,0.2)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-pit-teal">First night setup</p>
          <h2 className="mt-1 text-lg font-bold text-white">Welcome. Let&apos;s get organized.</h2>
        </div>
        <button
          type="button"
          className="rounded-full border border-pit-border px-2.5 py-1 text-[11px] font-semibold text-pit-muted transition hover:border-pit-teal/40 hover:text-white"
          onClick={onFinish}
        >
          Skip
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-pit-text">
        Start with a group, invite someone if you want, then build the first tournament. This coach disappears once you finish it.
      </p>

      <div className="mt-3 space-y-1.5">
        {steps.map((step, index) => (
          <div key={step.title} className={`rounded-lg border px-2.5 py-2 ${
            step.complete ? 'border-pit-teal/25 bg-pit-teal/10' : 'border-pit-border/70 bg-pit-bg/45'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                step.complete ? 'bg-pit-teal text-pit-bg' : 'bg-white/8 text-pit-muted'
              }`}>
                {step.complete ? <CheckCircle2 size={13} /> : index + 1}
              </span>
              <p className="text-xs font-semibold text-white">{step.title}</p>
            </div>
            <p className="mt-1 pl-7 text-[11px] leading-4 text-pit-muted">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <button type="button" className="btn-primary w-full justify-center px-3 py-2 text-xs" onClick={nextAction.onClick}>
          {nextAction.label}
        </button>
        {primaryGroup && !inviteComplete && (
          <button type="button" className="btn-ghost w-full justify-center px-3 py-2 text-xs" onClick={onSkipInvite}>
            Skip invite for now
          </button>
        )}
        {hasFirstGame && (
          <button type="button" className="btn-ghost w-full justify-center px-3 py-2 text-xs" onClick={onFinish}>
            Done with walkthrough
          </button>
        )}
      </div>

      {hasFirstGame && firstGameName && (
        <p className="mt-3 rounded-lg border border-pit-teal/20 bg-pit-teal/10 px-2.5 py-2 text-[11px] leading-4 text-pit-text">
          Next stop: <span className="font-semibold text-white">{firstGameName}</span>. Open it, check players in from the Players tab, then start the clock from Run Tournament.
        </p>
      )}
    </aside>
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
        className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition ${
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
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/18 px-2.5 py-2">
      {content}
    </div>
  );
}

type ScheduleItem =
  | {
      kind: 'tournament';
      id: string;
      name: string;
      parentName?: string | null;
      date: string | null;
      time?: string | null;
      cost: number;
      canManage: boolean;
      tournament: Tournament;
    }
  | {
      kind: 'league';
      id: string;
      name: string;
      parentName: string;
      date: string | null;
      time?: string | null;
      cost: number;
      canManage: boolean;
      leagueId: string;
      eventId: string;
      isParticipant: boolean;
      rsvpStatus?: string | null;
    }
  | {
      kind: 'cash';
      id: string;
      name: string;
      parentName?: string | null;
      date: string | null;
      time?: string | null;
      cost: number;
      canManage: boolean;
      isRegistered?: boolean;
      rsvpStatus?: string | null;
      game: GameListItem;
    };

function ScheduleList({
  items,
  view,
  loading,
  onOpen,
  onRegister,
  onDecline,
  onLeagueRsvp,
  onCashRsvp,
}: {
  items: ScheduleItem[];
  view: 'upcoming' | 'history';
  loading: boolean;
  onOpen: (item: ScheduleItem) => void;
  onRegister: (tournament: Tournament) => void;
  onDecline: (tournament: Tournament) => void;
  onLeagueRsvp: (item: Extract<ScheduleItem, { kind: 'league' }>, status: 'going' | 'not_going') => void;
  onCashRsvp: (item: Extract<ScheduleItem, { kind: 'cash' }>, status: 'going' | 'not_going') => void;
}) {
  if (items.length === 0) return <EmptyState view={view} />;

  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-surface/70 shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
      <div className="hidden grid-cols-[minmax(0,1.35fr)_7.5rem_8.5rem_6.5rem_9rem_10.75rem] gap-3 border-b border-pit-border/70 bg-black/18 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted md:grid">
        <span>Name</span>
        <span>Type</span>
        <span>Date / time</span>
        <span>Cost</span>
        <span>Status</span>
        <span className="text-right">Action</span>
      </div>
      <div className="divide-y divide-pit-border/60">
        {items.map((item) => (
          <ScheduleRow
            key={item.id}
            item={item}
            view={view}
            loading={loading}
            onOpen={() => onOpen(item)}
            onRegister={item.kind === 'tournament' ? () => onRegister(item.tournament) : undefined}
            onDecline={item.kind === 'tournament' ? () => onDecline(item.tournament) : undefined}
            onLeagueRsvp={item.kind === 'league' ? (status) => onLeagueRsvp(item, status) : undefined}
            onCashRsvp={item.kind === 'cash' ? (status) => onCashRsvp(item, status) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduleRow({
  item,
  view,
  loading,
  onOpen,
  onRegister,
  onDecline,
  onLeagueRsvp,
  onCashRsvp,
}: {
  item: ScheduleItem;
  view: 'upcoming' | 'history';
  loading: boolean;
  onOpen: () => void;
  onRegister?: () => void;
  onDecline?: () => void;
  onLeagueRsvp?: (status: 'going' | 'not_going') => void;
  onCashRsvp?: (status: 'going' | 'not_going') => void;
}) {
  const isTournament = item.kind === 'tournament';
  const isLeague = item.kind === 'league';
  const isCash = item.kind === 'cash';
  const isRegistered = isTournament
    ? Boolean(item.tournament.isregistered)
    : isLeague
      ? item.rsvpStatus === 'going'
      : Boolean(item.isRegistered) || item.rsvpStatus === 'going';
  const isDeclined = isTournament
    ? Boolean(item.tournament.isdeclined) && !isRegistered
    : isLeague
      ? item.rsvpStatus === 'not_going'
      : item.rsvpStatus === 'not_going';
  const showRsvp = view === 'upcoming' && isTournament && Boolean(item.tournament.groupid) && !item.canManage;
  const showLeagueRsvp = view === 'upcoming' && isLeague && item.isParticipant;
  const showCashRsvp = view === 'upcoming' && isCash && !item.canManage;
  const showTournamentLobby = showRsvp && isRegistered;
  const typeLabel = isTournament ? 'Tournament' : isCash ? 'Cash Game' : 'League';
  const statusLabel = item.canManage && (isTournament || isCash) ? 'Host' : null;
  const fieldCount = isTournament ? formatFieldCount(item.tournament) : isCash ? formatCashGameCount(item.game) : null;
  const typePillClass = isCash
    ? 'border-[#F5B84B]/45 bg-[#F5B84B]/12 text-[#F5B84B]'
    : isLeague
      ? 'border-[#8B5CF6]/45 bg-[#8B5CF6]/12 text-[#A78BFA]'
      : 'border-pit-teal/35 bg-pit-teal/10 text-pit-teal';
  const statusPillClass = 'border-pit-teal/35 bg-pit-teal/15 text-pit-teal';

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-l-2 px-3 py-2 transition md:grid-cols-[minmax(0,1.35fr)_7.5rem_8.5rem_6.5rem_9rem_10.75rem] md:items-center md:gap-3 md:border-l-0 md:px-4 md:py-3 ${
        isDeclined
          ? 'border-red-300/60 bg-red-500/[0.035] md:bg-red-500/10'
          : isRegistered
            ? 'border-pit-teal/60 bg-pit-teal/[0.035] md:bg-pit-teal/5'
            : 'border-transparent hover:bg-white/[0.025]'
      }`}
    >
      <div className="col-start-1 row-start-1 min-w-0 overflow-hidden md:col-auto md:row-auto">
        <button
          type="button"
          className="block w-full min-w-0 truncate text-left text-sm font-semibold text-white transition hover:text-pit-teal md:text-base"
          onClick={onOpen}
          title={item.name}
        >
          {item.name}
        </button>
        {item.parentName && (
          <p className="mt-1 w-full min-w-0 truncate text-xs text-pit-muted" title={item.parentName}>{item.parentName}</p>
        )}
      </div>

      <div className="hidden md:col-auto md:row-auto md:flex">
        <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${typePillClass}`}>
          {typeLabel}
        </span>
      </div>

      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-pit-text md:col-auto md:row-auto md:block md:space-y-1 md:text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 md:bg-transparent md:px-0 md:py-0">
          <Calendar size={11} />
          {item.date ?? 'Date TBD'}
        </span>
        {item.time && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 md:bg-transparent md:px-0 md:py-0">
            <Clock size={11} />
            {formatTime12Hour(item.time)}
          </span>
        )}
        {(isTournament || isCash) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 md:hidden">
            <Users size={11} />
            {fieldCount}
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-1 flex items-center justify-end gap-1.5 justify-self-end whitespace-nowrap text-right text-sm font-bold text-pit-gold md:col-auto md:row-auto md:block md:justify-self-auto md:text-left">
        <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-semibold uppercase tracking-[0.1em] md:hidden ${typePillClass}`}>
          {typeLabel}
        </span>
        <span>{formatCostLabel(item.cost)}</span>
      </div>

      <div className="col-start-2 row-start-2 hidden items-center justify-end gap-2 md:col-auto md:row-auto md:flex md:justify-start">
        {statusLabel && (
          <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${statusPillClass}`}>
            {statusLabel}
          </span>
        )}
        {fieldCount && (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-pit-text">
            <Users size={12} />
            {fieldCount}
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-2 flex items-center justify-end gap-1.5 md:col-auto md:row-auto md:gap-2">
        {showTournamentLobby ? (
          <>
            <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onOpen}>
              <PlayCircle size={14} />
              Lobby
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-10 items-center justify-center rounded-full border border-red-300/30 bg-red-400/8 text-xs font-semibold text-red-200 transition hover:bg-red-400/15 md:h-9 md:min-w-14 md:px-3"
              disabled={loading}
              onClick={onDecline}
              aria-label={`Cannot attend ${item.name}`}
              title="Cannot attend"
            >
              <X size={16} />
            </button>
          </>
        ) : showRsvp || showLeagueRsvp || showCashRsvp ? (
          <>
            <button
              type="button"
              className={`inline-flex h-8 w-10 items-center justify-center rounded-full border text-xs font-semibold transition md:h-9 md:min-w-14 md:px-3 ${
                isRegistered
                  ? 'border-pit-teal/55 bg-pit-teal/20 text-pit-teal shadow-inner'
                  : 'border-pit-teal/35 bg-pit-teal/10 text-pit-teal hover:bg-pit-teal/18'
              }`}
              disabled={loading || isRegistered}
              onClick={showLeagueRsvp ? () => onLeagueRsvp?.('going') : showCashRsvp ? () => onCashRsvp?.('going') : onRegister}
              aria-label={`Can attend ${item.name}`}
              title="Can attend"
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              type="button"
              className={`inline-flex h-8 w-10 items-center justify-center rounded-full border text-xs font-semibold transition md:h-9 md:min-w-14 md:px-3 ${
                isDeclined
                  ? 'border-red-300/55 bg-red-400/20 text-red-100 shadow-inner'
                  : 'border-red-300/30 bg-red-400/8 text-red-200 hover:bg-red-400/15'
              }`}
              disabled={loading || isDeclined}
              onClick={showLeagueRsvp ? () => onLeagueRsvp?.('not_going') : showCashRsvp ? () => onCashRsvp?.('not_going') : onDecline}
              aria-label={`Cannot attend ${item.name}`}
              title="Cannot attend"
            >
              <X size={16} />
            </button>
            {showLeagueRsvp && (
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onOpen}>
                View
              </button>
            )}
          </>
        ) : (
          <button type="button" className={item.canManage && isTournament ? 'btn-primary gap-2 px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'} onClick={onOpen}>
            {item.canManage && isTournament && view === 'upcoming' && <PlayCircle size={14} />}
            {item.canManage && isTournament ? (view === 'upcoming' ? 'Run' : 'Open') : 'View'}
          </button>
        )}
      </div>
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
        <p className="font-semibold text-white">{view === 'history' ? 'No history yet' : 'No upcoming games yet'}</p>
        <p className="mt-1 text-sm text-pit-muted">
          {view === 'history' ? 'Completed and past-dated games will appear here.' : 'Tournaments and league events will land here once they are scheduled.'}
        </p>
      </div>
    </div>
  );
}

function formatCostLabel(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'FREE';
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function formatFieldCount(tournament: Tournament) {
  const registered = Math.max(0, Number(tournament.playercount ?? 0));
  const cap = Math.max(0, Number(tournament.maxplayers ?? 0));
  return cap > 0 ? `${registered}/${cap}` : String(registered);
}

function CreateTournamentComposer({
  groups,
  me,
  onboardingActive,
  onBack,
  onSubmit,
  onSubmitCash,
  loading,
  error,
}: {
  groups: Group[];
  me?: Awaited<ReturnType<typeof api.me>>;
  onboardingActive?: boolean;
  onBack: () => void;
  onSubmit: (data: Partial<Tournament>) => void;
  onSubmitCash: (data: CreateGameRequest) => void;
  loading: boolean;
  error?: string;
}) {
  const steps = ['Basics', 'Game', 'Options', 'Review'] as const;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    gametype: 'tournament' as 'tournament' | 'cash',
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
    visibility: 'group_public' as 'group_public' | 'invite_only',
    inviteUserIds: [] as string[],
    stakeslabel: '',
    seatsavailable: '',
    minbuyin: '',
    maxbuyin: '',
    cashnotes: '',
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
  const { data: selectedGroupDetail } = useQuery({
    queryKey: ['group', form.groupid, 'members'],
    queryFn: () => api.getGroup(form.groupid),
    enabled: Boolean(form.groupid),
  });
  const inviteMembers = (selectedGroupDetail?.members ?? []).filter((member) => member.approved);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      playerselftracking: canUseClubFeatures && selectedGroup?.defaulttrackingmode === 'player',
      notifygroup: Boolean(selectedGroup),
      savedstructureid: '',
      inviteUserIds: [],
    }));
  }, [canUseClubFeatures, selectedGroup?.defaulttrackingmode, selectedGroup?.groupid]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({
      ...current,
      [key]:
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.gametype === 'cash') {
      const startsat = form.tourneydate ? `${form.tourneydate}T${form.tourneytime || '00:00'}` : null;
      onSubmitCash({
        groupid: form.groupid,
        gametype: 'cash',
        title: form.name.trim(),
        startsat,
        visibility: form.visibility,
        inviteUserIds: form.visibility === 'invite_only' ? form.inviteUserIds : [],
        alertUsers: Boolean(form.notifygroup),
        cash: {
          stakeslabel: form.stakeslabel.trim(),
          seatsavailable: form.seatsavailable ? Number(form.seatsavailable) : null,
          minbuyin: form.minbuyin ? Number(form.minbuyin) : null,
          maxbuyin: form.maxbuyin ? Number(form.maxbuyin) : null,
          notes: form.cashnotes.trim() || null,
        },
      });
      return;
    }
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

  const isCashGame = form.gametype === 'cash';
  const basicsComplete = Boolean(form.name.trim() && form.groupid && (isCashGame || (form.tourneydate && form.tourneytime)));
  const rebuysActive = Number(form.rebuyprice) > 0 || Number(form.rebuychips) > 0;
  const rebuyCutoffComplete = !rebuysActive || Number(form.rebuylastlevel) > 0;
  const maxPlayersComplete = form.maxplayersmode === 'unlimited' || (form.maxplayersmode === 'capped' && Number(form.maxplayers) > 0);
  const cashRangeComplete = !isCashGame || !form.minbuyin || !form.maxbuyin || Number(form.maxbuyin) >= Number(form.minbuyin);
  const cashDetailsComplete = !isCashGame || (Boolean(form.stakeslabel.trim()) && cashRangeComplete);
  const inviteComplete = form.visibility !== 'invite_only' || form.inviteUserIds.length > 0;
  const canAdvance = step === 0 ? basicsComplete : step === 1 ? (isCashGame ? cashDetailsComplete : maxPlayersComplete && rebuyCutoffComplete) : step === 2 ? inviteComplete : true;
  const selectedStructure = savedStructures.find((structure) => structure.id === form.savedstructureid);
  const maxPlayersReview = form.maxplayersmode === 'unlimited' ? 'Unlimited' : form.maxplayers;
  const canOpenStep = (targetStep: number) => {
    if (targetStep <= step) return true;
    if (targetStep >= 1 && !basicsComplete) return false;
    if (targetStep >= 2 && !isCashGame && !maxPlayersComplete) return false;
    if (targetStep >= 2 && isCashGame && !cashDetailsComplete) return false;
    if (targetStep >= 3 && !inviteComplete) return false;
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
              {step === 0 && 'Choose what you are hosting and connect it to a group.'}
              {step === 1 && (isCashGame ? 'Add the simple cash-game details.' : 'Set the buy-in, field size, rebuys, and add-ons.')}
              {step === 2 && (isCashGame ? 'Choose who can see it and whether to alert them.' : 'Choose tracking, blind structure, registration, and notifications.')}
              {step === 3 && 'Confirm the game details before creating it.'}
            </p>
            {onboardingActive && !isCashGame && (
              <p className="mt-3 rounded-lg border border-pit-teal/25 bg-pit-teal/10 px-3 py-2 text-xs leading-5 text-pit-text">
                {step === 0 && 'First-time tip: give the tournament a clear name, pick the schedule, and attach it to the group you just created.'}
                {step === 1 && 'Set the field rules now. Choose a player cap or Unlimited, then add buy-in, rebuy, or add-on details only if you use them.'}
                {step === 2 && 'Blind structures can be picked here if you saved one, or you can use the calculator right after creation. Register yourself if you are playing.'}
                {step === 3 && 'After creation, use the Players tab for registration and check-ins. Use Run Tournament when the room is ready for the clock.'}
              </p>
            )}
          </div>

          <div className="mt-5">
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: 'tournament', label: 'Tournament', description: 'Clock, blinds, seating, results.' },
                    { value: 'cash', label: 'Cash Game', description: 'Stakes, seats, buy-ins, cash-outs.' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, gametype: option.value as 'tournament' | 'cash' }))}
                      className={`rounded-xl border p-3 text-left transition ${
                        form.gametype === option.value
                          ? 'border-pit-teal bg-pit-teal/15 text-white'
                          : 'border-pit-border bg-pit-bg text-pit-text hover:border-pit-teal/40'
                      }`}
                    >
                      <span className="font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs text-pit-muted">{option.description}</span>
                    </button>
                  ))}
                </div>
                <input className="input text-lg" placeholder={isCashGame ? 'Cash game title' : 'Tournament name'} value={form.name} onChange={set('name')} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={isCashGame ? 'Date (optional)' : 'Date'}><input className="input" type="date" value={form.tourneydate} onChange={set('tourneydate')} required={!isCashGame} /></Field>
                  <Field label="Time">
                    <QuarterHourTimeSelect value={form.tourneytime} onChange={(value) => setForm((current) => ({ ...current, tourneytime: value }))} required={!isCashGame} />
                  </Field>
                </div>
                <Field label="Group">
                  <select className="input" value={form.groupid} onChange={set('groupid')} required>
                    <option value="">{groups.length > 0 ? 'Choose a group' : 'No admin groups available'}</option>
                    {groups.map((group) => (
                      <option key={group.groupid} value={group.groupid}>{group.name}</option>
                    ))}
                  </select>
                </Field>
                {groups.length === 0 && (
                  <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                    You can only host games for groups where you are an admin.
                  </p>
                )}
                {!basicsComplete && (
                  <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                    {isCashGame ? 'Add a title and group before continuing.' : 'Add a tournament name, date, time, and group before continuing.'}
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              isCashGame ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Stakes">
                    <input className="input" placeholder="$1/$2, $2/$5, etc." value={form.stakeslabel} onChange={set('stakeslabel')} required />
                  </Field>
                  <Field label="Seats available">
                    <input className="input" type="number" min="1" step="1" placeholder="Optional" value={form.seatsavailable} onChange={set('seatsavailable')} />
                  </Field>
                  <Field label="Min buy-in">
                    <input className="input" type="number" min="0" step="0.01" placeholder="Optional" value={form.minbuyin} onChange={set('minbuyin')} />
                  </Field>
                  <Field label="Max buy-in">
                    <input className="input" type="number" min="0" step="0.01" placeholder="Optional" value={form.maxbuyin} onChange={set('maxbuyin')} />
                  </Field>
                  <Field label="Notes" className="sm:col-span-2">
                    <textarea className="input min-h-24 resize-none" placeholder="Optional house notes, location details, or reminders." value={form.cashnotes} onChange={set('cashnotes')} />
                  </Field>
                  {!cashDetailsComplete && (
                    <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100 sm:col-span-2">
                      {cashRangeComplete ? 'Add a stakes label before continuing.' : 'Max buy-in cannot be lower than min buy-in.'}
                    </p>
                  )}
                </div>
              ) : (
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
              )
            )}

            {step === 2 && (
              isCashGame ? (
              <div className="space-y-3">
                <Field label="Visibility">
                  <select className="input" value={form.visibility} onChange={set('visibility')}>
                    <option value="group_public">Public to group</option>
                    <option value="invite_only">Invite only</option>
                  </select>
                </Field>
                {form.visibility === 'invite_only' && (
                  <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
                    <p className="text-sm font-semibold text-white">Invite group members</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {inviteMembers.map((member) => {
                        const checked = form.inviteUserIds.includes(member.userid);
                        return (
                          <label key={member.userid} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-pit-teal bg-pit-teal/10 text-white' : 'border-pit-border text-pit-text'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                inviteUserIds: event.target.checked
                                  ? [...current.inviteUserIds, member.userid]
                                  : current.inviteUserIds.filter((id) => id !== member.userid),
                              }))}
                            />
                            <span>{member.displayname || member.emailaddress || 'Player'}</span>
                          </label>
                        );
                      })}
                    </div>
                    {!inviteComplete && (
                      <p className="mt-3 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                        Pick at least one invited member.
                      </p>
                    )}
                  </div>
                )}
                <ToggleRow
                  checked={form.notifygroup}
                  onChange={set('notifygroup')}
                  title="Alert eligible users"
                  description={form.visibility === 'invite_only' ? 'Send email and push hooks to invited members.' : 'Send email and push hooks to group members.'}
                  icon={<Bell size={16} />}
                />
              </div>
              ) : (
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
              )
            )}

            {step === 3 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewItem label="Game type" value={isCashGame ? 'Cash Game' : 'Tournament'} />
                <ReviewItem label={isCashGame ? 'Cash game' : 'Tournament'} value={form.name || 'Untitled'} />
                <ReviewItem label="Group" value={selectedGroupName || 'Private'} />
                <ReviewItem label="Date and time" value={`${form.tourneydate || 'Date TBD'} ${form.tourneytime || ''}`.trim()} />
                {isCashGame ? (
                  <>
                    <ReviewItem label="Stakes" value={form.stakeslabel || 'Not set'} />
                    <ReviewItem label="Seats" value={form.seatsavailable || 'Open'} />
                    <ReviewItem label="Visibility" value={form.visibility === 'invite_only' ? `${form.inviteUserIds.length} invited` : 'Public to group'} />
                    <ReviewItem label="Notifications" value={form.notifygroup ? 'Alert users' : 'Create silently'} />
                  </>
                ) : (
                  <>
                    <ReviewItem label="Buy-in" value={`$${Number(form.buyin || 0).toFixed(2)}`} />
                    <ReviewItem label="Max players" value={maxPlayersReview || 'Not set'} />
                    <ReviewItem label="Rebuys" value={rebuysActive ? `Through level ${form.rebuylastlevel || 'not set'}` : 'Not enabled'} />
                    <ReviewItem label="Tracking" value={form.playerselftracking ? 'Player tracked stats' : 'Standard'} />
                    <ReviewItem label="Blind structure" value={selectedStructure?.name || 'Calculator after creation'} />
                    <ReviewItem label="Notifications" value={form.groupid && form.notifygroup ? 'Email group members' : 'No group email'} />
                  </>
                )}
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
              <button type="submit" className="btn-primary px-4 py-2.5" disabled={loading || !basicsComplete || (isCashGame ? !cashDetailsComplete || !inviteComplete : !maxPlayersComplete)}>
                {loading ? 'Creating...' : '+ Host Game'}
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

function tournamentToScheduleItem(tournament: Tournament): ScheduleItem {
  return {
    kind: 'tournament',
    id: `tournament-${tournament.tournamentid}`,
    name: tournament.name,
    parentName: tournament.groupname,
    date: getDateKey(tournament.tourneydate),
    time: tournament.tourneytime,
    cost: Number(tournament.buyin ?? 0),
    canManage: isEnabledFlag(tournament.canmanage),
    tournament,
  };
}

function gameToScheduleItem(game: GameListItem): Extract<ScheduleItem, { kind: 'cash' }> {
  const startsAt = splitDateTime(game.startsat);
  return {
    kind: 'cash',
    id: `cash-${game.id}`,
    name: game.title,
    parentName: game.groupname,
    date: startsAt.date,
    time: startsAt.time,
    cost: Number(game.minbuyin ?? 0),
    canManage: isEnabledFlag(game.canmanage),
    isRegistered: Boolean(game.isregistered),
    rsvpStatus: game.rsvpstatus ?? null,
    game,
  };
}

function buildLeagueScheduleItems(events: LeagueScheduleEvent[]): ScheduleItem[] {
  return events
    .filter((event) => Boolean(event.eventdate))
    .map(leagueEventToScheduleItem);
}

function splitDateTime(value: string | null | undefined): { date: string | null; time: string | null } {
  if (!value) return { date: null, time: null };
  const text = String(value);
  return {
    date: text.slice(0, 10),
    time: text.length >= 16 ? text.slice(11, 16) : null,
  };
}

function leagueEventToScheduleItem(event: LeagueScheduleEvent): ScheduleItem {
  return {
    kind: 'league',
    id: `league-${event.leagueid}-${event.eventid}`,
    name: event.name,
    parentName: event.leaguename,
    date: getDateKey(event.eventdate),
    time: event.eventtime ?? null,
    cost: Number(event.eventfee ?? 0),
    canManage: Boolean(event.isadmin),
    leagueId: event.leagueid,
    eventId: event.eventid,
    isParticipant: Boolean(event.participating),
    rsvpStatus: event.rsvpstatus ?? null,
  };
}

function compareScheduleItems(a: ScheduleItem, b: ScheduleItem) {
  return getScheduleSortValue(a) - getScheduleSortValue(b);
}

function getScheduleSortValue(item: ScheduleItem) {
  const date = item.date ?? '9999-12-31';
  const time = item.time || '23:59';
  return new Date(`${date}T${time}`).getTime();
}

function formatCashGameCount(game: GameListItem): string {
  const seated = Number(game.playercount ?? 0);
  const seats = Number(game.seatsavailable ?? 0);
  return seats > 0 ? `${seated}/${seats}` : String(seated);
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
