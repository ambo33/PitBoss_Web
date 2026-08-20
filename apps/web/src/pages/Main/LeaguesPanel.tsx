import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { ArrowLeft, BadgeCheck, BellRing, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Copy, Crown, Download, DollarSign, Ghost, Hash, ListOrdered, Mail, Menu, MessageSquare, Pencil, Plus, QrCode, RefreshCw, RotateCcw, Save, ScrollText, Search, Send, Share, Trash2, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, League, LeagueAuditLog, LeagueDetail, LeagueEvent, LeagueEventRsvp, LeagueEventRsvpStatus, LeagueFinalMultiplier, LeagueFinalStack, LeagueMember, LeaguePayment, LeaguePaymentType, LeaguePointRule, LeagueSeason } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import JoinShareDialog from '../../components/JoinShareDialog';
import LeagueLiveResultsTable from '../../components/LeagueLiveResultsTable';
import { useAuthStore } from '../../store/auth';

const BASE_POINTS_LOOKUP: LeaguePointRule[] = [
  { place: 'DNF', points: 0 },
  { place: 1, points: 671 }, { place: 2, points: 448 }, { place: 3, points: 336 },
  { place: 4, points: 269 }, { place: 5, points: 224 }, { place: 6, points: 192 },
  { place: 7, points: 168 }, { place: 8, points: 150 }, { place: 9, points: 135 },
  { place: 10, points: 122 }, { place: 11, points: 112 }, { place: 12, points: 104 },
  { place: 13, points: 96 }, { place: 14, points: 90 }, { place: 15, points: 84 },
  { place: 16, points: 79 }, { place: 17, points: 75 }, { place: 18, points: 71 },
  { place: 19, points: 68 }, { place: 20, points: 64 }, { place: 21, points: 61 },
  { place: 22, points: 59 }, { place: 23, points: 56 }, { place: 24, points: 54 },
  { place: 25, points: 52 }, { place: 26, points: 50 }, { place: 27, points: 48 },
  { place: 28, points: 47 }, { place: 29, points: 45 }, { place: 30, points: 44 },
  { place: 31, points: 42 }, { place: 32, points: 41 }, { place: 33, points: 40 },
  { place: 34, points: 39 }, { place: 35, points: 38 }, { place: 36, points: 37 },
];
const BASE_POINT_TOTAL = BASE_POINTS_LOOKUP.filter((rule) => rule.place !== 'DNF').reduce((sum, rule) => sum + rule.points, 0);
const FULL_FIELD_FIRST_PLACE_SHARE = Number(BASE_POINTS_LOOKUP.find((rule) => rule.place === 1)?.points ?? 0) / BASE_POINT_TOTAL;
type LeagueDetailTab = 'overview' | 'events' | 'board' | 'fees' | 'audit' | 'players' | 'scoring';

