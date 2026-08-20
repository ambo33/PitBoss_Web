import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Bell, Calendar, CalendarCheck, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Coins, Crown, Diamond, Home, ListChecks, PlayCircle, Settings, SlidersHorizontal, Spade, Trophy, UserPlus, Users, X } from 'lucide-react';
import { api, CreateGameRequest, GameListItem, Group, League, LeagueScheduleEvent, Tournament } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import QuarterHourTimeSelect from '../../components/QuarterHourTimeSelect';
import { isEnabledFlag } from '../../utils/flags';

export type CommandCenterSection = 'upcoming' | 'communities' | 'groups' | 'history' | 'leagues';

const HISTORY_PAGE_SIZE = 10;

interface TournamentsPanelProps {
  section?: CommandCenterSection;
  onSectionChange?: (section: CommandCenterSection) => void;
  renderSection?: (section: Extract<CommandCenterSection, 'groups' | 'leagues'>) => React.ReactNode;
  onOpenCommunity?: (community: { type: 'group' | 'league'; id: string }) => void;
  hideDashboard?: boolean;
  onCreateFlowChange?: (open: boolean) => void;
  onboardingActive?: boolean;
  createGameRequestId?: number;
  homeRequestId?: number;
  gamesRequestId?: number;
  onScheduleModeChange?: (mode: 'home' | 'games') => void;
  onHostCapabilityChange?: (canHost: boolean) => void;
  onStartGroupCreate?: () => void;
  onStartLeagueCreate?: () => void;
  onStartGroupInvite?: (groupId: string) => void;
  onStartFirstGame?: () => void;
  onCompleteOnboarding?: () => void;
  focusScheduleItemId?: string;
}

