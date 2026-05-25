import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Copy, Crown, DollarSign, Hash, ListOrdered, MoreVertical, Plus, Save, Settings, Trash2, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, League, LeagueDetail, LeagueEvent, LeagueFinalMultiplier, LeagueMember, LeaguePaymentType, LeaguePointRule } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuthStore } from '../../store/auth';

const DEFAULT_POINTS_PREVIEW = 'Scaled points by field size';
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
type LeagueDetailTab = 'overview' | 'events' | 'fees';

export default function LeaguesPanel() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<Pick<League, 'leagueid'> | null>(null);
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league) => (
          <LeagueCard key={league.leagueid} league={league} onClick={() => setSelected(league)} />
        ))}
        {leagues.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-pit-border bg-pit-surface">
              <ListOrdered size={24} className="text-pit-muted" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-white">No leagues yet</p>
              <p className="mt-1 text-sm text-pit-muted">Create a season-long leaderboard or join one with a code.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost text-sm" onClick={() => setShowJoin(true)}>Join with code</button>
              <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>Create league</button>
            </div>
          </div>
        )}
      </div>

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

function LeagueCard({ league, onClick }: { league: League; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card-hover text-left">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pit-teal/20 bg-pit-teal/10">
            <ListOrdered size={17} className="text-pit-teal" />
          </div>
          <div>
            <p className="font-bold leading-tight text-white">{league.name}</p>
          <p className="mt-1 text-xs text-pit-muted">{DEFAULT_POINTS_PREVIEW}</p>
          </div>
        </div>
        {league.isadmin && (
          <span className="badge border border-pit-gold/20 bg-pit-gold/10 text-pit-gold">
            <Crown size={9} className="mr-0.5" /> Admin
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-pit-border/60 pt-3">
        <LeagueMiniStat label="Players" value={league.membercount ?? 0} />
        <LeagueMiniStat label="Events" value={league.eventcount ?? 0} />
        <LeagueMiniStat label="Best" value={league.bestfinishcount} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="chip">{league.showupbonuspoints} show-up</span>
        <span className="font-mono text-[11px] tracking-widest text-pit-muted">{league.invitecode}</span>
      </div>
    </button>
  );
}

function LeagueDetailView({ league, onBack }: { league: Pick<League, 'leagueid'>; onBack: () => void }) {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.guid ?? null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [finalModalOpen, setFinalModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSeasonConfirmOpen, setDeleteSeasonConfirmOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<LeagueMember | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<LeagueEvent | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedRankUserId, setSelectedRankUserId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<LeagueDetailTab>('overview');
  const { data, isLoading } = useQuery({
    queryKey: ['league', league.leagueid, selectedSeasonId],
    queryFn: () => api.getLeague(league.leagueid, selectedSeasonId),
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: { name: string; eventdate?: string | null; eventnumber?: number; eventcount?: number }) => api.createLeagueEvent(league.leagueid, { ...payload, seasonid: data?.selectedseasonid ?? selectedSeasonId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEventModalOpen(false);
    },
  });
  const createSeasonMutation = useMutation({
    mutationFn: (payload: { name: string; begindate: string; enddate: string; eventcount?: number }) => api.createLeagueSeason(league.leagueid, payload),
    onSuccess: (created) => {
      setSelectedSeasonId(created.season.seasonid);
      setSelectedEvent(null);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
  });
  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, eventfee }: { eventId: string; eventfee: number | null }) =>
      api.updateLeagueEvent(league.leagueid, eventId, { eventfee }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const updateLeagueMutation = useMutation({
    mutationFn: (payload: Partial<Pick<League, 'leaguefee' | 'pereventfee' | 'pointslookup' | 'finalenabled' | 'finalmultiplierlookup' | 'finalchiprounding' | 'finalstartingbigblind'>>) =>
      api.updateLeague(league.leagueid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setPointsModalOpen(false);
      setFinalModalOpen(false);
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
  }, [detail, selectedEvent]);
  useEffect(() => {
    if (!detail) return;
    const preferredUserId = detail.league.isadmin
      ? selectedRankUserId
      : currentUserId && detail.standings.some((standing) => standing.userid === currentUserId)
        ? currentUserId
        : selectedRankUserId;
    if (!preferredUserId || !detail.standings.some((standing) => standing.userid === preferredUserId)) {
      setSelectedRankUserId(detail.standings[0]?.userid ?? null);
      return;
    }
    if (!detail.league.isadmin && selectedRankUserId !== preferredUserId) {
      setSelectedRankUserId(preferredUserId);
    }
  }, [currentUserId, detail, selectedRankUserId]);
  useEffect(() => {
    if (detail && !detail.league.isadmin && activeDetailTab !== 'overview') {
      setActiveDetailTab('overview');
    }
  }, [activeDetailTab, detail]);
  const currentEvent = (selectedEvent && detail?.events.find((event) => event.eventid === selectedEvent.eventid)) || detail?.events[0] || null;
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
        selectedSeason={selectedSeason}
        onBack={onBack}
        onSeasonChange={(seasonId) => {
          setSelectedSeasonId(seasonId);
          setSelectedEvent(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button className="shrink-0 text-sm text-pit-muted transition-colors hover:text-white" onClick={onBack} type="button">
          Back to leagues
        </button>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="chip shrink-0 font-mono">{detail.league.invitecode}</span>
          <select
            className="input h-10 w-36 shrink-0 py-2 text-xs sm:w-44"
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
          <button className="btn-ghost h-10 shrink-0 gap-2 px-3 py-2 text-xs" onClick={() => setSeasonModalOpen(true)}>
            <CalendarDays size={14} />
            +Season
          </button>
          <button
            className="btn-primary h-10 shrink-0 gap-2 px-3 py-2 text-xs"
            onClick={() => {
              setActiveDetailTab('events');
              setEventModalOpen(true);
            }}
          >
            <Plus size={14} />
            Event
          </button>
          <details className="relative shrink-0 [&_summary::-webkit-details-marker]:hidden">
            <summary className="btn-ghost h-10 cursor-pointer gap-2 px-3 py-2 text-xs">
              <MoreVertical size={14} />
              Manage
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-pit-border bg-pit-surface p-1 shadow-2xl">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white" onClick={() => setPointsModalOpen(true)}>
                <Settings size={14} />
                Points
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white" onClick={() => setFinalModalOpen(true)}>
                <Trophy size={14} />
                Final
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text hover:bg-pit-card hover:text-white"
                onClick={() => {
                  setActiveDetailTab('fees');
                  setPaymentModalOpen(true);
                }}
              >
                <DollarSign size={14} />
                Payment
              </button>
              <div className="my-1 h-px bg-pit-border" />
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={detail.seasons.length <= 1 || deleteSeasonMutation.isPending}
                onClick={() => setDeleteSeasonConfirmOpen(true)}
              >
                <Trash2 size={14} />
                Delete season
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteLeagueMutation.isPending}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={14} />
                Delete league
              </button>
            </div>
          </details>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5">
          <p className="eyebrow">League standings</p>
          <h2 className="mt-1 text-3xl font-black text-white">{detail.league.name}</h2>
          {selectedSeason && (
            <p className="mt-2 text-sm text-pit-text">
              {selectedSeason.name} runs {String(selectedSeason.begindate).slice(0, 10)} through {String(selectedSeason.enddate).slice(0, 10)}.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
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
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <StandingsTable detail={detail} selectedUserId={selectedRankUserId} onSelectUser={setSelectedRankUserId} />
            <div className="space-y-4">
              <PlayerLeagueProfile detail={detail} userId={selectedRankUserId} />
              <RankingTimeline detail={detail} />
              <FinalStackCard detail={detail} />
            </div>
          </div>
        )}
      </section>

      {activeDetailTab === 'fees' && (
        <PaymentTracker
          detail={detail}
          onSettings={(payload) => updateLeagueMutation.mutate(payload)}
          onDeletePayment={(paymentId) => deletePaymentMutation.mutate(paymentId)}
          settingsLoading={updateLeagueMutation.isPending}
          deleteLoading={deletePaymentMutation.isPending}
        />
      )}

      {activeDetailTab === 'events' && (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-5">
            <LeagueMembersCard
              detail={detail}
              onAddGuest={(displayname) => addGuestMutation.mutate(displayname)}
              onRemoveMember={setRemoveMemberTarget}
              addLoading={addGuestMutation.isPending}
              removeLoading={removeMemberMutation.isPending}
              error={addGuestMutation.error?.message ?? removeMemberMutation.error?.message}
            />
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Events</h3>
                <CalendarDays size={16} className="text-pit-teal" />
              </div>
              {detail.events.length === 0 ? (
                <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
                  No events yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {detail.events.map((event) => (
                    <button
                      key={event.eventid}
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        currentEvent?.eventid === event.eventid ? 'border-pit-teal bg-pit-teal/10' : 'border-pit-border bg-pit-bg/60 hover:border-pit-teal/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{event.name}</p>
                        <span className="text-xs text-pit-muted">{event.resultcount ?? 0} logged</span>
                      </div>
                      <p className="mt-1 text-xs text-pit-muted">{event.eventdate ? event.eventdate.slice(0, 10) : 'Date TBD'}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Finish logger</p>
                <h3 className="text-xl font-bold text-white">{currentEvent ? currentEvent.name : 'No event selected'}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentEvent && (
                  <a className="chip hover:border-pit-teal/50 hover:text-white" href={`/league/${league.leagueid}/event/${currentEvent.eventid}`}>
                    <Copy size={13} />
                    Player lobby
                  </a>
                )}
                <span className="chip">{eventResults.length} finishes</span>
              </div>
            </div>
            {currentEvent ? (
              <ResultLogger
                detail={detail}
                event={currentEvent}
                onLog={(userId, placed, dnf) => resultMutation.mutate({ eventId: currentEvent.eventid, userId, placed, dnf })}
                onEventFeeChange={(eventfee) => updateEventMutation.mutate({ eventId: currentEvent.eventid, eventfee })}
                loading={resultMutation.isPending}
                feeLoading={updateEventMutation.isPending}
                feeError={updateEventMutation.error?.message}
              />
            ) : (
              <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
                Add an event to start logging finishes.
              </p>
            )}
          </section>
        </div>
      )}

      <CreateEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSubmit={(payload) => createEventMutation.mutate(payload)}
        nextEventNumber={detail.events.length + 1}
        loading={createEventMutation.isPending}
        error={createEventMutation.error?.message}
      />
      <CreateSeasonModal
        open={seasonModalOpen}
        onClose={() => setSeasonModalOpen(false)}
        onSubmit={(payload) => createSeasonMutation.mutate(payload)}
        nextSeasonNumber={detail.seasons.length + 1}
        loading={createSeasonMutation.isPending}
        error={createSeasonMutation.error?.message}
      />
      <PointsEditorModal
        open={pointsModalOpen}
        league={detail.league}
        loading={updateLeagueMutation.isPending}
        error={updateLeagueMutation.error?.message}
        onClose={() => setPointsModalOpen(false)}
        onSubmit={(pointslookup) => updateLeagueMutation.mutate({ pointslookup })}
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

function StandingsTable({
  detail,
  selectedUserId,
  onSelectUser,
}: {
  detail: LeagueDetail;
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
      <div className="grid grid-cols-[56px_minmax(0,1fr)_80px_80px_80px] gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted">
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Total</span>
        <span className="text-right">Played</span>
        <span className="text-right">Avg</span>
      </div>
      {detail.standings.map((standing, index) => (
        <button
          key={standing.userid}
          type="button"
          onClick={() => onSelectUser(standing.userid)}
          className={`grid w-full grid-cols-[56px_minmax(0,1fr)_80px_80px_80px] gap-2 border-b border-pit-border/50 px-3 py-3 text-left text-sm transition-colors last:border-0 ${
            selectedUserId === standing.userid ? 'bg-pit-teal/10' : 'hover:bg-pit-card'
          }`}
        >
          <span className="font-mono text-pit-teal">#{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{standing.displayname ?? 'Player'}</p>
            <p className="mt-1 text-xs text-pit-muted">Best: {standing.bestfinishes.length ? standing.bestfinishes.join(', ') : 'No finishes'}</p>
          </div>
          <span className="text-right font-bold text-white">{formatNumber(Number(standing.totalpoints || 0))}</span>
          <span className="text-right text-pit-text">{standing.eventsplayed}</span>
          <span className="text-right text-pit-text">{standing.averagefinish ? standing.averagefinish.toFixed(1) : '-'}</span>
        </button>
      ))}
      {detail.standings.length === 0 && <p className="p-4 text-sm text-pit-text">No approved players yet.</p>}
    </div>
  );
}

function PlayerLeagueProfile({ detail, userId }: { detail: LeagueDetail; userId: string | null }) {
  const member = detail.members.find((item) => item.userid === userId) ?? null;
  const standing = detail.standings.find((item) => item.userid === userId) ?? null;
  if (!userId || !member || !standing) {
    return (
      <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
        <h3 className="font-semibold text-white">Player details</h3>
        <p className="mt-2 text-sm leading-6 text-pit-text">Select a player in the standings to review event finishes, points, and payment status.</p>
      </div>
    );
  }

  const seasonEventFees = detail.events.reduce((sum, event) => sum + getLeagueEventFee(detail, event), 0);
  const totalDue = Number(detail.league.leaguefee || 0) + seasonEventFees;
  const totalPaid = detail.payments
    .filter((payment) => payment.userid === userId)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
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
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {detail.events.map((event) => {
          const result = detail.results.find((item) => item.eventid === event.eventid && item.userid === userId);
          const points = result ? Number(result.points || 0) + Number(result.showupbonuspoints || 0) : 0;
          const paid = detail.payments
            .filter((payment) => payment.userid === userId && payment.eventid === event.eventid)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const eventFee = getLeagueEventFee(detail, event);
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

function RankingTimeline({ detail }: { detail: LeagueDetail }) {
  const topPlayers = detail.standings.slice(0, 5);
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">Rankings over time</h3>
        <Trophy size={16} className="text-pit-gold" />
      </div>
      <div className="space-y-3">
        {topPlayers.map((player, index) => {
          const topPoints = Number(detail.standings[0]?.totalpoints || 0);
          const playerPoints = Number(player.totalpoints || 0);
          const width = topPoints ? Math.max(8, (playerPoints / topPoints) * 100) : 0;
          return (
            <div key={player.userid}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-pit-text">#{index + 1} {player.displayname}</span>
                <span className="font-mono text-white">{formatNumber(playerPoints)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-pit-border">
                <div className="h-full rounded-full bg-pit-teal" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinalStackCard({ detail }: { detail: LeagueDetail }) {
  if (!detail.league.finalenabled) {
    return (
      <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-white">League finish</h3>
          <Trophy size={16} className="text-pit-muted" />
        </div>
        <p className="text-sm leading-6 text-pit-text">
          Standings decide the league winner after all events are complete. Enable a final table to convert season points into starting stacks.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">Final game stacks</h3>
        <Trophy size={16} className="text-pit-gold" />
      </div>
      <div className="space-y-2">
        {detail.finalstacks.slice(0, 8).map((stack) => (
          <div key={stack.userid} className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-2 rounded-lg border border-pit-border/70 bg-pit-card/70 px-3 py-2 text-xs">
            <span className="font-mono text-pit-teal">#{stack.place}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{stack.displayname ?? 'Player'}</p>
              <p className="text-pit-muted">{formatNumber(Number(stack.totalpoints || 0))} pts x {Number(stack.multiplier || 0)}</p>
            </div>
            <span className="text-right font-mono text-white">{formatNumber(Number(stack.startingstack || 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberLeagueView({
  detail,
  currentUserId,
  selectedSeason,
  onBack,
  onSeasonChange,
}: {
  detail: LeagueDetail;
  currentUserId: string | null;
  selectedSeason?: LeagueDetail['seasons'][number];
  onBack: () => void;
  onSeasonChange: (seasonId: string) => void;
}) {
  const member = currentUserId ? detail.members.find((item) => item.userid === currentUserId) ?? null : null;
  const standing = currentUserId ? detail.standings.find((item) => item.userid === currentUserId) ?? null : null;
  const rank = standing ? detail.standings.findIndex((item) => item.userid === standing.userid) + 1 : null;
  const userResults = currentUserId ? detail.results.filter((result) => result.userid === currentUserId) : [];
  const resultByEvent = new Map(userResults.map((result) => [result.eventid, result]));
  const today = todayDateString();
  const dueEvents = detail.events.filter((event) => isEventDueToDate(event, today) || resultByEvent.has(event.eventid));
  const remainingEvents = detail.events.filter((event) => !resultByEvent.has(event.eventid) && isEventRemaining(event, today));
  const nextEvent = [...remainingEvents].sort(compareLeagueEvents)[0] ?? null;
  const dueEventFees = dueEvents.reduce((sum, event) => sum + getLeagueEventFee(detail, event), 0);
  const totalDueToDate = Number(detail.league.leaguefee || 0) + dueEventFees;
  const totalPaid = currentUserId
    ? detail.payments.filter((payment) => payment.userid === currentUserId).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : 0;
  const openBalance = Math.max(0, totalDueToDate - totalPaid);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button className="shrink-0 text-sm text-pit-muted transition-colors hover:text-white" onClick={onBack} type="button">
          Back to leagues
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

      <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="grid gap-5 border-b border-pit-border bg-[radial-gradient(circle_at_18%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <p className="eyebrow">My league story</p>
            <h2 className="mt-1 text-3xl font-black text-white">{detail.league.name}</h2>
            <p className="mt-2 text-sm leading-6 text-pit-text">
              {selectedSeason?.name ?? 'Current season'}{selectedSeason ? ` runs ${String(selectedSeason.begindate).slice(0, 10)} through ${String(selectedSeason.enddate).slice(0, 10)}.` : ''}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MemberStoryStat label="Current place" value={rank ? `#${rank}` : '-'} />
              <MemberStoryStat label="Avg finish" value={standing?.averagefinish ? standing.averagefinish.toFixed(1) : '-'} />
              <MemberStoryStat label="Remaining" value={remainingEvents.length} />
              <MemberStoryStat label="Balance due" value={formatCurrency(openBalance)} accent={openBalance > 0 ? 'gold' : 'teal'} />
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
                <span className="chip">{formatNumber(Number(standing?.totalpoints || 0))} pts</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <MemberMoneyStat label="Events played" value={standing?.eventsplayed ?? 0} />
                <MemberMoneyStat label="Paid" value={formatCurrency(totalPaid)} accent="teal" />
                <MemberMoneyStat label="Balance due" value={formatCurrency(openBalance)} accent={openBalance > 0 ? 'gold' : 'teal'} />
              </div>
              <p className="mt-3 text-xs leading-5 text-pit-muted">
                Future-dated event fees are ignored until their event date arrives.
              </p>
            </section>

            <section className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-semibold text-white">My event finishes</h4>
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
                        <p className="mt-1 text-xs text-pit-muted">{event.eventdate ? String(event.eventdate).slice(0, 10) : 'Date TBD'}</p>
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
              {detail.standings.map((item, index) => (
                <div
                  key={item.userid}
                  className={`grid grid-cols-[42px_minmax(0,1fr)_82px] items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    item.userid === currentUserId ? 'border-pit-teal bg-pit-teal/10' : 'border-pit-border bg-pit-card/60'
                  }`}
                >
                  <span className="font-mono text-pit-teal">#{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{item.displayname ?? 'Player'}</p>
                    <p className="mt-1 text-xs text-pit-muted">{item.eventsplayed} played{item.averagefinish ? ` - avg ${item.averagefinish.toFixed(1)}` : ''}</p>
                  </div>
                  <span className="text-right font-mono text-white">{formatNumber(Number(item.totalpoints || 0))}</span>
                </div>
              ))}
              {detail.standings.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">Standings will appear once finishes are logged.</p>}
            </div>
          </section>
        </div>
      </section>
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
              <p className="mt-1 font-semibold text-white">{event.eventdate ? String(event.eventdate).slice(0, 10) : 'TBD'}</p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg/70 p-3">
              <p className="text-xs uppercase tracking-wide text-pit-muted">Fee</p>
              <p className="mt-1 font-semibold text-white">{formatCurrency(getLeagueEventFee(detail, event))}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-pit-border bg-pit-bg/70 p-3 text-sm leading-6 text-pit-text">
          No remaining events are scheduled for you in this season.
        </p>
      )}
    </div>
  );
}

function LeagueMembersCard({
  detail,
  onAddGuest,
  onRemoveMember,
  addLoading,
  removeLoading,
  error,
}: {
  detail: LeagueDetail;
  onAddGuest: (displayname: string) => void;
  onRemoveMember: (member: LeagueMember) => void;
  addLoading: boolean;
  removeLoading: boolean;
  error?: string;
}) {
  const [guestName, setGuestName] = useState('');
  const approvedMembers = detail.members.filter((member) => member.approved && member.participating);
  const pendingCount = detail.members.filter((member) => !member.approved).length;

  const submitGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    onAddGuest(name);
    setGuestName('');
  };

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Players</h3>
          <p className="mt-1 text-xs text-pit-muted">
            {approvedMembers.length}/{detail.league.expectedplayercount} active{pendingCount ? `, ${pendingCount} pending` : ''}
          </p>
        </div>
        <Users size={16} className="text-pit-teal" />
      </div>

      {detail.league.isadmin && (
        <div className="space-y-2 rounded-xl border border-pit-border bg-pit-bg/55 p-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Guest player</span>
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
          {error && <p className="text-xs text-red-300">{error}</p>}
          <button className="btn-primary w-full justify-center px-3 py-2 text-xs" disabled={addLoading || !guestName.trim()} onClick={submitGuest}>
            <UserPlus size={13} />
            {addLoading ? 'Adding...' : 'Add guest'}
          </button>
        </div>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {approvedMembers.map((member) => (
          <div key={member.userid} className="flex items-center justify-between gap-2 rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2">
            <p className="min-w-0 truncate text-sm font-semibold text-white">{member.displayname ?? 'Player'}</p>
            {member.isadmin && (
              <span className="badge border border-pit-gold/20 bg-pit-gold/10 text-pit-gold">
                <Crown size={9} className="mr-0.5" /> Admin
              </span>
            )}
            {detail.league.isadmin && (
              <button
                className="btn-ghost h-8 w-8 shrink-0 p-0 text-red-300 hover:border-red-400/40 hover:text-red-200"
                disabled={removeLoading}
                title={`Remove ${member.displayname ?? 'player'} from this season`}
                onClick={() => onRemoveMember(member)}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {approvedMembers.length === 0 && <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">No approved players yet.</p>}
      </div>
    </section>
  );
}

function PaymentTracker({
  detail,
  onSettings,
  onDeletePayment,
  settingsLoading,
  deleteLoading,
}: {
  detail: LeagueDetail;
  onSettings: (payload: Pick<League, 'leaguefee' | 'pereventfee'>) => void;
  onDeletePayment: (paymentId: string) => void;
  settingsLoading: boolean;
  deleteLoading: boolean;
}) {
  const [leagueFee, setLeagueFee] = useState(String(detail.league.leaguefee || 0));
  const [perEventFee, setPerEventFee] = useState(String(detail.league.pereventfee || 0));
  useEffect(() => {
    setLeagueFee(String(detail.league.leaguefee || 0));
    setPerEventFee(String(detail.league.pereventfee || 0));
  }, [detail.league.leaguefee, detail.league.pereventfee]);
  const approvedMembers = detail.members.filter((member) => member.approved && member.participating);
  const eventFeesTotal = detail.events.reduce((sum, event) => sum + getLeagueEventFee(detail, event), 0);
  const totalDuePerPlayer = Number(detail.league.leaguefee || 0) + eventFeesTotal;
  const totalPaid = detail.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalDue = approvedMembers.length * totalDuePerPlayer;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Payment audit</p>
          <h3 className="text-xl font-bold text-white">League Fees</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{formatCurrency(totalPaid)} paid</span>
          <span className="chip">{formatCurrency(Math.max(0, totalDue - totalPaid))} open</span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">League fee</span>
          <input className="input" inputMode="decimal" value={leagueFee} onChange={(event) => setLeagueFee(event.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Per event fee</span>
          <input className="input" inputMode="decimal" value={perEventFee} onChange={(event) => setPerEventFee(event.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <button className="btn-primary px-3 py-2 text-sm" disabled={settingsLoading} onClick={() => onSettings({ leaguefee: Number(leagueFee) || 0, pereventfee: Number(perEventFee) || 0 })}>
          <Save size={14} />
          Save Fees
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
        <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] gap-2 border-b border-pit-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-pit-muted">
          <span>Player</span>
          <span className="text-right">Due</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Open</span>
        </div>
        {approvedMembers.map((member) => {
          const paid = detail.payments.filter((payment) => payment.userid === member.userid).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const open = Math.max(0, totalDuePerPlayer - paid);
          return (
            <div key={member.userid} className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] gap-2 border-b border-pit-border/50 px-3 py-3 text-sm last:border-0">
              <span className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</span>
              <span className="text-right text-pit-text">{formatCurrency(totalDuePerPlayer)}</span>
              <span className="text-right text-pit-teal">{formatCurrency(paid)}</span>
              <span className={`text-right font-semibold ${open ? 'text-pit-gold' : 'text-pit-muted'}`}>{formatCurrency(open)}</span>
            </div>
          );
        })}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {detail.payments.map((payment) => (
          <div key={payment.paymentid} className="grid gap-2 rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_90px_36px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{payment.displayname ?? 'Player'} <span className="text-xs font-normal text-pit-muted">({payment.paymenttype})</span></p>
              <p className="mt-1 truncate text-xs text-pit-muted">{payment.eventname ?? 'Season'} · {String(payment.paidat).slice(0, 10)}{payment.note ? ` · ${payment.note}` : ''}</p>
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

function ResultLogger({
  detail,
  event,
  onLog,
  onEventFeeChange,
  loading,
  feeLoading,
  feeError,
}: {
  detail: LeagueDetail;
  event: LeagueEvent;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  onEventFeeChange: (eventfee: number | null) => void;
  loading: boolean;
  feeLoading: boolean;
  feeError?: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [eventFeeDraft, setEventFeeDraft] = useState('');
  const resultByUser = new Map(detail.results.filter((result) => result.eventid === event.eventid).map((result) => [result.userid, result]));
  const approvedMembers = detail.members.filter((member) => member.approved && member.participating);
  const eventResults = detail.results.filter((result) => result.eventid === event.eventid);
  const dnfCount = eventResults.filter((result) => result.dnf).length;

  useEffect(() => {
    setEventFeeDraft(String(getLeagueEventFee(detail, event) || ''));
  }, [detail, event.eventid, event.eventfee]);
  useEffect(() => {
    setDrafts({});
  }, [event.eventid]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pit-muted">Event fee</p>
            <p className="mt-1 text-xs text-pit-text">Used for this event's payment audit.</p>
          </div>
          <input
            className="input py-2"
            inputMode="decimal"
            value={eventFeeDraft}
            onChange={(eventValue) => setEventFeeDraft(eventValue.target.value.replace(/[^\d.]/g, ''))}
          />
          <button
            type="button"
            className="btn-primary px-3 py-2 text-xs"
            disabled={feeLoading}
            onClick={() => onEventFeeChange(eventFeeDraft.trim() ? Number(eventFeeDraft) || 0 : null)}
          >
            <Save size={13} />
            {feeLoading ? 'Saving...' : 'Save fee'}
          </button>
        </div>
        {feeError && <p className="mt-2 text-xs text-red-300">{feeError}</p>}
      </div>
      {approvedMembers.map((member) => {
        const existing = resultByUser.get(member.userid);
        const value = drafts[member.userid] ?? (existing?.placed ? String(existing.placed) : '');
        const totalPoints = existing ? Number(existing.points || 0) + Number(existing.showupbonuspoints || 0) : 0;
        const dnfCountForMember = dnfCount - (existing?.dnf ? 1 : 0);
        const maxPlace = Math.max(1, approvedMembers.length - dnfCountForMember);
        const usedPlaces = new Set(
          eventResults
            .filter((result) => result.userid !== member.userid && !result.dnf && result.placed != null)
            .map((result) => Number(result.placed))
        );
        const availablePlaces = Array.from({ length: maxPlace }, (_, index) => index + 1)
          .filter((place) => !usedPlaces.has(place));
        const selectedPlace = Number(value);
        if (selectedPlace && !availablePlaces.includes(selectedPlace)) {
          availablePlaces.push(selectedPlace);
          availablePlaces.sort((a, b) => a - b);
        }
        return (
          <div key={member.userid} className="grid gap-2 rounded-lg border border-pit-border bg-pit-bg/60 p-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_100px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
              <p className="mt-1 text-xs text-pit-muted">
                {existing ? `${existing.dnf ? 'DNF' : `${existing.placed}${ordinal(existing.placed)} place`} - ${formatNumber(totalPoints)} pts` : 'No finish logged'}
              </p>
            </div>
            <select
              className="input py-2"
              value={value}
              onChange={(eventValue) => setDrafts((current) => ({ ...current, [member.userid]: eventValue.target.value }))}
            >
              <option value="">Place</option>
              {availablePlaces.map((place) => (
                <option key={place} value={place}>{place}{ordinal(place)}</option>
              ))}
            </select>
            <button className="btn-primary px-3 py-2 text-xs" disabled={loading || !value} onClick={() => onLog(member.userid, Number(value), false)}>
              <Save size={13} />
              Log finish
            </button>
            <button className="btn-ghost px-3 py-2 text-xs" disabled={loading} onClick={() => onLog(member.userid, null, true)}>
              <UserMinus size={13} />
              DNF
            </button>
          </div>
        );
      })}
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
  onSubmit: (points: LeaguePointRule[]) => void;
}) {
  const [draft, setDraft] = useState<LeaguePointRule[]>(league.pointslookup);
  useEffect(() => {
    if (open) setDraft(league.pointslookup);
  }, [league.pointslookup, open]);
  const rows = draft.filter((rule) => rule.place !== 'DNF').sort((a, b) => Number(a.place) - Number(b.place));
  const dnf = draft.find((rule) => rule.place === 'DNF') ?? { place: 'DNF' as const, points: 0 };
  const updateRule = (place: number | 'DNF', pointsValue: string) => {
    const nextPoints = Math.max(0, Math.round(Number(pointsValue) || 0));
    setDraft((current) => current.map((rule) => rule.place === place ? { ...rule, points: nextPoints } : rule));
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
          <button type="button" className="btn-primary" disabled={loading} onClick={() => onSubmit([dnf, ...rows])}>
            {loading ? 'Saving...' : 'Save Points'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <p className="text-sm leading-6 text-pit-text">
          Updating placement point values recalculates logged league finishes. Final game multipliers are handled separately.
        </p>
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
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Per event fee</span>
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
  const selectedEvent = detail.events.find((event) => event.eventid === eventid) ?? detail.events[0] ?? null;
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
                  const nextEvent = selectedEvent ?? detail.events[0] ?? null;
                  setEventid(nextEvent?.eventid ?? '');
                  setAmount(String(nextEvent ? getLeagueEventFee(detail, nextEvent) || '' : detail.league.pereventfee || ''));
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
              <option value="">No event selected</option>
              {detail.events.map((event) => <option key={event.eventid} value={event.eventid}>{event.name}</option>)}
            </select>
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
          <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Starter events</span>
          <input className="input" inputMode="numeric" value={eventcount} onChange={(event) => setEventcount(event.target.value.replace(/\D/g, ''))} />
        </label>
        <p className="text-sm leading-6 text-pit-text">
          A season is the scoring window inside this league. Existing approved league members are added as season players, and admins can remove themselves from season play without losing admin access.
        </p>
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
  onSubmit: (data: { name: string; eventdate?: string | null; eventnumber?: number; eventcount?: number }) => void;
  nextEventNumber: number;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(`Event #${nextEventNumber}`);
  const [eventdate, setEventdate] = useState('');
  const [eventnumber, setEventnumber] = useState(String(nextEventNumber));
  const [eventcount, setEventcount] = useState('1');
  const countValue = Math.max(1, Math.min(100, Number(eventcount) || 1));
  useEffect(() => {
    if (!open) return;
    setName(`Event #${nextEventNumber}`);
    setEventdate('');
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Event name" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Event date</span>
              <input className="input" type="date" value={eventdate} onChange={(event) => setEventdate(event.target.value)} />
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

function LeagueMiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-pit-muted">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
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

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function getLeagueEventFee(detail: LeagueDetail, event: LeagueEvent) {
  return event.eventfee == null ? Number(detail.league.pereventfee || 0) : Number(event.eventfee || 0);
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
  return Number(a.eventnumber ?? 9999) - Number(b.eventnumber ?? 9999);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}