export default function LeaguesPanel({
  initialLeagueId,
  initialSeasonId,
  initialTab,
  initialPostId,
  initialEventId,
  onDetailStateChange,
  onBackToCommunities,
  createRequestId = 0,
}: {
  initialLeagueId?: string;
  initialSeasonId?: string;
  initialTab?: LeagueDetailTab;
  initialPostId?: string;
  initialEventId?: string;
  onDetailStateChange?: (open: boolean) => void;
  onBackToCommunities?: () => void;
  createRequestId?: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const lastCreateRequestRef = useRef(createRequestId);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<Pick<League, 'leagueid'> | null>(initialLeagueId ? { leagueid: initialLeagueId } : null);
  const [openedFromList, setOpenedFromList] = useState(false);
  const { data: leagues = [], isLoading } = useQuery({ queryKey: ['leagues'], queryFn: api.getLeagues });

  const createMutation = useMutation({
    mutationFn: api.createLeague,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setOpenedFromList(true);
      setSelected({ leagueid: created.leagueid });
      setShowCreate(false);
    },
  });

  useEffect(() => {
    onDetailStateChange?.(Boolean(selected));
    return () => onDetailStateChange?.(false);
  }, [onDetailStateChange, selected]);

  useEffect(() => {
    if (!initialLeagueId) return;
    setOpenedFromList(false);
    setSelected({ leagueid: initialLeagueId });
  }, [initialLeagueId]);

  useEffect(() => {
    if (!createRequestId || createRequestId === lastCreateRequestRef.current) return;
    lastCreateRequestRef.current = createRequestId;
    setSelected(null);
    setShowCreate(true);
  }, [createRequestId]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  if (selected) {
    return (
      <LeagueDetailView
        league={selected}
        initialSeasonId={initialSeasonId}
        initialTab={openedFromList ? undefined : initialTab}
        initialPostId={initialPostId}
        initialEventId={openedFromList ? undefined : initialEventId}
        onBack={() => {
          setSelected(null);
          onBackToCommunities?.();
        }}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Season standings</p>
          <h2 className="text-xl font-bold text-white">My Leagues</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost gap-1.5 px-3 py-2 text-xs" onClick={() => setShowJoin(true)}>
            <Hash size={13} /> Join
          </button>
          <button className="btn-primary gap-1.5 px-3 py-2 text-xs" onClick={() => setShowCreate(true)}>
            <Users size={13} /> New league
          </button>
        </div>
      </div>

      {leagues.length > 0 ? (
        <LeagueList leagues={leagues} onSelect={(league) => {
          setOpenedFromList(true);
          setSelected(league);
        }} />
      ) : (
        <LeagueEmptyState onJoin={() => setShowJoin(true)} onCreate={() => setShowCreate(true)} />
      )}

      <CreateLeagueModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error?.message}
      />
      <JoinLeagueModal
        open={showJoin}
        onClose={() => setShowJoin(false)}
        onSubmit={(code) => {
          setShowJoin(false);
          navigate(`/join/${encodeURIComponent(code.trim().toUpperCase())}`);
        }}
        loading={false}
      />
    </>
  );
}

function LeagueList({ leagues, onSelect }: { leagues: League[]; onSelect: (league: League) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-surface/70 shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
      <div className="hidden grid-cols-[minmax(0,1.5fr)_8rem_8rem_minmax(0,1fr)_7rem] gap-3 border-b border-pit-border/70 bg-black/18 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted md:grid">
        <span>League</span>
        <span>Players</span>
        <span>Events</span>
        <span>Scoring</span>
        <span className="text-right">Action</span>
      </div>
      <div className="divide-y divide-pit-border/60">
        {leagues.map((league) => (
          <LeagueListRow key={league.leagueid} league={league} onClick={() => onSelect(league)} />
        ))}
      </div>
    </div>
  );
}

function LeagueListRow({ league, onClick }: { league: League; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-l-2 px-3 py-2.5 text-left transition md:grid-cols-[minmax(0,1.5fr)_8rem_8rem_minmax(0,1fr)_7rem] md:items-center md:gap-3 md:border-l-0 md:px-4 md:py-3 ${
        league.isadmin ? 'border-pit-gold/60 bg-pit-gold/[0.035]' : 'border-transparent hover:bg-white/[0.025]'
      }`}
    >
      <div className="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-white transition group-hover:text-pit-teal md:text-base">
            {league.name}
          </span>
          {league.isadmin && (
            <span className="hidden shrink-0 rounded-full border border-pit-gold/35 bg-pit-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-pit-gold sm:inline-flex">
              <Crown size={10} className="mr-1" />
              Admin
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] tracking-widest text-pit-muted">{league.invitecode}</p>
      </div>

      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-pit-text md:col-auto md:row-auto">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 md:bg-transparent md:px-0 md:py-0">
          <Users size={11} />
          {league.membercount ?? 0}
        </span>
        {league.expectedplayercount ? (
          <span className="text-pit-muted">/ {league.expectedplayercount}</span>
        ) : null}
        {league.isadmin && (
          <span className="inline-flex items-center gap-1 rounded-full border border-pit-gold/25 bg-pit-gold/10 px-1.5 py-0.5 text-pit-gold md:hidden">
            <Crown size={10} />
            Admin
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-1 justify-self-end whitespace-nowrap text-right text-xs font-semibold text-pit-text md:col-auto md:row-auto md:justify-self-auto md:text-left">
        <span className="inline-flex items-center gap-1 rounded-full border border-pit-border bg-white/5 px-2 py-1">
          <CalendarDays size={12} />
          {league.eventcount ?? 0}
        </span>
      </div>

      <div className="col-span-2 row-start-3 min-w-0 text-xs text-pit-text md:col-auto md:row-auto">
        <p className="truncate font-semibold text-white md:text-pit-text">
          Top {league.bestfinishcount} event{league.bestfinishcount === 1 ? '' : 's'} scored
        </p>
        <p className="mt-1 text-[11px] text-pit-muted">
          {league.finalenabled ? 'Final table enabled' : 'Standings decide winner'}
        </p>
      </div>

      <div className="col-start-2 row-start-2 flex justify-end md:col-auto md:row-auto">
        <span className="rounded-lg border border-pit-border bg-pit-card px-3 py-2 text-xs font-semibold text-pit-text transition group-hover:border-pit-teal/40 group-hover:text-white">
          Open
        </span>
      </div>
    </button>
  );
}

function LeagueEmptyState({ onJoin, onCreate }: { onJoin: () => void; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-pit-border bg-pit-surface">
        <ListOrdered size={24} className="text-pit-muted" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-white">No leagues yet</p>
        <p className="mt-1 text-sm text-pit-muted">Create a season-long leaderboard or join one with a code.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost text-sm" onClick={onJoin}>Join with code</button>
        <button className="btn-primary text-sm" onClick={onCreate}>Create league</button>
      </div>
    </div>
  );
}

function LeagueDetailView({
  league,
  initialSeasonId,
  initialTab,
  initialPostId,
  initialEventId,
  onBack,
}: {
  league: Pick<League, 'leagueid'>;
  initialSeasonId?: string;
  initialTab?: LeagueDetailTab;
  initialPostId?: string;
  initialEventId?: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const appliedInitialEventRef = useRef<string | null>(null);
  const currentUserId = useAuthStore((state) => state.user?.guid ?? null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTargetUserId, setPaymentTargetUserId] = useState<string | null>(null);
  const [paymentSaveState, setPaymentSaveState] = useState<{ count: number; paymenttype: LeaguePaymentType }>({ count: 0, paymenttype: 'league' });
  const [shareInviteOpen, setShareInviteOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSeasonConfirmOpen, setDeleteSeasonConfirmOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<LeagueMember | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<LeagueEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<LeagueEvent | null>(null);
  const [editingPayment, setEditingPayment] = useState<LeaguePayment | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(initialSeasonId ?? null);
  const [selectedRankUserId, setSelectedRankUserId] = useState<string | null>(null);
  const [mobileRankUserId, setMobileRankUserId] = useState<string | null>(null);
  const [pendingScoringPlayerCount, setPendingScoringPlayerCount] = useState<number | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<LeagueDetailTab>(initialTab ?? 'overview');
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [fullStandingsOpen, setFullStandingsOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialSeasonId) setSelectedSeasonId(initialSeasonId);
    if (initialTab) setActiveDetailTab(initialTab);
  }, [initialPostId, initialSeasonId, initialTab]);

  const { data, isLoading, isFetching, refetch, error: detailError } = useQuery({
    queryKey: ['league', league.leagueid, selectedSeasonId],
    queryFn: () => api.getLeague(league.leagueid, selectedSeasonId),
  });

  useEffect(() => {
    if (!initialEventId || !data || appliedInitialEventRef.current === initialEventId) return;
    const event = data.events.find((item) => item.eventid === initialEventId);
    if (!event) return;
    appliedInitialEventRef.current = initialEventId;
    setSelectedEvent(event);
    setActiveDetailTab('events');
  }, [data, initialEventId]);

  const createEventMutation = useMutation({
    mutationFn: (payload: { name: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number; eventcount?: number }) => api.createLeagueEvent(league.leagueid, { ...payload, seasonid: data?.selectedseasonid ?? selectedSeasonId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEventModalOpen(false);
    },
  });
  const createSeasonMutation = useMutation({
    mutationFn: (payload: { name: string; eventcount?: number; pereventfee?: number; eventsasgames?: boolean }) => api.createLeagueSeason(league.leagueid, payload),
    onSuccess: (created) => {
      setSelectedSeasonId(created.season.seasonid);
      setSelectedEvent(null);
      setActiveDetailTab('players');
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setSeasonModalOpen(false);
    },
  });
  const addGuestMutation = useMutation({
    mutationFn: (displayname: string) => api.addLeagueGuest(league.leagueid, displayname, data?.selectedseasonid ?? selectedSeasonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const addAdminMutation = useMutation({
    mutationFn: (email: string) => api.addLeagueAdmin(league.leagueid, email),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const addSeasonMembersMutation = useMutation({
    mutationFn: (userids: string[]) => {
      const seasonId = data?.selectedseasonid ?? selectedSeasonId;
      if (!seasonId) throw new Error('Choose a season first.');
      return api.addLeagueSeasonMembers(league.leagueid, seasonId, userids);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const inviteSpotTakeoverMutation = useMutation({
    mutationFn: ({ userId, email }: { userId: string; email: string }) =>
      api.inviteLeagueSpotTakeover(league.leagueid, userId, email, data?.selectedseasonid ?? selectedSeasonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
    },
  });
  const updateMemberAdminMutation = useMutation({
    mutationFn: ({ userId, isadmin }: { userId: string; isadmin: boolean }) =>
      api.updateLeagueMemberAdmin(league.leagueid, userId, isadmin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.removeLeagueMember(league.leagueid, userId, data?.selectedseasonid ?? selectedSeasonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setRemoveMemberTarget(null);
    },
  });

  const resultMutation = useMutation({
    mutationFn: ({ eventId, userId, placed, dnf }: { eventId: string; userId: string; placed?: number | null; dnf?: boolean }) =>
      api.logLeagueResult(league.leagueid, eventId, userId, { placed, dnf }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
    },
  });
  const clearResultMutation = useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      api.clearLeagueResult(league.leagueid, eventId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
    },
  });
  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, ...payload }: { eventId: string; name?: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number | null }) =>
      api.updateLeagueEvent(league.leagueid, eventId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEditingEvent(null);
    },
  });
  const updatePaymentSettingsMutation = useMutation({
    mutationFn: async (payload: { leaguefee: number; seasonEventFee: number }) => {
      const seasonId = data?.selectedseasonid ?? selectedSeasonId;
      const nextLeagueFee = Math.max(0, Math.round(Number(payload.leaguefee || 0) * 100) / 100);
      const nextSeasonEventFee = Math.max(0, Math.round(Number(payload.seasonEventFee || 0) * 100) / 100);
      if (seasonId) {
        const selectedSeason = data?.seasons.find((season) => season.seasonid === seasonId);
        await api.updateLeagueSeason(league.leagueid, seasonId, {
          name: selectedSeason?.name,
          pereventfee: nextSeasonEventFee,
        });
      }
      await api.updateLeague(league.leagueid, { leaguefee: nextLeagueFee, pereventfee: nextSeasonEventFee });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
        qc.invalidateQueries({ queryKey: ['leagues'] }),
      ]);
      await qc.refetchQueries({ queryKey: ['league', league.leagueid, selectedSeasonId], type: 'active' });
    },
  });
  const updateSeasonScoringMutation = useMutation({
    mutationFn: (payload: {
      showupbonuspoints: number;
      bestfinishcount: number;
      pointslookup: LeaguePointRule[];
      finalenabled: boolean;
      finalmultiplierlookup: LeagueFinalMultiplier[];
      finalchiprounding: number;
      finalstartingbigblind: number;
      expectedplayercount?: number;
    }) => {
      const seasonId = data?.selectedseasonid ?? selectedSeasonId;
      if (!seasonId) throw new Error('Choose a season before updating scoring.');
      return Promise.all([
        api.updateLeagueSeason(league.leagueid, seasonId, {
          showupbonuspoints: payload.showupbonuspoints,
          bestfinishcount: payload.bestfinishcount,
          pointslookup: payload.pointslookup,
          expectedplayercount: payload.expectedplayercount,
          finalscoresupdated: payload.expectedplayercount != null,
        }),
        api.updateLeague(league.leagueid, {
          finalenabled: payload.finalenabled,
          finalmultiplierlookup: payload.finalmultiplierlookup,
          finalchiprounding: payload.finalchiprounding,
          finalstartingbigblind: payload.finalstartingbigblind,
        }),
      ]);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
        qc.invalidateQueries({ queryKey: ['leagues'] }),
      ]);
      await qc.refetchQueries({ queryKey: ['league', league.leagueid], type: 'active' });
      setPendingScoringPlayerCount(null);
    },
  });
  const updateNamesMutation = useMutation({
    mutationFn: async (payload: { leagueName: string; seasonId?: string | null; seasonName?: string; expectedplayercount?: number; memberledgervisible: boolean; eventsasgames?: boolean }) => {
      await api.updateLeague(league.leagueid, { name: payload.leagueName, memberledgervisible: payload.memberledgervisible });
      if (payload.seasonId && payload.seasonName) {
        await api.updateLeagueSeason(league.leagueid, payload.seasonId, {
          name: payload.seasonName,
          expectedplayercount: payload.expectedplayercount,
          eventsasgames: payload.eventsasgames,
        });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
        qc.invalidateQueries({ queryKey: ['leagues'] }),
      ]);
      await qc.refetchQueries({ queryKey: ['league', league.leagueid], type: 'active' });
      setSettingsModalOpen(false);
    },
  });
  const createPaymentMutation = useMutation({
    mutationFn: (payload: { userid: string; eventid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string }) =>
      api.createLeaguePayment(league.leagueid, { ...payload, seasonid: data?.selectedseasonid ?? selectedSeasonId }),
    onSuccess: (_response, variables) => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      setPaymentSaveState((current) => ({ count: current.count + 1, paymenttype: variables.paymenttype }));
    },
  });
  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => api.deleteLeaguePayment(league.leagueid, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const updatePaymentMutation = useMutation({
    mutationFn: ({ paymentId, payload }: { paymentId: string; payload: { userid: string; eventid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string } }) =>
      api.updateLeaguePayment(league.leagueid, paymentId, { ...payload, seasonid: data?.selectedseasonid ?? selectedSeasonId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      setEditingPayment(null);
    },
  });
  const markEventPaidMutation = useMutation({
    mutationFn: ({ eventId, userId, all }: { eventId: string; userId?: string; all?: boolean }) =>
      api.markLeagueEventPaid(league.leagueid, eventId, { userId, all }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const eventRsvpMutation = useMutation({
    mutationFn: ({ eventId, userId, status }: { eventId: string; userId: string; status: LeagueEventRsvpStatus }) =>
      api.rsvpLeagueEvent(league.leagueid, eventId, status, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const toggleEventPaidMutation = useMutation({
    mutationFn: async ({ eventId, userId, paid }: { eventId: string; userId: string; paid: boolean }) => {
      if (!paid) {
        await api.markLeagueEventPaid(league.leagueid, eventId, { userId });
        return;
      }
      const payments = (data?.payments ?? []).filter((payment) =>
        payment.eventid === eventId && payment.userid === userId && payment.paymenttype === 'event'
      );
      await Promise.all(payments.map((payment) => api.deleteLeaguePayment(league.leagueid, payment.paymentid)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const markLeagueFeeInstallmentMutation = useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      api.markLeagueFeeInstallmentPaid(league.leagueid, eventId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const deleteLeagueMutation = useMutation({
    mutationFn: () => api.deleteLeague(league.leagueid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setDeleteConfirmOpen(false);
      onBack();
    },
  });
  const deleteSeasonMutation = useMutation({
    mutationFn: (seasonId: string) => api.deleteLeagueSeason(league.leagueid, seasonId),
    onSuccess: (_result, deletedSeasonId) => {
      const nextSeasonId = detail?.seasons.find((season) => season.seasonid !== deletedSeasonId)?.seasonid ?? null;
      setSelectedSeasonId(nextSeasonId);
      setSelectedEvent(null);
      setDeleteSeasonConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });

  const detail = data;
  useEffect(() => {
    if (detail?.selectedseasonid && !selectedSeasonId) setSelectedSeasonId(detail.selectedseasonid);
  }, [detail?.selectedseasonid, selectedSeasonId]);
  useEffect(() => {
    if (selectedEvent && detail && !detail.events.some((event) => event.eventid === selectedEvent.eventid)) {
      setSelectedEvent(null);
    }
    if (editingEvent && detail && !detail.events.some((event) => event.eventid === editingEvent.eventid)) {
      setEditingEvent(null);
    }
  }, [detail, editingEvent, selectedEvent]);
  useEffect(() => {
    if (!detail) return;
    const rankedStandings = getRankedStandings(detail);
    const currentUserIsRanked = currentUserId && rankedStandings.some((standing) => standing.userid === currentUserId);
    const fallbackUserId = !detail.league.isadmin && currentUserIsRanked
      ? currentUserId
      : rankedStandings[0]?.userid ?? null;
    const preferredUserId = selectedRankUserId && rankedStandings.some((standing) => standing.userid === selectedRankUserId)
      ? selectedRankUserId
      : fallbackUserId;
    if (selectedRankUserId !== preferredUserId) {
      setSelectedRankUserId(preferredUserId);
      return;
    }
  }, [currentUserId, detail, selectedRankUserId]);
  useEffect(() => {
    if (detail && !detail.league.isadmin && activeDetailTab !== 'overview') {
      setActiveDetailTab('overview');
    }
  }, [activeDetailTab, detail]);
  useEffect(() => {
    if (!manageMenuOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (manageMenuRef.current?.contains(event.target as Node)) return;
      setManageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setManageMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [manageMenuOpen]);
  const selectedEventFromDetail = selectedEvent && detail?.events.find((event) => event.eventid === selectedEvent.eventid) || null;
  const currentEvent = selectedEventFromDetail || detail?.events[0] || null;
  useEffect(() => {
    if (!detail?.league.isadmin || !currentEvent?.eventid) return;
    const socket = io('/', { path: '/socket.io' });
    const refreshEvent = () => {
      void qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      void qc.invalidateQueries({ queryKey: ['leagues'] });
    };
    const joinRooms = () => {
      socket.emit('join-league-event', currentEvent.eventid);
      if (currentEvent.tournamentid) socket.emit('join-tournament', currentEvent.tournamentid);
    };

    socket.on('connect', joinRooms);
    if (socket.connected) joinRooms();
    socket.on('league-event-updated', refreshEvent);
    socket.on('tournament-updated', refreshEvent);
    return () => {
      socket.disconnect();
    };
  }, [currentEvent?.eventid, currentEvent?.tournamentid, detail?.league.isadmin, league.leagueid, qc]);
  const eventResults = useMemo(() => {
    if (!detail || !currentEvent) return [];
    return detail.results.filter((result) => result.eventid === currentEvent.eventid);
  }, [currentEvent, detail]);
  const selectRankedUser = (userId: string) => {
    setSelectedRankUserId(userId);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      setMobileRankUserId(userId);
    }
  };

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (detailError || !detail) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-red-400/20 bg-red-400/10 p-5 text-center">
        <p className="font-semibold text-white">League unavailable</p>
        <p className="mt-2 text-sm text-red-200">{detailError instanceof Error ? detailError.message : 'This league could not be loaded.'}</p>
        <button type="button" className="btn-ghost mt-4" onClick={onBack}>Back</button>
      </div>
    );
  }
  const activeMembers = detail.members.filter((member) => member.approved && member.participating);
  const selectedSeason = detail.seasons.find((season) => season.seasonid === detail.selectedseasonid);

  if (!detail.league.isadmin) {
    return (
      <MemberLeagueView
        detail={detail}
        currentUserId={currentUserId}
        selectedUserId={selectedRankUserId}
        selectedSeason={selectedSeason}
        focusPostId={initialPostId}
        onBack={onBack}
        onSelectUser={selectRankedUser}
        onSeasonChange={(seasonId) => {
          setSelectedSeasonId(seasonId);
          setSelectedEvent(null);
        }}
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)_88px] items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <button className="inline-flex h-10 w-fit items-center justify-start gap-1.5 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 via-[#122E30] to-pit-teal/10 px-3 py-2 text-xs font-semibold text-pit-teal shadow-[0_0_18px_rgba(20,184,166,0.12)] transition hover:border-pit-teal/60 hover:text-white md:shrink-0" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Back
        </button>
        <p className="line-clamp-2 min-w-0 px-1 text-center text-sm font-bold leading-4 text-white md:line-clamp-1 md:text-left md:text-base">{detail.league.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="chip h-10 w-10 justify-center p-0 transition hover:border-pit-teal/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-pit-teal/50 md:w-auto md:gap-1.5 md:px-3"
            onClick={() => setShareInviteOpen(true)}
            title="Share league invite"
            aria-label="Share league invite"
          >
            <Share size={15} aria-hidden="true" />
            <span className="hidden font-mono md:inline">{detail.league.invitecode}</span>
          </button>
          <div ref={manageMenuRef} className="relative">
            <button
              type="button"
              className="btn-ghost h-10 w-10 cursor-pointer justify-center p-0 md:w-auto md:gap-2 md:px-3 md:py-2"
              aria-expanded={manageMenuOpen}
              aria-haspopup="menu"
              onClick={() => setManageMenuOpen((open) => !open)}
              aria-label="Manage league"
              title="Manage league"
            >
              <Menu size={17} />
              <span className="hidden md:inline">Manage</span>
            </button>
            {manageMenuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-pit-border bg-pit-surface p-1 shadow-2xl" role="menu">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setSettingsModalOpen(true);
                  }}
                >
                  <Pencil size={14} />
                  League & season
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setSeasonModalOpen(true);
                  }}
                >
                  <CalendarDays size={14} />
                  New season
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setActiveDetailTab('players');
                  }}
                >
                  <Users size={14} />
                  Players
                </button>
                <div className="my-1 h-px bg-pit-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={detail.seasons.length <= 1 || deleteSeasonMutation.isPending}
                  onClick={() => {
                    setManageMenuOpen(false);
                    setDeleteSeasonConfirmOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  Delete season
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={deleteLeagueMutation.isPending}
                  onClick={() => {
                    setManageMenuOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  Delete league
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-3 min-[1100px]:hidden">
          {selectedSeason ? (
            <>
              <label className="flex h-12 w-full items-center gap-2 rounded-lg border border-pit-teal/45 bg-pit-bg/85 px-3 shadow-[0_0_18px_rgba(20,184,166,0.08)]">
                <CalendarDays size={16} className="shrink-0 text-pit-teal" aria-hidden="true" />
                <select
                  className="min-w-0 flex-1 appearance-none bg-transparent py-2 text-sm font-semibold text-white outline-none [color-scheme:dark]"
                  aria-label="Select season"
                  value={detail.selectedseasonid}
                  onChange={(event) => {
                    setSelectedSeasonId(event.target.value);
                    setSelectedEvent(null);
                  }}
                >
                  {detail.seasons.map((season) => (
                    <option key={season.seasonid} value={season.seasonid} className="bg-pit-bg text-white">
                      {normalizeSeasonLabel(season.name)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} className="pointer-events-none shrink-0 text-pit-teal" aria-hidden="true" />
              </label>
              <p className="mt-2 px-1 text-xs text-pit-text">{formatSeasonDateRange(selectedSeason.begindate, selectedSeason.enddate)}</p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <MobileSeasonMetric icon={<Users size={14} />} label="Players" value={`${activeMembers.length}/${detail.league.expectedplayercount}`} />
                <MobileSeasonMetric icon={<CalendarDays size={14} />} label="Events" value={detail.events.length} />
                <MobileSeasonMetric icon={<ListOrdered size={14} />} label="Best finishes" value={detail.league.bestfinishcount} />
                <MobileSeasonMetric icon={<Trophy size={14} />} label="Show-up bonus" value={detail.league.showupbonuspoints} />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
              <p className="font-semibold text-white">No active season</p>
              <p className="mt-1 text-sm text-pit-text">Choose or create a season to view league standings.</p>
            </div>
          )}
        </div>
        <div className="hidden border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5 min-[1100px]:block">
          {selectedSeason && (
            <>
              <label className="flex h-12 max-w-xl items-center gap-2 rounded-lg border border-pit-teal/40 bg-pit-bg/80 px-3 shadow-[0_0_18px_rgba(20,184,166,0.08)]">
                <CalendarDays size={16} className="shrink-0 text-pit-teal" aria-hidden="true" />
                <span className="shrink-0 text-sm font-normal text-pit-text">Season</span>
                <select
                  className="min-w-0 flex-1 appearance-none bg-transparent py-2 text-base font-bold text-white outline-none [color-scheme:dark]"
                  aria-label="Select season"
                  value={detail.selectedseasonid}
                  onChange={(event) => {
                    setSelectedSeasonId(event.target.value);
                    setSelectedEvent(null);
                  }}
                >
                  {detail.seasons.map((season) => (
                    <option key={season.seasonid} value={season.seasonid} className="bg-pit-bg text-white">
                      Season {season.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} className="pointer-events-none shrink-0 text-pit-teal" aria-hidden="true" />
              </label>
              <p className="mt-2 text-sm text-pit-text">
                <strong className="font-semibold text-white">{normalizeSeasonLabel(selectedSeason.name)}</strong> runs{' '}
                <strong className="font-semibold text-white">{String(selectedSeason.begindate).slice(0, 10)}</strong> through{' '}
                <strong className="font-semibold text-white">{String(selectedSeason.enddate).slice(0, 10)}</strong>.
              </p>
            </>
          )}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <LeagueHeroStat label="Players" value={`${activeMembers.length}/${detail.league.expectedplayercount}`} />
            <LeagueHeroStat label="Events" value={detail.events.length} />
            <LeagueHeroStat label="Best finishes" value={detail.league.bestfinishcount} />
            <LeagueHeroStat label="Show-up bonus" value={detail.league.showupbonuspoints} />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5 border-b border-pit-border bg-pit-bg/45 p-2 min-[1100px]:hidden" role="tablist" aria-label="League sections">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'events', label: 'Events' },
            { id: 'scoring', label: 'Scoring' },
            { id: 'fees', label: 'Payments' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeDetailTab === tab.id}
              className={`min-w-0 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
                activeDetailTab === tab.id
                  ? 'border-pit-teal bg-pit-teal/15 text-white'
                  : 'border-pit-border bg-pit-card/60 text-pit-text hover:border-pit-teal/50 hover:text-white'
              }`}
              onClick={() => {
                setMobileMoreOpen(false);
                if (tab.id === 'events') setSelectedEvent(null);
                setActiveDetailTab(tab.id as LeagueDetailTab);
              }}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={['audit', 'board', 'players'].includes(activeDetailTab)}
            aria-expanded={mobileMoreOpen}
            className={`min-w-0 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
              mobileMoreOpen || ['audit', 'board', 'players'].includes(activeDetailTab)
                ? 'border-pit-teal bg-pit-teal/15 text-white'
                : 'border-pit-border bg-pit-card/60 text-pit-text hover:border-pit-teal/50 hover:text-white'
            }`}
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            More
          </button>
        </div>
        {mobileMoreOpen && (
          <div className="grid grid-cols-2 gap-2 border-b border-pit-border bg-pit-bg/75 p-3 min-[1100px]:hidden">
            {[
              { id: 'board', label: 'Message Board', icon: <MessageSquare size={14} /> },
              { id: 'audit', label: 'Audit Trail', icon: <ScrollText size={14} /> },
              { id: 'players', label: 'Players', icon: <Users size={14} /> },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className="btn-ghost justify-start gap-2 px-3 py-2 text-xs"
                onClick={() => {
                  setActiveDetailTab(item.id as LeagueDetailTab);
                  setMobileMoreOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="btn-ghost justify-start gap-2 px-3 py-2 text-xs"
              onClick={() => {
                setMobileMoreOpen(false);
                setSettingsModalOpen(true);
              }}
            >
              <Pencil size={14} />
              Season details
            </button>
          </div>
        )}
        <div className="hidden min-w-0 max-w-full gap-2 overflow-x-auto border-b border-pit-border bg-pit-bg/45 px-4 py-3 min-[1100px]:flex">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'events', label: 'Events' },
            { id: 'scoring', label: 'Scoring' },
            { id: 'fees', label: 'Payments' },
            { id: 'audit', label: 'Audit Trail' },
            { id: 'board', label: 'Message Board' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                activeDetailTab === tab.id
                  ? 'border-pit-teal bg-pit-teal/15 text-white'
                  : 'border-pit-border bg-pit-card/60 text-pit-text hover:border-pit-teal/50 hover:text-white'
              }`}
              onClick={() => {
                if (tab.id === 'events') setSelectedEvent(null);
                setActiveDetailTab(tab.id as LeagueDetailTab);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeDetailTab === 'overview' && (
          <>
            <div className="min-[1100px]:hidden">
              <MobileLeagueOverview
                detail={detail}
                onSelectUser={selectRankedUser}
                onViewAll={() => setFullStandingsOpen(true)}
              />
            </div>
            <div className="hidden gap-4 p-4 min-[1100px]:grid xl:grid-cols-[minmax(0,1fr)_360px]">
              <StandingsTable detail={detail} selectedUserId={selectedRankUserId} onSelectUser={selectRankedUser} />
              <div className="hidden xl:sticky xl:top-4 xl:block xl:self-start">
                <PlayerLeagueProfile detail={detail} userId={selectedRankUserId} floating />
              </div>
            </div>
          </>
        )}
      </section>

      <Modal title="Player Journey" open={Boolean(mobileRankUserId)} onClose={() => setMobileRankUserId(null)} mobilePlacement="center">
        <PlayerLeagueProfile detail={detail} userId={mobileRankUserId} />
      </Modal>
      <Modal title="Full Standings" open={fullStandingsOpen} onClose={() => setFullStandingsOpen(false)} mobilePlacement="center">
        <MobileFullStandings
          detail={detail}
          onSelectUser={(userId) => {
            setFullStandingsOpen(false);
            selectRankedUser(userId);
          }}
        />
      </Modal>

      {activeDetailTab === 'fees' && (
        <div className="space-y-4">
          <PaymentTracker
            detail={detail}
            onSettings={(payload) => updatePaymentSettingsMutation.mutate(payload)}
            onAddPayment={(userId) => {
              setPaymentTargetUserId(userId);
              setPaymentModalOpen(true);
            }}
            onEditPayment={(payment) => setEditingPayment(payment)}
            onDeletePayment={(paymentId) => deletePaymentMutation.mutate(paymentId)}
            settingsLoading={updatePaymentSettingsMutation.isPending}
            settingsError={updatePaymentSettingsMutation.error?.message}
            deleteLoading={deletePaymentMutation.isPending}
          />
          <LeagueAuditTrail detail={detail} compact />
        </div>
      )}

      {activeDetailTab === 'board' && (
        <LeagueBoard leagueId={detail.league.leagueid} seasonId={detail.selectedseasonid} isAdmin focusPostId={initialPostId} />
      )}

      {activeDetailTab === 'scoring' && (
        <ScoringFinalGamePanel
          league={detail.league}
          season={selectedSeason}
          eventCount={detail.events.length}
          playerCountOverride={pendingScoringPlayerCount}
          loading={updateSeasonScoringMutation.isPending}
          error={updateSeasonScoringMutation.error?.message}
          onSubmit={(payload) => updateSeasonScoringMutation.mutate(payload)}
        />
      )}

      {activeDetailTab === 'players' && (
        <LeagueMembersCard
          detail={detail}
          onAddGuest={(displayname) => addGuestMutation.mutate(displayname)}
          onAddAdmin={(email) => addAdminMutation.mutate(email)}
          onAddSeasonMembers={(userids) => addSeasonMembersMutation.mutate(userids)}
          onInviteTakeover={(userId, email) => inviteSpotTakeoverMutation.mutate({ userId, email })}
          onToggleAdmin={(userId, isadmin) => updateMemberAdminMutation.mutate({ userId, isadmin })}
          onRemoveMember={setRemoveMemberTarget}
          addLoading={addGuestMutation.isPending}
          addAdminLoading={addAdminMutation.isPending}
          addSeasonMembersLoading={addSeasonMembersMutation.isPending}
          inviteLoadingUserId={inviteSpotTakeoverMutation.isPending ? inviteSpotTakeoverMutation.variables?.userId : null}
          adminLoadingUserId={updateMemberAdminMutation.isPending ? updateMemberAdminMutation.variables?.userId : null}
          removeLoading={removeMemberMutation.isPending}
          error={addGuestMutation.error?.message ?? addAdminMutation.error?.message ?? addSeasonMembersMutation.error?.message ?? inviteSpotTakeoverMutation.error?.message ?? updateMemberAdminMutation.error?.message ?? removeMemberMutation.error?.message}
        />
      )}

      {activeDetailTab === 'events' && (
        <div>
          <div className="lg:hidden">
            {selectedEventFromDetail ? (
              <EventTrackerCard
                detail={detail}
                event={selectedEventFromDetail}
                leagueId={league.leagueid}
                resultsCount={detail.results.filter((result) => result.eventid === selectedEventFromDetail.eventid).length}
                onLog={(userId, placed, dnf) => resultMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId, placed, dnf })}
                onMarkAllPaid={() => markEventPaidMutation.mutate({ eventId: selectedEventFromDetail.eventid, all: true })}
                onTogglePaid={(userId, paid) => toggleEventPaidMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId, paid })}
                onSetRsvp={(userId, status) => eventRsvpMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId, status })}
                onMarkLeagueFeePaid={(userId) => markLeagueFeeInstallmentMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId })}
                onClearResult={(userId) => clearResultMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId })}
                onRefresh={() => void refetch()}
                refreshing={isFetching}
                loading={resultMutation.isPending || clearResultMutation.isPending || markEventPaidMutation.isPending || toggleEventPaidMutation.isPending || markLeagueFeeInstallmentMutation.isPending || eventRsvpMutation.isPending}
                error={resultMutation.error?.message ?? clearResultMutation.error?.message ?? markEventPaidMutation.error?.message ?? toggleEventPaidMutation.error?.message ?? markLeagueFeeInstallmentMutation.error?.message ?? eventRsvpMutation.error?.message}
              />
            ) : (
              <LeagueEventListCard
                events={detail.events}
                currentEventId={currentEvent?.eventid ?? null}
                onSelect={setSelectedEvent}
                onEdit={setEditingEvent}
                onAdd={() => setEventModalOpen(true)}
                showRunLinks={Boolean(selectedSeason?.eventsasgames)}
              />
            )}
          </div>
          <div className="hidden gap-5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <LeagueEventListCard
              events={detail.events}
              currentEventId={currentEvent?.eventid ?? null}
              onSelect={setSelectedEvent}
              onEdit={setEditingEvent}
              onAdd={() => setEventModalOpen(true)}
              showRunLinks={Boolean(selectedSeason?.eventsasgames)}
            />
            <EventTrackerCard
              detail={detail}
              event={currentEvent}
              leagueId={league.leagueid}
              resultsCount={eventResults.length}
              onLog={(userId, placed, dnf) => currentEvent && resultMutation.mutate({ eventId: currentEvent.eventid, userId, placed, dnf })}
              onMarkAllPaid={() => currentEvent && markEventPaidMutation.mutate({ eventId: currentEvent.eventid, all: true })}
              onTogglePaid={(userId, paid) => currentEvent && toggleEventPaidMutation.mutate({ eventId: currentEvent.eventid, userId, paid })}
              onSetRsvp={(userId, status) => currentEvent && eventRsvpMutation.mutate({ eventId: currentEvent.eventid, userId, status })}
              onMarkLeagueFeePaid={(userId) => currentEvent && markLeagueFeeInstallmentMutation.mutate({ eventId: currentEvent.eventid, userId })}
              onClearResult={(userId) => currentEvent && clearResultMutation.mutate({ eventId: currentEvent.eventid, userId })}
              onRefresh={() => void refetch()}
              refreshing={isFetching}
              loading={resultMutation.isPending || clearResultMutation.isPending || markEventPaidMutation.isPending || toggleEventPaidMutation.isPending || markLeagueFeeInstallmentMutation.isPending || eventRsvpMutation.isPending}
              error={resultMutation.error?.message ?? clearResultMutation.error?.message ?? markEventPaidMutation.error?.message ?? toggleEventPaidMutation.error?.message ?? markLeagueFeeInstallmentMutation.error?.message ?? eventRsvpMutation.error?.message}
            />
          </div>
        </div>
      )}

      {activeDetailTab === 'audit' && (
        <LeagueAuditTrail detail={detail} />
      )}

      <CreateEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSubmit={(payload) => createEventMutation.mutate(payload)}
        nextEventNumber={detail.events.length + 1}
        loading={createEventMutation.isPending}
        error={createEventMutation.error?.message}
      />
      <EditEventModal
        open={Boolean(editingEvent)}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSubmit={(payload) => {
          if (!editingEvent) return;
          updateEventMutation.mutate({ eventId: editingEvent.eventid, ...payload });
        }}
        loading={updateEventMutation.isPending}
        error={updateEventMutation.error?.message}
      />
      <CreateSeasonModal
        open={seasonModalOpen}
        onClose={() => setSeasonModalOpen(false)}
        onSubmit={(payload) => createSeasonMutation.mutate(payload)}
        nextSeasonNumber={detail.seasons.length + 1}
        loading={createSeasonMutation.isPending}
        error={createSeasonMutation.error?.message}
      />
      <LeagueSettingsModal
        open={settingsModalOpen}
        league={detail.league}
        season={selectedSeason}
        finalGameEnabled={Boolean(detail.league.finalenabled)}
        loading={updateNamesMutation.isPending}
        error={updateNamesMutation.error?.message}
        onClose={() => setSettingsModalOpen(false)}
        onSubmit={(payload) => {
          const playerCountChanged = selectedSeason
            && payload.expectedplayercount != null
            && payload.expectedplayercount !== Number(selectedSeason.expectedplayercount ?? detail.league.expectedplayercount);
          if (playerCountChanged && detail.league.finalenabled) {
            setPendingScoringPlayerCount(payload.expectedplayercount!);
            setSettingsModalOpen(false);
            setActiveDetailTab('scoring');
            return;
          }
          updateNamesMutation.mutate(payload);
        }}
      />
      <RecordPaymentModal
        open={paymentModalOpen}
        detail={detail}
        targetUserId={paymentTargetUserId}
        loading={createPaymentMutation.isPending}
        error={createPaymentMutation.error?.message}
        saveState={paymentSaveState}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentTargetUserId(null);
        }}
        onSubmit={(payload) => createPaymentMutation.mutate(payload)}
      />

      <AdjustPaymentModal
        open={Boolean(editingPayment)}
        detail={detail}
        payment={editingPayment}
        loading={updatePaymentMutation.isPending}
        error={updatePaymentMutation.error?.message}
        onClose={() => setEditingPayment(null)}
        onSubmit={(paymentId, payload) => updatePaymentMutation.mutate({ paymentId, payload })}
      />
      <JoinShareDialog
        open={shareInviteOpen}
        onClose={() => setShareInviteOpen(false)}
        kind="league"
        name={detail.league.name}
        inviteCode={detail.league.invitecode}
        joinPath={`/join/${encodeURIComponent(detail.league.invitecode)}`}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete league?"
        message={(
          <>
            Delete <span className="font-semibold text-white">{detail.league.name}</span>? This hides the league and its events from everyone.
          </>
        )}
        confirmLabel="Delete league"
        loading={deleteLeagueMutation.isPending}
        requireText={detail.league.name}
        requireLabel="League name"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => deleteLeagueMutation.mutate()}
      />
      <ConfirmDialog
        open={deleteSeasonConfirmOpen}
        title="Delete season?"
        message={(
          <>
            Delete <span className="font-semibold text-white">{selectedSeason?.name ?? 'this season'}</span>? The league stays active, but this season and its events are hidden from standings and tracking.
          </>
        )}
        confirmLabel="Delete season"
        loading={deleteSeasonMutation.isPending}
        requireText={selectedSeason?.name}
        requireLabel="Season name"
        onClose={() => setDeleteSeasonConfirmOpen(false)}
        onConfirm={() => selectedSeason && deleteSeasonMutation.mutate(selectedSeason.seasonid)}
      />
      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        title="Remove from season?"
        message={(
          <>
            Remove <span className="font-semibold text-white">{removeMemberTarget?.displayname ?? 'this player'}</span> from this season? They keep league access and admin rights, but this season's finishes and payment records are removed.
          </>
        )}
        confirmLabel="Remove player"
        loading={removeMemberMutation.isPending}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={() => removeMemberTarget && removeMemberMutation.mutate(removeMemberTarget.userid)}
      />
    </div>
  );
}