export default function TournamentsPanel({
  section,
  onSectionChange,
  renderSection,
  onOpenCommunity,
  hideDashboard = false,
  onCreateFlowChange,
  onboardingActive = false,
  createGameRequestId = 0,
  homeRequestId = 0,
  gamesRequestId = 0,
  onScheduleModeChange,
  onHostCapabilityChange,
  onStartGroupCreate,
  onStartLeagueCreate,
  onStartGroupInvite,
  onStartFirstGame,
  onCompleteOnboarding,
  focusScheduleItemId,
}: TournamentsPanelProps = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showCommunityCreate, setShowCommunityCreate] = useState(false);
  const [showCommunityJoin, setShowCommunityJoin] = useState(false);
  const [showFullUpcomingSchedule, setShowFullUpcomingSchedule] = useState(false);
  const [localSection, setLocalSection] = useState<CommandCenterSection>('upcoming');
  const lastCreateGameRequestRef = useRef(createGameRequestId);
  const lastHomeRequestRef = useRef(homeRequestId);
  const lastGamesRequestRef = useRef(gamesRequestId);
  const activeSection = section ?? localSection;
  const scheduleView = activeSection === 'history' ? 'history' : 'upcoming';
  const [inviteSkipped, setInviteSkipped] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ['tournaments', 'mine'],
    queryFn: api.getTournaments,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const { data: leagues = [] } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: api.getLeagues,
  });
  const { data: games = [], isLoading: loadingGames } = useQuery<GameListItem[]>({
    queryKey: ['games'],
    queryFn: api.getGames,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { data: leagueEvents = [], isLoading: loadingLeagueEvents, error: leagueScheduleError } = useQuery({
    queryKey: ['leagues', 'schedule'],
    queryFn: api.getLeagueSchedule,
    enabled: leagues.length > 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 0,
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
  const rsvpError = registerMutation.error?.message || declineMutation.error?.message || cashRsvpMutation.error?.message;

  const leagueScheduleItems = useMemo(() => buildLeagueScheduleItems(leagueEvents), [leagueEvents]);
  const gameScheduleItems = useMemo(() => games.map(gameToScheduleItem), [games]);
  const tournamentScheduleItems = useMemo(() => mine.map(tournamentToScheduleItem), [mine]);
  const allScheduleItems = useMemo(
    () => [...tournamentScheduleItems, ...leagueScheduleItems, ...gameScheduleItems],
    [gameScheduleItems, leagueScheduleItems, tournamentScheduleItems]
  );
  const upcomingScheduleItems = useMemo(
    () => allScheduleItems.filter(isUpcomingScheduleItem).sort(compareScheduleItems),
    [allScheduleItems]
  );
  const historyScheduleItems = useMemo(
    () => allScheduleItems.filter((item) => !isUpcomingScheduleItem(item)).sort(compareScheduleItems).reverse(),
    [allScheduleItems]
  );
  const featuredUpcomingItem = scheduleView === 'upcoming' ? upcomingScheduleItems[0] ?? null : null;
  const upcomingItemsAfterFeatured = featuredUpcomingItem
    ? upcomingScheduleItems.slice(1)
    : upcomingScheduleItems;
  const comingUpScheduleItems = upcomingItemsAfterFeatured.filter((item) => !isThirtyOrMoreDaysAway(item));
  const laterScheduleItems = upcomingItemsAfterFeatured.filter(isThirtyOrMoreDaysAway);
  const scheduleList = scheduleView === 'history' ? historyScheduleItems : upcomingScheduleItems;
  const firstHostedTournament = mine.find((tournament) => isUpcomingScheduleItem(tournamentToScheduleItem(tournament)) && tournament.ownerid === me?.guid)
    ?? mine.find((tournament) => isUpcomingScheduleItem(tournamentToScheduleItem(tournament)))
    ?? null;
  const hostableGroups = useMemo(() => groups.filter((group) => group.isadmin && group.approved), [groups]);
  const loadingSchedule = loadingMine || loadingGames || (loadingLeagueEvents && scheduleList.length === 0);
  const externalSection = activeSection === 'groups' || activeSection === 'leagues'
    ? renderSection?.(activeSection)
    : null;

  useEffect(() => {
    if (!createGameRequestId || createGameRequestId === lastCreateGameRequestRef.current) return;
    lastCreateGameRequestRef.current = createGameRequestId;
    setShowCreate(true);
  }, [createGameRequestId]);

  useEffect(() => {
    if (!homeRequestId || homeRequestId === lastHomeRequestRef.current) return;
    lastHomeRequestRef.current = homeRequestId;
    setShowFullUpcomingSchedule(false);
    onScheduleModeChange?.('home');
  }, [homeRequestId, onScheduleModeChange]);

  useEffect(() => {
    if (!gamesRequestId || gamesRequestId === lastGamesRequestRef.current) return;
    lastGamesRequestRef.current = gamesRequestId;
    setShowFullUpcomingSchedule(true);
    onScheduleModeChange?.('games');
  }, [gamesRequestId, onScheduleModeChange]);

  useEffect(() => {
    onHostCapabilityChange?.(hostableGroups.length > 0);
  }, [hostableGroups.length, onHostCapabilityChange]);

  useEffect(() => {
    onCreateFlowChange?.(showCreate);
    return () => onCreateFlowChange?.(false);
  }, [onCreateFlowChange, showCreate]);

  useEffect(() => {
    if (activeSection !== 'upcoming') {
      setShowFullUpcomingSchedule(false);
      onScheduleModeChange?.('home');
    }
  }, [activeSection, onScheduleModeChange]);

  function setScheduleMode(mode: 'home' | 'games') {
    setShowFullUpcomingSchedule(mode === 'games');
    onScheduleModeChange?.(mode);
  }

  function changeSection(nextSection: CommandCenterSection) {
    setLocalSection(nextSection);
    onSectionChange?.(nextSection);
  }

  function openHostGame() {
    if (hostableGroups.length > 0) {
      setShowCreate(true);
      return;
    }
    changeSection('communities');
  }

  function openScheduleItem(item: ScheduleItem) {
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
    if (item.canManage) {
      navigate(`/?section=leagues&league=${encodeURIComponent(item.leagueId)}&leagueTab=events&event=${encodeURIComponent(item.eventId)}`);
      return;
    }
    if (item.tournamentId) {
      navigate(`/lobby/${item.tournamentId}`);
      return;
    }
    navigate(`/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`);
  }

  function openHomeScheduleItem(item: ScheduleItem) {
    if (item.canManage && !isScheduleParticipant(item)) {
      openScheduleItem(item);
      return;
    }
    if (item.kind === 'tournament') {
      navigate(`/lobby/${item.tournament.tournamentid}`);
      return;
    }
    if (item.kind === 'cash') {
      navigate(`/cash-games/${item.game.id}/admin`);
      return;
    }
    if (item.tournamentId) {
      navigate(`/lobby/${item.tournamentId}`);
      return;
    }
    navigate(`/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`);
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
          firstHostedTournament={firstHostedTournament}
          onboardingActive={onboardingActive}
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
        />
      )}

      {externalSection ? (
        <div className="min-w-0">{externalSection}</div>
      ) : activeSection === 'communities' ? (
        <CommunitiesDirectory
          groups={groups}
          leagues={leagues}
          upcomingCount={upcomingScheduleItems.length}
          onHome={() => {
            changeSection('upcoming');
            setScheduleMode('home');
          }}
          onCreate={() => setShowCommunityCreate(true)}
          onJoin={() => setShowCommunityJoin(true)}
          onOpen={(community) => {
            if (onOpenCommunity) {
              onOpenCommunity(community);
              return;
            }
            changeSection(community.type === 'group' ? 'groups' : 'leagues');
          }}
        />
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
          {loadingSchedule ? (
            scheduleView === 'upcoming' ? <HomeScheduleSkeleton /> : <LoadingSpinner className="mt-16" />
          ) : scheduleView === 'history' ? (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-pit-teal">History</p>
                <span className="rounded-full border border-pit-border bg-pit-surface px-2.5 py-1 text-xs font-semibold text-[#d0d0da]">{historyScheduleItems.length}</span>
              </div>
              <ScheduleList
                items={historyScheduleItems}
                focusItemId={focusScheduleItemId}
                view="history"
                pageSize={HISTORY_PAGE_SIZE}
                loading={false}
                onOpen={openHomeScheduleItem}
                onManage={openScheduleItem}
                onLeagueLobby={(item) => navigate(item.tournamentId ? `/lobby/${encodeURIComponent(item.tournamentId)}` : `/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`)}
                onRegister={(tournament) => registerMutation.mutate(tournament)}
                onDecline={(tournament) => declineMutation.mutate(tournament.tournamentid)}
                onLeagueEvent={(item) => navigate(`/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`)}
                onCashRsvp={(item, status) => cashRsvpMutation.mutate({ gameId: item.game.id, status })}
              />
            </section>
          ) : showFullUpcomingSchedule ? (
            <FullUpcomingSchedule
              items={upcomingScheduleItems}
              focusItemId={focusScheduleItemId}
              loading={registerMutation.isPending || declineMutation.isPending || cashRsvpMutation.isPending}
              onBack={() => setScheduleMode('home')}
              onOpen={openHomeScheduleItem}
              onManage={openScheduleItem}
              onLeagueLobby={(item) => navigate(item.tournamentId ? `/lobby/${encodeURIComponent(item.tournamentId)}` : `/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`)}
              onRegister={(tournament) => registerMutation.mutate(tournament)}
              onDecline={(tournament) => declineMutation.mutate(tournament.tournamentid)}
              onLeagueEvent={(item) => navigate(`/league/${encodeURIComponent(item.leagueId)}/event/${encodeURIComponent(item.eventId)}`)}
              onCashRsvp={(item, status) => cashRsvpMutation.mutate({ gameId: item.game.id, status })}
            />
          ) : (
            <HomeSchedule
              nextUp={featuredUpcomingItem}
              comingUp={comingUpScheduleItems}
              laterCount={laterScheduleItems.length}
              totalUpcomingCount={upcomingScheduleItems.length}
              canHost={hostableGroups.length > 0}
              onOpen={openHomeScheduleItem}
              onManage={openScheduleItem}
              onViewAll={() => setScheduleMode('games')}
              onHostGame={openHostGame}
            />
          )}
        </>
      )}

      <CreateCommunityModal
        open={showCommunityCreate}
        onClose={() => setShowCommunityCreate(false)}
        onCreateGroup={() => {
          setShowCommunityCreate(false);
          (onStartGroupCreate ?? (() => changeSection('groups')))();
        }}
        onCreateLeague={() => {
          setShowCommunityCreate(false);
          (onStartLeagueCreate ?? (() => changeSection('leagues')))();
        }}
      />
      <JoinCommunityModal
        open={showCommunityJoin}
        onClose={() => setShowCommunityJoin(false)}
        onSubmit={(code) => {
          setShowCommunityJoin(false);
          navigate(`/join/${encodeURIComponent(code.trim().toUpperCase())}`);
        }}
      />
    </>
  );
}

function DashboardOverview({
  me,
  groups,
  firstHostedTournament,
  onboardingActive,
  onStartGroupCreate,
  onStartGroupInvite,
  onStartFirstGame,
  onCompleteOnboarding,
  inviteSkipped,
  onSkipInvite,
  onOpenFirstGame,
}: {
  me?: Awaited<ReturnType<typeof api.me>>;
  groups: Group[];
  firstHostedTournament: Tournament | null;
  onboardingActive: boolean;
  onStartGroupCreate: () => void;
  onStartGroupInvite: (groupId: string) => void;
  onStartFirstGame: () => void;
  onCompleteOnboarding?: () => void;
  inviteSkipped: boolean;
  onSkipInvite: () => void;
  onOpenFirstGame: (tournamentId: string) => void;
}) {
  const adminGroups = groups.filter((group) => group.isadmin && group.approved);
  const primaryAdminGroup = adminGroups[0] ?? null;
  const hasInvitedPlayer = adminGroups.some((group) => Number(group.membercount ?? 0) > 1);
  const showOnboardingCard = onboardingActive && Boolean(me);

  if (!showOnboardingCard) return null;

  return (
    <section className="mb-5 max-w-[22rem]">
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

function CommunitiesDirectory({
  groups,
  leagues,
  upcomingCount,
  onHome,
  onCreate,
  onJoin,
  onOpen,
}: {
  groups: Group[];
  leagues: League[];
  upcomingCount: number;
  onHome: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onOpen: (community: { type: 'group' | 'league'; id: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);
  const imageMutation = useMutation({
    mutationFn: async ({ type, id, image, filename }: { type: 'group' | 'league'; id: string; image: string; filename: string }) => {
      if (type === 'group') {
        return api.updateGroupCommunityImage(id, { communityimagedata: image, communityimagefilename: filename });
      }
      return api.updateLeagueCommunityImage(id, { communityimagedata: image, communityimagefilename: filename });
    },
    onSuccess: (_result, variables) => {
      setImageError(null);
      setImageSuccess(`${variables.filename} saved.`);
      if (variables.type === 'group') {
        queryClient.setQueryData<Group[]>(['groups'], (current = []) => current.map((group) => (
          group.groupid === variables.id
            ? { ...group, communityimagedata: variables.image, communityimagefilename: variables.filename }
            : group
        )));
      } else {
        queryClient.setQueryData<League[]>(['leagues'], (current = []) => current.map((league) => (
          league.leagueid === variables.id
            ? { ...league, communityimagedata: variables.image, communityimagefilename: variables.filename }
            : league
        )));
      }
    },
    onError: (error) => {
      setImageSuccess(null);
      setImageError(error instanceof Error ? error.message : 'Community image could not be saved.');
    },
  });

  const communities = useMemo(() => [
    ...groups.map((group) => ({
      id: group.groupid,
      type: 'group' as const,
      name: group.name,
      code: group.invitecode,
      count: Number(group.membercount ?? 0),
      isAdmin: Boolean(group.isadmin),
      detail: group.nexttournamentname ? `Next: ${group.nexttournamentname}` : 'No game scheduled',
      image: group.communityimagedata ?? null,
    })),
    ...leagues.map((league) => ({
      id: league.leagueid,
      type: 'league' as const,
      name: league.name,
      code: league.invitecode,
      count: Number(league.membercount ?? 0),
      isAdmin: Boolean(league.isadmin),
      detail: `${Number(league.eventcount ?? 0)} event${Number(league.eventcount ?? 0) === 1 ? '' : 's'}`,
      image: league.communityimagedata ?? null,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name)), [groups, leagues]);

  const handleImage = async (community: typeof communities[number], file?: File) => {
    if (!file) return;
    setImageError(null);
    setImageSuccess(null);
    try {
      const image = await prepareCommunityImage(file);
      await imageMutation.mutateAsync({ type: community.type, id: community.id, image, filename: file.name });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'That image could not be prepared.');
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pit-border bg-pit-surface text-pit-text transition hover:border-pit-teal/55 hover:bg-pit-teal/10 hover:text-white"
            onClick={onHome}
            aria-label="Return home"
            title="Return home"
          >
            <Home size={17} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-pit-teal">Groups & Leagues</p>
            <h2 className="mt-1 truncate text-xl font-bold text-white">Your poker communities</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onJoin}>+ Join</button>
          <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={onCreate}>+ Create</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 divide-x divide-pit-border overflow-hidden rounded-lg border border-pit-border bg-pit-surface/75">
        {[
          { label: 'Communities', value: communities.length, icon: Users },
          { label: 'Groups', value: groups.length, icon: Users },
          { label: 'Leagues', value: leagues.length, icon: Trophy },
          { label: 'Upcoming', value: upcomingCount, icon: Calendar },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 px-2 py-2.5 text-center sm:flex sm:items-center sm:justify-center sm:gap-2 sm:px-3">
            <stat.icon size={15} className="mx-auto mb-1 text-pit-teal sm:m-0" />
            <div className="min-w-0 sm:text-left">
              <p className="text-base font-bold leading-none text-white">{stat.value}</p>
              <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-pit-text sm:text-[10px]">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {imageError && (
        <p className="mb-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">{imageError}</p>
      )}
      {imageSuccess && (
        <p className="mb-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">{imageSuccess}</p>
      )}

      {communities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pit-border bg-pit-surface/60 px-4 py-10 text-center">
          <Users className="mx-auto mb-3 text-pit-muted" size={28} />
          <p className="font-semibold text-white">No groups or leagues yet</p>
          <p className="mt-1 text-sm text-pit-text">Create or join one to keep your games and seasons together.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onJoin}>+ Join</button>
            <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={onCreate}>+ Create</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 md:gap-3">
            {communities.map((community) => (
              <article
                key={`${community.type}-${community.id}`}
                className={`group relative grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg border p-3 transition hover:-translate-y-0.5 hover:border-pit-teal/45 hover:shadow-[0_14px_30px_rgba(0,0,0,0.24)] md:grid-cols-[4.25rem_minmax(0,1fr)] md:items-start md:p-4 ${
                  community.type === 'group'
                    ? 'border-pit-teal/20 bg-[linear-gradient(135deg,rgba(20,184,181,0.09),rgba(27,27,34,0.96)_52%)]'
                    : 'border-violet-400/20 bg-[linear-gradient(135deg,rgba(139,92,246,0.1),rgba(27,27,34,0.96)_52%)]'
                }`}
              >
                <div className={`relative flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border md:h-[4.25rem] md:w-[4.25rem] ${
                  community.type === 'group' ? 'border-pit-teal/30 bg-pit-teal/10' : 'border-violet-400/30 bg-violet-500/10'
                }`}>
                  {community.image ? (
                    <img src={community.image} alt="" className="h-full w-full object-cover" />
                  ) : community.type === 'group' ? (
                    <Users size={24} className="text-pit-teal md:h-7 md:w-7" />
                  ) : (
                    <Trophy size={24} className="text-violet-300 md:h-7 md:w-7" />
                  )}
                  {community.isAdmin && (
                    <label
                      className="absolute inset-x-0 bottom-0 flex h-6 cursor-pointer items-center justify-center bg-black/75 text-white transition hover:bg-pit-teal hover:text-pit-bg"
                      title="Upload community image"
                      aria-label={`Upload image for ${community.name}`}
                    >
                      {imageMutation.isPending && imageMutation.variables?.id === community.id ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      ) : (
                        <Camera size={13} />
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={imageMutation.isPending}
                        onChange={(event) => {
                          void handleImage(community, event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="min-w-0 self-center md:self-start">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h3 className="min-w-0 truncate text-sm font-bold text-white transition group-hover:text-pit-teal md:text-base">{community.name}</h3>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] ${
                      community.type === 'group'
                        ? 'border-pit-teal/45 bg-pit-teal/10 text-pit-teal'
                        : 'border-violet-400/45 bg-violet-500/10 text-violet-300'
                    }`}>{community.type}</span>
                    {community.isAdmin && (
                      <span className="shrink-0 rounded-full border border-pit-gold/35 bg-pit-gold/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-pit-gold">
                        <Crown size={9} className="mr-0.5 inline" /> Admin
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-pit-text md:mt-2 md:text-xs">
                    <span className="inline-flex shrink-0 items-center gap-1"><Users size={12} /> {community.count}</span>
                    <span className="truncate">{community.detail}</span>
                  </div>
                  <p className="mt-2 hidden text-[10px] uppercase tracking-[0.12em] text-pit-muted md:block">Join code {community.code}</p>
                </div>

                <button
                  type="button"
                  className="btn-primary col-start-3 row-start-1 h-9 self-center px-3 text-xs md:col-span-2 md:col-start-1 md:row-start-auto md:mt-1 md:w-full md:justify-center"
                  onClick={() => onOpen({ type: community.type, id: community.id })}
                  aria-label={`Open ${community.name}`}
                >
                  Open <ChevronRight size={14} />
                </button>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}

async function prepareCommunityImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Use a PNG, JPG, or WebP image.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 8 MB.');
  }

  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let releaseSource: () => void = () => {};

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      source = bitmap;
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      releaseSource = () => bitmap.close();
    } catch {
      const decoded = await loadCommunityImage(file);
      source = decoded.image;
      sourceWidth = decoded.image.naturalWidth;
      sourceHeight = decoded.image.naturalHeight;
      releaseSource = decoded.release;
    }
  } else {
    const decoded = await loadCommunityImage(file);
    source = decoded.image;
    sourceWidth = decoded.image.naturalWidth;
    sourceHeight = decoded.image.naturalHeight;
    releaseSource = decoded.release;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the image.');

  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  try {
    context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/webp', 0.8);
  } finally {
    releaseSource();
  }
}

function loadCommunityImage(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be opened.'));
    };
    image.src = url;
  });
}

function CreateCommunityModal({
  open,
  onClose,
  onCreateGroup,
  onCreateLeague,
}: {
  open: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onCreateLeague: () => void;
}) {
  return (
    <Modal title="Create Group or League" open={open} onClose={onClose} mobilePlacement="center">
      <p className="text-sm text-pit-text">Choose the kind of poker community you want to set up.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCreateGroup}
          className="rounded-xl border border-pit-teal/35 bg-pit-teal/10 p-4 text-left transition hover:border-pit-teal hover:bg-pit-teal/15"
        >
          <Users size={20} className="text-pit-teal" />
          <span className="mt-3 block font-semibold text-white">Group</span>
          <span className="mt-1 block text-xs leading-5 text-pit-text">Bring players together to organize games, posts, and invites.</span>
        </button>
        <button
          type="button"
          onClick={onCreateLeague}
          className="rounded-xl border border-violet-400/35 bg-violet-500/10 p-4 text-left transition hover:border-violet-300 hover:bg-violet-500/15"
        >
          <Trophy size={20} className="text-violet-300" />
          <span className="mt-3 block font-semibold text-white">League</span>
          <span className="mt-1 block text-xs leading-5 text-pit-text">Set up a multi-event season with standings, points, and fees.</span>
        </button>
      </div>
    </Modal>
  );
}

function JoinCommunityModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  return (
    <Modal
      title="Join Group or League"
      open={open}
      onClose={onClose}
      mobilePlacement="center"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!code.trim()} onClick={() => onSubmit(code)}>
            Continue
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          className="input text-center font-mono text-lg uppercase tracking-[0.18em]"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 10))}
          placeholder="Join code"
          maxLength={10}
          autoFocus
        />
        <p className="text-center text-xs text-pit-muted">Enter a group or league join code.</p>
      </div>
    </Modal>
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
      tournamentId?: string | null;
      isParticipant: boolean;
      completed: boolean;
      rsvpStatus?: string | null;
      goingCount: number;
      seasonPlayerCount: number;
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

function NextUpFocus({ item, onOpen, onManage }: { item: ScheduleItem; onOpen: () => void; onManage: () => void }) {
  const isTournament = item.kind === 'tournament';
  const isLeague = item.kind === 'league';
  const isCash = item.kind === 'cash';
  const isLive = isLiveScheduleItem(item);
  const isRegistered = isTournament
    ? Boolean(item.tournament.isregistered)
    : isLeague
      ? item.rsvpStatus === 'going'
      : Boolean(item.isRegistered) || item.rsvpStatus === 'going';
  const isDeclined = isTournament
    ? Boolean(item.tournament.isdeclined) && !isRegistered
    : item.rsvpStatus === 'not_going';
  const canRespond = isTournament
    ? Boolean(item.tournament.groupid) && !item.canManage
    : isLeague
      ? item.isParticipant && !hasScheduleStarted(item.date, item.time)
      : !item.canManage;
  const typeLabel = isTournament ? 'Tournament' : isCash ? 'Cash game' : 'League';
  const fieldCount = isTournament
    ? formatFieldCount(item.tournament)
    : isCash
      ? formatCashGameCount(item.game)
      : `${item.goingCount}/${item.seasonPlayerCount}`;
  const typePillClass = isCash
    ? 'border-[#F5B84B]/45 bg-[#F5B84B]/12 text-[#F5B84B]'
    : isLeague
      ? 'border-[#8B5CF6]/45 bg-[#8B5CF6]/12 text-[#A78BFA]'
      : 'border-pit-teal/35 bg-pit-teal/10 text-pit-teal';
  const attendanceLabel = isRegistered ? 'Going' : isDeclined ? "I'm out" : canRespond ? 'RSVP Needed' : null;
  const attendanceClass = isRegistered
    ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-300'
    : isDeclined
      ? 'border-red-300/45 bg-red-400/10 text-red-100'
      : 'border-pit-gold/45 bg-pit-gold/15 text-pit-gold';
  const isParticipant = isScheduleParticipant(item);
  const primaryIsManage = item.canManage && !isParticipant;

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-pit-teal/55 bg-[radial-gradient(circle_at_82%_32%,rgba(20,184,166,0.22),transparent_34%),linear-gradient(145deg,rgba(5,48,49,0.98),rgba(15,24,28,0.98)_76%)] shadow-[0_20px_52px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-7 z-0 h-24 w-28 opacity-20 sm:right-7 sm:top-6 sm:h-28 sm:w-32"
      >
        <div className="absolute left-1 top-2 flex h-[76%] w-[62%] -rotate-12 items-center justify-center rounded-xl border border-pit-teal/60 bg-pit-black/20">
          <Diamond className="h-8 w-8 text-pit-teal/55" strokeWidth={1.4} />
        </div>
        <div className="absolute bottom-0 right-0 flex h-[82%] w-[66%] rotate-6 items-center justify-center rounded-xl border border-pit-teal/80 bg-pit-panel/75 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
          <Spade className="h-10 w-10 text-pit-teal/75" strokeWidth={1.5} />
        </div>
      </div>
      <div className="relative z-10 flex flex-col px-4 py-4 sm:px-5">
        <div className="min-w-0 max-w-[78%] sm:max-w-[72%]">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${typePillClass}`}>
              {typeLabel}
            </span>
            {item.parentName && <span className="min-w-0 truncate text-xs font-semibold text-[#d7d7e0] sm:text-sm">{item.parentName}</span>}
            {isLive && primaryIsManage && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-400">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                </span>
                Live
              </span>
            )}
          </div>
          <button type="button" onClick={onOpen} className="mt-2 line-clamp-2 block max-w-[34rem] text-left text-[1.55rem] font-black leading-[1.08] text-white transition hover:text-pit-teal sm:text-[1.85rem]" title={item.name}>
            {item.name}
          </button>
          <div className="mt-3 flex flex-col gap-2 text-xs text-[#e1e1e8] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex min-w-0 items-center gap-1.5"><Calendar size={14} className="shrink-0 text-pit-muted" /><span className="truncate">{formatHeroLongDate(item.date)}</span></span>
              {item.time && <span className="inline-flex shrink-0 items-center gap-1.5"><Clock size={14} className="text-pit-muted" />{formatTime12Hour(item.time)}</span>}
            </div>
            <div className="flex items-center gap-2">
              {fieldCount && <span className="inline-flex items-center gap-1.5"><Users size={14} className="text-pit-muted" />{fieldCount}</span>}
              {attendanceLabel && <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 font-semibold ${attendanceClass}`}>{attendanceLabel}</span>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="inline-flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-xl font-black text-pit-teal">{formatCostLabel(item.cost)}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-pit-muted">Buy-in</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`btn-primary w-[8.5rem] justify-center px-3 sm:w-[11rem] ${isLive && !primaryIsManage ? 'h-[3.25rem] flex-col gap-0.5 py-1.5' : 'h-10 gap-1.5 text-sm'}`}
              onClick={onOpen}
            >
              {isLive && !primaryIsManage ? (
                <>
                  <span className="inline-flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-400">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                    </span>
                    Live
                  </span>
                  <span className="text-[15px] font-black leading-tight">Enter Lobby</span>
                </>
              ) : (
                <>
                  {primaryIsManage && <Settings size={15} />}
                  {primaryIsManage ? 'Manage game' : 'View details'}
                  {!primaryIsManage && <ChevronRight size={16} />}
                </>
              )}
            </button>
            {item.canManage && isParticipant && (
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pit-border bg-[#101216] text-[#d6d7df] transition hover:border-pit-teal/50 hover:bg-pit-teal/10 hover:text-pit-teal"
                onClick={onManage}
                aria-label={`Administer ${item.name}`}
                title={`Administer ${item.name}`}
              >
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeSchedule({
  nextUp,
  comingUp,
  laterCount,
  totalUpcomingCount,
  canHost,
  onOpen,
  onManage,
  onViewAll,
  onHostGame,
}: {
  nextUp: ScheduleItem | null;
  comingUp: ScheduleItem[];
  laterCount: number;
  totalUpcomingCount: number;
  canHost: boolean;
  onOpen: (item: ScheduleItem) => void;
  onManage: (item: ScheduleItem) => void;
  onViewAll: () => void;
  onHostGame: () => void;
}) {
  const visibleComingUp = comingUp.slice(0, 2);
  const hiddenComingUpCount = Math.max(0, comingUp.length - visibleComingUp.length);

  if (!nextUp) {
    return <HomeEmptyState canHost={canHost} onHostGame={onHostGame} />;
  }

  return (
    <div className="mx-auto max-w-[48rem] space-y-5 sm:space-y-6">
      <section aria-labelledby="next-up-heading">
        <p id="next-up-heading" className="mb-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-pit-teal">Next up</p>
        <NextUpFocus item={nextUp} onOpen={() => onOpen(nextUp)} onManage={() => onManage(nextUp)} />
      </section>

      {visibleComingUp.length > 0 && (
        <section aria-labelledby="coming-up-heading">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p id="coming-up-heading" className="text-[11px] font-black uppercase tracking-[0.18em] text-pit-teal">Coming up</p>
            <span className="text-[11px] font-semibold text-[#bfc0cb]">{comingUp.length} upcoming</span>
          </div>
          <div className="divide-y divide-pit-border/80 overflow-hidden rounded-xl border border-pit-border bg-[#17191e] shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
            {visibleComingUp.map((item) => (
              <CompactGameRow key={item.id} item={item} embedded onOpen={() => onOpen(item)} onManage={() => onManage(item)} />
            ))}
            {hiddenComingUpCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-semibold text-pit-teal transition hover:bg-pit-teal/5 hover:text-[#8ef4eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pit-teal"
                onClick={onViewAll}
              >
                View all {totalUpcomingCount} upcoming games
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}

      {laterCount > 0 && (
        <section aria-labelledby="later-games-heading">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p id="later-games-heading" className="text-[11px] font-black uppercase tracking-[0.18em] text-pit-teal">Later</p>
            <span className="text-[11px] font-semibold text-[#bfc0cb]">{laterCount} games</span>
          </div>
          <button
            type="button"
            className="flex h-[3.35rem] w-full items-center justify-between rounded-xl border border-pit-border bg-[#17191e] px-4 text-left text-sm font-semibold text-[#e4e4ea] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition hover:border-pit-teal/45 hover:bg-pit-teal/5 hover:text-white"
            onClick={onViewAll}
          >
            <span>View all {laterCount} later games</span>
            <ChevronRight size={18} className="text-pit-teal" />
          </button>
        </section>
      )}

    </div>
  );
}

function CompactGameRow({ item, embedded = false, onOpen, onManage }: { item: ScheduleItem; embedded?: boolean; onOpen: () => void; onManage: () => void }) {
  const isTournament = item.kind === 'tournament';
  const isLeague = item.kind === 'league';
  const isCash = item.kind === 'cash';
  const { month, day } = formatScheduleDateTile(item.date);
  const typeLabel = isTournament ? 'Tournament' : isCash ? 'Cash game' : 'League';
  const fieldCount = isTournament
    ? formatFieldCount(item.tournament)
    : isCash
      ? formatCashGameCount(item.game)
      : `${item.goingCount}/${item.seasonPlayerCount}`;
  const typePillClass = isCash
    ? 'border-[#F5B84B]/45 bg-[#F5B84B]/12 text-[#F5B84B]'
    : isLeague
      ? 'border-[#8B5CF6]/45 bg-[#8B5CF6]/12 text-[#A78BFA]'
      : 'border-pit-teal/35 bg-pit-teal/10 text-pit-teal';
  const showAdmin = item.canManage;
  const isRegistered = isTournament
    ? Boolean(item.tournament.isregistered)
    : isLeague
      ? item.rsvpStatus === 'going'
      : Boolean(item.isRegistered) || item.rsvpStatus === 'going';
  const isDeclined = isTournament
    ? Boolean(item.tournament.isdeclined) && !isRegistered
    : item.rsvpStatus === 'not_going';
  const canRespond = isTournament
    ? Boolean(item.tournament.groupid) && !item.canManage
    : isLeague
      ? item.isParticipant && !hasScheduleStarted(item.date, item.time)
      : !item.canManage;
  const attendanceLabel = isRegistered ? 'Going' : isDeclined ? "I'm out" : canRespond ? 'RSVP Needed' : null;
  const attendanceClass = isRegistered
    ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-300'
    : isDeclined
      ? 'border-red-300/45 bg-red-400/10 text-red-100'
      : 'border-pit-gold/45 bg-pit-gold/15 text-pit-gold';

  return (
    <div className={`group flex min-h-[4.85rem] items-stretch gap-1 p-2 transition hover:bg-pit-teal/[0.045] ${embedded ? '' : 'rounded-xl border border-pit-border bg-[#17191e] shadow-[0_10px_28px_rgba(0,0,0,0.12)]'}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal sm:gap-3"
        aria-label={`Open ${item.name}`}
      >
        <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-pit-teal/20 bg-[#101216] leading-none shadow-inner">
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-pit-teal">{month}</span>
          <span className="mt-1 text-[1.35rem] font-black text-white">{day}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-white" title={item.name}>{item.name}</span>
            {isLiveScheduleItem(item) && (
              <span className="relative flex h-2 w-2 shrink-0" aria-label="Live">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
              </span>
            )}
          </span>
          {item.parentName && <span className="mt-0.5 block truncate text-[11px] text-[#bfc0ca] sm:text-xs" title={item.parentName}>{item.parentName}</span>}
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-[#c9cad3] sm:text-[11px]">
            {item.time && <span className="inline-flex items-center gap-1"><Clock size={12} />{formatTime12Hour(item.time)}</span>}
            {item.time && fieldCount && <span aria-hidden="true">&#8226;</span>}
            {fieldCount && <span className="inline-flex items-center gap-1"><Users size={12} />{fieldCount}</span>}
            {attendanceLabel && (
              <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[9px] font-black leading-none ${attendanceClass}`}>
                {attendanceLabel}
              </span>
            )}
          </span>
        </span>
        <span className="flex h-full shrink-0 flex-col items-end justify-between py-0.5">
          <span className="text-sm font-black text-pit-gold">{formatCostLabel(item.cost)}</span>
          <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-semibold uppercase tracking-[0.1em] max-[390px]:hidden ${typePillClass}`}>{typeLabel}</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-[#8c8d98] transition group-hover:text-pit-teal" />
      </button>
      {showAdmin && (
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-lg border border-pit-border bg-[#101216] text-[#d6d7df] transition hover:border-pit-teal/50 hover:bg-pit-teal/10 hover:text-pit-teal"
          onClick={onManage}
          aria-label={`Administer ${item.name}`}
          title={`Administer ${item.name}`}
        >
          <Settings size={16} />
        </button>
      )}
    </div>
  );
}

function FullUpcomingSchedule({
  items,
  focusItemId,
  loading,
  onBack,
  onOpen,
  onManage,
  onRegister,
  onDecline,
  onLeagueEvent,
  onLeagueLobby,
  onCashRsvp,
}: Omit<ScheduleListProps, 'items' | 'view' | 'pageSize'> & {
  items: ScheduleItem[];
  onBack: () => void;
}) {
  return (
    <section className="mx-auto max-w-[48rem]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-pit-teal">All upcoming games</p>
          <p className="mt-1 text-xs text-pit-muted">{items.length} scheduled</p>
        </div>
        <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onBack}>
          <ArrowLeft size={14} /> Home
        </button>
      </div>
      <ScheduleList
        items={items}
        focusItemId={focusItemId}
        view="upcoming"
        calendarLayout
        loading={loading}
        onOpen={onOpen}
        onManage={onManage}
        onRegister={onRegister}
        onDecline={onDecline}
        onLeagueEvent={onLeagueEvent}
        onLeagueLobby={onLeagueLobby}
        onCashRsvp={onCashRsvp}
      />
    </section>
  );
}

function HomeScheduleSkeleton() {
  return (
    <div className="mx-auto max-w-[46rem] space-y-5 animate-pulse">
      <div className="h-52 rounded-2xl border border-pit-border bg-pit-surface/65" />
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-pit-surface" />
        <div className="h-20 rounded-xl border border-pit-border bg-pit-surface/65" />
        <div className="h-20 rounded-xl border border-pit-border bg-pit-surface/65" />
      </div>
    </div>
  );
}

function HomeEmptyState({ canHost, onHostGame }: { canHost: boolean; onHostGame: () => void }) {
  return (
    <div className="mx-auto flex min-h-72 max-w-[46rem] flex-col items-center justify-center rounded-2xl border border-pit-border bg-pit-surface/55 px-5 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-pit-teal/30 bg-pit-teal/10 text-pit-teal"><Trophy size={24} /></div>
      <h2 className="mt-4 text-xl font-black text-white">No games scheduled</h2>
      <p className="mt-2 max-w-xs text-sm leading-6 text-pit-text">Ready to get something on the calendar?</p>
      {canHost && <button type="button" className="btn-primary mt-5 px-5 py-3 text-sm" onClick={onHostGame}>+ Host a Game</button>}
    </div>
  );
}

type ScheduleListProps = {
  items: ScheduleItem[];
  focusItemId?: string;
  view: 'upcoming' | 'history';
  calendarLayout?: boolean;
  pageSize?: number;
  loading: boolean;
  onOpen: (item: ScheduleItem) => void;
  onManage: (item: ScheduleItem) => void;
  onRegister: (tournament: Tournament) => void;
  onDecline: (tournament: Tournament) => void;
  onLeagueEvent: (item: Extract<ScheduleItem, { kind: 'league' }>) => void;
  onLeagueLobby: (item: Extract<ScheduleItem, { kind: 'league' }>) => void;
  onCashRsvp: (item: Extract<ScheduleItem, { kind: 'cash' }>, status: 'going' | 'not_going') => void;
};

function ScheduleList({
  items,
  focusItemId,
  view,
  calendarLayout = false,
  pageSize,
  loading,
  onOpen,
  onManage,
  onRegister,
  onDecline,
  onLeagueEvent,
  onLeagueLobby,
  onCashRsvp,
}: ScheduleListProps) {
  const [page, setPage] = useState(0);
  const pageCount = pageSize ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visibleItems = pageSize
    ? items.slice(safePage * pageSize, safePage * pageSize + pageSize)
    : items;

  useEffect(() => {
    setPage(0);
  }, [view]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (!focusItemId || items.length === 0) return;
    const itemIndex = items.findIndex((item) => item.id === focusItemId);
    if (itemIndex >= 0 && pageSize) {
      setPage(Math.floor(itemIndex / pageSize));
    }
  }, [focusItemId, items, pageSize]);

  useEffect(() => {
    if (!focusItemId || !visibleItems.some((item) => item.id === focusItemId)) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`schedule-item-${focusItemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusItemId, visibleItems]);

  if (items.length === 0) return <EmptyState view={view} />;

  return (
    <div className="overflow-visible rounded-xl border border-pit-border bg-pit-surface/70 shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
      {!calendarLayout && (
        <div className="hidden grid-cols-[minmax(12rem,1.35fr)_6.75rem_8.5rem_5.5rem_10.25rem_7rem] gap-4 border-b border-pit-border/70 bg-black/18 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b8b8c7] lg:grid">
          <span>Name</span>
          <span>Type</span>
          <span>Date / time</span>
          <span>Cost</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>
      )}
      <div className="divide-y divide-pit-border/60">
        {visibleItems.map((item) => (
          <ScheduleRow
            key={item.id}
            item={item}
            focused={item.id === focusItemId}
            view={view}
            calendarLayout={calendarLayout}
            loading={loading}
            onOpen={() => onOpen(item)}
            onManage={() => onManage(item)}
            onRegister={item.kind === 'tournament' ? () => onRegister(item.tournament) : undefined}
            onDecline={item.kind === 'tournament' ? () => onDecline(item.tournament) : undefined}
            onLeagueEvent={item.kind === 'league' ? () => onLeagueEvent(item) : undefined}
            onLeagueLobby={item.kind === 'league' ? () => onLeagueLobby(item) : undefined}
            onCashRsvp={item.kind === 'cash' ? (status) => onCashRsvp(item, status) : undefined}
          />
        ))}
      </div>
      {pageSize && items.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-pit-border/70 px-4 py-3 sm:px-5">
          <p className="text-xs text-[#c6c6d2]">
            Showing {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, items.length)} of {items.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost inline-flex h-8 w-8 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              aria-label="Previous history page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-14 text-center text-xs font-semibold text-[#d0d0da]">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn-ghost inline-flex h-8 w-8 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              aria-label="Next history page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  item,
  focused,
  view,
  calendarLayout = false,
  loading,
  onOpen,
  onManage,
  onRegister,
  onDecline,
  onLeagueEvent,
  onLeagueLobby,
  onCashRsvp,
}: {
  item: ScheduleItem;
  focused?: boolean;
  view: 'upcoming' | 'history';
  calendarLayout?: boolean;
  loading: boolean;
  onOpen: () => void;
  onManage: () => void;
  onRegister?: () => void;
  onDecline?: () => void;
  onLeagueEvent?: () => void;
  onLeagueLobby?: () => void;
  onCashRsvp?: (status: 'going' | 'not_going') => void;
}) {
  const isTournament = item.kind === 'tournament';
  const isLeague = item.kind === 'league';
  const isCash = item.kind === 'cash';
  const isLive = view === 'upcoming' && isLiveScheduleItem(item);
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
  const leagueEventStarted = isLeague && hasScheduleStarted(item.date, item.time);
  const showLeagueRsvp = view === 'upcoming' && isLeague && item.isParticipant && !leagueEventStarted;
  const showLeagueLobby = view === 'upcoming' && isLeague && item.isParticipant && leagueEventStarted;
  const showLeagueAdminOnly = view === 'upcoming' && isLeague && item.canManage && !item.isParticipant;
  const showLeagueAdminPlayerMenu = view === 'upcoming' && isLeague && item.canManage && item.isParticipant;
  const showTournamentAdminPlayerActions = view === 'upcoming' && isTournament && item.canManage && isRegistered;
  const showCashRsvp = view === 'upcoming' && isCash && !item.canManage;
  const showTournamentLobby = showRsvp && isRegistered;
  const showAnyRsvp = showRsvp || showLeagueRsvp || showCashRsvp;
  const showRsvpChoices = showRsvp || showCashRsvp;
  const needsRsvp = showAnyRsvp && !isRegistered && !isDeclined;
  const needsLeagueRsvp = showLeagueRsvp && needsRsvp;
  const typeLabel = isTournament ? 'Tournament' : isCash ? 'Cash Game' : 'League';
  const statusLabel = needsRsvp
    ? 'RSVP Needed'
    : isRegistered
      ? 'DEAL ME IN'
      : isDeclined
        ? "I'M OUT"
        : item.canManage && (isTournament || isCash)
          ? 'Host'
          : null;
  const fieldCount = isTournament
    ? formatFieldCount(item.tournament)
    : isCash
      ? formatCashGameCount(item.game)
      : `${item.goingCount}/${item.seasonPlayerCount}`;
  const typePillClass = isCash
    ? 'border-[#F5B84B]/45 bg-[#F5B84B]/12 text-[#F5B84B]'
    : isLeague
      ? 'border-[#8B5CF6]/45 bg-[#8B5CF6]/12 text-[#A78BFA]'
      : 'border-pit-teal/35 bg-pit-teal/10 text-pit-teal';
  const statusPillClass = needsRsvp
    ? 'border-pit-gold/45 bg-pit-gold/15 text-pit-gold'
    : isDeclined
      ? 'border-red-300/45 bg-red-400/15 text-red-100'
      : isRegistered
        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
        : 'border-pit-teal/35 bg-pit-teal/15 text-pit-teal';
  const statusIcon = needsRsvp
    ? <CalendarCheck size={13} className="shrink-0" />
    : isDeclined
      ? <X size={13} strokeWidth={2.5} className="shrink-0" />
      : isRegistered
        ? <Check size={13} strokeWidth={2.5} className="shrink-0" />
        : <Settings size={13} className="shrink-0" />;
  const showMobileStatus = Boolean(statusLabel && (needsRsvp || isRegistered || isDeclined));
  const dateTile = formatScheduleDateTile(item.date);

  return (
    <div
      id={`schedule-item-${item.id}`}
      className={`grid border-l-2 transition ${calendarLayout
        ? 'grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:px-4'
        : 'grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-3 py-2 lg:grid-cols-[minmax(12rem,1.35fr)_6.75rem_8.5rem_5.5rem_10.25rem_7rem] lg:items-center lg:gap-4 lg:border-l-0 lg:px-5 lg:py-3'} ${
        focused
          ? 'border-pit-teal bg-pit-teal/10 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.35),0_0_24px_rgba(20,184,166,0.12)]'
          :
        isLive
          ? 'border-pit-teal bg-pit-teal/[0.11] shadow-[inset_0_0_0_1px_rgba(20,184,166,0.26),0_0_26px_rgba(20,184,166,0.13)]'
          :
        isDeclined
          ? 'border-red-300/60 bg-red-500/[0.035] lg:bg-red-500/10'
          : isRegistered
            ? 'border-pit-teal/60 bg-pit-teal/[0.035] lg:bg-pit-teal/5'
            : 'border-transparent hover:bg-white/[0.025]'
      }`}
    >
      {calendarLayout && (
        <div className="col-start-1 row-span-2 row-start-1 flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-white/15 bg-black/30 text-center shadow-inner sm:h-16 sm:w-16">
          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#bfc0ca]">{dateTile.month}</span>
          <span className="mt-0.5 text-xl font-black leading-none text-white sm:text-2xl">{dateTile.day}</span>
        </div>
      )}

      <div className={calendarLayout
        ? 'col-start-2 row-span-2 row-start-1 min-w-0 overflow-hidden'
        : 'col-start-1 row-start-1 min-w-0 overflow-hidden lg:col-auto lg:row-auto'}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="block min-w-0 truncate text-left text-sm font-semibold text-white transition hover:text-pit-teal lg:text-base"
            onClick={onOpen}
            title={item.name}
          >
            {item.name}
          </button>
          {isLive && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pit-teal/60 bg-pit-teal/18 px-2 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-red-400 shadow-[0_0_16px_rgba(20,184,166,0.26)]">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
              </span>
              Live
            </span>
          )}
        </div>
        {item.parentName && (
          <p className="mt-1 w-full min-w-0 truncate text-xs text-[#b3b3c2]" title={item.parentName}>{item.parentName}</p>
        )}
        {calendarLayout && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-[#c9cad3] sm:text-[11px]">
            {item.time && <span className="inline-flex items-center gap-1"><Clock size={12} />{formatTime12Hour(item.time)}</span>}
            {fieldCount && <span className="inline-flex items-center gap-1"><Users size={12} />{fieldCount}</span>}
            <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${typePillClass}`}>{typeLabel}</span>
            {statusLabel && (
              <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[9px] font-black ${statusPillClass}`}>
                {statusIcon}
                {statusLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={calendarLayout ? 'hidden' : 'hidden lg:col-auto lg:row-auto lg:flex'}>
        <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${typePillClass}`}>
          {typeLabel}
        </span>
      </div>

      <div className={calendarLayout
        ? 'hidden'
        : 'col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[#c6c6d2] lg:col-auto lg:row-auto lg:block lg:space-y-1 lg:text-xs'}>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 lg:bg-transparent lg:px-0 lg:py-0">
          <Calendar size={13} className="shrink-0" />
          {item.date ?? 'Date TBD'}
        </span>
        {item.time && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 lg:bg-transparent lg:px-0 lg:py-0">
            <Clock size={13} className="shrink-0" />
            {formatTime12Hour(item.time)}
          </span>
        )}
        {fieldCount && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 lg:hidden">
            <Users size={13} className="shrink-0" />
            {fieldCount}
          </span>
        )}
        {showMobileStatus && (
          <span className={`inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-[9px] font-black leading-none lg:hidden ${statusPillClass}`}>
            {statusIcon}
            {statusLabel}
          </span>
        )}
      </div>

      <div className={calendarLayout
        ? 'col-start-3 row-start-1 flex items-center justify-end self-start whitespace-nowrap text-right text-sm font-black text-pit-gold sm:text-base'
        : 'col-start-2 row-start-1 flex items-center justify-end gap-1.5 justify-self-end whitespace-nowrap text-right text-sm font-bold text-pit-gold lg:col-auto lg:row-auto lg:block lg:justify-self-auto lg:text-left'}>
        <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-semibold uppercase tracking-[0.1em] ${calendarLayout ? 'hidden' : 'lg:hidden'} ${typePillClass}`}>
          {typeLabel}
        </span>
        <span>{formatCostLabel(item.cost)}</span>
      </div>

      <div className={calendarLayout ? 'hidden' : 'col-start-2 row-start-2 hidden items-center justify-end gap-2 lg:col-auto lg:row-auto lg:flex lg:justify-start'}>
        {fieldCount && (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-[#d0d0da]">
            <Users size={13} className="shrink-0" />
            {fieldCount}
          </span>
        )}
        {statusLabel && (
          <span className={`inline-flex h-7 min-w-[6.75rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold ${statusPillClass}`}>
            {statusIcon}
            {statusLabel}
          </span>
        )}
      </div>

      <div className={calendarLayout
        ? 'col-start-3 row-start-2 flex items-center justify-end gap-1.5 self-end'
        : showRsvpChoices
          ? 'col-span-2 row-start-3 mt-2 grid grid-cols-2 gap-2 lg:col-auto lg:row-auto lg:mt-0 lg:flex lg:grid-cols-none lg:justify-end'
          : 'col-start-2 row-start-2 flex items-center justify-end gap-1.5 lg:col-auto lg:row-auto lg:gap-2'}>
        {showLeagueAdminPlayerMenu ? (
          <>
            <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onLeagueLobby}>
              <PlayCircle size={14} />
              <span className={calendarLayout ? 'hidden sm:inline' : ''}>Lobby</span>
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pit-border bg-[#101216] text-[#d6d7df] transition hover:border-pit-teal/50 hover:bg-pit-teal/10 hover:text-pit-teal"
              onClick={onManage}
              aria-label={`Administer ${item.name}`}
              title={`Administer ${item.name}`}
            >
              <Settings size={14} />
            </button>
          </>
        ) : showTournamentAdminPlayerActions ? (
          <>
            <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onOpen}>
              <PlayCircle size={14} />
              <span className={calendarLayout ? 'hidden sm:inline' : ''}>{isLive ? 'Lobby' : 'Details'}</span>
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pit-border bg-[#101216] text-[#d6d7df] transition hover:border-pit-teal/50 hover:bg-pit-teal/10 hover:text-pit-teal"
              onClick={onManage}
              aria-label={`Administer ${item.name}`}
              title={`Administer ${item.name}`}
            >
              <Settings size={14} />
            </button>
          </>
        ) : showLeagueAdminOnly ? (
          <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onManage}>
            <Settings size={14} />
            Admin
          </button>
        ) : showLeagueLobby ? (
          <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onLeagueLobby}>
              <PlayCircle size={14} />
              Lobby
          </button>
        ) : showTournamentLobby ? (
          <>
            <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onOpen}>
              <PlayCircle size={14} />
              Lobby
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-10 items-center justify-center rounded-full border border-red-300/30 bg-red-400/8 text-xs font-semibold text-red-200 transition hover:bg-red-400/15 lg:h-9 lg:min-w-14 lg:px-3"
              disabled={loading}
              onClick={onDecline}
              aria-label={`Cannot attend ${item.name}`}
              title="Cannot attend"
            >
              <X size={16} />
            </button>
          </>
        ) : needsLeagueRsvp ? (
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border border-pit-gold/55 bg-pit-gold/20 px-3 py-2 text-xs font-black text-pit-gold shadow-[0_0_18px_rgba(244,178,74,0.14)] transition hover:bg-pit-gold/30 hover:text-yellow-100" onClick={onLeagueEvent}>
            <CalendarCheck size={14} />
            RSVP
          </button>
        ) : showLeagueRsvp ? (
          <button type="button" className="btn-primary gap-2 px-3 py-2 text-xs" onClick={onLeagueEvent}>
            <PlayCircle size={14} />
            Lobby
          </button>
        ) : showRsvpChoices ? (
          <>
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 border font-black transition ${calendarLayout ? 'h-8 w-8 rounded-lg p-0 text-xs sm:w-auto sm:px-2.5' : 'h-10 rounded-xl px-3 text-sm lg:h-9 lg:min-w-20 lg:rounded-full lg:text-xs'} ${
                isRegistered
                  ? 'border-pit-teal/55 bg-pit-teal/20 text-pit-teal shadow-inner'
                  : 'border-pit-teal/45 bg-pit-teal/12 text-pit-teal hover:bg-pit-teal/20'
              }`}
              disabled={loading || isRegistered}
              onClick={showCashRsvp ? () => onCashRsvp?.('going') : onRegister}
              aria-label={`Can attend ${item.name}`}
              title="Can attend"
            >
              <CheckCircle2 size={16} />
              <span className={calendarLayout ? 'hidden sm:inline' : ''}>Deal me in</span>
            </button>
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 border font-black transition ${calendarLayout ? 'h-8 w-8 rounded-lg p-0 text-xs sm:w-auto sm:px-2.5' : 'h-10 rounded-xl px-3 text-sm lg:h-9 lg:min-w-20 lg:rounded-full lg:text-xs'} ${
                isDeclined
                  ? 'border-red-300/55 bg-red-400/20 text-red-100 shadow-inner'
                  : 'border-red-300/30 bg-red-400/8 text-red-200 hover:bg-red-400/15'
              }`}
              disabled={loading || isDeclined}
              onClick={showCashRsvp ? () => onCashRsvp?.('not_going') : onDecline}
              aria-label={`Cannot attend ${item.name}`}
              title="Cannot attend"
            >
              <X size={16} />
              <span className={calendarLayout ? 'hidden sm:inline' : ''}>I'm out</span>
            </button>
          </>
        ) : (
          <button type="button" className={item.canManage && isTournament ? 'btn-primary gap-2 px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs !text-[#c9c9d4] hover:!text-white'} onClick={onOpen}>
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

function formatHeroLongDate(date: string | null) {
  if (!date) return 'Date TBD';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function formatScheduleDateTile(date: string | null) {
  if (!date) return { month: 'TBD', day: '--' };
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { month: 'TBD', day: '--' };
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(parsed).toUpperCase(),
    day: new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(parsed),
  };
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
  const steps = ['Basics', 'Game Details', 'Options', 'Review'] as const;
  const [step, setStep] = useState(0);
  const [attemptedStep, setAttemptedStep] = useState(false);
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
    rebuysenabled: false,
    addonprice: '',
    addonchips: '',
    addonsenabled: false,
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
      rebuyprice: form.rebuysenabled ? Number(form.rebuyprice) || 0 : 0,
      rebuychips: form.rebuysenabled ? Number(form.rebuychips) || 0 : 0,
      rebuylastlevel: rebuysActive ? Number(form.rebuylastlevel) || null : null,
      addonprice: form.addonsenabled ? Number(form.addonprice) || 0 : 0,
      addonchips: form.addonsenabled ? Number(form.addonchips) || 0 : 0,
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
  const rebuysActive = form.rebuysenabled;
  const addonsActive = form.addonsenabled;
  const rebuyDetailsComplete = !rebuysActive || (
    Number(form.rebuyprice) >= 0
    && Number(form.rebuychips) > 0
    && Number(form.rebuylastlevel) > 0
  );
  const addonDetailsComplete = !addonsActive || (Number(form.addonprice) >= 0 && Number(form.addonchips) > 0);
  const maxPlayersComplete = form.maxplayersmode === 'unlimited' || (form.maxplayersmode === 'capped' && Number(form.maxplayers) > 0);
  const cashRangeComplete = !isCashGame || !form.minbuyin || !form.maxbuyin || Number(form.maxbuyin) >= Number(form.minbuyin);
  const cashDetailsComplete = !isCashGame || (Boolean(form.stakeslabel.trim()) && cashRangeComplete);
  const inviteComplete = form.visibility !== 'invite_only' || form.inviteUserIds.length > 0;
  const canAdvance = step === 0
    ? basicsComplete
    : step === 1
      ? (isCashGame ? cashDetailsComplete : maxPlayersComplete && rebuyDetailsComplete && addonDetailsComplete)
      : step === 2
        ? inviteComplete
        : true;
  const selectedStructure = savedStructures.find((structure) => structure.id === form.savedstructureid);
  const maxPlayersReview = form.maxplayersmode === 'unlimited' ? 'Unlimited' : form.maxplayers;
  const canOpenStep = (targetStep: number) => {
    if (targetStep <= step) return true;
    if (targetStep >= 1 && !basicsComplete) return false;
    if (targetStep >= 2 && !isCashGame && (!maxPlayersComplete || !rebuyDetailsComplete || !addonDetailsComplete)) return false;
    if (targetStep >= 2 && isCashGame && !cashDetailsComplete) return false;
    if (targetStep >= 3 && !inviteComplete) return false;
    return true;
  };

  function goToStep(targetStep: number) {
    if (!canOpenStep(targetStep)) {
      setAttemptedStep(true);
      return;
    }
    setAttemptedStep(false);
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function advanceStep() {
    if (!canAdvance) {
      setAttemptedStep(true);
      return;
    }
    goToStep(Math.min(step + 1, steps.length - 1));
  }

  function backStep() {
    if (step === 0) {
      onBack();
      return;
    }
    goToStep(step - 1);
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto w-full overflow-y-auto bg-pit-bg px-4 pb-24 sm:static sm:z-auto sm:max-w-2xl sm:overflow-visible sm:bg-transparent sm:px-0 sm:pb-8">
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex h-14 items-center justify-between border-b border-pit-border bg-pit-bg/95 px-4 backdrop-blur sm:static sm:mx-0 sm:mb-6 sm:rounded-xl sm:border sm:bg-pit-surface/85">
        {step === 0 ? (
          <span className="h-9 w-9" aria-hidden="true" />
        ) : (
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-pit-text transition hover:bg-white/5 hover:text-white" onClick={backStep} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="text-center">
          <p className="text-sm font-black text-white">Host a Game</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-pit-muted">Step {step + 1} of {steps.length}</p>
        </div>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-pit-muted transition hover:bg-white/5 hover:text-white" onClick={onBack} aria-label="Close game setup">
          <X size={19} />
        </button>
      </header>

      <WizardStepper steps={steps} activeStep={step} canOpenStep={canOpenStep} onStepChange={goToStep} />

      <form id="create-tourney" onSubmit={submit} className="mt-6 space-y-5">
        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p>
        )}

        <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-surface/80 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
          <div className="border-b border-pit-border bg-gradient-to-r from-pit-teal/10 to-transparent px-4 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pit-teal">{steps[step]}</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
              {step === 0 && 'What are you hosting?'}
              {step === 1 && (isCashGame ? 'Set the cash-game details' : 'Build the game details')}
              {step === 2 && 'Choose the room options'}
              {step === 3 && 'Review your game'}
            </h2>
            <p className="mt-1 text-sm leading-5 text-pit-muted">
              {step === 0 && 'Start with the essentials. You can fine-tune everything later.'}
              {step === 1 && (isCashGame ? 'Set the stakes, seats, and buy-in range.' : 'Set the field, buy-in, rebuys, and add-ons.')}
              {step === 2 && (isCashGame ? 'Choose visibility and alerts.' : 'Choose structure, tracking, and announcements.')}
              {step === 3 && 'Give it one last look before it goes on the calendar.'}
            </p>
          </div>

          <div className="p-4 sm:p-6">
            {onboardingActive && !isCashGame && (
              <div className="mb-4 flex gap-3 rounded-xl border border-pit-teal/25 bg-pit-teal/[0.07] px-3 py-3 text-xs leading-5 text-pit-text">
                <CheckCircle2 className="mt-0.5 shrink-0 text-pit-teal" size={16} />
                <p>
                  {step === 0 && 'Pick the group that will host this game. Only groups you administer are shown.'}
                  {step === 1 && 'Start simple. Turn on rebuys or add-ons only when the game uses them.'}
                  {step === 2 && 'Saved blind structures appear here, or the calculator can build one after creation.'}
                  {step === 3 && 'After creation, use Players for check-in and Run Tournament when the room is ready.'}
                </p>
              </div>
            )}

            {step === 0 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3" role="group" aria-label="Game type">
                  <GameTypeCard
                    active={!isCashGame}
                    icon={<Trophy size={26} />}
                    title="Tournament"
                    description="Clock, blinds, seating, results"
                    onClick={() => setForm((current) => ({ ...current, gametype: 'tournament' }))}
                  />
                  <GameTypeCard
                    active={isCashGame}
                    tone="violet"
                    icon={<Banknote size={27} />}
                    title="Cash Game"
                    description="Stakes, seats, buy-ins, cash-outs"
                    onClick={() => setForm((current) => ({ ...current, gametype: 'cash' }))}
                  />
                </div>

                <Field label="Game name" error={attemptedStep && !form.name.trim() ? 'Give the game a name.' : undefined}>
                  <input className="input h-12 text-base font-semibold" placeholder={isCashGame ? 'Friday Night Cash Game' : 'Saturday Championship'} value={form.name} onChange={set('name')} autoFocus />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={isCashGame ? 'Date (optional)' : 'Date'} error={attemptedStep && !isCashGame && !form.tourneydate ? 'Required' : undefined}>
                    <input className="input h-12" type="date" value={form.tourneydate} onChange={set('tourneydate')} />
                  </Field>
                  <Field label={isCashGame ? 'Time (optional)' : 'Time'} error={attemptedStep && !isCashGame && !form.tourneytime ? 'Required' : undefined}>
                    <QuarterHourTimeSelect value={form.tourneytime} onChange={(value) => setForm((current) => ({ ...current, tourneytime: value }))} required={!isCashGame} />
                  </Field>
                </div>

                <Field label="Host group" error={attemptedStep && !form.groupid ? 'Choose a group you administer.' : undefined}>
                  <SelectShell>
                    <select className="input h-12 pr-10 font-semibold" value={form.groupid} onChange={set('groupid')}>
                      <option value="">{groups.length > 0 ? 'Choose a group' : 'No admin groups available'}</option>
                      {groups.map((group) => (
                        <option key={group.groupid} value={group.groupid}>{group.name}</option>
                      ))}
                    </select>
                  </SelectShell>
                </Field>
                {groups.length === 0 && (
                  <p className="rounded-xl border border-pit-gold/30 bg-pit-gold/10 px-3 py-2.5 text-xs leading-5 text-pit-gold">
                    Create a group or ask a group admin to promote you before hosting a game.
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              isCashGame ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Stakes" error={attemptedStep && !form.stakeslabel.trim() ? 'Required' : undefined}>
                      <input className="input h-12 font-semibold" placeholder="$1 / $2" value={form.stakeslabel} onChange={set('stakeslabel')} />
                    </Field>
                    <Field label="Seats">
                      <input className="input h-12" type="number" min="1" step="1" placeholder="Open" value={form.seatsavailable} onChange={set('seatsavailable')} />
                    </Field>
                  </div>
                  <WizardPanel icon={<Banknote size={18} />} title="Buy-in range" description="Optional minimum and maximum amounts.">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Minimum"><input className="input h-11" type="number" min="0" step="0.01" placeholder="$0" value={form.minbuyin} onChange={set('minbuyin')} /></Field>
                      <Field label="Maximum" error={attemptedStep && !cashRangeComplete ? 'Below minimum' : undefined}><input className="input h-11" type="number" min="0" step="0.01" placeholder="No max" value={form.maxbuyin} onChange={set('maxbuyin')} /></Field>
                    </div>
                  </WizardPanel>
                  <Field label="Game notes">
                    <textarea className="input min-h-24 resize-none py-3" placeholder="Optional location, house rules, or reminders" value={form.cashnotes} onChange={set('cashnotes')} />
                  </Field>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Buy-in"><input className="input h-12 font-semibold" type="number" placeholder="0.00" min="0" step="0.01" value={form.buyin} onChange={set('buyin')} /></Field>
                    <Field label="Rake"><input className="input h-12" type="number" placeholder="0.00" min="0" step="0.01" value={form.rake} onChange={set('rake')} /></Field>
                  </div>

                  <WizardPanel icon={<Users size={18} />} title="Field size" description="Leave it open or cap the number of seats." error={attemptedStep && !maxPlayersComplete ? 'Choose Unlimited or set a player cap.' : undefined}>
                    <SegmentedPicker
                      value={form.maxplayersmode}
                      options={[{ value: 'unlimited', label: 'Unlimited' }, { value: 'capped', label: 'Set a cap' }]}
                      onChange={(value) => setForm((current) => ({ ...current, maxplayersmode: value, maxplayers: value === 'unlimited' ? '' : current.maxplayers }))}
                    />
                    {form.maxplayersmode === 'capped' && (
                      <Field label="Player cap" className="mt-3">
                        <input className="input h-11" type="number" min="1" max={maxPlayersCap ?? undefined} placeholder="16" value={form.maxplayers} onChange={set('maxplayers')} />
                      </Field>
                    )}
                  </WizardPanel>

                  <ToggleRow
                    checked={rebuysActive}
                    onChange={(event) => setForm((current) => ({ ...current, rebuysenabled: event.target.checked }))}
                    title="Allow rebuys"
                    description="Set the price, chips, and closing level."
                    icon={<Coins size={18} />}
                    tone="violet"
                  />
                  {rebuysActive && (
                    <WizardPanel inset error={attemptedStep && !rebuyDetailsComplete ? 'Add rebuy chips and the final eligible level.' : undefined}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Price"><input className="input h-11" type="number" min="0" step="0.01" placeholder="0.00" value={form.rebuyprice} onChange={set('rebuyprice')} /></Field>
                        <Field label="Chips"><input className="input h-11" type="number" min="1" placeholder="10000" value={form.rebuychips} onChange={set('rebuychips')} /></Field>
                      </div>
                      <Field label="Available through level" className="mt-3"><input className="input h-11" type="number" min="1" step="1" placeholder="4" value={form.rebuylastlevel} onChange={set('rebuylastlevel')} /></Field>
                    </WizardPanel>
                  )}

                  <ToggleRow
                    checked={addonsActive}
                    onChange={(event) => setForm((current) => ({ ...current, addonsenabled: event.target.checked }))}
                    title="Offer an add-on"
                    description="Reveal the price and chip amount only when used."
                    icon={<Banknote size={18} />}
                  />
                  {addonsActive && (
                    <WizardPanel inset error={attemptedStep && !addonDetailsComplete ? 'Add the add-on chip amount.' : undefined}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Price"><input className="input h-11" type="number" min="0" step="0.01" placeholder="0.00" value={form.addonprice} onChange={set('addonprice')} /></Field>
                        <Field label="Chips"><input className="input h-11" type="number" min="1" placeholder="10000" value={form.addonchips} onChange={set('addonchips')} /></Field>
                      </div>
                    </WizardPanel>
                  )}
                </div>
              )
            )}

            {step === 2 && (
              isCashGame ? (
                <div className="space-y-4">
                  <WizardPanel icon={<Users size={18} />} title="Who can see this game?">
                    <SegmentedPicker
                      value={form.visibility}
                      options={[{ value: 'group_public', label: 'Entire group' }, { value: 'invite_only', label: 'Invite only' }]}
                      onChange={(value) => setForm((current) => ({ ...current, visibility: value as 'group_public' | 'invite_only' }))}
                    />
                  </WizardPanel>
                  {form.visibility === 'invite_only' && (
                    <WizardPanel icon={<UserPlus size={18} />} title="Invite players" description={`${form.inviteUserIds.length} selected`} error={attemptedStep && !inviteComplete ? 'Pick at least one group member.' : undefined}>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {inviteMembers.map((member) => {
                          const checked = form.inviteUserIds.includes(member.userid);
                          return (
                            <label key={member.userid} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition ${checked ? 'border-pit-teal/50 bg-pit-teal/10 text-white' : 'border-pit-border bg-pit-bg/45 text-pit-text'}`}>
                              <input
                                type="checkbox"
                                className="accent-[#14aaa9]"
                                checked={checked}
                                onChange={(event) => setForm((current) => ({
                                  ...current,
                                  inviteUserIds: event.target.checked
                                    ? [...current.inviteUserIds, member.userid]
                                    : current.inviteUserIds.filter((id) => id !== member.userid),
                                }))}
                              />
                              <span className="min-w-0 truncate">{member.displayname || member.emailaddress || 'Player'}</span>
                            </label>
                          );
                        })}
                      </div>
                    </WizardPanel>
                  )}
                  <ToggleRow checked={form.notifygroup} onChange={set('notifygroup')} title="Alert eligible players" description="Send the game announcement by email and push." icon={<Bell size={18} />} />
                </div>
              ) : (
                <div className="space-y-4">
                  <WizardPanel icon={<ListChecks size={18} />} title="Blind structure" description={selectedStructure ? selectedStructure.name : 'Use a saved structure or build one after creation.'}>
                    <SelectShell>
                      <select className="input h-12 pr-10 font-semibold" value={form.savedstructureid} onChange={set('savedstructureid')} disabled={!form.groupid}>
                        <option value="">Use calculator after creation</option>
                        {savedStructures.map((structure) => (
                          <option key={structure.id} value={structure.id}>{structure.name}</option>
                        ))}
                      </select>
                    </SelectShell>
                  </WizardPanel>

                  <WizardPanel icon={<SlidersHorizontal size={18} />} title="Player stats tracking" description={canUseClubFeatures ? 'Choose who records rebuys, add-ons, and knockouts.' : 'Standard host tracking is active.'}>
                    <SegmentedPicker
                      value={form.playerselftracking ? 'player' : 'standard'}
                      options={[{ value: 'standard', label: 'Host tracks' }, { value: 'player', label: 'Players track' }]}
                      disabledValue={!canUseClubFeatures ? 'player' : undefined}
                      onChange={(value) => setForm((current) => ({ ...current, playerselftracking: canUseClubFeatures && value === 'player' }))}
                    />
                  </WizardPanel>

                  <ToggleRow checked={form.registerself} onChange={set('registerself')} title="Register me" description={selectedGroupName ? `Add me to ${selectedGroupName} when it is created.` : 'Add me as a player when it is created.'} icon={<CheckCircle2 size={18} />} />
                  <ToggleRow checked={Boolean(form.groupid) && form.notifygroup} disabled={!form.groupid} onChange={set('notifygroup')} title="Announce to the group" description="Email approved group members when the tournament is posted." icon={<Bell size={18} />} />
                </div>
              )
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-pit-teal/25 bg-gradient-to-br from-pit-teal/15 to-pit-bg/30 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-teal/30 bg-pit-teal/15 text-pit-teal">
                    {isCashGame ? <Banknote size={22} /> : <Trophy size={22} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pit-teal">{isCashGame ? 'Cash Game' : 'Tournament'}</p>
                    <h3 className="mt-1 truncate text-lg font-black text-white">{form.name || 'Untitled game'}</h3>
                    <p className="mt-1 text-sm text-pit-text">{selectedGroupName || 'No group selected'}</p>
                  </div>
                </div>

                <SummarySection title="Basics" onEdit={() => goToStep(0)}>
                  <ReviewRow icon={<Calendar size={15} />} label="Date" value={form.tourneydate ? formatHeroLongDate(form.tourneydate) : 'Date TBD'} />
                  <ReviewRow icon={<Clock size={15} />} label="Time" value={form.tourneytime ? formatTime12Hour(form.tourneytime) : 'Time TBD'} />
                </SummarySection>

                <SummarySection title="Game details" onEdit={() => goToStep(1)}>
                  {isCashGame ? (
                    <>
                      <ReviewRow label="Stakes" value={form.stakeslabel || 'Not set'} />
                      <ReviewRow label="Seats" value={form.seatsavailable || 'Open'} />
                      <ReviewRow label="Buy-in range" value={`${form.minbuyin ? `$${form.minbuyin}` : 'No minimum'} - ${form.maxbuyin ? `$${form.maxbuyin}` : 'No maximum'}`} />
                    </>
                  ) : (
                    <>
                      <ReviewRow label="Buy-in" value={`$${Number(form.buyin || 0).toFixed(2)}`} />
                      <ReviewRow label="Rake" value={`$${Number(form.rake || 0).toFixed(2)}`} />
                      <ReviewRow label="Max players" value={maxPlayersReview || 'Not set'} />
                      <ReviewRow label="Rebuys" value={rebuysActive ? `$${Number(form.rebuyprice || 0).toFixed(2)} for ${Number(form.rebuychips || 0).toLocaleString()} through level ${form.rebuylastlevel}` : 'Off'} />
                      <ReviewRow label="Add-on" value={addonsActive ? `$${Number(form.addonprice || 0).toFixed(2)} for ${Number(form.addonchips || 0).toLocaleString()}` : 'Off'} />
                    </>
                  )}
                </SummarySection>

                <SummarySection title="Options" onEdit={() => goToStep(2)}>
                  {isCashGame ? (
                    <>
                      <ReviewRow label="Visibility" value={form.visibility === 'invite_only' ? `${form.inviteUserIds.length} invited players` : 'Entire group'} />
                      <ReviewRow label="Announcements" value={form.notifygroup ? 'On' : 'Off'} />
                    </>
                  ) : (
                    <>
                      <ReviewRow label="Blind structure" value={selectedStructure?.name || 'Use calculator after creation'} />
                      <ReviewRow label="Stats tracking" value={form.playerselftracking ? 'Players track' : 'Host tracks'} />
                      <ReviewRow label="Register me" value={form.registerself ? 'Yes' : 'No'} />
                      <ReviewRow label="Group announcement" value={form.groupid && form.notifygroup ? 'On' : 'Off'} />
                    </>
                  )}
                </SummarySection>
              </div>
            )}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-pit-teal/25 bg-[#0d1115]/96 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_36px_rgba(0,0,0,0.48)] backdrop-blur sm:static sm:rounded-xl sm:border sm:border-pit-border sm:bg-pit-surface/90 sm:p-3 sm:shadow-none">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            <button type="button" className="btn-ghost h-12 min-w-[6.5rem] flex-1 justify-center gap-2" onClick={backStep} disabled={loading}>
              {step === 0 ? 'Cancel' : <><ChevronLeft size={16} /> Back</>}
            </button>
            {step < steps.length - 1 ? (
              <button type="button" className="btn-primary h-12 flex-[1.45] justify-center gap-2" onClick={advanceStep}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button type="submit" className="btn-primary h-12 flex-[1.45] justify-center gap-2 bg-emerald-500 hover:bg-emerald-400" disabled={loading || !basicsComplete || !canAdvance}>
                {loading ? 'Creating...' : <><CheckCircle2 size={17} /> Create Event</>}
              </button>
            )}
          </div>
          {attemptedStep && !canAdvance && step < steps.length - 1 && (
            <p className="mt-2 text-center text-xs font-semibold text-pit-gold">Finish the highlighted settings to continue.</p>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  className = '',
  error,
  children,
}: {
  label: string;
  className?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <span className="mb-1.5 flex min-h-4 items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-pit-muted">
        <span>{label}</span>
        {error && <span className="normal-case tracking-normal text-red-300">{error}</span>}
      </span>
      {children}
    </label>
  );
}

function WizardStepper({
  steps,
  activeStep,
  canOpenStep,
  onStepChange,
}: {
  steps: readonly string[];
  activeStep: number;
  canOpenStep: (step: number) => boolean;
  onStepChange: (step: number) => void;
}) {
  return (
    <nav aria-label="Game setup progress" className="rounded-xl border border-pit-border bg-pit-surface/70 px-3 py-3 sm:px-5">
      <ol className="grid grid-cols-4">
        {steps.map((label, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          const enabled = canOpenStep(index);
          return (
            <li key={label} className="relative flex min-w-0 flex-col items-center">
              {index > 0 && (
                <span className={`absolute right-1/2 top-[13px] h-px w-full ${index <= activeStep ? 'bg-pit-teal' : 'bg-pit-border'}`} aria-hidden="true" />
              )}
              <button
                type="button"
                className="relative z-10 flex min-w-0 flex-col items-center gap-1.5 disabled:cursor-not-allowed"
                onClick={() => onStepChange(index)}
                disabled={!enabled}
                aria-current={active ? 'step' : undefined}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black transition ${
                  complete || active
                    ? 'border-pit-teal bg-pit-teal text-[#071315] shadow-[0_0_14px_rgba(20,184,166,0.25)]'
                    : 'border-pit-border bg-pit-bg text-pit-muted'
                }`}>
                  {complete ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span className={`max-w-full truncate text-[9px] font-black uppercase tracking-[0.08em] sm:text-[10px] ${active ? 'text-white' : 'text-pit-muted'}`}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GameTypeCard({
  active,
  tone = 'teal',
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  tone?: 'teal' | 'violet';
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const activeClasses = tone === 'violet'
    ? 'border-violet-400/65 bg-violet-400/10 shadow-[0_0_22px_rgba(139,92,246,0.14)]'
    : 'border-pit-teal bg-pit-teal/10 shadow-[0_0_22px_rgba(20,184,166,0.16)]';
  const iconClasses = tone === 'violet' ? 'border-violet-400/30 bg-violet-400/10 text-violet-300' : 'border-pit-teal/30 bg-pit-teal/10 text-pit-teal';
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex min-h-36 flex-col items-center justify-center rounded-xl border px-3 py-4 text-center transition ${active ? activeClasses : 'border-pit-border bg-pit-bg/45 hover:border-white/25'}`}
      onClick={onClick}
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl border ${iconClasses}`}>{icon}</span>
      <span className="mt-3 text-sm font-black text-white">{title}</span>
      <span className="mt-1 max-w-32 text-[11px] leading-4 text-pit-muted">{description}</span>
    </button>
  );
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-pit-muted" size={17} />
    </div>
  );
}

function WizardPanel({
  icon,
  title,
  description,
  error,
  inset = false,
  children,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  error?: string;
  inset?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border p-3.5 ${error ? 'border-red-400/40 bg-red-400/[0.05]' : inset ? 'border-pit-border bg-pit-bg/30' : 'border-pit-border bg-pit-bg/45'}`}>
      {(title || description || icon) && (
        <div className="mb-3 flex items-start gap-3">
          {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pit-teal/10 text-pit-teal">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-sm font-black text-white">{title}</h3>}
            {description && <p className="mt-0.5 text-xs leading-4 text-pit-muted">{description}</p>}
          </div>
        </div>
      )}
      {children}
      {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
    </section>
  );
}

function SegmentedPicker({
  value,
  options,
  disabledValue,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  disabledValue?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-pit-border bg-pit-bg p-1">
      {options.map((option) => {
        const active = value === option.value;
        const disabled = disabledValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`min-h-10 rounded-md px-3 text-xs font-black transition ${active ? 'bg-pit-teal text-[#071315]' : 'text-pit-text hover:bg-white/5 hover:text-white'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  checked,
  disabled,
  onChange,
  title,
  description,
  icon,
  tone = 'teal',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
  tone?: 'teal' | 'violet';
}) {
  const accent = tone === 'violet' ? 'text-violet-300' : 'text-pit-teal';
  const switchColor = checked ? (tone === 'violet' ? 'bg-violet-500' : 'bg-pit-teal') : 'bg-pit-border';
  return (
    <label className={`flex min-h-[4.5rem] cursor-pointer items-center justify-between gap-4 rounded-xl border border-pit-border bg-pit-bg/45 px-3.5 py-3 transition hover:border-white/20 ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ${accent}`}>{icon}</div>}
        <div className="min-w-0">
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-4 text-pit-muted">{description}</p>
        </div>
      </div>
      <div className={`flex h-6 w-11 shrink-0 items-center rounded-full px-1 transition-colors duration-150 ${switchColor}`}>
        <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

function SummarySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/45">
      <div className="flex items-center justify-between border-b border-pit-border px-3.5 py-2.5">
        <h3 className="text-xs font-black uppercase tracking-[0.16em] text-pit-muted">{title}</h3>
        <button type="button" className="text-xs font-black text-pit-teal hover:text-white" onClick={onEdit}>Edit</button>
      </div>
      <div className="divide-y divide-pit-border px-3.5">{children}</div>
    </section>
  );
}

function ReviewRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-pit-muted">{icon && <span className="text-pit-teal">{icon}</span>}{label}</span>
      <span className="max-w-[62%] text-right font-bold text-white">{value}</span>
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
    tournamentId: event.tournamentid ?? null,
    isParticipant: Boolean(event.participating),
    completed: Boolean(event.completed),
    rsvpStatus: event.rsvpstatus ?? null,
    goingCount: Number(event.goingcount ?? 0),
    seasonPlayerCount: Number(event.seasonplayercount ?? 0),
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

function isScheduleParticipant(item: ScheduleItem) {
  if (item.kind === 'tournament') return Boolean(item.tournament.isregistered);
  if (item.kind === 'league') return item.isParticipant;
  return Boolean(item.isRegistered) || item.rsvpStatus === 'going';
}

function isScheduleItemFinalized(item: ScheduleItem) {
  if (item.kind === 'tournament') return Boolean(item.tournament.completed);
  if (item.kind === 'cash') return item.game.status === 'completed' || item.game.status === 'cancelled';
  return item.completed;
}

function getScheduleTimestamp(date: string | null | undefined, time: string | null | undefined) {
  if (!date) return null;
  const match = `${String(date).slice(0, 10)}T${(time?.slice(0, 8) ?? '00:00:00').padEnd(8, ':00').slice(0, 8)}`
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
}

function isLiveScheduleItem(item: ScheduleItem) {
  if (isScheduleItemFinalized(item)) return false;
  const startsAt = getScheduleTimestamp(item.date, item.time);
  const currentTime = nowInAppTimezone();
  const now = getScheduleTimestamp(currentTime.slice(0, 10), currentTime.slice(11));
  return startsAt != null && now != null && now >= startsAt && now < startsAt + (12 * 60 * 60 * 1000);
}

function isUpcomingScheduleItem(item: ScheduleItem) {
  if (isScheduleItemFinalized(item)) return false;
  if (!item.date) return true;
  if (isLiveScheduleItem(item)) return true;

  const startsAt = getScheduleTimestamp(item.date, item.time);
  const currentTime = nowInAppTimezone();
  const now = getScheduleTimestamp(currentTime.slice(0, 10), currentTime.slice(11));
  if (startsAt != null && now != null) return startsAt > now;
  return item.date >= todayInAppTimezone();
}

function isThirtyOrMoreDaysAway(item: ScheduleItem) {
  const startsAt = getScheduleTimestamp(item.date, item.time);
  const currentTime = nowInAppTimezone();
  const now = getScheduleTimestamp(currentTime.slice(0, 10), currentTime.slice(11));
  return startsAt != null && now != null && startsAt >= now + (30 * 24 * 60 * 60 * 1000);
}

function formatCashGameCount(game: GameListItem): string {
  const seated = Number(game.playercount ?? 0);
  const seats = Number(game.seatsavailable ?? 0);
  return seats > 0 ? `${seated}/${seats}` : String(seated);
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

function hasScheduleStarted(date: string | null | undefined, time: string | null | undefined) {
  if (!date) return false;
  const effectiveTime = (time?.slice(0, 8) ?? '00:00:00').padEnd(8, ':00').slice(0, 8);
  return nowInAppTimezone() >= `${String(date).slice(0, 10)}T${effectiveTime}`;
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
