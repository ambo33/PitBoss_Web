import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, CalendarDays, CheckCircle2, Copy, Crown, Download, DollarSign, Hash, ListOrdered, Mail, MoreVertical, Pencil, Plus, Save, ScrollText, Settings, Trash2, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, League, LeagueAuditLog, LeagueDetail, LeagueEvent, LeagueEventRsvp, LeagueFinalMultiplier, LeagueFinalStack, LeagueMember, LeaguePaymentType, LeaguePointRule } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
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
type LeagueDetailTab = 'overview' | 'events' | 'fees' | 'audit' | 'players';

export default function LeaguesPanel({
  initialLeagueId,
  onDetailStateChange,
}: {
  initialLeagueId?: string;
  onDetailStateChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<Pick<League, 'leagueid'> | null>(initialLeagueId ? { leagueid: initialLeagueId } : null);
  const { data: leagues = [], isLoading } = useQuery({ queryKey: ['leagues'], queryFn: api.getLeagues });

  const createMutation = useMutation({
    mutationFn: api.createLeague,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setSelected({ leagueid: created.leagueid });
      setShowCreate(false);
    },
  });
  const joinMutation = useMutation({
    mutationFn: (code: string) => api.joinLeague(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setShowJoin(false);
    },
  });

  useEffect(() => {
    onDetailStateChange?.(Boolean(selected));
    return () => onDetailStateChange?.(false);
  }, [onDetailStateChange, selected]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  if (selected) {
    return <LeagueDetailView league={selected} onBack={() => setSelected(null)} />;
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
        <LeagueList leagues={leagues} onSelect={setSelected} />
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
        onSubmit={(code) => joinMutation.mutate(code)}
        loading={joinMutation.isPending}
        error={joinMutation.error?.message}
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

function LeagueDetailView({ league, onBack }: { league: Pick<League, 'leagueid'>; onBack: () => void }) {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.guid ?? null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [finalModalOpen, setFinalModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSeasonConfirmOpen, setDeleteSeasonConfirmOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<LeagueMember | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<LeagueEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<LeagueEvent | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedRankUserId, setSelectedRankUserId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<LeagueDetailTab>('overview');
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [standingsNotifyEventIds, setStandingsNotifyEventIds] = useState<string[]>([]);
  const manageMenuRef = useRef<HTMLDivElement | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['league', league.leagueid, selectedSeasonId],
    queryFn: () => api.getLeague(league.leagueid, selectedSeasonId),
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: { name: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number; eventcount?: number }) => api.createLeagueEvent(league.leagueid, { ...payload, seasonid: data?.selectedseasonid ?? selectedSeasonId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEventModalOpen(false);
    },
  });
  const createSeasonMutation = useMutation({
    mutationFn: (payload: { name: string; begindate: string; enddate: string; eventcount?: number; pereventfee?: number }) => api.createLeagueSeason(league.leagueid, payload),
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
    onSuccess: (_result, variables) => {
      setStandingsNotifyEventIds((current) => current.includes(variables.eventId) ? current : [...current, variables.eventId]);
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
    },
  });
  const notifyStandingsMutation = useMutation({
    mutationFn: (eventId: string) => {
      const seasonId = data?.selectedseasonid ?? selectedSeasonId;
      if (!seasonId) throw new Error('Choose a season first.');
      return api.notifyLeagueStandings(league.leagueid, seasonId).then((result) => ({ ...result, eventId }));
    },
    onSuccess: (result) => {
      setStandingsNotifyEventIds((current) => current.filter((eventId) => eventId !== result.eventId));
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
          begindate: selectedSeason ? String(selectedSeason.begindate).slice(0, 10) : undefined,
          enddate: selectedSeason ? String(selectedSeason.enddate).slice(0, 10) : undefined,
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
  const updateLeagueMutation = useMutation({
    mutationFn: (payload: Partial<Pick<League, 'leaguefee' | 'pereventfee' | 'showupbonuspoints' | 'pointslookup' | 'finalenabled' | 'finalmultiplierlookup' | 'finalchiprounding' | 'finalstartingbigblind' | 'memberledgervisible'>>) =>
      api.updateLeague(league.leagueid, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
        qc.invalidateQueries({ queryKey: ['leagues'] }),
      ]);
      await qc.refetchQueries({ queryKey: ['league', league.leagueid], type: 'active' });
      setPointsModalOpen(false);
      setFinalModalOpen(false);
    },
  });
  const updateNamesMutation = useMutation({
    mutationFn: async (payload: { leagueName: string; seasonId?: string | null; seasonName?: string; memberledgervisible: boolean }) => {
      await api.updateLeague(league.leagueid, { name: payload.leagueName, memberledgervisible: payload.memberledgervisible });
      if (payload.seasonId && payload.seasonName) {
        await api.updateLeagueSeason(league.leagueid, payload.seasonId, { name: payload.seasonName });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      setPaymentModalOpen(false);
    },
  });
  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => api.deleteLeaguePayment(league.leagueid, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const markEventPaidMutation = useMutation({
    mutationFn: ({ eventId, userId, all }: { eventId: string; userId?: string; all?: boolean }) =>
      api.markLeagueEventPaid(league.leagueid, eventId, { userId, all }),
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
  const eventResults = useMemo(() => {
    if (!detail || !currentEvent) return [];
    return detail.results.filter((result) => result.eventid === currentEvent.eventid);
  }, [currentEvent, detail]);

  if (isLoading || !detail) return <LoadingSpinner className="mt-16" />;
  const activeMembers = detail.members.filter((member) => member.approved && member.participating);
  const selectedSeason = detail.seasons.find((season) => season.seasonid === detail.selectedseasonid);

  if (!detail.league.isadmin) {
    return (
      <MemberLeagueView
        detail={detail}
        currentUserId={currentUserId}
        selectedUserId={selectedRankUserId}
        selectedSeason={selectedSeason}
        onBack={onBack}
        onSelectUser={setSelectedRankUserId}
        onSeasonChange={(seasonId) => {
          setSelectedSeasonId(seasonId);
          setSelectedEvent(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 md:flex md:items-start md:justify-between md:gap-3 md:space-y-0">
        <button className="inline-flex h-10 w-full items-center justify-start gap-1.5 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 via-[#122E30] to-pit-teal/10 px-3 py-2 text-xs font-semibold text-pit-teal shadow-[0_0_18px_rgba(20,184,166,0.12)] transition hover:border-pit-teal/60 hover:text-white md:w-auto md:shrink-0" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Back to Leagues
        </button>
        <div className="grid min-w-0 grid-cols-2 gap-2 md:ml-auto md:flex md:flex-wrap md:items-center md:justify-end">
          <span className="chip h-10 justify-center font-mono">{detail.league.invitecode}</span>
          <select
            className="input h-10 min-w-0 py-2 text-xs md:w-44"
            value={detail.selectedseasonid}
            onChange={(event) => {
              setSelectedSeasonId(event.target.value);
              setSelectedEvent(null);
            }}
          >
            {detail.seasons.map((season) => (
              <option key={season.seasonid} value={season.seasonid}>
                {season.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost h-10 justify-center gap-2 px-3 py-2 text-xs" onClick={() => setSeasonModalOpen(true)}>
            <CalendarDays size={14} />
            +Season
          </button>
          <button
            className="btn-primary h-10 justify-center gap-2 px-3 py-2 text-xs"
            onClick={() => {
              setActiveDetailTab('events');
              setEventModalOpen(true);
            }}
          >
            <Plus size={14} />
            Event
          </button>
          <div ref={manageMenuRef} className="relative col-span-2 md:col-span-1">
            <button
              type="button"
              className="btn-ghost h-10 w-full cursor-pointer justify-center gap-2 px-3 py-2 text-xs md:w-auto"
              aria-expanded={manageMenuOpen}
              aria-haspopup="menu"
              onClick={() => setManageMenuOpen((open) => !open)}
            >
              <MoreVertical size={14} />
              Manage
            </button>
            {manageMenuOpen && (
              <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-pit-border bg-pit-surface p-1 shadow-2xl md:left-auto md:w-48" role="menu">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setSettingsModalOpen(true);
                  }}
                >
                  <Pencil size={14} />
                  Settings
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
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setPointsModalOpen(true);
                  }}
                >
                  <Settings size={14} />
                  Points
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setFinalModalOpen(true);
                  }}
                >
                  <Trophy size={14} />
                  Final
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                  onClick={() => {
                    setManageMenuOpen(false);
                    setActiveDetailTab('fees');
                    setPaymentModalOpen(true);
                  }}
                >
                  <DollarSign size={14} />
                  Payment
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

      <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-4 sm:p-5">
          <p className="eyebrow">League standings</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-white sm:text-3xl">{detail.league.name}</h2>
          {selectedSeason && (
            <p className="mt-2 text-sm text-pit-text">
              <strong className="font-semibold text-white">{selectedSeason.name}</strong> runs{' '}
              <strong className="font-semibold text-white">{String(selectedSeason.begindate).slice(0, 10)}</strong> through{' '}
              <strong className="font-semibold text-white">{String(selectedSeason.enddate).slice(0, 10)}</strong>.
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LeagueHeroStat label="Players" value={`${activeMembers.length}/${detail.league.expectedplayercount}`} />
            <LeagueHeroStat label="Events" value={detail.events.length} />
            <LeagueHeroStat label="Best finishes" value={detail.league.bestfinishcount} />
            <LeagueHeroStat label="Show-up bonus" value={detail.league.showupbonuspoints} />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-pit-border bg-pit-bg/45 px-4 py-3">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'events', label: 'Events' },
            { id: 'fees', label: 'Fee Tracker' },
            { id: 'audit', label: 'Audit Trail' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                activeDetailTab === tab.id
                  ? 'border-pit-teal bg-pit-teal/15 text-white'
                  : 'border-pit-border bg-pit-card/60 text-pit-text hover:border-pit-teal/50 hover:text-white'
              }`}
              onClick={() => setActiveDetailTab(tab.id as LeagueDetailTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeDetailTab === 'overview' && (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <StandingsTable detail={detail} selectedUserId={selectedRankUserId} onSelectUser={setSelectedRankUserId} />
            <div className="lg:sticky lg:top-4 lg:self-start">
              <PlayerLeagueProfile detail={detail} userId={selectedRankUserId} floating />
            </div>
          </div>
        )}
      </section>

      {activeDetailTab === 'fees' && (
        <PaymentTracker
          detail={detail}
          onSettings={(payload) => updatePaymentSettingsMutation.mutate(payload)}
          onDeletePayment={(paymentId) => deletePaymentMutation.mutate(paymentId)}
          settingsLoading={updatePaymentSettingsMutation.isPending}
          settingsError={updatePaymentSettingsMutation.error?.message}
          deleteLoading={deletePaymentMutation.isPending}
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
                onBack={() => setSelectedEvent(null)}
                onLog={(userId, placed, dnf) => resultMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId, placed, dnf })}
                onNotifyStandings={() => notifyStandingsMutation.mutate(selectedEventFromDetail.eventid)}
                onMarkAllPaid={() => markEventPaidMutation.mutate({ eventId: selectedEventFromDetail.eventid, all: true })}
                onTogglePaid={(userId, paid) => toggleEventPaidMutation.mutate({ eventId: selectedEventFromDetail.eventid, userId, paid })}
                standingsNotificationPending={standingsNotifyEventIds.includes(selectedEventFromDetail.eventid)}
                notifyLoading={notifyStandingsMutation.isPending && notifyStandingsMutation.variables === selectedEventFromDetail.eventid}
                loading={resultMutation.isPending || markEventPaidMutation.isPending || toggleEventPaidMutation.isPending}
                error={resultMutation.error?.message ?? notifyStandingsMutation.error?.message ?? markEventPaidMutation.error?.message ?? toggleEventPaidMutation.error?.message}
              />
            ) : (
              <LeagueEventListCard
                events={detail.events}
                currentEventId={currentEvent?.eventid ?? null}
                onSelect={setSelectedEvent}
                onEdit={setEditingEvent}
              />
            )}
          </div>
          <div className="hidden gap-5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <LeagueEventListCard
              events={detail.events}
              currentEventId={currentEvent?.eventid ?? null}
              onSelect={setSelectedEvent}
              onEdit={setEditingEvent}
            />
            <EventTrackerCard
              detail={detail}
              event={currentEvent}
              leagueId={league.leagueid}
              resultsCount={eventResults.length}
              onLog={(userId, placed, dnf) => currentEvent && resultMutation.mutate({ eventId: currentEvent.eventid, userId, placed, dnf })}
              onNotifyStandings={() => currentEvent && notifyStandingsMutation.mutate(currentEvent.eventid)}
              onMarkAllPaid={() => currentEvent && markEventPaidMutation.mutate({ eventId: currentEvent.eventid, all: true })}
              onTogglePaid={(userId, paid) => currentEvent && toggleEventPaidMutation.mutate({ eventId: currentEvent.eventid, userId, paid })}
              standingsNotificationPending={Boolean(currentEvent && standingsNotifyEventIds.includes(currentEvent.eventid))}
              notifyLoading={Boolean(currentEvent && notifyStandingsMutation.isPending && notifyStandingsMutation.variables === currentEvent.eventid)}
              loading={resultMutation.isPending || markEventPaidMutation.isPending || toggleEventPaidMutation.isPending}
              error={resultMutation.error?.message ?? notifyStandingsMutation.error?.message ?? markEventPaidMutation.error?.message ?? toggleEventPaidMutation.error?.message}
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
        loading={updateNamesMutation.isPending}
        error={updateNamesMutation.error?.message}
        onClose={() => setSettingsModalOpen(false)}
        onSubmit={(payload) => updateNamesMutation.mutate(payload)}
      />
      <PointsEditorModal
        open={pointsModalOpen}
        league={detail.league}
        loading={updateLeagueMutation.isPending}
        error={updateLeagueMutation.error?.message}
        onClose={() => setPointsModalOpen(false)}
        onSubmit={(payload) => updateLeagueMutation.mutate(payload)}
      />
      <FinalSettingsModal
        open={finalModalOpen}
        league={detail.league}
        loading={updateLeagueMutation.isPending}
        error={updateLeagueMutation.error?.message}
        onClose={() => setFinalModalOpen(false)}
        onSubmit={(payload) => updateLeagueMutation.mutate(payload)}
      />
      <RecordPaymentModal
        open={paymentModalOpen}
        detail={detail}
        loading={createPaymentMutation.isPending}
        error={createPaymentMutation.error?.message}
        onClose={() => setPaymentModalOpen(false)}
        onSubmit={(payload) => createPaymentMutation.mutate(payload)}
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
}: {
  events: LeagueEvent[];
  currentEventId: string | null;
  onSelect: (event: LeagueEvent) => void;
  onEdit: (event: LeagueEvent) => void;
}) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Events</h3>
        <CalendarDays size={16} className="text-pit-teal" />
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
  onBack,
  onLog,
  onNotifyStandings,
  onMarkAllPaid,
  onTogglePaid,
  standingsNotificationPending,
  notifyLoading,
  loading,
  error,
}: {
  detail: LeagueDetail;
  event: LeagueEvent | null;
  leagueId: string;
  resultsCount: number;
  onBack?: () => void;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  onNotifyStandings: () => void;
  onMarkAllPaid: () => void;
  onTogglePaid: (userId: string, paid: boolean) => void;
  standingsNotificationPending: boolean;
  notifyLoading: boolean;
  loading: boolean;
  error?: string;
}) {
  return (
    <section className="card space-y-4">
      {onBack && (
        <button className="btn-ghost w-fit px-3 py-2 text-xs" type="button" onClick={onBack}>
          Back to events
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Finish logger</p>
          <h3 className="text-xl font-bold text-white">{event ? event.name : 'No event selected'}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {event && standingsNotificationPending && (
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={notifyLoading}
              onClick={onNotifyStandings}
            >
              <Bell size={13} />
              {notifyLoading ? 'Notifying...' : 'Notify league'}
            </button>
          )}
          {event && (
            <a className="chip hover:border-pit-teal/50 hover:text-white" href={`/league/${leagueId}/event/${event.eventid}`}>
              <Copy size={13} />
              Player lobby
            </a>
          )}
          <span className="chip">{resultsCount} finishes</span>
        </div>
      </div>
      {event ? (
        <>
          <LeagueEventRsvpPanel detail={detail} event={event} />
          <EventRosterLogger
            detail={detail}
            event={event}
            onLog={onLog}
            onMarkAllPaid={onMarkAllPaid}
            onTogglePaid={onTogglePaid}
            loading={loading}
            error={error}
          />
        </>
      ) : (
        <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
          Add an event to start logging finishes.
        </p>
      )}
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
    email: rsvp.emailaddress ?? '',
    status: rsvp.status === 'going' ? 'Going' : "Can't go",
    updated: rsvp.updatedat,
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
              {rsvp.emailaddress && <span className="hidden shrink-0 text-pit-muted sm:block">{rsvp.emailaddress}</span>}
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
  const totalShowupBonus = projectedFinalStacks.reduce((sum, stack) => sum + Number(stack.showupbonus || 0), 0);
  const projectedPlayers = projectedFinalStacks.length;
  const averageStack = projectedPlayers ? Math.round(totalStartingStack / projectedPlayers) : 0;
  const finalBigBlind = Math.max(1, Math.round(Number(detail.league.finalstartingbigblind || 100)));
  const averageBbs = averageStack / finalBigBlind;
  const rowClassName = finalEnabled
    ? 'block w-full border-b border-pit-border/50 px-3 py-3 text-left text-sm transition-colors last:border-0 md:grid md:grid-cols-[56px_minmax(0,1fr)_80px_112px_64px_70px_70px] md:gap-2'
    : 'block w-full border-b border-pit-border/50 px-3 py-3 text-left text-sm transition-colors last:border-0 md:grid md:grid-cols-[56px_minmax(0,1fr)_80px_80px_80px] md:gap-2';
  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
      {finalEnabled && (
        <div className="border-b border-pit-border bg-pit-card/45 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Final game outlook</p>
              <p className="mt-1 text-xs text-pit-muted">Calculated live from current standings.</p>
            </div>
            <Trophy size={16} className="shrink-0 text-pit-gold" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-2">
              <p className="text-pit-muted">Final chips</p>
              <p className="mt-1 font-bold text-white">{formatNumber(totalStartingStack)}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-2">
              <p className="text-pit-muted">Show-up bonus</p>
              <p className="mt-1 font-bold text-pit-teal">{formatNumber(totalShowupBonus)}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-2">
              <p className="text-pit-muted">Players</p>
              <p className="mt-1 font-bold text-white">{formatNumber(projectedPlayers)}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-2">
              <p className="text-pit-muted">Avg stack</p>
              <p className="mt-1 font-bold text-white">{formatNumber(averageStack)}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-2">
              <p className="text-pit-muted">Avg BBs</p>
              <p className="mt-1 font-bold text-white">{formatBbs(averageBbs)}</p>
            </div>
          </div>
        </div>
      )}
      <div className={`hidden gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted md:grid ${
        finalEnabled ? 'grid-cols-[56px_minmax(0,1fr)_80px_112px_64px_70px_70px]' : 'grid-cols-[56px_minmax(0,1fr)_80px_80px_80px]'
      }`}>
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Points</span>
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
                <p className="mt-1 text-xs text-pit-muted">Best: {bestPlacementSummary(detail, standing.userid)}</p>
                {finalEnabled && finalStack && (
                  <p className="mt-1 text-xs text-pit-teal md:hidden">
                    Final {formatNumber(Number(finalStack.startingstack || 0))} - {formatBbs(Number(finalStack.bbstostart || 0))} BBs ({formatPercentOfField(Number(finalStack.startingstack || 0), totalStartingStack)})
                  </p>
                )}
              </div>
              <span className="shrink-0 text-right font-bold text-white md:hidden">{formatNumber(Number(standing.scoredpoints || 0))}</span>
            </div>
            <span className="hidden text-right font-bold text-white md:block">{formatNumber(Number(standing.scoredpoints || 0))}</span>
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
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:contents md:text-sm">
              <span className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-1.5 text-pit-text md:border-0 md:bg-transparent md:p-0 md:text-right">
                <span className="text-pit-muted md:hidden">Played </span>{standing.eventsplayed}
              </span>
              <span className="rounded-lg border border-pit-border/60 bg-pit-card/50 px-2 py-1.5 text-pit-text md:border-0 md:bg-transparent md:p-0 md:text-right">
                <span className="text-pit-muted md:hidden">Avg </span>{standing.averagefinish ? standing.averagefinish.toFixed(1) : '-'}
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

  const seasonEventFees = detail.events.reduce((sum, event) => sum + getPlayerEventFeeDue(detail, event, userId), 0);
  const totalDue = Number(detail.league.leaguefee || 0) + seasonEventFees;
  const totalPaid = detail.payments
    .filter((payment) => payment.userid === userId)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return (
    <div className={shellClass}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Player ledger</p>
          <h3 className="truncate text-lg font-bold text-white">{member.displayname ?? 'Player'}</h3>
        </div>
        <span className="chip shrink-0">{formatNumber(Number(standing.totalpoints || 0))} pts</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-pit-border bg-pit-card/60 p-2">
          <p className="text-pit-muted">Played</p>
          <p className="mt-1 font-bold text-white">{standing.eventsplayed}</p>
        </div>
        <div className="rounded-lg border border-pit-border bg-pit-card/60 p-2">
          <p className="text-pit-muted">Paid</p>
          <p className="mt-1 font-bold text-pit-teal">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-pit-border bg-pit-card/60 p-2">
          <p className="text-pit-muted">Open</p>
          <p className="mt-1 font-bold text-pit-gold">{formatCurrency(Math.max(0, totalDue - totalPaid))}</p>
        </div>
      </div>
      <div className={`${floating ? 'max-h-[calc(100vh-15rem)]' : 'max-h-[34rem]'} space-y-2 overflow-y-auto pr-1`}>
        {detail.events.map((event) => {
          const result = detail.results.find((item) => item.eventid === event.eventid && item.userid === userId);
          const points = result ? Number(result.points || 0) + Number(result.showupbonuspoints || 0) : 0;
          const paid = detail.payments
            .filter((payment) => payment.userid === userId && payment.eventid === event.eventid)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const eventFee = getPlayerEventFeeDue(detail, event, userId);
          return (
            <div key={event.eventid} className="rounded-lg border border-pit-border bg-pit-card/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-white">{event.name}</p>
                <span className="font-mono text-pit-teal">{formatNumber(points)} pts</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-pit-text">
                <span>{result ? (result.dnf ? 'DNF' : `${result.placed}${ordinal(result.placed)} place`) : 'No finish'}</span>
                <span className="text-right">{formatCurrency(paid)} / {formatCurrency(eventFee)}</span>
              </div>
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
  onBack,
  onSelectUser,
  onSeasonChange,
}: {
  detail: LeagueDetail;
  currentUserId: string | null;
  selectedUserId: string | null;
  selectedSeason?: LeagueDetail['seasons'][number];
  onBack: () => void;
  onSelectUser: (userId: string) => void;
  onSeasonChange: (seasonId: string) => void;
}) {
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
  const dueEvents = detail.events.filter((event) => {
    const result = resultByEvent.get(event.eventid);
    return result ? !result.dnf : isEventDueToDate(event, today);
  });
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
  const dueEventFees = viewedUserId ? dueEvents.reduce((sum, event) => sum + getPlayerEventFeeDue(detail, event, viewedUserId), 0) : 0;
  const totalDueToDate = Number(detail.league.leaguefee || 0) + dueEventFees;
  const totalPaid = viewedUserId
    ? detail.payments.filter((payment) => payment.userid === viewedUserId).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : 0;
  const openBalance = Math.max(0, totalDueToDate - totalPaid);
  const canViewLeagueLedger = Boolean(detail.league.memberledgervisible);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 via-[#122E30] to-pit-teal/10 px-3 py-2 text-xs font-semibold text-pit-teal shadow-[0_0_18px_rgba(20,184,166,0.12)] transition hover:border-pit-teal/60 hover:text-white" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Back to Leagues
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
                label={isViewingSelf ? 'Balance due' : 'Placement points'}
                value={isViewingSelf ? formatCurrency(openBalance) : formatNumber(placementPoints)}
                accent={isViewingSelf ? (openBalance > 0 ? 'gold' : 'teal') : 'teal'}
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
                    <MemberMoneyStat label="Paid" value={formatCurrency(totalPaid)} accent="teal" />
                    <MemberMoneyStat label="Balance due" value={formatCurrency(openBalance)} accent={openBalance > 0 ? 'gold' : 'teal'} />
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
                <h4 className="font-semibold text-white">{isViewingSelf ? 'My event finishes' : `${member?.displayname ?? 'Player'} finishes`}</h4>
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
                  onClick={() => onSelectUser(item.userid)}
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

      {canViewLeagueLedger && <LeagueAuditTrail detail={detail} compact />}
    </div>
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
    .filter((member) => member.approved && !member.participating)
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
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Season roster</p>
          <h3 className="text-xl font-bold text-white">Player Management</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{approvedMembers.length}/{detail.league.expectedplayercount} active</span>
          {pendingCount > 0 && <span className="chip">{pendingCount} pending</span>}
        </div>
      </div>

      {detail.league.isadmin && (
        <div className="grid gap-3 rounded-xl border border-pit-border bg-pit-bg/55 p-3 xl:grid-cols-2">
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
          <div className="xl:col-span-2">
            {error ? (
              <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>
            ) : (
              <p className="text-sm leading-6 text-pit-muted">
                Each season has its own roster. Add league members here only when they are playing this selected season.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-pit-border bg-pit-bg/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">League admins</p>
            <p className="text-sm text-pit-muted">People who can manage this league.</p>
          </div>
          <span className="chip">{leagueAdmins.length} admins</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
      </div>

      <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {approvedMembers.map((member) => (
          <div key={member.userid} className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-pit-muted">
                  <Mail size={11} className="shrink-0 text-pit-teal" />
                  {member.isguestuser
                    ? member.pendinginviteemail
                      ? `Invite pending: ${member.pendinginviteemail}`
                      : 'Guest player'
                    : member.emailaddress ?? 'No email on file'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {member.isadmin && (
                  <span className="badge border border-pit-gold/20 bg-pit-gold/10 text-pit-gold">
                    <Crown size={9} className="mr-0.5" /> Admin
                  </span>
                )}
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
            {detail.league.isadmin && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="input h-9 py-2 text-xs"
                  type="email"
                  value={takeoverEmails[member.userid] ?? ''}
                  onChange={(event) => setTakeoverEmails((current) => ({ ...current, [member.userid]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitTakeoverInvite(member);
                  }}
                  placeholder="Email to take over spot"
                />
                <button
                  className="btn-ghost h-9 justify-center gap-1.5 px-3 py-2 text-xs"
                  disabled={inviteLoadingUserId === member.userid || !(takeoverEmails[member.userid] ?? '').trim()}
                  onClick={() => submitTakeoverInvite(member)}
                  type="button"
                >
                  <Mail size={12} />
                  {inviteLoadingUserId === member.userid ? 'Sending...' : 'Invite takeover'}
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
  onDeletePayment,
  settingsLoading,
  settingsError,
  deleteLoading,
}: {
  detail: LeagueDetail;
  onSettings: (payload: { leaguefee: number; seasonEventFee: number }) => void;
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
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Payment audit</p>
          <h3 className="text-xl font-bold text-white">League Fees</h3>
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
        <div className="hidden gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted md:grid md:grid-cols-[minmax(160px,1fr)_90px_90px_90px_100px]">
          <span>Player</span>
          <span className="text-right">Due</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Open</span>
          <span className="text-right">Events</span>
        </div>
        {approvedMembers.map((member) => {
          const paid = detail.payments.filter((payment) => payment.userid === member.userid).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const memberDue = getMemberTotalDue(member.userid);
          const open = Math.max(0, memberDue - paid);
          const eventStatuses = detail.events.map((event) => getEventPaymentStatus(detail, event, member.userid));
          const eventsOwed = eventStatuses.filter((status) => status.due > 0).length;
          const eventsPaid = eventStatuses.filter((status) => status.due > 0 && status.paid).length;
          return (
            <div key={member.userid} className="border-b border-pit-border/50 p-3 text-sm last:border-0 md:grid md:grid-cols-[minmax(160px,1fr)_90px_90px_90px_100px] md:items-center md:gap-2 md:px-3 md:py-3">
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
            </div>
          );
        })}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {detail.payments.map((payment) => (
          <div key={payment.paymentid} className="grid gap-2 rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_90px_36px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{payment.displayname ?? 'Player'} <span className="text-xs font-normal text-pit-muted">({payment.paymenttype})</span></p>
              <p className="mt-1 truncate text-xs text-pit-muted">{payment.eventname ?? 'Season'} - {String(payment.paidat).slice(0, 10)}{payment.note ? ` - ${payment.note}` : ''}</p>
            </div>
            <span className="font-mono text-pit-teal sm:text-right">{formatCurrency(payment.amount)}</span>
            <span className="text-xs text-pit-muted sm:text-right">{String(payment.createdat).slice(0, 10)}</span>
            <button className="btn-ghost h-9 w-9 p-0 text-red-300" disabled={deleteLoading} onClick={() => onDeletePayment(payment.paymentid)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {detail.payments.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">No payments recorded yet.</p>}
      </div>
    </section>
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
  loading,
  error,
}: {
  detail: LeagueDetail;
  event: LeagueEvent;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  onMarkAllPaid: () => void;
  onTogglePaid: (userId: string, paid: boolean) => void;
  loading: boolean;
  error?: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const resultByUser = new Map(detail.results.filter((result) => result.eventid === event.eventid).map((result) => [result.userid, result]));
  const approvedMembers = [...detail.members]
    .filter((member) => member.approved && member.participating)
    .sort((a, b) => String(a.displayname ?? '').localeCompare(String(b.displayname ?? '')));
  const eventResults = detail.results.filter((result) => result.eventid === event.eventid);
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
          Mark all paid
        </button>
      </div>
      {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {approvedMembers.map((member) => {
          const existing = resultByUser.get(member.userid);
          const paymentStatus = getEventPaymentStatus(detail, event, member.userid);
          const value = drafts[member.userid] ?? (existing?.placed ? String(existing.placed) : '');
          const totalPoints = existing ? Number(existing.points || 0) + Number(existing.showupbonuspoints || 0) : 0;
          const maxPlace = Math.max(1, approvedMembers.length);
          const usedPlaces = new Set(
            eventResults
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
            <div key={member.userid} className="space-y-3 rounded-xl border border-pit-border bg-pit-bg/60 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
                {existing?.dnf ? (
                  <p className="mt-1 inline-flex rounded-full border border-red-300/25 bg-red-400/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-200">
                    DNF
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-pit-muted">
                    {existing ? `${existing.placed}${ordinal(existing.placed)} place - ${formatNumber(totalPoints)} pts` : 'No finish logged'}
                  </p>
                )}
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
                  {paymentStatus.due <= 0 ? 'No fee' : paymentStatus.paid ? 'Paid' : 'Flag paid'}
                </button>
                <button
                  className="btn-ghost justify-center px-3 py-2 text-xs"
                  disabled={loading}
                  onClick={() => {
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[member.userid];
                      return next;
                    });
                    onLog(member.userid, null, true);
                  }}
                >
                  <UserMinus size={13} />
                  DNF
                </button>
              </div>
              <select
                className="input py-2"
                value={value}
                disabled={loading}
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
              <p className="text-[11px] text-pit-muted">
                Paid {formatCurrency(paymentStatus.amount)} / {formatCurrency(paymentStatus.due)}
              </p>
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

function PointsEditorModal({
  open,
  league,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  league: League;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: Pick<League, 'showupbonuspoints' | 'pointslookup'>) => void;
}) {
  const [draft, setDraft] = useState<LeaguePointRule[]>(league.pointslookup);
  const [showupBonus, setShowupBonus] = useState(String(league.showupbonuspoints ?? 0));
  useEffect(() => {
    if (open) {
      setDraft(league.pointslookup);
      setShowupBonus(String(league.showupbonuspoints ?? 0));
    }
  }, [league.pointslookup, league.showupbonuspoints, open]);
  const rows = draft.filter((rule) => rule.place !== 'DNF').sort((a, b) => Number(a.place) - Number(b.place));
  const dnf = draft.find((rule) => rule.place === 'DNF') ?? { place: 'DNF' as const, points: 0 };
  const updateRule = (place: number | 'DNF', pointsValue: string) => {
    const nextPoints = Math.max(0, Math.round(Number(pointsValue) || 0));
    setDraft((current) => current.map((rule) => {
      const matches = place === 'DNF'
        ? rule.place === 'DNF'
        : rule.place !== 'DNF' && Number(rule.place) === Number(place);
      return matches ? { ...rule, place, points: nextPoints } : rule;
    }));
  };
  const addPlace = () => {
    const maxPlace = rows.reduce((max, rule) => Math.max(max, Number(rule.place)), 0);
    setDraft((current) => [...current, { place: maxPlace + 1, points: 0 }]);
  };
  const removePlace = (place: number) => setDraft((current) => current.filter((rule) => rule.place !== place));

  return (
    <Modal
      title="Placement Points"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => onSubmit({
              showupbonuspoints: Math.max(0, Math.round(Number(showupBonus) || 0)),
              pointslookup: [
                { place: 'DNF', points: Number(dnf.points || 0) },
                ...rows.map((rule) => ({ place: Number(rule.place), points: Number(rule.points || 0) })),
              ],
            })}
          >
            {loading ? 'Saving...' : 'Save Scoring'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <p className="text-sm leading-6 text-pit-text">
          Updating placement point values recalculates logged league finishes. Final game multipliers are handled separately.
        </p>
        <label className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 p-3">
          <span>
            <span className="block font-semibold text-white">Show-up bonus</span>
            <span className="mt-1 block text-xs text-pit-muted">Awarded for each non-DNF event result.</span>
          </span>
          <input
            className="input py-2 text-right"
            inputMode="numeric"
            value={showupBonus}
            onChange={(event) => setShowupBonus(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button type="button" className="btn-ghost w-full justify-center" onClick={() => setDraft(generateLeaguePoints(league.expectedplayercount || 36))}>
          Help me decide from {league.expectedplayercount || 36} players
        </button>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 p-3">
            <span className="font-semibold text-white">DNF</span>
            <input className="input py-2 text-right" inputMode="numeric" value={dnf.points} onChange={(event) => updateRule('DNF', event.target.value)} />
          </div>
          {rows.map((rule) => (
            <div key={rule.place} className="grid grid-cols-[1fr_120px_36px] items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 p-3">
              <span className="font-semibold text-white">{rule.place}{ordinal(Number(rule.place))}</span>
              <input className="input py-2 text-right" inputMode="numeric" value={rule.points} onChange={(event) => updateRule(Number(rule.place), event.target.value)} />
              <button className="btn-ghost h-9 w-9 p-0 text-red-300" type="button" onClick={() => removePlace(Number(rule.place))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost w-full justify-center" onClick={addPlace}>
          <Plus size={14} />
          Add placement
        </button>
      </div>
    </Modal>
  );
}

function FinalSettingsModal({
  open,
  league,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  league: League;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: Partial<Pick<League, 'finalenabled' | 'finalmultiplierlookup' | 'finalchiprounding' | 'finalstartingbigblind'>>) => void;
}) {
  const [enabled, setEnabled] = useState(Boolean(league.finalenabled));
  const [rounding, setRounding] = useState(String(league.finalchiprounding || 100));
  const [bigBlind, setBigBlind] = useState(String(league.finalstartingbigblind || 100));
  const [multipliers, setMultipliers] = useState<LeagueFinalMultiplier[]>(league.finalmultiplierlookup?.length ? league.finalmultiplierlookup : defaultFinalMultipliers());
  useEffect(() => {
    if (!open) return;
    setEnabled(Boolean(league.finalenabled));
    setRounding(String(league.finalchiprounding || 100));
    setBigBlind(String(league.finalstartingbigblind || 100));
    setMultipliers(league.finalmultiplierlookup?.length ? league.finalmultiplierlookup : defaultFinalMultipliers());
  }, [league, open]);

  const updateMultiplier = (place: number, value: string) => {
    const multiplier = Math.max(0, Math.round(Number(value) || 0));
    setMultipliers((current) => current.map((rule) => rule.place === place ? { ...rule, multiplier } : rule));
  };
  const addPlace = () => {
    const maxPlace = multipliers.reduce((max, rule) => Math.max(max, rule.place), 0);
    setMultipliers((current) => [...current, { place: maxPlace + 1, multiplier: Math.max(2, 20 - maxPlace) }]);
  };

  return (
    <Modal
      title="Final Game Setup"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => onSubmit({
              finalenabled: enabled,
              finalmultiplierlookup: multipliers,
              finalchiprounding: Number(rounding) || 100,
              finalstartingbigblind: Number(bigBlind) || 100,
            })}
          >
            {loading ? 'Saving...' : 'Save Final'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 p-3">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span className="text-sm text-pit-text">Use a final game after the regular-season standings</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Round chips to</span>
            <input className="input" inputMode="numeric" value={rounding} onChange={(event) => setRounding(event.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Starting big blind</span>
            <input className="input" inputMode="numeric" value={bigBlind} onChange={(event) => setBigBlind(event.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <p className="text-sm leading-6 text-pit-text">
          Final stacks use scored season points times the rank multiplier, rounded to your chip denomination, then add each player's total show-up bonus. Changing this does not rewrite logged event points.
        </p>
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {[...multipliers].sort((a, b) => a.place - b.place).map((rule) => (
            <div key={rule.place} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 p-3">
              <span className="font-semibold text-white">{rule.place}{ordinal(rule.place)} place multiplier</span>
              <input className="input py-2 text-right" inputMode="numeric" value={rule.multiplier} onChange={(event) => updateMultiplier(rule.place, event.target.value)} />
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost w-full justify-center" onClick={addPlace}>
          <Plus size={14} />
          Add final placement
        </button>
      </div>
    </Modal>
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
  onSubmit: (data: { name: string; approvalneeded: boolean; expectedplayercount: number; leaguefee: number; pereventfee: number; showupbonuspoints: number; bestfinishcount: number; pointslookup: LeaguePointRule[]; eventcount: number; seasonname: string; seasonbegindate: string; seasonenddate: string }) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState('Season Championship League');
  const [seasonname, setSeasonname] = useState('Season 1');
  const [seasonbegindate, setSeasonbegindate] = useState(() => new Date().toISOString().slice(0, 10));
  const [seasonenddate, setSeasonenddate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date.toISOString().slice(0, 10);
  });
  const [approvalneeded, setApprovalneeded] = useState(false);
  const [expectedplayercount, setExpectedplayercount] = useState('36');
  const [leaguefee, setLeaguefee] = useState('0');
  const [pereventfee, setPereventfee] = useState('0');
  const [showupbonuspoints, setShowupbonuspoints] = useState('300');
  const [bestfinishcount, setBestfinishcount] = useState('7');
  const [eventcount, setEventcount] = useState('10');
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
              seasonbegindate,
              seasonenddate,
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">First season</span>
            <input className="input" value={seasonname} onChange={(event) => setSeasonname(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Begin date</span>
            <input className="input" type="date" value={seasonbegindate} onChange={(event) => setSeasonbegindate(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">End date</span>
            <input className="input" type="date" value={seasonenddate} onChange={(event) => setSeasonenddate(event.target.value)} />
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
  return (
    <Modal
      title="Join League"
      open={open}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={loading || !code.trim()} onClick={() => onSubmit(code)}>
            {loading ? 'Joining...' : 'Join'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <input className="input font-mono uppercase tracking-widest" placeholder="League code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
      </div>
    </Modal>
  );
}

function RecordPaymentModal({
  open,
  detail,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  detail: LeagueDetail;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: { userid: string; eventid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string }) => void;
}) {
  const members = detail.members.filter((member) => member.approved && member.participating);
  const [userid, setUserid] = useState(members[0]?.userid ?? '');
  const [paymenttype, setPaymenttype] = useState<LeaguePaymentType>('league');
  const [eventid, setEventid] = useState('');
  const [amount, setAmount] = useState(String(detail.league.leaguefee || ''));
  const [paidat, setPaidat] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setUserid(members[0]?.userid ?? '');
    setPaymenttype('league');
    setEventid('');
    setAmount(String(detail.league.leaguefee || ''));
    setPaidat(new Date().toISOString().slice(0, 10));
    setNote('');
  }, [detail.league.leaguefee, members, open]);

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
  onSubmit: (data: { name: string; begindate: string; enddate: string; eventcount?: number }) => void;
  nextSeasonNumber: number;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(`Season ${nextSeasonNumber}`);
  const [begindate, setBegindate] = useState(() => new Date().toISOString().slice(0, 10));
  const [enddate, setEnddate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date.toISOString().slice(0, 10);
  });
  const [eventcount, setEventcount] = useState('10');
  useEffect(() => {
    if (!open) return;
    setName(`Season ${nextSeasonNumber}`);
    setBegindate(new Date().toISOString().slice(0, 10));
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    setEnddate(date.toISOString().slice(0, 10));
    setEventcount('10');
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
            disabled={loading || !name.trim() || !begindate || !enddate || enddate < begindate}
            onClick={() => onSubmit({ name, begindate, enddate, eventcount: Math.max(0, Math.min(100, Number(eventcount) || 0)) })}
          >
            {loading ? 'Creating...' : 'Create Season'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Season name" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Begin date</span>
            <input className="input" type="date" value={begindate} onChange={(event) => setBegindate(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">End date</span>
            <input className="input" type="date" value={enddate} onChange={(event) => setEnddate(event.target.value)} />
          </label>
        </div>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Total events</span>
          <input className="input" inputMode="numeric" value={eventcount} onChange={(event) => setEventcount(event.target.value.replace(/\D/g, ''))} />
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
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  league: League;
  season?: LeagueDetail['seasons'][number];
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: { leagueName: string; seasonId?: string | null; seasonName?: string; memberledgervisible: boolean }) => void;
}) {
  const [leagueName, setLeagueName] = useState(league.name);
  const [seasonName, setSeasonName] = useState(season?.name ?? '');
  const [memberLedgerVisible, setMemberLedgerVisible] = useState(Boolean(league.memberledgervisible));

  useEffect(() => {
    if (!open) return;
    setLeagueName(league.name);
    setSeasonName(season?.name ?? '');
    setMemberLedgerVisible(Boolean(league.memberledgervisible));
  }, [league.memberledgervisible, league.name, open, season?.name]);

  const canSave = leagueName.trim().length > 0 && (!season || seasonName.trim().length > 0);

  return (
    <Modal
      title="League Settings"
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
              memberledgervisible: memberLedgerVisible,
            })}
          >
            {loading ? 'Saving...' : 'Save Settings'}
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
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Current season name</span>
          <input
            className="input"
            value={seasonName}
            onChange={(event) => setSeasonName(event.target.value)}
            disabled={!season}
            placeholder={season ? 'Season name' : 'No season selected'}
          />
        </label>
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

function ordinal(value?: number | null) {
  if (!value) return '';
  if ([11, 12, 13].includes(value % 100)) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
}

function defaultFinalMultipliers(): LeagueFinalMultiplier[] {
  return Array.from({ length: 36 }, (_, index) => ({
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

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    league_created: 'League created',
    season_created: 'Season created',
    season_deleted: 'Season deleted',
    season_fee_updated: 'Season fee updated',
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
    payment_deleted: 'Payment deleted',
    event_payment_marked_paid: 'Event payment marked paid',
    event_payments_marked_paid: 'Event payments marked paid',
    event_payments_applied: 'Event payments applied',
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

function exportLeagueEventRsvps(event: LeagueEvent, rows: Array<{ name: string; email: string; status: string; updated: string }>) {
  const csv = [
    ['Name', 'Email', 'Status', 'Updated'],
    ...rows.map((row) => [row.name, row.email, row.status, row.updated]),
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
  return getLeagueEventFee(detail, event);
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}