function LeagueEventListCard({
  events,
  currentEventId,
  onSelect,
  onEdit,
  onAdd,
  showRunLinks,
}: {
  events: LeagueEvent[];
  currentEventId: string | null;
  onSelect: (event: LeagueEvent) => void;
  onEdit: (event: LeagueEvent) => void;
  onAdd: () => void;
  showRunLinks: boolean;
}) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Events</h3>
        <button type="button" className="btn-primary h-8 gap-1.5 px-2.5 py-1.5 text-xs" onClick={onAdd}>
          <Plus size={13} />
          Event
        </button>
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
          No events yet.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.eventid}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                currentEventId === event.eventid ? 'border-pit-teal bg-pit-teal/10' : 'border-pit-border bg-pit-bg/60 hover:border-pit-teal/40'
              }`}
            >
              <button className="min-w-0 flex-1 text-left" type="button" onClick={() => onSelect(event)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-white">{event.name}</p>
                  <span className="shrink-0 text-xs text-pit-muted">{event.resultcount ?? 0} logged</span>
                </div>
                <p className="mt-1 text-xs text-pit-muted">{formatLeagueEventDateTime(event)}</p>
              </button>
              <button
                className="btn-ghost h-8 w-8 shrink-0 p-0"
                type="button"
                title={`Edit ${event.name}`}
                onClick={() => onEdit(event)}
              >
                <Pencil size={13} />
              </button>
              {showRunLinks && event.tournamentid && (
                <a
                  className="btn-primary h-8 shrink-0 px-2.5 py-1.5 text-xs"
                  href={`/tournament/${event.tournamentid}`}
                  onClick={(clickEvent) => clickEvent.stopPropagation()}
                >
                  Run
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EventTrackerCard({
  detail,
  event,
  leagueId,
  resultsCount,
  onLog,
  onMarkAllPaid,
  onTogglePaid,
  onSetRsvp,
  onMarkLeagueFeePaid,
  onClearResult,
  onRefresh,
  refreshing,
  loading,
  error,
}: {
  detail: LeagueDetail;
  event: LeagueEvent | null;
  leagueId: string;
  resultsCount: number;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  onMarkAllPaid: () => void;
  onTogglePaid: (userId: string, paid: boolean) => void;
  onSetRsvp: (userId: string, status: LeagueEventRsvpStatus) => void;
  onMarkLeagueFeePaid: (userId: string) => void;
  onClearResult: (userId: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  loading: boolean;
  error?: string;
}) {
  const [showKnockoutQr, setShowKnockoutQr] = useState(false);
  const [showKnockoutQrFullscreen, setShowKnockoutQrFullscreen] = useState(false);
  const [knockoutToken, setKnockoutToken] = useState<string | null>(null);
  const knockoutLinkMutation = useMutation({
    mutationFn: () => api.createLeagueEventKnockoutLink(leagueId, event!.eventid),
    onSuccess: (response) => {
      setKnockoutToken(response.token);
      setShowKnockoutQr(true);
    },
  });
  const knockoutLobbyUrl = event && knockoutToken
    ? `${window.location.origin}/league-knockout/${knockoutToken}`
    : '';

  useEffect(() => {
    setShowKnockoutQr(false);
    setShowKnockoutQrFullscreen(false);
    setKnockoutToken(null);
  }, [event?.eventid]);

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white">{event ? event.name : 'No event selected'}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="chip hover:border-pit-teal/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh event players, RSVPs, payments, and finishes"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          {event && (
            <a className="chip hover:border-pit-teal/50 hover:text-white" href={event.tournamentid ? `/tournament/${event.tournamentid}` : `/league/${leagueId}/event/${event.eventid}`}>
              <Copy size={13} />
              {event.tournamentid ? 'Run tournament' : 'Player lobby'}
            </a>
          )}
          {event && (
            <button
              type="button"
              className="chip hover:border-pit-teal/50 hover:text-white"
              onClick={() => {
                if (showKnockoutQr) {
                  setShowKnockoutQr(false);
                } else if (knockoutToken) {
                  setShowKnockoutQr(true);
                } else {
                  knockoutLinkMutation.mutate();
                }
              }}
              disabled={knockoutLinkMutation.isPending}
              aria-expanded={showKnockoutQr}
            >
              <QrCode size={13} />
              {knockoutLinkMutation.isPending ? 'Preparing QR...' : 'Knockout QR'}
            </button>
          )}
          <span className="chip">{resultsCount} finishes</span>
        </div>
      </div>
      {event ? (
        <>
          {showKnockoutQr && knockoutLobbyUrl && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-pit-teal/30 bg-pit-teal/5 p-4">
              <div className="w-fit rounded-lg bg-white p-2">
                <QRCodeSVG value={knockoutLobbyUrl} size={132} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-pit-text">
                  Scan to quickly record an event knockout.
                </p>
                <button
                  type="button"
                  className="btn-ghost mt-3 px-3 py-2 text-xs"
                  onClick={() => setShowKnockoutQrFullscreen(true)}
                >
                  View full screen
                </button>
              </div>
            </div>
          )}
          <LeagueEventRsvpPanel detail={detail} event={event} />
          {event.tournamentid ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pit-teal/25 bg-pit-teal/5 p-3">
              <p className="text-sm text-pit-text">Check-ins, payments, seating, and finishes are tracked in the tournament runner. Restore a player there to clear a placement.</p>
              <a className="btn-primary px-3 py-2 text-xs" href={`/tournament/${event.tournamentid}`}>Manage placements</a>
            </div>
          ) : (
            <EventRosterLogger
              detail={detail}
              event={event}
              onLog={onLog}
              onMarkAllPaid={onMarkAllPaid}
              onTogglePaid={onTogglePaid}
              onSetRsvp={onSetRsvp}
              onMarkLeagueFeePaid={onMarkLeagueFeePaid}
              onClearResult={onClearResult}
              loading={loading}
              error={error}
            />
          )}
        </>
      ) : (
        <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
          Add an event to start logging finishes.
        </p>
      )}
      <Modal
        title="Knockout QR"
        open={showKnockoutQrFullscreen && Boolean(knockoutLobbyUrl)}
        onClose={() => setShowKnockoutQrFullscreen(false)}
        mobilePlacement="center"
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="max-w-full rounded-xl bg-white p-3">
            <QRCodeSVG value={knockoutLobbyUrl} size={360} className="h-auto max-w-full" />
          </div>
          <p className="text-sm text-pit-text">Scan to quickly record an event knockout.</p>
        </div>
      </Modal>
    </section>
  );
}

function LeagueEventRsvpPanel({ detail, event }: { detail: LeagueDetail; event: LeagueEvent }) {
  const eventRsvps = (detail.rsvps ?? []).filter((rsvp) => rsvp.eventid === event.eventid);
  const going = eventRsvps
    .filter((rsvp) => rsvp.status === 'going')
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const notGoing = eventRsvps
    .filter((rsvp) => rsvp.status === 'not_going')
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const exportRows = eventRsvps.map((rsvp) => ({
    name: rsvp.displayname ?? 'Player',
    status: rsvp.status === 'going' ? 'Going' : "Can't go",
  }));

  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pit-muted">Event RSVP</p>
          <p className="mt-1 text-sm text-white">{going.length} going{notGoing.length ? `, ${notGoing.length} cannot attend` : ''}</p>
        </div>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-xs"
          disabled={eventRsvps.length === 0}
          onClick={() => exportLeagueEventRsvps(event, exportRows)}
        >
          <Download size={13} />
          Export RSVP CSV
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <RsvpList title="Going" rsvps={going} empty="No one has RSVP'd going yet." />
        <RsvpList title="Can't go" rsvps={notGoing} empty="No declines yet." danger />
      </div>
    </div>
  );
}

function RsvpList({
  title,
  rsvps,
  empty,
  danger = false,
}: {
  title: string;
  rsvps: LeagueEventRsvp[];
  empty: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-pit-muted">{title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
          danger ? 'border-red-300/25 bg-red-400/10 text-red-200' : 'border-pit-teal/30 bg-pit-teal/10 text-pit-teal'
        }`}>
          {rsvps.length}
        </span>
      </div>
      {rsvps.length === 0 ? (
        <p className="text-xs text-pit-muted">{empty}</p>
      ) : (
        <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
          {rsvps.map((rsvp) => (
            <div key={rsvp.rsvpid} className="flex items-center justify-between gap-2 rounded-md bg-pit-bg/70 px-2 py-1.5 text-xs">
              <span className="truncate font-semibold text-white">{rsvp.displayname ?? 'Player'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getRankedStandings(detail: LeagueDetail) {
  return [...detail.standings].sort((a, b) => {
    const pointDiff = Number(b.scoredpoints || 0) - Number(a.scoredpoints || 0);
    if (pointDiff !== 0) return pointDiff;
    const averageA = a.averagefinish ? Number(a.averagefinish) : Number.POSITIVE_INFINITY;
    const averageB = b.averagefinish ? Number(b.averagefinish) : Number.POSITIVE_INFINITY;
    if (averageA !== averageB) return averageA - averageB;
    return String(a.displayname ?? '').localeCompare(String(b.displayname ?? ''));
  });
}

function MobileLeagueOverview({
  detail,
  onSelectUser,
  onViewAll,
}: {
  detail: LeagueDetail;
  onSelectUser: (userId: string) => void;
  onViewAll: () => void;
}) {
  const rankedStandings = getRankedStandings(detail);
  const leaders = rankedStandings.slice(0, 3);
  const preview = rankedStandings.slice(3, 7);
  const leaderGridClass = leaders.length === 1 ? 'grid-cols-1' : leaders.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  const hasLoggedResults = detail.results.length > 0;

  if (rankedStandings.length === 0 || !hasLoggedResults) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-pit-border bg-pit-bg/55 px-4 py-8 text-center">
          <Trophy size={24} className="mx-auto text-pit-muted" aria-hidden="true" />
          <h3 className="mt-3 font-semibold text-white">No results yet</h3>
          <p className="mt-1 text-sm text-pit-text">Standings will appear after the first scored event.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 pb-20 sm:p-4 sm:pb-20">
      <section aria-labelledby="top-leaders-heading">
        <h3 id="top-leaders-heading" className="mb-3 text-base font-bold text-white">Top 3 Leaders</h3>
        <div className={`grid gap-2 ${leaderGridClass}`}>
          {leaders.map((standing, index) => {
            const rank = index + 1;
            const wins = detail.results.filter((result) => result.userid === standing.userid && !result.dnf && Number(result.placed) === 1).length;
            return (
              <MobileLeaderCard
                key={standing.userid}
                rank={rank}
                name={standing.displayname ?? 'Player'}
                points={Number(standing.scoredpoints || 0)}
                average={standing.averagefinish ?? null}
                wins={wins}
                onClick={() => onSelectUser(standing.userid)}
              />
            );
          })}
        </div>
      </section>

      {preview.length > 0 && (
        <section aria-labelledby="standings-preview-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="standings-preview-heading" className="text-base font-bold text-white">Standings</h3>
            <button type="button" className="text-xs font-semibold text-pit-teal hover:text-white" onClick={onViewAll}>
              View all
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
            {preview.map((standing, index) => (
              <MobileStandingRow
                key={standing.userid}
                rank={index + 4}
                name={standing.displayname ?? 'Player'}
                points={Number(standing.scoredpoints || 0)}
                average={standing.averagefinish ?? null}
                onClick={() => onSelectUser(standing.userid)}
              />
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        className="flex h-12 w-full items-center justify-between rounded-xl border border-pit-border bg-pit-bg/55 px-4 text-sm font-semibold text-pit-text transition hover:border-pit-teal/45 hover:text-white"
        onClick={onViewAll}
      >
        View Full Standings
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

function MobileLeaderCard({
  rank,
  name,
  points,
  average,
  wins,
  onClick,
}: {
  rank: number;
  name: string;
  points: number;
  average: number | null;
  wins: number;
  onClick: () => void;
}) {
  const rankStyles = rank === 1
    ? 'border-[#d8bf55]/35 bg-[#d8bf55]/[0.07]'
    : rank === 2
      ? 'border-slate-300/25 bg-slate-300/[0.055]'
      : 'border-[#c78654]/30 bg-[#c78654]/[0.06]';
  const badgeStyles = rank === 1
    ? 'bg-[#e2c84e] text-[#17130a]'
    : rank === 2
      ? 'bg-[#c8ced5] text-[#15181b]'
      : 'bg-[#c98657] text-[#1c120c]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[10.25rem] min-w-0 flex-col items-center rounded-xl border px-2 py-3 text-center transition hover:border-pit-teal/55 hover:bg-pit-teal/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal/60 ${rankStyles}`}
      aria-label={`Rank ${rank}, ${name}, ${formatNumber(points)} points`}
    >
      <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black shadow-sm ${badgeStyles}`}>{rank}</span>
      <span className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pit-teal/40 bg-gradient-to-br from-pit-teal/35 to-[#063638] text-sm font-black text-white">
        {playerInitial(name)}
      </span>
      <span className="mt-2 flex min-h-8 w-full items-center justify-center break-words text-[11px] font-semibold leading-4 text-white sm:text-xs">
        {name}
      </span>
      <span className="mt-1 whitespace-nowrap text-lg font-black text-white sm:text-xl">
        {formatNumber(points)} <span className="text-[10px] font-semibold text-pit-teal">pts</span>
      </span>
      <span className="mt-auto flex w-full items-center justify-center gap-2 border-t border-pit-border/60 pt-2 text-[10px] text-pit-text">
        <span>Avg {average ? average.toFixed(1) : '-'}</span>
        {wins > 0 && <span className="inline-flex items-center gap-0.5"><Trophy size={10} className="text-pit-gold" /> {wins}</span>}
      </span>
    </button>
  );
}

function MobileStandingRow({
  rank,
  name,
  points,
  average,
  onClick,
}: {
  rank: number;
  name: string;
  points: number;
  average: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-14 w-full grid-cols-[28px_30px_minmax(0,1fr)_64px_48px_16px] items-center gap-1.5 border-b border-pit-border/60 px-2.5 py-2 text-left text-xs transition last:border-b-0 hover:bg-pit-teal/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pit-teal/60 sm:grid-cols-[32px_34px_minmax(0,1fr)_74px_56px_18px] sm:gap-2 sm:px-3"
      aria-label={`Rank ${rank}, ${name}, ${formatNumber(points)} points, average finish ${average ? average.toFixed(1) : 'not available'}`}
    >
      <span className="font-mono text-pit-teal">{rank}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-pit-teal/30 bg-pit-teal/15 font-bold text-white sm:h-8 sm:w-8">
        {playerInitial(name)}
      </span>
      <span className="min-w-0 truncate font-semibold text-white">{name}</span>
      <span className="whitespace-nowrap text-right font-mono font-semibold text-white">{formatNumber(points)} <span className="text-[9px] text-pit-teal">pts</span></span>
      <span className="whitespace-nowrap text-right text-pit-text">Avg {average ? average.toFixed(1) : '-'}</span>
      <ChevronRight size={15} className="text-pit-muted" aria-hidden="true" />
    </button>
  );
}

function MobileFullStandings({ detail, onSelectUser }: { detail: LeagueDetail; onSelectUser: (userId: string) => void }) {
  const [search, setSearch] = useState('');
  const rankedStandings = getRankedStandings(detail);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleStandings = normalizedSearch
    ? rankedStandings.filter((standing) => String(standing.displayname ?? '').toLowerCase().includes(normalizedSearch))
    : rankedStandings;

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-lg border border-pit-border bg-pit-bg/70 px-3 focus-within:border-pit-teal/60">
        <Search size={15} className="text-pit-muted" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-pit-muted"
          placeholder="Search players"
        />
      </label>
      <div className="max-h-[62dvh] overflow-y-auto rounded-xl border border-pit-border bg-pit-bg/55">
        {visibleStandings.map((standing) => {
          const rank = rankedStandings.findIndex((item) => item.userid === standing.userid) + 1;
          return (
            <MobileStandingRow
              key={standing.userid}
              rank={rank}
              name={standing.displayname ?? 'Player'}
              points={Number(standing.scoredpoints || 0)}
              average={standing.averagefinish ?? null}
              onClick={() => onSelectUser(standing.userid)}
            />
          );
        })}
        {visibleStandings.length === 0 && <p className="p-4 text-center text-sm text-pit-text">No players match that search.</p>}
      </div>
    </div>
  );
}

function buildProjectedFinalStacks(detail: LeagueDetail, standings = getRankedStandings(detail)): LeagueFinalStack[] {
  if (!detail.league.finalenabled) return [];
  const rounding = Math.max(1, Math.round(Number(detail.league.finalchiprounding || 100)));
  const bigBlind = Math.max(1, Math.round(Number(detail.league.finalstartingbigblind || 100)));
  const multiplierByPlace = new Map(
    (detail.league.finalmultiplierlookup ?? []).map((rule) => [Number(rule.place), Number(rule.multiplier || 0)])
  );
  return standings.map((standing, index) => {
    const place = index + 1;
    const multiplier = multiplierByPlace.get(place) ?? 0;
    const multiplierchips = Math.round(Number(standing.scoredpoints || 0) * multiplier);
    const rawStartingStack = multiplierchips + Number(standing.showupbonus || 0);
    const startingstack = Math.ceil(rawStartingStack / rounding) * rounding;
    return {
      ...standing,
      place,
      multiplier,
      multiplierchips,
      roundedchips: startingstack,
      startingstack,
      bbstostart: Math.round(startingstack / bigBlind),
    };
  });
}

function StandingsTable({
  detail,
  selectedUserId,
  onSelectUser,
}: {
  detail: LeagueDetail;
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
}) {
  const rankedStandings = getRankedStandings(detail);
  const finalEnabled = Boolean(detail.league.finalenabled);
  const projectedFinalStacks = buildProjectedFinalStacks(detail, rankedStandings);
  const finalStackByUser = new Map(projectedFinalStacks.map((stack) => [stack.userid, stack]));
  const totalStartingStack = projectedFinalStacks.reduce((sum, stack) => sum + Number(stack.startingstack || 0), 0);
  const rowClassName = finalEnabled
    ? 'block w-full border-b border-pit-border/50 px-3 py-3 text-left text-sm transition-colors last:border-0 md:grid md:grid-cols-[56px_minmax(180px,1fr)_90px_90px_112px_64px_70px_70px] md:gap-2'
    : 'block w-full border-b border-pit-border/50 px-3 py-3 text-left text-sm transition-colors last:border-0 md:grid md:grid-cols-[56px_minmax(180px,1fr)_90px_90px_70px_70px] md:gap-2';
  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
      <div className={`hidden gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted md:grid ${
        finalEnabled ? 'grid-cols-[56px_minmax(180px,1fr)_90px_90px_112px_64px_70px_70px]' : 'grid-cols-[56px_minmax(180px,1fr)_90px_90px_70px_70px]'
      }`}>
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Placement</span>
        <span className="text-right">Show-up</span>
        {finalEnabled && <span className="text-right">Final</span>}
        {finalEnabled && <span className="text-right">BBs</span>}
        <span className="text-right">Played</span>
        <span className="text-right">Avg</span>
      </div>
      {rankedStandings.map((standing, index) => {
        const finalStack = finalStackByUser.get(standing.userid);
        return (
          <button
            key={standing.userid}
            type="button"
            onClick={() => onSelectUser(standing.userid)}
            className={`${rowClassName} ${
              selectedUserId === standing.userid ? 'bg-pit-teal/10' : 'hover:bg-pit-card'
            }`}
          >
            <div className="flex items-start justify-between gap-3 md:contents">
              <span className="shrink-0 font-mono text-pit-teal">#{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-white md:truncate">{standing.displayname ?? 'Player'}</p>
                <p className="mt-1 text-xs text-pit-muted">
                  Scored finishes: {bestPlacementSummary(detail, standing.userid)}
                  <span className="md:hidden"> (Avg: {standing.averagefinish ? standing.averagefinish.toFixed(1) : '-'})</span>
                </p>
                {finalEnabled && finalStack && (
                  <p className="mt-1 text-xs text-pit-teal md:hidden">
                    Final {formatNumber(Number(finalStack.startingstack || 0))} - {formatBbs(Number(finalStack.bbstostart || 0))} BBs ({formatPercentOfField(Number(finalStack.startingstack || 0), totalStartingStack)})
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right md:hidden">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-pit-muted">Placement</span>
                <span className="block font-bold text-white">{formatNumber(Number(standing.scoredpoints || 0))}</span>
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-pit-muted">Show-up</span>
                <span className="block font-bold text-pit-teal">{formatNumber(Number(standing.showupbonus || 0))}</span>
              </div>
            </div>
            <span className="hidden text-right font-bold text-white md:block">{formatNumber(Number(standing.scoredpoints || 0))}</span>
            <span className="hidden text-right font-bold text-pit-teal md:block">{formatNumber(Number(standing.showupbonus || 0))}</span>
            {finalEnabled && (
              <span className="hidden text-right md:block">
                <span className="block font-mono text-white">{finalStack ? formatNumber(Number(finalStack.startingstack || 0)) : '-'}</span>
                <span className="block text-[11px] text-pit-muted">{finalStack ? `${Number(finalStack.multiplier || 0)}x - ${formatPercentOfField(Number(finalStack.startingstack || 0), totalStartingStack)}` : ''}</span>
              </span>
            )}
            {finalEnabled && (
              <span className="hidden text-right font-mono text-pit-teal md:block">
                {finalStack ? formatBbs(Number(finalStack.bbstostart || 0)) : '-'}
              </span>
            )}
            <div className="hidden md:contents">
              <span className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-1.5 text-pit-text md:border-0 md:bg-transparent md:p-0 md:text-right">
                {standing.eventsplayed}
              </span>
              <span className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-1.5 text-pit-text md:border-0 md:bg-transparent md:p-0 md:text-right">
                {standing.averagefinish ? standing.averagefinish.toFixed(1) : '-'}
              </span>
            </div>
          </button>
        );
      })}
      {rankedStandings.length === 0 && <p className="p-4 text-sm text-pit-text">No approved players yet.</p>}
    </div>
  );
}

function PlayerLeagueProfile({ detail, userId, floating = false }: { detail: LeagueDetail; userId: string | null; floating?: boolean }) {
  const member = detail.members.find((item) => item.userid === userId) ?? null;
  const standing = getRankedStandings(detail).find((item) => item.userid === userId) ?? null;
  const shellClass = floating
    ? 'max-h-[calc(100vh-2rem)] rounded-xl border border-pit-border bg-pit-bg/55 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.25)]'
    : 'h-full rounded-xl border border-pit-border bg-pit-bg/55 p-4';
  if (!userId || !member || !standing) {
    return (
      <div className={shellClass}>
        <h3 className="font-semibold text-white">Player details</h3>
        <p className="mt-2 text-sm leading-6 text-pit-text">Select a player in the standings to review event finishes, points, and payment status.</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Player ledger</p>
          <h3 className="truncate text-lg font-bold text-white">{member.displayname ?? 'Player'}</h3>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="text-pit-muted">Placement <span className="font-semibold text-white">{formatNumber(Number(standing.scoredpoints || 0))}</span></p>
          <p className="mt-1 text-pit-muted">Show-up <span className="font-semibold text-pit-teal">{formatNumber(Number(standing.showupbonus || 0))}</span></p>
        </div>
      </div>
      <div className={`${floating ? 'max-h-[calc(100vh-15rem)]' : 'max-h-[34rem]'} space-y-2 overflow-y-auto pr-1`}>
        {detail.events.map((event) => {
          const result = detail.results.find((item) => item.eventid === event.eventid && item.userid === userId);
          const placementPoints = result ? Number(result.points || 0) : 0;
          return (
            <div key={event.eventid} className="flex items-center gap-2 rounded-lg border border-pit-border bg-pit-card/60 px-3 py-2 text-xs">
                <p className="min-w-0 flex-1 truncate font-semibold text-white">{event.name}</p>
              <span className="shrink-0 text-pit-text">{result ? (result.dnf ? 'DNF' : `${result.placed}${ordinal(result.placed)}`) : '-'}</span>
              <span className="shrink-0 font-mono text-pit-teal">{formatNumber(placementPoints)} pts</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MemberLeagueView({
  detail,
  currentUserId,
  selectedUserId,
  selectedSeason,
  focusPostId,
  onBack,
  onSelectUser,
  onSeasonChange,
}: {
  detail: LeagueDetail;
  currentUserId: string | null;
  selectedUserId: string | null;
  selectedSeason?: LeagueDetail['seasons'][number];
  focusPostId?: string;
  onBack: () => void;
  onSelectUser: (userId: string) => void;
  onSeasonChange: (seasonId: string) => void;
}) {
  const [mobileProfileUserId, setMobileProfileUserId] = useState<string | null>(null);
  const rankedStandings = getRankedStandings(detail);
  const viewedUserId = selectedUserId && rankedStandings.some((item) => item.userid === selectedUserId)
    ? selectedUserId
    : currentUserId;
  const isViewingSelf = Boolean(currentUserId && viewedUserId === currentUserId);
  const member = viewedUserId ? detail.members.find((item) => item.userid === viewedUserId) ?? null : null;
  const standing = viewedUserId ? rankedStandings.find((item) => item.userid === viewedUserId) ?? null : null;
  const rank = standing ? rankedStandings.findIndex((item) => item.userid === standing.userid) + 1 : null;
  const userResults = viewedUserId ? detail.results.filter((result) => result.userid === viewedUserId) : [];
  const resultByEvent = new Map(userResults.map((result) => [result.eventid, result]));
  const today = todayDateString();
  const remainingEvents = detail.events.filter((event) => !resultByEvent.has(event.eventid) && isEventRemaining(event, today));
  const nextEvent = detail.events.filter((event) => isEventRemaining(event, today)).sort(compareLeagueEvents)[0] ?? null;
  const resultEventIds = new Set(detail.results.map((result) => result.eventid));
  const completedEventIds = new Set(
    detail.events
      .filter((event) => isEventDueToDate(event, today) || resultEventIds.has(event.eventid))
      .map((event) => event.eventid)
  );
  const playedCompletedEventCount = new Set(userResults.filter((result) => completedEventIds.has(result.eventid)).map((result) => result.eventid)).size;
  const eventsPlayedLabel = completedEventIds.size === 0 ? '0' : `${playedCompletedEventCount} of ${completedEventIds.size}`;
  const placementPoints = Number(standing?.scoredpoints || 0);
  const bestFinish = viewedUserId ? bestPlacementValues(detail, viewedUserId)[0] ?? null : null;
  const feeSummary = viewedUserId ? getPlayerFeeSummary(detail, viewedUserId) : null;
  const canViewLeagueLedger = Boolean(detail.league.memberledgervisible);
  const qc = useQueryClient();
  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: LeagueEventRsvpStatus }) =>
      api.rsvpLeagueEvent(detail.league.leagueid, eventId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', detail.league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const selectProfileUser = (userId: string) => {
    onSelectUser(userId);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      setMobileProfileUserId(userId);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 via-[#122E30] to-pit-teal/10 px-3 py-2 text-xs font-semibold text-pit-teal shadow-[0_0_18px_rgba(20,184,166,0.12)] transition hover:border-pit-teal/60 hover:text-white" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Back
        </button>
        <select
          className="input h-10 w-40 shrink-0 py-2 text-xs sm:w-52"
          value={detail.selectedseasonid}
          onChange={(event) => onSeasonChange(event.target.value)}
        >
          {detail.seasons.map((season) => (
            <option key={season.seasonid} value={season.seasonid}>
              {season.name}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-2xl border border-pit-border bg-pit-card">
        <div className="grid gap-5 border-b border-pit-border bg-[radial-gradient(circle_at_18%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <p className="eyebrow">{isViewingSelf ? 'My league story' : 'Player journey'}</p>
            <h2 className="mt-1 text-3xl font-black text-white">{detail.league.name}</h2>
            <p className="mt-2 text-sm leading-6 text-pit-text">
              <strong className="font-semibold text-white">{selectedSeason?.name ?? 'Current season'}</strong>
              {selectedSeason && (
                <>
                  {' '}runs <strong className="font-semibold text-white">{String(selectedSeason.begindate).slice(0, 10)}</strong> through{' '}
                  <strong className="font-semibold text-white">{String(selectedSeason.enddate).slice(0, 10)}</strong>.
                </>
              )}
            </p>
            {!isViewingSelf && currentUserId && (
              <button
                type="button"
                className="mt-3 rounded-full border border-pit-teal/35 bg-pit-teal/10 px-3 py-1 text-xs font-semibold text-pit-teal transition hover:border-pit-teal/70 hover:bg-pit-teal/15"
                onClick={() => onSelectUser(currentUserId)}
              >
                Back to my story
              </button>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MemberStoryStat label="Current place" value={rank ? `#${rank}` : '-'} />
              <MemberStoryStat label="Avg finish" value={standing?.averagefinish ? standing.averagefinish.toFixed(1) : '-'} />
              <MemberStoryStat label="Remaining" value={remainingEvents.length} />
              <MemberStoryStat
                label={isViewingSelf ? 'Estimated open' : 'Placement points'}
                value={isViewingSelf ? formatCurrency(feeSummary?.totalRemaining ?? 0) : formatNumber(placementPoints)}
                accent={isViewingSelf ? ((feeSummary?.totalRemaining ?? 0) > 0 ? 'gold' : 'teal') : 'teal'}
              />
            </div>
          </div>
          <NextLeagueEventCard detail={detail} event={nextEvent} />
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="eyebrow">Season performance</p>
                  <h3 className="mt-1 text-lg font-bold text-white">{member?.displayname ?? 'League member'}</h3>
                </div>
                <span className="chip">{formatNumber(placementPoints)} pts</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <MemberMoneyStat label="Events played" value={eventsPlayedLabel} />
                {isViewingSelf ? (
                  <>
                    <MemberMoneyStat label="League fees left" value={formatCurrency(feeSummary?.leagueFeeRemaining ?? 0)} accent={(feeSummary?.leagueFeeRemaining ?? 0) > 0 ? 'gold' : 'teal'} />
                    <MemberMoneyStat label="Estimated event fees left" value={formatCurrency(feeSummary?.eventFeeRemaining ?? 0)} accent={(feeSummary?.eventFeeRemaining ?? 0) > 0 ? 'gold' : 'teal'} />
                  </>
                ) : (
                  <>
                    <MemberMoneyStat label="Placement points" value={formatNumber(placementPoints)} accent="teal" />
                    <MemberMoneyStat label="Best finish" value={bestFinish ? `${bestFinish}${ordinal(bestFinish)}` : '-'} accent="gold" />
                  </>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-semibold text-white">{isViewingSelf ? 'Events' : `${member?.displayname ?? 'Player'} events`}</h4>
                <Trophy size={15} className="text-pit-gold" />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {detail.events.map((event) => {
                  const result = resultByEvent.get(event.eventid);
                  const points = result ? Number(result.points || 0) + Number(result.showupbonuspoints || 0) : 0;
                  return (
                    <div key={event.eventid} className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{event.name}</p>
                        <p className="mt-1 text-xs text-pit-muted">{formatLeagueEventDateTime(event)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-pit-teal">{formatNumber(points)} pts</p>
                        <p className="mt-1 text-xs text-pit-text">{result ? (result.dnf ? 'DNF' : `${result.placed}${ordinal(result.placed)} place`) : 'No finish'}</p>
                      </div>
                      {isViewingSelf && (
                        <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-pit-border/70 pt-2">
                          <button
                            type="button"
                            className={`justify-center px-2 py-1.5 text-xs ${getLeagueEventRsvp(detail, event, currentUserId!)?.status === 'going' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={rsvpMutation.isPending}
                            onClick={() => rsvpMutation.mutate({ eventId: event.eventid, status: 'going' })}
                          >
                            <CheckCircle2 size={13} />
                            Going
                          </button>
                          <button
                            type="button"
                            className={`btn-ghost justify-center px-2 py-1.5 text-xs ${getLeagueEventRsvp(detail, event, currentUserId!)?.status === 'not_going' ? 'border-red-300/35 bg-red-400/10 text-red-100' : ''}`}
                            disabled={rsvpMutation.isPending}
                            onClick={() => rsvpMutation.mutate({ eventId: event.eventid, status: 'not_going' })}
                          >
                            <UserMinus size={13} />
                            Can't go
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {detail.events.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">No events scheduled yet.</p>}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-white">Player rankings</h3>
              <ListOrdered size={16} className="text-pit-teal" />
            </div>
            <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {rankedStandings.map((item, index) => (
                <button
                  key={item.userid}
                  type="button"
                  onClick={() => selectProfileUser(item.userid)}
                  className={`grid w-full grid-cols-[42px_minmax(0,1fr)_82px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    item.userid === viewedUserId ? 'border-pit-teal bg-pit-teal/10' : 'border-pit-border bg-pit-card/60 hover:border-pit-teal/45 hover:bg-pit-card'
                  }`}
                >
                  <span className="font-mono text-pit-teal">#{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {item.displayname ?? 'Player'}{item.userid === currentUserId ? ' (you)' : ''}
                    </p>
                    <p className="mt-1 text-xs text-pit-muted">{item.eventsplayed} played{item.averagefinish ? ` - avg ${item.averagefinish.toFixed(1)}` : ''}</p>
                  </div>
                  <span className="text-right font-mono text-white">{formatNumber(Number(item.scoredpoints || 0))}</span>
                </button>
              ))}
              {rankedStandings.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">Standings will appear once finishes are logged.</p>}
            </div>
          </section>
        </div>
      </section>

      <LeagueBoard leagueId={detail.league.leagueid} seasonId={detail.selectedseasonid} isAdmin={false} focusPostId={focusPostId} />

      <Modal title="Player Journey" open={Boolean(mobileProfileUserId)} onClose={() => setMobileProfileUserId(null)} mobilePlacement="center">
        <PlayerLeagueProfile detail={detail} userId={mobileProfileUserId} />
      </Modal>

      {canViewLeagueLedger && <LeagueAuditTrail detail={detail} compact />}
    </div>
  );
}

function LeagueBoard({
  leagueId,
  seasonId,
  isAdmin,
  focusPostId,
}: {
  leagueId: string;
  seasonId: string;
  isAdmin: boolean;
  focusPostId?: string;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const queryKey = ['league-posts', leagueId, seasonId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.getLeaguePosts(leagueId, seasonId),
  });
  const createMutation = useMutation({
    mutationFn: () => api.createLeaguePost(leagueId, seasonId, { message: message.trim(), notifyMembers }),
    onSuccess: () => {
      setMessage('');
      qc.invalidateQueries({ queryKey });
    },
  });
  const replyMutation = useMutation({
    mutationFn: ({ postId, reply }: { postId: string; reply: string }) => api.createLeaguePostComment(leagueId, seasonId, postId, reply),
    onSuccess: (_, variables) => {
      setReplyDrafts((current) => ({ ...current, [variables.postId]: '' }));
      qc.invalidateQueries({ queryKey });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (postId: string) => api.deleteLeaguePost(leagueId, seasonId, postId),
    onSuccess: () => {
      setDeletePostId(null);
      qc.invalidateQueries({ queryKey });
    },
  });
  const posts = data?.posts ?? [];

  useEffect(() => {
    if (!focusPostId || isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`league-post-${focusPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusPostId, isLoading, posts]);

  return (
    <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
      <div className="flex items-center justify-between gap-3 border-b border-pit-border px-4 py-3 sm:px-5">
        <div>
          <p className="eyebrow">Season conversation</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-white"><MessageSquare size={17} className="text-pit-teal" />League Board</h3>
        </div>
        <span className="chip">{posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>
      </div>

      {isAdmin && (
        <div className="space-y-3 border-b border-pit-border bg-pit-bg/35 p-4 sm:p-5">
          <textarea
            className="input min-h-24 resize-y"
            value={message}
            maxLength={1600}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Share an update with this season..."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${notifyMembers ? 'border-pit-teal/45 bg-pit-teal/10 text-pit-teal' : 'border-pit-border text-pit-muted'}`}
              onClick={() => setNotifyMembers((current) => !current)}
              aria-pressed={notifyMembers}
            >
              <BellRing size={14} />
              {notifyMembers ? 'Email and push on' : 'Post silently'}
            </button>
            <button
              type="button"
              className="btn-primary gap-2"
              disabled={!message.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Send size={14} />
              {createMutation.isPending ? 'Posting...' : 'Post update'}
            </button>
          </div>
          {createMutation.error && <p className="text-xs text-red-300">{createMutation.error.message}</p>}
        </div>
      )}

      <div className="space-y-3 p-4 sm:p-5">
        {isLoading && <LoadingSpinner className="py-8" />}
        {error && <p className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error.message}</p>}
        {!isLoading && !error && posts.length === 0 && (
          <p className="rounded-lg border border-dashed border-pit-border px-4 py-8 text-center text-sm text-pit-muted">No season updates yet.</p>
        )}
        {posts.map((post) => (
          <article
            id={`league-post-${post.postid}`}
            key={post.postid}
            className={`rounded-xl border bg-pit-bg/45 p-4 transition ${focusPostId === post.postid ? 'border-pit-teal shadow-[0_0_0_1px_rgba(20,184,166,0.3),0_0_24px_rgba(20,184,166,0.16)]' : 'border-pit-border'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">{post.displayname ?? 'League admin'}</p>
                <p className="mt-0.5 text-xs text-pit-muted">{new Date(post.createdat).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              {isAdmin && (
                <button type="button" className="icon-btn text-red-300" title="Delete post" onClick={() => setDeletePostId(post.postid)}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-pit-text">{post.message}</p>

            {post.comments.length > 0 && (
              <div className="mt-4 space-y-2 border-l-2 border-pit-teal/30 pl-3">
                {post.comments.map((comment) => (
                  <div key={comment.commentid} className="rounded-lg bg-black/20 px-3 py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-white">{comment.displayname ?? 'League member'}</p>
                      <p className="text-[10px] text-pit-muted">{new Date(comment.createdat).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-pit-text">{comment.message}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <input
                className="input min-w-0 flex-1"
                value={replyDrafts[post.postid] ?? ''}
                maxLength={800}
                onChange={(event) => setReplyDrafts((current) => ({ ...current, [post.postid]: event.target.value }))}
                placeholder="Write a reply"
                onKeyDown={(event) => {
                  const reply = (replyDrafts[post.postid] ?? '').trim();
                  if (event.key === 'Enter' && !event.shiftKey && reply && !replyMutation.isPending) {
                    event.preventDefault();
                    replyMutation.mutate({ postId: post.postid, reply });
                  }
                }}
              />
              <button
                type="button"
                className="icon-btn shrink-0 text-pit-teal"
                title="Send reply"
                disabled={!String(replyDrafts[post.postid] ?? '').trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate({ postId: post.postid, reply: String(replyDrafts[post.postid] ?? '').trim() })}
              >
                <Send size={16} />
              </button>
            </div>
          </article>
        ))}
        {replyMutation.error && <p className="text-xs text-red-300">{replyMutation.error.message}</p>}
      </div>

      <ConfirmDialog
        open={Boolean(deletePostId)}
        title="Delete league post?"
        message="This removes the post and its replies from this season board."
        confirmLabel="Delete post"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeletePostId(null)}
        onConfirm={() => {
          if (deletePostId) deleteMutation.mutate(deletePostId);
        }}
      />
    </section>
  );
}

function MemberStoryStat({ label, value, accent = 'white' }: { label: string; value: string | number; accent?: 'white' | 'teal' | 'gold' }) {
  const colorClass = accent === 'teal' ? 'text-pit-teal' : accent === 'gold' ? 'text-pit-gold' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-pit-muted">{label}</p>
      <p className={`mt-1 text-2xl font-black ${colorClass}`}>{value}</p>
    </div>
  );
}

function MemberMoneyStat({ label, value, accent = 'white' }: { label: string; value: string | number; accent?: 'white' | 'teal' | 'gold' }) {
  const colorClass = accent === 'teal' ? 'text-pit-teal' : accent === 'gold' ? 'text-pit-gold' : 'text-white';
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card/60 p-3">
      <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
      <p className={`mt-2 text-2xl font-black ${colorClass}`}>{value}</p>
    </div>
  );
}

function NextLeagueEventCard({ detail, event }: { detail: LeagueDetail; event: LeagueEvent | null }) {
  return (
    <div className="rounded-xl border border-pit-border bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">Next event</h3>
        <CalendarDays size={16} className="text-pit-teal" />
      </div>
      {event ? (
        <div>
          <p className="text-xl font-black text-white">{event.name}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-pit-border bg-pit-bg/70 p-3">
              <p className="text-xs uppercase tracking-wide text-pit-muted">Date</p>
              <p className="mt-1 font-semibold text-white">{formatLeagueEventDateTime(event)}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/70 p-3">
              <p className="text-xs uppercase tracking-wide text-pit-muted">Fee</p>
              <p className="mt-1 font-semibold text-white">{formatCurrency(getLeagueEventFee(detail, event))}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-pit-border bg-pit-bg/70 p-3 text-sm leading-6 text-pit-text">
          No upcoming events are scheduled in this season.
        </p>
      )}
    </div>
  );
}

function LeagueMembersCard({
  detail,
  onAddGuest,
  onAddAdmin,
  onAddSeasonMembers,
  onInviteTakeover,
  onToggleAdmin,
  onRemoveMember,
  addLoading,
  addAdminLoading,
  addSeasonMembersLoading,
  inviteLoadingUserId,
  adminLoadingUserId,
  removeLoading,
  error,
}: {
  detail: LeagueDetail;
  onAddGuest: (displayname: string) => void;
  onAddAdmin: (email: string) => void;
  onAddSeasonMembers: (userIds: string[]) => void;
  onInviteTakeover: (userId: string, email: string) => void;
  onToggleAdmin: (userId: string, isadmin: boolean) => void;
  onRemoveMember: (member: LeagueMember) => void;
  addLoading: boolean;
  addAdminLoading: boolean;
  addSeasonMembersLoading: boolean;
  inviteLoadingUserId?: string | null;
  adminLoadingUserId?: string | null;
  removeLoading: boolean;
  error?: string;
}) {
  const [guestName, setGuestName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [selectedSeasonMemberIds, setSelectedSeasonMemberIds] = useState<string[]>([]);
  const [takeoverEmails, setTakeoverEmails] = useState<Record<string, string>>({});
  const approvedMembers = detail.members
    .filter((member) => member.approved && member.participating)
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const seasonCandidates = detail.members
    .filter((member) => member.approved && !member.participating && !member.claimedbyuserid)
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const leagueAdmins = detail.members
    .filter((member) => member.approved && member.isadmin)
    .sort((a, b) => Number(b.userid === detail.league.ownerid) - Number(a.userid === detail.league.ownerid) || String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const pendingCount = detail.members.filter((member) => !member.approved).length;

  const submitGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    onAddGuest(name);
    setGuestName('');
  };
  const submitTakeoverInvite = (member: LeagueMember) => {
    const email = (takeoverEmails[member.userid] ?? '').trim();
    if (!email) return;
    onInviteTakeover(member.userid, email);
  };
  const submitAdmin = () => {
    const email = adminEmail.trim();
    if (!email) return;
    onAddAdmin(email);
    setAdminEmail('');
  };
  const submitSeasonMembers = () => {
    if (selectedSeasonMemberIds.length === 0) return;
    onAddSeasonMembers(selectedSeasonMemberIds);
    setSelectedSeasonMemberIds([]);
  };

  return (
    <section className="card min-w-0 max-w-full space-y-4 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Season roster</p>
          <h3 className="text-xl font-bold text-white">Players</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{approvedMembers.length}/{detail.league.expectedplayercount} active</span>
          {pendingCount > 0 && <span className="chip">{pendingCount} pending</span>}
        </div>
      </div>

      {detail.league.isadmin && (
        <details className="group rounded-xl border border-pit-border bg-pit-bg/45">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Users size={15} className="text-pit-teal" />Player Management</span>
            <ChevronDown size={15} className="text-pit-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-pit-border p-3 xl:grid-cols-2">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end xl:col-span-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Add league members to this season</span>
              <select
                className="input min-h-[7.5rem] py-2"
                multiple
                value={selectedSeasonMemberIds}
                onChange={(event) => {
                  const values = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
                  setSelectedSeasonMemberIds(values);
                }}
              >
                {seasonCandidates.map((member) => (
                  <option key={member.userid} value={member.userid}>
                    {member.displayname ?? 'League member'}{member.isadmin ? ' (admin)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn-primary justify-center px-4 py-2 text-sm"
              disabled={addSeasonMembersLoading || selectedSeasonMemberIds.length === 0}
              onClick={submitSeasonMembers}
            >
              <UserPlus size={13} />
              {addSeasonMembersLoading ? 'Adding...' : 'Add to season'}
            </button>
            {seasonCandidates.length === 0 && (
              <p className="rounded-lg border border-pit-border bg-pit-card/60 px-3 py-2 text-sm text-pit-muted lg:col-span-2">
                No approved league members are waiting for this season.
              </p>
            )}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Add player</span>
              <input
                className="input py-2"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitGuest();
                }}
                placeholder="Player name"
              />
            </label>
            <button className="btn-primary justify-center px-4 py-2 text-sm" disabled={addLoading || !guestName.trim()} onClick={submitGuest}>
              <UserPlus size={13} />
              {addLoading ? 'Adding...' : 'Add player'}
            </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Add league admin</span>
              <input
                className="input py-2"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitAdmin();
                }}
                placeholder="Registered email"
              />
            </label>
            <button className="btn-ghost justify-center gap-2 px-4 py-2 text-sm" disabled={addAdminLoading || !adminEmail.trim()} onClick={submitAdmin}>
              <Crown size={13} />
              {addAdminLoading ? 'Adding...' : 'Add admin'}
            </button>
            </div>
            {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300 xl:col-span-2">{error}</p>}
          </div>
        </details>
      )}

      <details className="group rounded-xl border border-pit-border bg-pit-bg/45">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Crown size={15} className="text-pit-gold" />League Admins <span className="text-xs font-normal text-pit-muted">{leagueAdmins.length}</span></span>
          <ChevronDown size={15} className="text-pit-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-pit-border p-3 sm:grid-cols-2 xl:grid-cols-3">
          {leagueAdmins.map((member) => (
            <div key={member.userid} className="flex items-center justify-between gap-3 rounded-lg border border-pit-border bg-pit-card/70 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{member.displayname ?? 'League admin'}</p>
                <p className="truncate text-xs text-pit-muted">
                  {member.userid === detail.league.ownerid ? 'Owner' : member.participating ? 'Admin and player' : 'Admin only'}
                </p>
              </div>
              {member.userid !== detail.league.ownerid && detail.league.isadmin && (
                <button
                  type="button"
                  className="btn-ghost h-8 w-8 shrink-0 p-0 text-pit-gold hover:border-pit-gold/40 hover:text-yellow-100"
                  disabled={adminLoadingUserId === member.userid}
                  onClick={() => onToggleAdmin(member.userid, false)}
                  title={`Remove ${member.displayname ?? 'admin'} as league admin`}
                >
                  <Crown size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </details>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {approvedMembers.map((member) => (
          <div key={member.userid} className="min-w-0 rounded-xl border border-pit-border bg-pit-bg/60 p-3">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-white">
                  {member.isguestuser ? (
                    <span className="shrink-0" title="Guest player"><Ghost size={15} className="text-pit-muted" aria-label="Guest player" /></span>
                  ) : (
                    <span className="shrink-0" title="Verified account"><BadgeCheck size={15} className="text-pit-teal" aria-label="Verified account" /></span>
                  )}
                  <span className="truncate">{member.displayname ?? 'Player'}</span>
                </p>
                {member.isadmin && (
                  <span className="badge mt-1.5 w-fit border border-pit-gold/20 bg-pit-gold/10 text-pit-gold">
                    <Crown size={9} className="mr-0.5" /> Admin
                  </span>
                )}
                {member.isguestuser && member.haspendinginvite && <p className="mt-1 text-[11px] text-pit-muted">Invite pending</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {detail.league.isadmin && (
                  <>
                    {member.userid !== detail.league.ownerid && (
                      <button
                        className={`btn-ghost h-8 w-8 shrink-0 p-0 ${
                          member.isadmin
                            ? 'text-pit-gold hover:border-pit-gold/40 hover:text-yellow-100'
                            : 'text-pit-muted hover:border-pit-gold/40 hover:text-pit-gold'
                        }`}
                        disabled={adminLoadingUserId === member.userid}
                        title={member.isadmin ? `Remove ${member.displayname ?? 'player'} as league admin` : `Make ${member.displayname ?? 'player'} a league admin`}
                        onClick={() => onToggleAdmin(member.userid, !member.isadmin)}
                      >
                        <Crown size={13} />
                      </button>
                    )}
                    <button
                      className="btn-ghost h-8 w-8 shrink-0 p-0 text-red-300 hover:border-red-400/40 hover:text-red-200"
                      disabled={removeLoading}
                      title={`Remove ${member.displayname ?? 'player'} from this season`}
                      onClick={() => onRemoveMember(member)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {detail.league.isadmin && member.isguestuser && !member.claimedbyuserid && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="input h-9 py-2 text-xs"
                  type="email"
                  value={takeoverEmails[member.userid] ?? ''}
                  onChange={(event) => setTakeoverEmails((current) => ({ ...current, [member.userid]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitTakeoverInvite(member);
                  }}
                  placeholder="Email to invite"
                />
                <button
                  className="btn-ghost h-9 justify-center gap-1.5 px-3 py-2 text-xs"
                  disabled={inviteLoadingUserId === member.userid || !(takeoverEmails[member.userid] ?? '').trim()}
                  onClick={() => submitTakeoverInvite(member)}
                  type="button"
                >
                  <Mail size={12} />
                  {inviteLoadingUserId === member.userid ? 'Sending...' : 'Invite'}
                </button>
              </div>
            )}
          </div>
        ))}
        {approvedMembers.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">No players in this season yet.</p>}
      </div>
    </section>
  );
}

function PaymentTracker({
  detail,
  onSettings,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  settingsLoading,
  settingsError,
  deleteLoading,
}: {
  detail: LeagueDetail;
  onSettings: (payload: { leaguefee: number; seasonEventFee: number }) => void;
  onAddPayment: (userId: string) => void;
  onEditPayment: (payment: LeaguePayment) => void;
  onDeletePayment: (paymentId: string) => void;
  settingsLoading: boolean;
  settingsError?: string;
  deleteLoading: boolean;
}) {
  const selectedSeason = getSelectedLeagueSeason(detail);
  const [leagueFee, setLeagueFee] = useState(feeInputValue(detail.league.leaguefee));
  const [perEventFee, setPerEventFee] = useState(feeInputValue(getSeasonEventFee(detail)));
  useEffect(() => {
    setLeagueFee(feeInputValue(detail.league.leaguefee));
    setPerEventFee(feeInputValue(getSeasonEventFee(detail)));
  }, [detail]);
  const approvedMembers = detail.members.filter((member) => member.approved && member.participating);
  const totalPaid = detail.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const getMemberTotalDue = (userId: string) =>
    Number(detail.league.leaguefee || 0) + detail.events.reduce((sum, event) => sum + getPlayerEventFeeDue(detail, event, userId), 0);
  const totalDue = approvedMembers.reduce((sum, member) => sum + getMemberTotalDue(member.userid), 0);

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Payments</p>
            <h3 className="text-xl font-bold text-white">Payment Settings</h3>
            {selectedSeason && (
              <p className="mt-1 text-sm text-pit-muted">{selectedSeason.name} event fee applies to every event in this season.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip">{formatCurrency(totalPaid)} paid</span>
            <span className="chip">{formatCurrency(Math.max(0, totalDue - totalPaid))} open</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">League fee</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={leagueFee}
              onFocus={() => leagueFee === '0' && setLeagueFee('')}
              onChange={(event) => setLeagueFee(cleanMoneyInput(event.target.value))}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Season event fee</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={perEventFee}
              onFocus={() => perEventFee === '0' && setPerEventFee('')}
              onChange={(event) => setPerEventFee(cleanMoneyInput(event.target.value))}
            />
          </label>
          <button className="btn-primary px-3 py-2 text-sm" disabled={settingsLoading} onClick={() => onSettings({ leaguefee: Number(leagueFee) || 0, seasonEventFee: Number(perEventFee) || 0 })}>
            <Save size={14} />
            {settingsLoading ? 'Saving...' : 'Save Fees'}
          </button>
        </div>
        {settingsError && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{settingsError}</p>}
        <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
          <div className="hidden gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted md:grid md:grid-cols-[minmax(160px,1fr)_90px_90px_90px_100px_104px]">
            <span>Player</span>
            <span className="text-right">Due</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Open</span>
            <span className="text-right">Events</span>
            <span className="text-right">Payment</span>
          </div>
          {approvedMembers.map((member) => {
            const paid = detail.payments.filter((payment) => payment.userid === member.userid).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            const memberDue = getMemberTotalDue(member.userid);
            const open = Math.max(0, memberDue - paid);
            const eventStatuses = detail.events.map((event) => getEventPaymentStatus(detail, event, member.userid));
            const eventsOwed = eventStatuses.filter((status) => status.due > 0).length;
            const eventsPaid = eventStatuses.filter((status) => status.due > 0 && status.paid).length;
            return (
              <div key={member.userid} className="border-b border-pit-border/50 p-3 text-sm last:border-0 md:grid md:grid-cols-[minmax(160px,1fr)_90px_90px_90px_100px_104px] md:items-center md:gap-2 md:px-3 md:py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
                  <p className="mt-1 text-xs text-pit-muted md:hidden">{eventsPaid}/{eventsOwed} events paid</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 md:contents">
                  <div className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-2 md:border-0 md:bg-transparent md:p-0 md:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted md:hidden">Due</p>
                    <p className="font-semibold text-pit-text md:font-normal">{formatCurrency(memberDue)}</p>
                  </div>
                  <div className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-2 md:border-0 md:bg-transparent md:p-0 md:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted md:hidden">Paid</p>
                    <p className="font-semibold text-pit-teal md:font-normal">{formatCurrency(paid)}</p>
                  </div>
                  <div className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-2 md:border-0 md:bg-transparent md:p-0 md:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted md:hidden">Open</p>
                    <p className={`font-semibold ${open ? 'text-pit-gold' : 'text-pit-muted'}`}>{formatCurrency(open)}</p>
                  </div>
                </div>
                <span className="hidden text-right text-pit-text md:block">{eventsPaid}/{eventsOwed}</span>
                <button
                  type="button"
                  className="btn-ghost mt-3 w-full justify-center gap-1.5 px-3 py-2 text-xs text-pit-teal hover:border-pit-teal/60 hover:text-white md:mt-0 md:w-auto md:justify-self-end"
                  onClick={() => onAddPayment(member.userid)}
                >
                  <Plus size={13} />
                  Payment
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Payment history</p>
            <h3 className="text-xl font-bold text-white">Recorded Payments</h3>
            <p className="mt-1 text-sm text-pit-muted">Recorded league, event, and adjustment entries for this season.</p>
          </div>
          <span className="chip">
            <ScrollText size={13} />
            {detail.payments.length} records
          </span>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {detail.payments.map((payment) => (
            <div key={payment.paymentid} className="grid gap-2 rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_90px_80px] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{payment.displayname ?? 'Player'} <span className="text-xs font-normal text-pit-muted">({payment.paymenttype})</span></p>
                <p className="mt-1 truncate text-xs text-pit-muted">{payment.eventname ?? 'Season'} - {String(payment.paidat).slice(0, 10)}{payment.note ? ` - ${payment.note}` : ''}</p>
              </div>
              <span className="font-mono text-pit-teal sm:text-right">{formatCurrency(payment.amount)}</span>
              <span className="text-xs text-pit-muted sm:text-right">{String(payment.createdat).slice(0, 10)}</span>
              <div className="flex justify-end gap-1">
                <button className="btn-ghost h-9 w-9 p-0 text-pit-teal" onClick={() => onEditPayment(payment)} title="Adjust payment" aria-label={`Adjust payment for ${payment.displayname ?? 'player'}`}>
                  <Pencil size={14} />
                </button>
                <button className="btn-ghost h-9 w-9 p-0 text-red-300" disabled={deleteLoading} onClick={() => onDeletePayment(payment.paymentid)} title="Delete payment" aria-label={`Delete payment for ${payment.displayname ?? 'player'}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {detail.payments.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">No payments recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

function LeagueAuditTrail({ detail, compact = false }: { detail: LeagueDetail; compact?: boolean }) {
  const rows = compact ? detail.auditlog.slice(0, 8) : detail.auditlog;
  return (
    <section className={`${compact ? 'rounded-xl border border-pit-border bg-pit-card p-4' : 'card'} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h3 className="text-xl font-bold text-white">League Ledger</h3>
        </div>
        <span className="chip">
          <ScrollText size={13} />
          {detail.auditlog.length} entries
        </span>
      </div>
      <div className={`${compact ? 'max-h-80' : 'max-h-[34rem]'} space-y-2 overflow-y-auto pr-1`}>
        {rows.map((entry) => {
          const detailText = formatAuditDetails(entry);
          return (
            <div key={entry.auditid} className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{formatAuditAction(entry.action)}</p>
                  <p className="mt-1 text-sm leading-5 text-pit-text">{entry.summary}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-pit-muted">{formatAuditTimestamp(entry.createdat)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-pit-border bg-pit-card/70 px-2.5 py-1 text-pit-text">
                  By {entry.actorname ?? 'System'}
                </span>
                {entry.targetname && (
                  <span className="rounded-full border border-pit-border bg-pit-card/70 px-2.5 py-1 text-pit-text">
                    Player {entry.targetname}
                  </span>
                )}
                {entry.eventname && (
                  <span className="rounded-full border border-pit-teal/25 bg-pit-teal/10 px-2.5 py-1 text-pit-teal">
                    {entry.eventname}
                  </span>
                )}
                {entry.seasonname && (
                  <span className="rounded-full border border-pit-border bg-pit-card/70 px-2.5 py-1 text-pit-text">
                    {entry.seasonname}
                  </span>
                )}
              </div>
              {detailText && (
                <p className="mt-3 rounded-lg border border-pit-border bg-pit-card/50 px-3 py-2 text-xs leading-5 text-pit-muted">
                  {detailText}
                </p>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
            League changes will appear here as members join, payments are recorded, finishes are logged, and scoring settings change.
          </p>
        )}
      </div>
    </section>
  );
}

function EventRosterLogger({
  detail,
  event,
  onLog,
  onMarkAllPaid,
  onTogglePaid,
  onSetRsvp,
  onMarkLeagueFeePaid,
  onClearResult,
  loading,
  error,
}: {
  detail: LeagueDetail;
  event: LeagueEvent;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  onMarkAllPaid: () => void;
  onTogglePaid: (userId: string, paid: boolean) => void;
  onSetRsvp: (userId: string, status: LeagueEventRsvpStatus) => void;
  onMarkLeagueFeePaid: (userId: string) => void;
  onClearResult: (userId: string) => void;
  loading: boolean;
  error?: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const resultByUser = new Map(detail.results.filter((result) => result.eventid === event.eventid).map((result) => [result.userid, result]));
  const approvedMembers = [...detail.members]
    .filter((member) => member.approved && member.participating)
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const eventResults = detail.results.filter((result) => result.eventid === event.eventid);
  const goingMemberIds = new Set(
    approvedMembers
      .filter((member) => getLeagueEventRsvp(detail, event, member.userid)?.status === 'going')
      .map((member) => member.userid)
  );
  const liveFieldSize = goingMemberIds.size;
  const eventPlacementResults = eventResults.filter((result) => goingMemberIds.has(result.userid));
  const liveDnfCount = eventPlacementResults.filter((result) => result.dnf).length;
  const liveAvailablePlaces = Array.from({ length: Math.max(0, liveFieldSize - liveDnfCount) }, (_, index) => index + 1)
    .filter((place) => !eventPlacementResults.some((result) => !result.dnf && Number(result.placed) === place));
  const liveNextPlace = liveAvailablePlaces.length ? liveAvailablePlaces[liveAvailablePlaces.length - 1] : null;
  const pointLookup = new Map(
    detail.league.pointslookup
      .filter((rule) => typeof rule.place === 'number')
      .map((rule) => [Number(rule.place), Number(rule.points || 0)])
  );
  const liveFinishOptions = Array.from({ length: Math.max(0, liveFieldSize - liveDnfCount) }, (_, index) => ({
    place: index + 1,
    points: pointLookup.get(index + 1) ?? 0,
  }));
  const fee = getSeasonEventFee(detail);
  const eventPaymentStatuses = approvedMembers.map((member) => getEventPaymentStatus(detail, event, member.userid));
  const eligibleCount = eventPaymentStatuses.filter((status) => status.due > 0).length;
  const paidCount = eventPaymentStatuses.filter((status) => status.due > 0 && status.paid).length;

  useEffect(() => {
    setDrafts({});
  }, [event.eventid]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg/55 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pit-muted">Event roster</p>
          <p className="mt-1 text-sm text-white">{formatCurrency(fee)} event fee - {paidCount}/{eligibleCount} paid</p>
        </div>
        <button
          type="button"
          className="btn-primary px-3 py-2 text-xs"
          disabled={loading || !fee || eligibleCount === 0 || paidCount === eligibleCount}
          onClick={onMarkAllPaid}
        >
          <CheckCircle2 size={13} />
          Mark all event fees paid
        </button>
      </div>
      {event.hasstarted && liveFinishOptions.length > 0 && (
        <LeagueLiveResultsTable
          finishOptions={liveFinishOptions}
          results={eventResults}
          nextPlace={liveNextPlace}
        />
      )}
      {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {approvedMembers.map((member) => {
          const existing = resultByUser.get(member.userid);
          const paymentStatus = getEventPaymentStatus(detail, event, member.userid);
          const leagueFeeStatus = getLeagueFeeInstallmentStatus(detail, event, member.userid);
          const rsvp = getLeagueEventRsvp(detail, event, member.userid);
          const rsvpGoing = rsvp?.status === 'going';
          const rsvpNotGoing = rsvp?.status === 'not_going';
          const value = drafts[member.userid] ?? (existing?.placed ? String(existing.placed) : '');
          const totalPoints = existing ? Number(existing.points || 0) + Number(existing.showupbonuspoints || 0) : 0;
          const otherDnfCount = eventPlacementResults.filter((result) => result.userid !== member.userid && result.dnf).length;
          const maxPlace = Math.max(0, liveFieldSize - otherDnfCount);
          const usedPlaces = new Set(
            eventPlacementResults
              .filter((result) => result.userid !== member.userid && !result.dnf && result.placed != null)
              .map((result) => Number(result.placed))
          );
          Object.entries(drafts).forEach(([userId, place]) => {
            const draftPlace = Number(place);
            if (userId !== member.userid && draftPlace) usedPlaces.add(draftPlace);
          });
          const availablePlaces = Array.from({ length: maxPlace }, (_, index) => index + 1)
            .filter((place) => !usedPlaces.has(place));
          const selectedPlace = Number(value);
          if (selectedPlace && !availablePlaces.includes(selectedPlace)) {
            availablePlaces.push(selectedPlace);
            availablePlaces.sort((a, b) => a - b);
          }
          return (
            <div
              key={member.userid}
              className={`space-y-3 rounded-xl border p-3 ${
                rsvpGoing
                  ? 'border-emerald-300/25 bg-emerald-400/[0.045]'
                  : rsvpNotGoing
                    ? 'border-red-300/20 bg-red-400/[0.045]'
                    : 'border-pit-gold/25 bg-pit-gold/[0.04]'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
                {existing?.dnf ? (
                  <p className="mt-1 inline-flex rounded-full border border-red-300/25 bg-red-400/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-200">
                    DNF
                  </p>
                ) : existing?.placed != null ? (
                  <p className="mt-1 text-xs text-pit-muted">
                    {existing.placed}{ordinal(existing.placed)} place - {formatNumber(totalPoints)} pts
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-pit-border/70 bg-pit-card/45 p-2">
                <button
                  type="button"
                  className={`justify-center px-3 py-2 text-xs ${rsvpGoing ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={loading}
                  onClick={() => onSetRsvp(member.userid, 'going')}
                  title={`Set ${member.displayname ?? 'player'} RSVP to going`}
                >
                  <CheckCircle2 size={13} />
                  Going
                </button>
                <button
                  type="button"
                  className={`btn-ghost justify-center px-3 py-2 text-xs ${rsvpNotGoing ? 'border-red-300/30 bg-red-400/10 text-red-200' : ''}`}
                  disabled={loading}
                  onClick={() => onSetRsvp(member.userid, 'not_going')}
                  title={`Set ${member.displayname ?? 'player'} RSVP to can't go`}
                >
                  <UserMinus size={13} />
                  Can't go
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`justify-center px-3 py-2 text-xs ${paymentStatus.paid ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={loading || paymentStatus.due <= 0}
                  onClick={() => onTogglePaid(member.userid, paymentStatus.paid)}
                  title={paymentStatus.due <= 0 ? 'DNF players do not owe event fees' : paymentStatus.paid ? 'Click to mark unpaid' : 'Click to mark paid'}
                >
                  <CheckCircle2 size={13} />
                  Paid Event
                </button>
                <button
                  type="button"
                  className={`justify-center px-3 py-2 text-xs ${leagueFeeStatus.paidForEvent ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={loading || leagueFeeStatus.remaining <= 0 || leagueFeeStatus.installment <= 0 || leagueFeeStatus.paidForEvent}
                  onClick={() => onMarkLeagueFeePaid(member.userid)}
                  title={
                    leagueFeeStatus.remaining <= 0
                      ? 'League fee is fully paid'
                      : leagueFeeStatus.paidForEvent
                        ? 'League fee installment recorded for this event'
                        : `Record ${formatCurrency(Math.min(leagueFeeStatus.installment, leagueFeeStatus.remaining))} toward the league fee`
                  }
                >
                  <DollarSign size={13} />
                  Paid League Fee
                </button>
                <button
                  type="button"
                  className={`btn-ghost col-span-2 justify-center px-3 py-2 text-xs ${existing?.dnf ? 'border-red-300/30 bg-red-400/10 text-red-200' : ''}`}
                  disabled={loading}
                  onClick={() => {
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[member.userid];
                      return next;
                    });
                    if (existing?.dnf) onClearResult(member.userid);
                    else onLog(member.userid, null, true);
                  }}
                >
                  {existing?.dnf ? <RotateCcw size={13} /> : <UserMinus size={13} />}
                  {existing?.dnf ? 'Undo DNF' : 'DNF'}
                </button>
              </div>
              <div className={`grid gap-2 ${existing?.placed != null ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
                <select
                  className="input py-2"
                  value={value}
                  disabled={loading || !rsvpGoing}
                  title={rsvpGoing ? 'Record placement' : 'Only players marked Going can receive a placement'}
                  onChange={(eventValue) => {
                    const nextPlace = Number(eventValue.target.value);
                    if (!nextPlace) return;
                    setDrafts((current) => ({ ...current, [member.userid]: String(nextPlace) }));
                    onLog(member.userid, nextPlace, false);
                  }}
                >
                  <option value="" disabled>Place</option>
                  {availablePlaces.map((place) => (
                    <option key={place} value={place}>{place}{ordinal(place)}</option>
                  ))}
                </select>
                {existing?.placed != null && (
                  <button
                    type="button"
                    className="btn-ghost px-3 py-2 text-xs text-red-200 hover:border-red-300/45 hover:text-red-100"
                    disabled={loading}
                    onClick={() => {
                      setDrafts((current) => {
                        const next = { ...current };
                        delete next[member.userid];
                        return next;
                      });
                      onClearResult(member.userid);
                    }}
                  >
                    Clear placement
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {approvedMembers.length === 0 && (
          <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
            No active players in this season.
          </p>
        )}
      </div>
    </div>
  );
}

function ScoringFinalGamePanel({
  league,
  season,
  eventCount,
  playerCountOverride,
  loading,
  error,
  onSubmit,
}: {
  league: League;
  season?: LeagueSeason;
  eventCount: number;
  playerCountOverride?: number | null;
  loading: boolean;
  error?: string;
  onSubmit: (data: {
    showupbonuspoints: number;
    bestfinishcount: number;
    pointslookup: LeaguePointRule[];
    finalenabled: boolean;
    finalmultiplierlookup: LeagueFinalMultiplier[];
    finalchiprounding: number;
    finalstartingbigblind: number;
    expectedplayercount?: number;
  }) => void;
}) {
  const normalizedPlayerCount = Math.max(2, Math.min(500, Math.round(Number(playerCountOverride ?? season?.expectedplayercount ?? league.expectedplayercount ?? 36))));
  const isPendingPlayerCountChange = playerCountOverride != null;
  const normalizePointRows = (source: LeaguePointRule[]) => {
    const current = new Map(source.map((rule) => [rule.place, Number(rule.points || 0)]));
    const fallback = new Map(generateLeaguePoints(normalizedPlayerCount).map((rule) => [rule.place, Number(rule.points || 0)]));
    return [
      { place: 'DNF' as const, points: current.get('DNF') ?? 0 },
      ...Array.from({ length: normalizedPlayerCount }, (_, index) => {
        const place = index + 1;
        return { place, points: current.get(place) ?? fallback.get(place) ?? 0 };
      }),
    ];
  };
  const normalizeMultiplierRows = (source: LeagueFinalMultiplier[]) => {
    const current = new Map(source.map((rule) => [Number(rule.place), Number(rule.multiplier || 0)]));
    const fallback = new Map(defaultFinalMultipliers(normalizedPlayerCount).map((rule) => [rule.place, rule.multiplier]));
    return Array.from({ length: normalizedPlayerCount }, (_, index) => {
      const place = index + 1;
      return { place, multiplier: current.get(place) ?? fallback.get(place) ?? 0 };
    });
  };
  const [draft, setDraft] = useState<LeaguePointRule[]>(() => normalizePointRows(league.pointslookup));
  const [showupBonus, setShowupBonus] = useState(String(league.showupbonuspoints ?? 0));
  const [bestFinishCount, setBestFinishCount] = useState(String(season?.bestfinishcount ?? league.bestfinishcount ?? 7));
  const [finalEnabled, setFinalEnabled] = useState(Boolean(league.finalenabled));
  const [rounding, setRounding] = useState(String(league.finalchiprounding || 100));
  const [bigBlind, setBigBlind] = useState(String(league.finalstartingbigblind || 100));
  const [multipliers, setMultipliers] = useState<LeagueFinalMultiplier[]>(() => normalizeMultiplierRows(league.finalmultiplierlookup?.length ? league.finalmultiplierlookup : defaultFinalMultipliers(normalizedPlayerCount)));
  const [simulation, setSimulation] = useState<SeasonSimulation | null>(null);
  useEffect(() => {
    setDraft(isPendingPlayerCountChange ? generateLeaguePoints(normalizedPlayerCount) : normalizePointRows(league.pointslookup));
    setShowupBonus(String(league.showupbonuspoints ?? 0));
    setBestFinishCount(String(season?.bestfinishcount ?? league.bestfinishcount ?? 7));
    setFinalEnabled(Boolean(league.finalenabled));
    setRounding(String(league.finalchiprounding || 100));
    setBigBlind(String(league.finalstartingbigblind || 100));
    setMultipliers(normalizeMultiplierRows(isPendingPlayerCountChange ? defaultFinalMultipliers(normalizedPlayerCount) : (league.finalmultiplierlookup?.length ? league.finalmultiplierlookup : defaultFinalMultipliers(normalizedPlayerCount))));
    setSimulation(null);
  }, [isPendingPlayerCountChange, league.bestfinishcount, league.finalchiprounding, league.finalenabled, league.finalmultiplierlookup, league.finalstartingbigblind, league.pointslookup, league.showupbonuspoints, normalizedPlayerCount, playerCountOverride, season]);
  const rows = draft.filter((rule) => rule.place !== 'DNF').sort((a, b) => Number(a.place) - Number(b.place));
  const dnf = draft.find((rule) => rule.place === 'DNF') ?? { place: 'DNF' as const, points: 0 };
  const recommendedRows = generateLeaguePoints(normalizedPlayerCount).filter((rule) => rule.place !== 'DNF');
  const recommendedTotalPoints = recommendedRows.reduce((sum, rule) => sum + Number(rule.points || 0), 0);
  const recommendedTopEightPoints = recommendedRows.filter((rule) => Number(rule.place) <= 8).reduce((sum, rule) => sum + Number(rule.points || 0), 0);
  const recommendedTopThreePoints = recommendedRows.filter((rule) => Number(rule.place) <= 3).reduce((sum, rule) => sum + Number(rule.points || 0), 0);
  const updateRule = (place: number | 'DNF', pointsValue: string) => {
    const nextPoints = Math.max(0, Math.round(Number(pointsValue) || 0));
    setDraft((current) => current.map((rule) => {
      const matches = place === 'DNF'
        ? rule.place === 'DNF'
        : rule.place !== 'DNF' && Number(rule.place) === Number(place);
      return matches ? { ...rule, place, points: nextPoints } : rule;
    }));
  };
  const applyRecommendation = () => {
    setDraft(generateLeaguePoints(normalizedPlayerCount));
    setSimulation(null);
  };
  const runSimulation = () => {
    setSimulation(simulateSeasonFinale({
      playerCount: normalizedPlayerCount,
      eventCount,
      pointRules: draft,
      showupBonus: Math.max(0, Math.round(Number(showupBonus) || 0)),
      bestFinishCount: Math.max(1, Math.round(Number(bestFinishCount) || 1)),
      league: {
        ...league,
        finalenabled: finalEnabled,
        finalmultiplierlookup: multipliers,
        finalchiprounding: Math.max(1, Number(rounding) || 100),
        finalstartingbigblind: Math.max(1, Number(bigBlind) || 100),
      },
    }));
  };
  const updateMultiplier = (place: number, value: string) => {
    const multiplier = Math.max(0, Math.round(Number(value) || 0));
    setMultipliers((current) => current.some((rule) => rule.place === place)
      ? current.map((rule) => rule.place === place ? { ...rule, multiplier } : rule)
      : [...current, { place, multiplier }]);
    setSimulation(null);
  };
  const multiplierByPlace = new Map(multipliers.map((rule) => [rule.place, rule.multiplier]));
  const scoringGridColumns = finalEnabled
    ? 'grid-cols-[minmax(0,1fr)_5rem_5.5rem] sm:grid-cols-[minmax(0,1fr)_8rem_9rem]'
    : 'grid-cols-[minmax(0,1fr)_6rem] sm:grid-cols-[minmax(0,1fr)_10rem]';
  const submit = () => onSubmit({
    showupbonuspoints: Math.max(0, Math.round(Number(showupBonus) || 0)),
    bestfinishcount: Math.max(1, Math.round(Number(bestFinishCount) || 1)),
    pointslookup: [
      { place: 'DNF', points: Number(dnf.points || 0) },
      ...rows.map((rule) => ({ place: Number(rule.place), points: Number(rule.points || 0) })),
    ],
    finalenabled: finalEnabled,
    finalmultiplierlookup: multipliers,
    finalchiprounding: Math.max(1, Math.round(Number(rounding) || 100)),
    finalstartingbigblind: Math.max(1, Math.round(Number(bigBlind) || 100)),
    expectedplayercount: isPendingPlayerCountChange ? normalizedPlayerCount : undefined,
  });

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Season setup</p>
          <h3 className="mt-1 text-lg font-bold text-white">Scoring &amp; Final Game</h3>
        </div>
        <button type="button" className="btn-primary" disabled={loading} onClick={submit}>
          <Save size={15} />
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      {isPendingPlayerCountChange && (
        <p className="rounded-lg border border-pit-gold/30 bg-pit-gold/10 px-3 py-2 text-sm text-pit-gold">
          Review the {normalizedPlayerCount}-player scoring and final multipliers, then save this plan to update the season capacity.
        </p>
      )}
      {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-pit-muted">Top events scored</span>
            <input
              className="input mt-2 py-2"
              inputMode="numeric"
              value={bestFinishCount}
              onChange={(event) => { setBestFinishCount(event.target.value.replace(/\D/g, '')); setSimulation(null); }}
            />
          </label>
          <label className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-pit-muted">Show-up bonus</span>
            <input
              className="input mt-2 py-2 text-right"
              inputMode="numeric"
              value={showupBonus}
              onChange={(event) => { setShowupBonus(event.target.value.replace(/\D/g, '')); setSimulation(null); }}
            />
          </label>
      </div>
      <section className="rounded-lg border border-pit-gold/25 bg-pit-gold/5 p-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={finalEnabled}
            onChange={(event) => { setFinalEnabled(event.target.checked); setSimulation(null); }}
          />
          <span>
            <span className="block font-semibold text-white">Run a final game</span>
            <span className="mt-0.5 block text-xs text-pit-text">Use regular-season points to create final-game starting stacks.</span>
          </span>
        </label>
        {finalEnabled && (
          <div className="mt-3 grid gap-3 border-t border-pit-gold/20 pt-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Round chips to nearest</span>
            <input className="input" inputMode="numeric" value={rounding} onChange={(event) => { setRounding(event.target.value.replace(/\D/g, '')); setSimulation(null); }} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Starting big blind</span>
            <input className="input" inputMode="numeric" value={bigBlind} onChange={(event) => { setBigBlind(event.target.value.replace(/\D/g, '')); setSimulation(null); }} />
          </label>
          </div>
        )}
      </section>
        <div className="rounded-lg border border-teal-400/25 bg-teal-400/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-white">Recommended for {normalizedPlayerCount} players</p>
              <p className="mt-1 text-xs text-pit-text">
                {formatNumber(normalizedPlayerCount * 100)} points per event. Top 8: {formatNumber(recommendedTopEightPoints)} ({recommendedTotalPoints ? Math.round((recommendedTopEightPoints / recommendedTotalPoints) * 100) : 0}%). Top 3: {formatNumber(recommendedTopThreePoints)} ({recommendedTotalPoints ? Math.round((recommendedTopThreePoints / recommendedTotalPoints) * 100) : 0}%).
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={applyRecommendation}>Apply recommendation</button>
          </div>
        </div>
        <section className="overflow-hidden rounded-lg border border-pit-border bg-pit-bg/60">
          <div className={`grid ${scoringGridColumns} items-center gap-2 border-b border-pit-border bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pit-muted`}>
            <span>Placement</span>
            <span className="text-right">Event points</span>
            {finalEnabled && <span className="text-right">Final multiplier</span>}
          </div>
          <div className="divide-y divide-pit-border">
            {rows.map((rule) => {
              const place = Number(rule.place);
              return (
                <div key={rule.place} className={`grid ${scoringGridColumns} items-center gap-2 px-3 py-2`}>
                  <span className="font-semibold text-white">{place}{ordinal(place)}</span>
                  <input className="input py-2 text-right" inputMode="numeric" value={rule.points} onChange={(event) => updateRule(place, event.target.value)} />
                  {finalEnabled ? (
                    <label className="relative block">
                      <input className="input w-full py-2 pr-6 text-right" inputMode="numeric" value={multiplierByPlace.get(place) ?? 0} onChange={(event) => updateMultiplier(place, event.target.value)} />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-pit-muted">x</span>
                    </label>
                  ) : null}
                </div>
              );
            })}
            <div className={`grid ${scoringGridColumns} items-center gap-2 px-3 py-2`}>
              <span className="font-semibold text-white">DNF</span>
              <input className="input py-2 text-right" inputMode="numeric" value={dnf.points} onChange={(event) => updateRule('DNF', event.target.value)} />
              {finalEnabled && <span className="text-right text-sm text-pit-muted">-</span>}
            </div>
          </div>
        </section>
        {finalEnabled && <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-white">Simulate season</p>
              <p className="mt-1 text-xs text-pit-text">Randomized results preview how the final game could look. Nothing is saved.</p>
            </div>
            <button type="button" className="btn-ghost" onClick={runSimulation}>Run simulation</button>
          </div>
          {simulation && (
            <div className="mt-3 overflow-hidden rounded-md border border-pit-border">
              <div className="grid grid-cols-[42px_1fr_auto_auto] gap-2 border-b border-pit-border bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pit-muted">
                <span>Rank</span><span>Player</span><span>Points</span><span>Final</span>
              </div>
              {simulation.players.map((player) => (
                <div key={player.rank} className="grid grid-cols-[42px_1fr_auto_auto] items-center gap-2 border-b border-pit-border/70 px-3 py-2 text-sm last:border-b-0">
                  <span className="text-teal-300">#{player.rank}</span>
                  <span className="font-semibold text-white">{player.name}</span>
                  <span>{formatNumber(player.totalPoints)}</span>
                  <span className="font-semibold text-teal-300">{formatNumber(player.startingStack)}</span>
                </div>
              ))}
              <p className="border-t border-pit-border bg-black/20 px-3 py-2 text-xs text-pit-text">
                Final stack uses the current multiplier and chip-rounding settings.
              </p>
            </div>
          )}
        </div>}
    </section>
  );
}

function CreateLeagueModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; approvalneeded: boolean; expectedplayercount: number; leaguefee: number; pereventfee: number; showupbonuspoints: number; bestfinishcount: number; pointslookup: LeaguePointRule[]; eventcount: number; seasonname: string; eventsasgames: boolean }) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState('Season Championship League');
  const [seasonname, setSeasonname] = useState('Season 1');
  const [approvalneeded, setApprovalneeded] = useState(false);
  const [expectedplayercount, setExpectedplayercount] = useState('36');
  const [leaguefee, setLeaguefee] = useState('0');
  const [pereventfee, setPereventfee] = useState('0');
  const [showupbonuspoints, setShowupbonuspoints] = useState('300');
  const [bestfinishcount, setBestfinishcount] = useState('7');
  const [eventcount, setEventcount] = useState('10');
  const [eventsasgames, setEventsasgames] = useState(false);
  const [pointslookup, setPointslookup] = useState<LeaguePointRule[]>(() => generateLeaguePoints(36));
  const playerCount = Math.max(2, Number(expectedplayercount) || 36);
  const totalEventCount = Math.max(1, Math.min(100, Number(eventcount) || 1));
  const topEventsScored = Math.max(1, Math.min(100, Number(bestfinishcount) || 1));
  const eventsScoredTooHigh = topEventsScored > totalEventCount;
  const pointTotal = pointslookup.filter((rule) => rule.place !== 'DNF').reduce((sum, rule) => sum + rule.points, 0);

  return (
    <Modal
      title="Create League"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !name.trim() || !Number(expectedplayercount) || eventsScoredTooHigh}
            onClick={() => onSubmit({
              name,
              approvalneeded,
              expectedplayercount: playerCount,
              leaguefee: Number(leaguefee) || 0,
              pereventfee: Number(pereventfee) || 0,
              showupbonuspoints: Number(showupbonuspoints) || 0,
              bestfinishcount: topEventsScored,
              pointslookup,
              eventcount: totalEventCount,
              seasonname,
              eventsasgames,
            })}
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <input className="input" placeholder="League name" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="grid gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">First season</span>
            <input className="input" value={seasonname} onChange={(event) => setSeasonname(event.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Players</span>
            <input
              className="input"
              inputMode="numeric"
              value={expectedplayercount}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, '');
                setExpectedplayercount(next);
                setPointslookup(generateLeaguePoints(Math.max(2, Number(next) || 36)));
              }}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">League fee</span>
            <input className="input" inputMode="decimal" value={leaguefee} onChange={(event) => setLeaguefee(event.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Season event fee</span>
            <input className="input" inputMode="decimal" value={pereventfee} onChange={(event) => setPereventfee(event.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <p className="text-sm leading-6 text-pit-text">
          Placement point rules can be tuned before launch. This first step creates the league, invite code, and first season.
        </p>
        <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Total events</span>
              <input
                className="input"
                inputMode="numeric"
                value={eventcount}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '');
                  setEventcount(next);
                  const nextTotal = Math.max(1, Math.min(100, Number(next) || 1));
                  if (topEventsScored > nextTotal) setBestfinishcount(String(nextTotal));
                }}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Top events scored</span>
              <input
                className="input"
                inputMode="numeric"
                value={bestfinishcount}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '');
                  if (!next) {
                    setBestfinishcount('');
                    return;
                  }
                  setBestfinishcount(String(Math.min(totalEventCount, Math.max(1, Number(next) || 1))));
                }}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Show-up bonus</span>
              <input className="input" inputMode="numeric" value={showupbonuspoints} onChange={(event) => setShowupbonuspoints(event.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          {eventsScoredTooHigh && (
            <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              Top events scored cannot exceed total events.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Suggested point chart</p>
              <p className="mt-1 text-xs text-pit-muted">
                {formatNumber(pointTotal)} points per event from the league curve. 1st place is about {Math.round(FULL_FIELD_FIRST_PLACE_SHARE * 10000) / 100}% of the pool in a full 36-player field.
              </p>
            </div>
            <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setPointslookup(generateLeaguePoints(playerCount))}>
              Help me decide
            </button>
          </div>
          <p className="mt-3 text-xs font-mono text-pit-teal">
            {pointslookup.filter((rule) => rule.place !== 'DNF').slice(0, 8).map((rule) => `${rule.place}${ordinal(Number(rule.place))} ${rule.points}`).join(' / ')}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={approvalneeded} onChange={(event) => setApprovalneeded(event.target.checked)} />
          <span className="text-sm text-pit-text">Require approval to join</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pit-teal/25 bg-pit-teal/5 p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-pit-teal"
            checked={eventsasgames}
            onChange={(event) => setEventsasgames(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-white">Run season events as tournaments</span>
            <span className="mt-1 block text-xs leading-5 text-pit-text">
              Give every event the standard check-in, blind timer, seating, payment, knockout, and TV board flow.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

function JoinLeagueModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
  loading: boolean;
  error?: string;
}) {
  const [code, setCode] = useState('');
  useEffect(() => {
    if (!open) setCode('');
  }, [open]);
  return (
    <Modal
      title="Join with code"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={loading || !code.trim()} onClick={() => onSubmit(code)}>
            {loading ? 'Joining...' : 'Continue'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <>
          <input className="input font-mono uppercase tracking-widest" placeholder="Join code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 10))} />
          <p className="text-center text-xs text-pit-muted">Enter a group or league join code</p>
        </>
      </div>
    </Modal>
  );
}

function AdjustPaymentModal({
  open,
  detail,
  payment,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  detail: LeagueDetail;
  payment: LeaguePayment | null;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (paymentId: string, data: { userid: string; eventid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string }) => void;
}) {
  const members = useMemo(
    () => detail.members.filter((member) => member.approved && member.participating),
    [detail.members]
  );
  const [userid, setUserid] = useState('');
  const [paymenttype, setPaymenttype] = useState<LeaguePaymentType>('league');
  const [eventid, setEventid] = useState('');
  const [amount, setAmount] = useState('');
  const [paidat, setPaidat] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !payment) return;
    setUserid(payment.userid);
    setPaymenttype(normalizeLeaguePaymentType(payment.paymenttype));
    setEventid(payment.eventid ?? '');
    setAmount(feeInputValue(payment.amount));
    setPaidat(String(payment.paidat).slice(0, 10));
    setNote(payment.note ?? '');
  }, [open, payment]);

  const selectedMember = members.find((member) => member.userid === userid);
  const selectedEvent = detail.events.find((event) => event.eventid === eventid);
  const paymentId = payment?.paymentid ?? '';
  return (
    <Modal
      title="Adjust Payment"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !paymentId || !userid || !Number(amount)}
            onClick={() => onSubmit(paymentId, { userid, eventid: eventid || null, paymenttype, amount: Number(amount) || 0, paidat, note })}
          >
            {loading ? 'Saving...' : 'Save Adjustment'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Player</span>
          <select className="input" value={userid} onChange={(event) => setUserid(event.target.value)}>
            {members.map((member: LeagueMember) => <option key={member.userid} value={member.userid}>{member.displayname ?? 'Player'}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Type</span>
            <select
              className="input"
              value={paymenttype}
              onChange={(event) => setPaymenttype(event.target.value as LeaguePaymentType)}
            >
              <option value="league">League fee</option>
              <option value="event">Event fee</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Amount</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(cleanMoneyInput(event.target.value))} />
          </label>
        </div>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event</span>
          <select className="input" value={eventid} onChange={(event) => setEventid(event.target.value)}>
            <option value="">Season-level payment</option>
            {detail.events.map((event) => <option key={event.eventid} value={event.eventid}>{event.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-pit-muted">
            {selectedEvent ? `Linked to ${selectedEvent.name}.` : 'Leave blank for season-level league fees or other credits.'}
          </p>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" type="date" value={paidat} onChange={(event) => setPaidat(event.target.value)} />
          <input className="input" placeholder={`Note for ${selectedMember?.displayname ?? 'payment'}`} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function RecordPaymentModal({
  open,
  detail,
  targetUserId,
  loading,
  error,
  saveState,
  onClose,
  onSubmit,
}: {
  open: boolean;
  detail: LeagueDetail;
  targetUserId: string | null;
  loading: boolean;
  error?: string;
  saveState: { count: number; paymenttype: LeaguePaymentType };
  onClose: () => void;
  onSubmit: (data: { userid: string; eventid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string }) => void;
}) {
  const members = useMemo(
    () => detail.members.filter((member) => member.approved && member.participating),
    [detail.members]
  );
  const [userid, setUserid] = useState(members[0]?.userid ?? '');
  const [paymenttype, setPaymenttype] = useState<LeaguePaymentType>('league');
  const [eventid, setEventid] = useState('');
  const [amount, setAmount] = useState(String(detail.league.leaguefee || ''));
  const [paidat, setPaidat] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const wasOpenRef = useRef(false);
  const lastHandledSaveRef = useRef(saveState.count);
  const initialUserId = targetUserId && members.some((member) => member.userid === targetUserId)
    ? targetUserId
    : members[0]?.userid ?? '';
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setUserid(initialUserId);
    setPaymenttype('league');
    setEventid('');
    setAmount(String(detail.league.leaguefee || ''));
    setPaidat(new Date().toISOString().slice(0, 10));
    setNote('');
  }, [detail.league.leaguefee, initialUserId, open]);

  useEffect(() => {
    if (!open || saveState.count === lastHandledSaveRef.current) return;
    lastHandledSaveRef.current = saveState.count;
    setNote('');
    if (saveState.paymenttype === 'league') {
      setPaymenttype('event');
      setEventid('');
      setAmount(String(getSeasonEventFee(detail) || ''));
    }
  }, [detail, open, saveState]);

  const selectedMember = members.find((member) => member.userid === userid);
  const seasonEventFee = getSeasonEventFee(detail);
  return (
    <Modal
      title="Record Payment"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !userid || !Number(amount)}
            onClick={() => onSubmit({ userid, eventid: paymenttype === 'event' ? eventid || null : null, paymenttype, amount: Number(amount) || 0, paidat, note })}
          >
            {loading ? 'Saving...' : 'Save Payment'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Player</span>
          {targetUserId ? (
            <div className="input flex items-center bg-pit-bg/60 text-sm font-semibold text-white">
              {selectedMember?.displayname ?? 'Player'}
            </div>
          ) : (
            <select className="input" value={userid} onChange={(event) => setUserid(event.target.value)}>
              {members.map((member: LeagueMember) => <option key={member.userid} value={member.userid}>{member.displayname ?? 'Player'}</option>)}
            </select>
          )}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Type</span>
            <select
              className="input"
              value={paymenttype}
              onChange={(event) => {
                const next = event.target.value as LeaguePaymentType;
                setPaymenttype(next);
                if (next === 'event') {
                  setEventid('');
                  setAmount(String(seasonEventFee || ''));
                } else {
                  setAmount(String(next === 'league' ? detail.league.leaguefee || '' : ''));
                }
              }}
            >
              <option value="league">League fee</option>
              <option value="event">Event fee</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Amount</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        {paymenttype === 'event' && (
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event</span>
            <select
              className="input"
              value={eventid}
              onChange={(eventValue) => {
                const nextEventId = eventValue.target.value;
                setEventid(nextEventId);
                const nextEvent = detail.events.find((item) => item.eventid === nextEventId);
                if (nextEvent) setAmount(String(getLeagueEventFee(detail, nextEvent) || ''));
              }}
            >
              <option value="">Apply forward through season events</option>
              {detail.events.map((event) => <option key={event.eventid} value={event.eventid}>{event.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-pit-muted">
              Leave this on apply forward to mark the player's next unpaid events in order.
            </p>
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" type="date" value={paidat} onChange={(event) => setPaidat(event.target.value)} />
          <input className="input" placeholder={`Note for ${selectedMember?.displayname ?? 'payment'}`} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function CreateSeasonModal({
  open,
  onClose,
  onSubmit,
  nextSeasonNumber,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; eventcount?: number; eventsasgames?: boolean }) => void;
  nextSeasonNumber: number;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(`Season ${nextSeasonNumber}`);
  const [eventcount, setEventcount] = useState('10');
  const [eventsasgames, setEventsasgames] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(`Season ${nextSeasonNumber}`);
    setEventcount('10');
    setEventsasgames(false);
  }, [nextSeasonNumber, open]);

  return (
    <Modal
      title="Create Season"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !name.trim()}
            onClick={() => onSubmit({ name, eventcount: Math.max(0, Math.min(100, Number(eventcount) || 0)), eventsasgames })}
          >
            {loading ? 'Creating...' : 'Create Season'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Season name" />
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Total events</span>
          <input className="input" inputMode="numeric" value={eventcount} onChange={(event) => setEventcount(event.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pit-teal/25 bg-pit-teal/5 p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-pit-teal"
            checked={eventsasgames}
            onChange={(event) => setEventsasgames(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-white">Run season events as tournaments</span>
            <span className="mt-1 block text-xs leading-5 text-pit-text">
              Create live tournament runners for this season's events with check-in, blinds, seating, payments, knockouts, and TV display.
            </span>
          </span>
        </label>
        <p className="text-sm leading-6 text-pit-text">
          A season is its own roster, standings, events, and fee ledger. After creating it, add only the league members who are playing this season.
        </p>
      </div>
    </Modal>
  );
}

function LeagueSettingsModal({
  open,
  league,
  season,
  finalGameEnabled,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  league: League;
  season?: LeagueDetail['seasons'][number];
  finalGameEnabled: boolean;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: { leagueName: string; seasonId?: string | null; seasonName?: string; expectedplayercount?: number; memberledgervisible: boolean; eventsasgames?: boolean }) => void;
}) {
  const [leagueName, setLeagueName] = useState(league.name);
  const [seasonName, setSeasonName] = useState(season?.name ?? '');
  const [playerCount, setPlayerCount] = useState(String(season?.expectedplayercount ?? league.expectedplayercount ?? 36));
  const [memberLedgerVisible, setMemberLedgerVisible] = useState(Boolean(league.memberledgervisible));
  const [eventsasgames, setEventsasgames] = useState(Boolean(season?.eventsasgames));

  useEffect(() => {
    if (!open) return;
    setLeagueName(league.name);
    setSeasonName(season?.name ?? '');
    setPlayerCount(String(season?.expectedplayercount ?? league.expectedplayercount ?? 36));
    setMemberLedgerVisible(Boolean(league.memberledgervisible));
    setEventsasgames(Boolean(season?.eventsasgames));
  }, [league.expectedplayercount, league.memberledgervisible, league.name, open, season?.eventsasgames, season?.expectedplayercount, season?.name]);

  const canSave = leagueName.trim().length > 0 && (!season || seasonName.trim().length > 0);
  const requestedPlayerCount = season ? Math.max(2, Math.min(500, Math.round(Number(playerCount) || 2))) : null;
  const playerCountChanging = Boolean(season && requestedPlayerCount !== Number(season.expectedplayercount ?? league.expectedplayercount ?? 36));
  const needsFinalScoringReview = Boolean(finalGameEnabled && playerCountChanging);

  return (
    <Modal
      title="League & Season Settings"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !canSave}
            onClick={() => onSubmit({
              leagueName: leagueName.trim(),
              seasonId: season?.seasonid ?? null,
              seasonName: season ? seasonName.trim() : undefined,
              expectedplayercount: requestedPlayerCount ?? undefined,
              memberledgervisible: memberLedgerVisible,
              eventsasgames,
            })}
          >
            {loading ? 'Saving...' : needsFinalScoringReview ? 'Review Scoring' : 'Save Settings'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">League name</span>
          <input className="input" value={leagueName} onChange={(event) => setLeagueName(event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Selected season name</span>
          <input
            className="input"
            value={seasonName}
            onChange={(event) => setSeasonName(event.target.value)}
            disabled={!season}
            placeholder={season ? 'Season name' : 'No season selected'}
          />
        </label>
        {season && (
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Player capacity</span>
            <input
              className="input"
              inputMode="numeric"
              value={playerCount}
              onChange={(event) => setPlayerCount(event.target.value.replace(/\D/g, ''))}
            />
            <span className="block text-xs text-pit-muted">Used for this season's roster, scoring recommendation, and final-game simulation.</span>
            {needsFinalScoringReview && (
              <span className="block text-xs font-medium text-pit-gold">Review the scoring and final multipliers before saving this capacity change.</span>
            )}
          </label>
        )}
        <label className="flex items-start gap-3 rounded-xl border border-pit-border bg-pit-bg/55 p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-pit-teal"
            checked={memberLedgerVisible}
            onChange={(event) => setMemberLedgerVisible(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-white">Show league ledger to members</span>
            <span className="mt-1 block text-xs leading-5 text-pit-text">
              Admins always see the audit ledger. Turn this on only if regular league members should see league changes, payments, and placement updates.
            </span>
          </span>
        </label>
        {season && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pit-teal/25 bg-pit-teal/5 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-pit-teal"
              checked={eventsasgames}
              disabled={Boolean(season.eventsasgames)}
              onChange={(event) => setEventsasgames(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-white">Run season events as tournaments</span>
              <span className="mt-1 block text-xs leading-5 text-pit-text">
                {season.eventsasgames
                  ? 'Tournament runners are active for this season and remain attached to preserve event history.'
                  : "Create and connect tournament runners for this season's events. Existing events are linked when you save."}
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function CreateEventModal({
  open,
  onClose,
  onSubmit,
  nextEventNumber,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number; eventcount?: number }) => void;
  nextEventNumber: number;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(`Event #${nextEventNumber}`);
  const [eventdate, setEventdate] = useState('');
  const [eventtime, setEventtime] = useState('');
  const [eventnumber, setEventnumber] = useState(String(nextEventNumber));
  const [eventcount, setEventcount] = useState('1');
  const countValue = Math.max(1, Math.min(100, Number(eventcount) || 1));
  useEffect(() => {
    if (!open) return;
    setName(`Event #${nextEventNumber}`);
    setEventdate('');
    setEventtime('');
    setEventnumber(String(nextEventNumber));
    setEventcount('1');
  }, [nextEventNumber, open]);

  return (
    <Modal
      title="Add League Event"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || (countValue === 1 && !name.trim())}
            onClick={() => onSubmit({
              name,
              eventdate: countValue === 1 ? eventdate || null : null,
              eventtime: countValue === 1 ? eventtime || null : null,
              eventnumber: Number(eventnumber) || nextEventNumber,
              eventcount: countValue,
            })}
          >
            {loading ? 'Saving...' : countValue > 1 ? `Create ${countValue} events` : 'Save event'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">How many events?</span>
            <input className="input" inputMode="numeric" value={eventcount} onChange={(event) => setEventcount(event.target.value.replace(/\D/g, ''))} placeholder="1" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Starting event order</span>
            <input className="input" inputMode="numeric" value={eventnumber} onChange={(event) => setEventnumber(event.target.value.replace(/\D/g, ''))} placeholder="1" />
          </label>
        </div>
        {countValue === 1 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Event name" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event date</span>
              <input className="input" type="date" value={eventdate} onChange={(event) => setEventdate(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Start time</span>
              <input className="input" type="time" value={eventtime} onChange={(event) => setEventtime(event.target.value)} />
            </label>
          </div>
        ) : (
          <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
            This will create {countValue} blank events named Event #{Number(eventnumber) || nextEventNumber} through Event #{(Number(eventnumber) || nextEventNumber) + countValue - 1}.
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditEventModal({
  open,
  event,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  event: LeagueEvent | null;
  onClose: () => void;
  onSubmit: (data: { name: string; eventdate: string | null; eventtime: string | null; eventnumber: number | null }) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState('');
  const [eventdate, setEventdate] = useState('');
  const [eventtime, setEventtime] = useState('');
  const [eventnumber, setEventnumber] = useState('');

  useEffect(() => {
    if (!open || !event) return;
    setName(event.name);
    setEventdate(leagueEventDate(event));
    setEventtime(event.eventtime ? String(event.eventtime).slice(0, 5) : '');
    setEventnumber(event.eventnumber ? String(event.eventnumber) : '');
  }, [event, open]);

  return (
    <Modal
      title="Edit League Event"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !name.trim()}
            onClick={() => onSubmit({
              name,
              eventdate: eventdate || null,
              eventtime: eventtime || null,
              eventnumber: eventnumber.trim() ? Number(eventnumber) || null : null,
            })}
          >
            {loading ? 'Saving...' : 'Save event'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event name</span>
          <input className="input" value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event date</span>
            <input className="input" type="date" value={eventdate} onChange={(inputEvent) => setEventdate(inputEvent.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Start time</span>
            <input className="input" type="time" value={eventtime} onChange={(inputEvent) => setEventtime(inputEvent.target.value)} />
          </label>
        </div>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event order</span>
          <input className="input" inputMode="numeric" value={eventnumber} onChange={(inputEvent) => setEventnumber(inputEvent.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
    </Modal>
  );
}

function LeagueHeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-pit-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function MobileSeasonMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-h-[4.6rem] min-w-0 flex-col items-center justify-center rounded-lg border border-pit-border/80 bg-pit-bg/65 px-1 py-2 text-center">
      <span className="text-pit-teal" aria-hidden="true">{icon}</span>
      <span className="mt-1 min-h-6 text-[8px] font-semibold uppercase leading-3 tracking-[0.08em] text-pit-muted sm:text-[9px]">{label}</span>
      <span className="mt-0.5 truncate text-base font-black text-white sm:text-lg">{value}</span>
    </div>
  );
}

function ordinal(value?: number | null) {
  if (!value) return '';
  if ([11, 12, 13].includes(value % 100)) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
}

function defaultFinalMultipliers(playerCount = 36): LeagueFinalMultiplier[] {
  const length = Math.max(2, Math.min(500, Math.round(Number(playerCount) || 36)));
  return Array.from({ length }, (_, index) => ({
    place: index + 1,
    multiplier: Math.max(2, 20 - index),
  }));
}

function generateLeaguePoints(playerCount: number, totalPoints = playerCount * 100): LeaguePointRule[] {
  const players = Math.max(1, Math.min(500, Math.round(Number(playerCount || 36))));
  const total = Math.max(players, Math.round(Number(totalPoints || players * 100)));
  const weights: Array<{ place: number; value: number }> = [];
  let lastWeight = 1;
  for (const rule of BASE_POINTS_LOOKUP) {
    if (typeof rule.place !== 'number') continue;
    lastWeight = rule.points;
    if (rule.place <= players) weights.push({ place: rule.place, value: rule.points });
  }
  for (let place = weights.length + 1; place <= players; place += 1) {
    lastWeight = Math.max(1, lastWeight * 0.96);
    weights.push({ place, value: lastWeight });
  }
  const weightTotal = weights.reduce((sum, item) => sum + item.value, 0);
  const raw = weights.map((item) => ({
    place: item.place,
    value: (total * item.value) / weightTotal,
  }));
  const rounded = raw.map((item) => ({ ...item, points: Math.floor(item.value), remainder: item.value - Math.floor(item.value) }));
  let delta = total - rounded.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...rounded].sort((a, b) => b.remainder - a.remainder || a.place - b.place)) {
    if (delta <= 0) break;
    item.points += 1;
    delta -= 1;
  }
  return [{ place: 'DNF', points: 0 }, ...rounded.sort((a, b) => a.place - b.place).map(({ place, points }) => ({ place, points }))];
}

type SeasonSimulation = {
  players: Array<{
    rank: number;
    name: string;
    totalPoints: number;
    startingStack: number;
  }>;
};

function simulateSeasonFinale({
  playerCount,
  eventCount,
  pointRules,
  showupBonus,
  bestFinishCount,
  league,
}: {
  playerCount: number;
  eventCount: number;
  pointRules: LeaguePointRule[];
  showupBonus: number;
  bestFinishCount: number;
  league: League;
}): SeasonSimulation {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    name: `Player ${index + 1}`,
    finishes: [] as number[],
  }));
  const pointsByPlace = new Map(pointRules
    .filter((rule): rule is LeaguePointRule & { place: number } => typeof rule.place === 'number')
    .map((rule) => [rule.place, Math.max(0, Number(rule.points || 0))]));
  const playedEvents = Math.max(1, eventCount);

  for (let eventIndex = 0; eventIndex < playedEvents; eventIndex += 1) {
    const shuffled = [...players];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
    }
    shuffled.forEach((player, index) => player.finishes.push(pointsByPlace.get(index + 1) ?? 0));
  }

  const multiplierByPlace = new Map((league.finalmultiplierlookup?.length
    ? league.finalmultiplierlookup
    : defaultFinalMultipliers()).map((rule) => [rule.place, rule.multiplier]));
  const rounding = Math.max(1, Number(league.finalchiprounding || 100));
  const standings = players.map((player) => {
    const scoredPoints = [...player.finishes].sort((a, b) => b - a).slice(0, Math.max(1, bestFinishCount)).reduce((sum, points) => sum + points, 0);
    const totalPoints = scoredPoints + (playedEvents * showupBonus);
    return { ...player, scoredPoints, totalPoints };
  }).sort((a, b) => b.scoredPoints - a.scoredPoints || a.name.localeCompare(b.name));

  return {
    players: standings.slice(0, Math.min(8, standings.length)).map((player, index) => {
      const multiplier = Number(multiplierByPlace.get(index + 1) ?? 0);
      const rawStartingStack = (player.scoredPoints * multiplier) + (playedEvents * showupBonus);
      return {
        rank: index + 1,
        name: player.name,
        totalPoints: player.totalPoints,
        startingStack: Math.ceil(rawStartingStack / rounding) * rounding,
      };
    }),
  };
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    league_created: 'League created',
    season_created: 'Season created',
    season_deleted: 'Season deleted',
    season_fee_updated: 'Season fee updated',
    season_scoring_updated: 'Season scoring updated',
    season_updated: 'Season updated',
    event_created: 'Event created',
    events_created: 'Events created',
    event_updated: 'Event updated',
    member_joined: 'Member joined',
    member_join_requested: 'Join requested',
    guest_added: 'Guest added',
    guest_claim_invite_sent: 'Guest claim invite sent',
    guest_profile_claimed: 'Guest profile claimed',
    season_takeover_invite_sent: 'Takeover invite sent',
    season_spot_claimed: 'Season spot claimed',
    member_removed_from_season: 'Member removed',
    payment_added: 'Payment added',
    payment_updated: 'Payment adjusted',
    payment_deleted: 'Payment deleted',
    event_payment_marked_paid: 'Event payment marked paid',
    event_payments_marked_paid: 'Event payments marked paid',
    event_payments_applied: 'Event payments applied',
    event_rsvp_updated: 'Event RSVP updated',
    placement_logged: 'Placement logged',
    placement_updated: 'Placement updated',
    dnf_logged: 'DNF logged',
    dnf_updated: 'DNF updated',
    scoring_updated: 'Scoring updated',
    fee_settings_updated: 'Fee settings updated',
  };
  return labels[action] ?? action.replace(/_/g, ' ');
}

function formatAuditTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function auditObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function auditNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatAuditPlacement(value: unknown) {
  const item = auditObject(value);
  if (item.dnf) return `DNF (${formatNumber(auditNumber(item.points) + auditNumber(item.showupbonuspoints))} pts)`;
  const placed = item.placed == null ? null : Number(item.placed);
  const placement = placed ? `${placed}${ordinal(placed)} place` : 'No placement';
  return `${placement} (${formatNumber(auditNumber(item.points) + auditNumber(item.showupbonuspoints))} pts)`;
}

function formatAuditDetails(entry: LeagueAuditLog) {
  const details = auditObject(entry.details);
  if (entry.action === 'payment_added' || entry.action === 'payment_deleted') {
    const type = String(details.paymenttype ?? 'payment');
    const paidAt = details.paidat ? ` on ${String(details.paidat).slice(0, 10)}` : '';
    const note = details.note ? `, note: ${String(details.note)}` : '';
    return `${type} payment ${formatCurrency(auditNumber(details.amount))}${paidAt}${note}`;
  }
  if (entry.action === 'payment_updated') {
    const previous = auditObject(details.previous);
    const next = auditObject(details.next);
    const type = String(next.paymenttype ?? previous.paymenttype ?? 'payment');
    const previousAmount = formatCurrency(auditNumber(previous.amount));
    const nextAmount = formatCurrency(auditNumber(next.amount));
    const paidAt = next.paidat ? ` on ${String(next.paidat).slice(0, 10)}` : '';
    return `${type} payment adjusted from ${previousAmount} to ${nextAmount}${paidAt}.`;
  }
  if (entry.action === 'placement_logged' || entry.action === 'placement_updated' || entry.action === 'dnf_logged' || entry.action === 'dnf_updated') {
    const previous = details.previous ? `Previous: ${formatAuditPlacement(details.previous)}. ` : '';
    return `${previous}Current: ${formatAuditPlacement(details.current)}.`;
  }
  if (entry.action === 'scoring_updated') {
    return `${formatNumber(auditNumber(details.recalculatedResults))} logged finishes recalculated.`;
  }
  if (entry.action === 'fee_settings_updated') {
    const previous = auditObject(details.previous);
    const current = auditObject(details.current);
    return `League fee ${formatCurrency(auditNumber(previous.leaguefee))} -> ${formatCurrency(auditNumber(current.leaguefee))}; default event fee ${formatCurrency(auditNumber(previous.pereventfee))} -> ${formatCurrency(auditNumber(current.pereventfee))}.`;
  }
  if (entry.action === 'season_fee_updated') {
    const previous = auditObject(details.previous);
    const current = auditObject(details.current);
    return `Season event fee ${formatCurrency(auditNumber(previous.pereventfee))} -> ${formatCurrency(auditNumber(current.pereventfee))}.`;
  }
  if (entry.action === 'event_payment_marked_paid' || entry.action === 'event_payments_marked_paid') {
    return `${formatNumber(auditNumber(details.playersUpdated))} player event fees marked paid at ${formatCurrency(auditNumber(details.seasonEventFee))}.`;
  }
  if (entry.action === 'event_payments_applied') {
    return `${formatCurrency(auditNumber(details.amount))} applied across ${formatNumber(auditNumber(details.paymentsCreated))} event payment records.`;
  }
  if (entry.action === 'event_rsvp_updated') {
    return `RSVP set to ${details.status === 'not_going' ? "Can't go" : 'Going'}.`;
  }
  if (entry.action === 'guest_added') {
    return details.displayname ? `Guest name: ${String(details.displayname)}` : '';
  }
  if (entry.action === 'season_takeover_invite_sent') {
    return `Invited ${String(details.email ?? 'replacement player')} to take over ${String(details.playerName ?? 'this spot')}.`;
  }
  if (entry.action === 'season_spot_claimed') {
    return `${String(details.previousName ?? 'Previous player')} transferred ${formatNumber(auditNumber(details.resultsTransferred))} finishes, ${formatNumber(auditNumber(details.paymentsTransferred))} payments, and ${formatNumber(auditNumber(details.rsvpsTransferred))} RSVPs.`;
  }
  if (entry.action === 'member_removed_from_season') {
    return `${formatNumber(auditNumber(details.deletedResults))} finishes and ${formatNumber(auditNumber(details.deletedPayments))} payments removed from this season.`;
  }
  if (entry.action === 'league_created') {
    return `${formatNumber(auditNumber(details.eventCount))} starting events, ${formatNumber(auditNumber(details.expectedPlayerCount))} expected players.`;
  }
  if (entry.action === 'season_created') {
    return `${formatNumber(auditNumber(details.eventCount))} events created for this season.`;
  }
  if (entry.action === 'events_created') {
    return `${formatNumber(auditNumber(details.eventCount))} events created starting at #${formatNumber(auditNumber(details.startNumber))}.`;
  }
  if (entry.action === 'event_created') {
    return `${String(details.eventdate ?? 'Date TBD')}${details.eventtime ? ` at ${String(details.eventtime)}` : ''}.`;
  }
  if (entry.action === 'event_updated') {
    return 'Event name, date, time, or order changed.';
  }
  return '';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatBbs(value: number) {
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? formatNumber(value) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function bestPlacementValues(detail: LeagueDetail, userId: string) {
  return detail.results
    .filter((result) => result.userid === userId && !result.dnf && result.placed != null)
    .sort((a, b) =>
      Number(b.points || 0) - Number(a.points || 0)
      || Number(a.placed || 999) - Number(b.placed || 999)
    )
    .slice(0, Math.max(1, Number(detail.league.bestfinishcount || 7)))
    .map((result) => Number(result.placed));
}

function bestPlacementSummary(detail: LeagueDetail, userId: string) {
  const placements = bestPlacementValues(detail, userId);
  return placements.length ? placements.map((place) => `${place}${ordinal(place)}`).join(', ') : 'No finishes';
}

function formatPercentOfField(value: number, total: number) {
  if (!total) return '0% field';
  return `${((value / total) * 100).toFixed(1)}% field`;
}

function exportLeagueEventRsvps(event: LeagueEvent, rows: Array<{ name: string; status: string }>) {
  const csv = [
    ['Name', 'Status'],
    ...rows.map((row) => [row.name, row.status]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugifyFileName(event.name)}-rsvps.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function slugifyFileName(value: string) {
  return String(value || 'league-event')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'league-event';
}

function getSelectedLeagueSeason(detail: LeagueDetail) {
  return detail.seasons.find((season) => season.seasonid === detail.selectedseasonid) ?? detail.seasons[0] ?? null;
}

function getSeasonEventFee(detail: LeagueDetail) {
  const season = getSelectedLeagueSeason(detail);
  return Number(season?.pereventfee ?? detail.league.pereventfee ?? 0);
}

function getLeagueEventFee(detail: LeagueDetail, _event: LeagueEvent) {
  return getSeasonEventFee(detail);
}

function getLeagueEventResult(detail: LeagueDetail, event: LeagueEvent, userId: string) {
  return detail.results.find((result) => result.eventid === event.eventid && result.userid === userId) ?? null;
}

function getPlayerEventFeeDue(detail: LeagueDetail, event: LeagueEvent, userId: string) {
  const result = getLeagueEventResult(detail, event, userId);
  if (result?.dnf) return 0;
  const rsvp = getLeagueEventRsvp(detail, event, userId);
  if (rsvp?.status !== 'going') return 0;
  return getLeagueEventFee(detail, event);
}

function getPlayerFeeSummary(detail: LeagueDetail, userId: string) {
  const playerPayments = detail.payments.filter((payment) => payment.userid === userId);
  const leagueFeeDue = Math.max(0, Number(detail.league.leaguefee || 0));
  const estimatedEventFeesDue = detail.events.reduce(
    (sum, event) => sum + getPlayerEventFeeDue(detail, event, userId),
    0,
  );
  const leagueFeePaid = playerPayments
    .filter((payment) => payment.paymenttype === 'league')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const eventFeesPaid = playerPayments
    .filter((payment) => payment.paymenttype === 'event')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    leagueFeePaid,
    eventFeesPaid,
    totalPaid: leagueFeePaid + eventFeesPaid,
    leagueFeeRemaining: Math.max(0, leagueFeeDue - leagueFeePaid),
    eventFeeRemaining: Math.max(0, estimatedEventFeesDue - eventFeesPaid),
    totalRemaining: Math.max(0, leagueFeeDue - leagueFeePaid) + Math.max(0, estimatedEventFeesDue - eventFeesPaid),
  };
}

function feeInputValue(value: unknown) {
  const numeric = Number(value || 0);
  if (!numeric) return '';
  return String(Math.round(numeric * 100) / 100);
}

function cleanMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const decimals = rest.join('').slice(0, 2);
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '');
  return rest.length ? `${trimmedWhole || '0'}.${decimals}` : trimmedWhole;
}

function normalizeLeaguePaymentType(value: unknown): LeaguePaymentType {
  return value === 'event' || value === 'other' ? value : 'league';
}

function getEventPaymentStatus(detail: LeagueDetail, event: LeagueEvent, userId: string) {
  const due = getPlayerEventFeeDue(detail, event, userId);
  const amount = detail.payments
    .filter((payment) => payment.userid === userId && payment.paymenttype === 'event' && payment.eventid === event.eventid)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return {
    amount,
    due,
    paid: due > 0 && amount + 0.001 >= due,
  };
}

function getLeagueEventRsvp(detail: LeagueDetail, event: LeagueEvent, userId: string) {
  return detail.rsvps.find((rsvp) => rsvp.eventid === event.eventid && rsvp.userid === userId) ?? null;
}

function getLeagueFeeInstallmentStatus(detail: LeagueDetail, event: LeagueEvent, userId: string) {
  const totalFeeCents = Math.max(0, Math.round(Number(detail.league.leaguefee || 0) * 100));
  const orderedEvents = [...detail.events].sort((a, b) => {
    const eventNumberDifference = Number(a.eventnumber ?? Number.MAX_SAFE_INTEGER) - Number(b.eventnumber ?? Number.MAX_SAFE_INTEGER);
    if (eventNumberDifference) return eventNumberDifference;
    const dateDifference = String(a.eventdate ?? '').localeCompare(String(b.eventdate ?? ''));
    if (dateDifference) return dateDifference;
    const timeDifference = String(a.eventtime ?? '').localeCompare(String(b.eventtime ?? ''));
    if (timeDifference) return timeDifference;
    return String(a.createdat ?? '').localeCompare(String(b.createdat ?? ''));
  });
  const eventIndex = orderedEvents.findIndex((item) => item.eventid === event.eventid);
  const baseInstallmentCents = orderedEvents.length ? Math.floor(totalFeeCents / orderedEvents.length) : 0;
  const remainderCents = orderedEvents.length ? totalFeeCents % orderedEvents.length : 0;
  const installmentCents = eventIndex < 0 ? 0 : baseInstallmentCents + (eventIndex < remainderCents ? 1 : 0);
  const leaguePayments = detail.payments.filter((payment) => payment.userid === userId && payment.paymenttype === 'league');
  const paidCents = Math.round(leaguePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100);
  return {
    installment: installmentCents / 100,
    remaining: Math.max(0, totalFeeCents - paidCents) / 100,
    paidForEvent: leaguePayments.some((payment) => payment.eventid === event.eventid),
  };
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function leagueEventDate(event: LeagueEvent) {
  return event.eventdate ? String(event.eventdate).slice(0, 10) : '';
}

function formatLeagueEventTime(event: LeagueEvent) {
  const raw = event.eventtime ? String(event.eventtime).slice(0, 5) : '';
  const [hourValue, minute = '00'] = raw.split(':');
  const hour = Number(hourValue);
  if (!raw || Number.isNaN(hour)) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.padStart(2, '0')} ${suffix}`;
}

function formatLeagueEventDateTime(event: LeagueEvent) {
  const date = leagueEventDate(event);
  const time = formatLeagueEventTime(event);
  if (date && time) return `${date} at ${time}`;
  if (date) return date;
  if (time) return time;
  return 'Date/time TBD';
}

function isEventDueToDate(event: LeagueEvent, today: string) {
  const date = leagueEventDate(event);
  return Boolean(date && date <= today);
}

function isEventRemaining(event: LeagueEvent, today: string) {
  const date = leagueEventDate(event);
  return !date || date >= today;
}

function compareLeagueEvents(a: LeagueEvent, b: LeagueEvent) {
  const aDate = leagueEventDate(a) || '9999-12-31';
  const bDate = leagueEventDate(b) || '9999-12-31';
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aTime = a.eventtime ? String(a.eventtime).slice(0, 5) : '23:59';
  const bTime = b.eventtime ? String(b.eventtime).slice(0, 5) : '23:59';
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return Number(a.eventnumber ?? 9999) - Number(b.eventnumber ?? 9999);
}

function normalizeSeasonLabel(name?: string | null) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Current season';
  return /^season\b/i.test(trimmed) ? trimmed : `Season ${trimmed}`;
}

function formatSeasonDateRange(beginDate?: string | null, endDate?: string | null) {
  const formatDate = (value?: string | null) => {
    const raw = String(value ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    const [year, month, day] = raw.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
  };
  const begin = formatDate(beginDate);
  const end = formatDate(endDate);
  if (begin && end) return `${begin} - ${end}`;
  return begin || end || 'Season dates not set';
}

function playerInitial(name: string) {
  const normalized = name.trim();
  return (normalized.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}
