import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Copy, Crown, DollarSign, Hash, ListOrdered, Plus, Save, Settings, Trash2, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, League, LeagueDetail, LeagueEvent, LeagueFinalMultiplier, LeagueMember, LeaguePaymentType, LeaguePointRule } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';

const DEFAULT_POINTS_PREVIEW = '1st 671 / 2nd 448 / 3rd 336';
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
const TOP_THREE_SHARE = BASE_POINTS_LOOKUP
  .filter((rule) => typeof rule.place === 'number' && rule.place <= 3)
  .reduce((sum, rule) => sum + rule.points, 0) / BASE_POINT_TOTAL;
const TOP_EIGHT_SHARE = 0.5;

export default function LeaguesPanel() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<League | null>(null);
  const { data: leagues = [], isLoading } = useQuery({ queryKey: ['leagues'], queryFn: api.getLeagues });

  const createMutation = useMutation({
    mutationFn: api.createLeague,
    onSuccess: async (created) => {
      const freshLeagues = await qc.fetchQuery({ queryKey: ['leagues'], queryFn: api.getLeagues });
      setSelected(freshLeagues.find((league) => league.leagueid === created.leagueid) ?? null);
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

function LeagueDetailView({ league, onBack }: { league: League; onBack: () => void }) {
  const qc = useQueryClient();
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [finalModalOpen, setFinalModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<LeagueEvent | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['league', league.leagueid],
    queryFn: () => api.getLeague(league.leagueid),
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: { name: string; eventdate?: string | null; eventnumber?: number; eventcount?: number }) => api.createLeagueEvent(league.leagueid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEventModalOpen(false);
    },
  });
  const addGuestMutation = useMutation({
    mutationFn: (displayname: string) => api.addLeagueGuest(league.leagueid, displayname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });

  const resultMutation = useMutation({
    mutationFn: ({ eventId, userId, placed, dnf }: { eventId: string; userId: string; placed?: number | null; dnf?: boolean }) =>
      api.logLeagueResult(league.leagueid, eventId, userId, { placed, dnf }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
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
      api.createLeaguePayment(league.leagueid, payload),
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
      onBack();
    },
  });

  const detail = data;
  const currentEvent = selectedEvent ?? detail?.events[0] ?? null;
  const eventResults = useMemo(() => {
    if (!detail || !currentEvent) return [];
    return detail.results.filter((result) => result.eventid === currentEvent.eventid);
  }, [currentEvent, detail]);

  if (isLoading || !detail) return <LoadingSpinner className="mt-16" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="text-sm text-pit-muted transition-colors hover:text-white" onClick={onBack} type="button">
          Back to leagues
        </button>
        <div className="flex gap-2">
          <span className="chip font-mono">{detail.league.invitecode}</span>
          {detail.league.isadmin && (
            <>
              <button className="btn-ghost gap-2 px-3 py-2 text-xs" onClick={() => setPointsModalOpen(true)}>
                <Settings size={14} />
                Points
              </button>
              <button className="btn-ghost gap-2 px-3 py-2 text-xs" onClick={() => setFinalModalOpen(true)}>
                <Trophy size={14} />
                Final
              </button>
              <button className="btn-ghost gap-2 px-3 py-2 text-xs" onClick={() => setPaymentModalOpen(true)}>
                <DollarSign size={14} />
                Payment
              </button>
              <button className="btn-primary gap-2 px-3 py-2 text-xs" onClick={() => setEventModalOpen(true)}>
                <Plus size={14} />
                Event
              </button>
              <button
                className="btn-ghost gap-2 px-3 py-2 text-xs text-red-300 hover:border-red-400/40 hover:text-red-200"
                disabled={deleteLeagueMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${detail.league.name}? This hides the league and its events from everyone.`)) {
                    deleteLeagueMutation.mutate();
                  }
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5">
          <p className="eyebrow">League standings</p>
          <h2 className="mt-1 text-3xl font-black text-white">{detail.league.name}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <LeagueHeroStat label="Players" value={`${detail.members.filter((member) => member.approved).length}/${detail.league.expectedplayercount}`} />
            <LeagueHeroStat label="Events" value={detail.events.length} />
            <LeagueHeroStat label="Best finishes" value={detail.league.bestfinishcount} />
            <LeagueHeroStat label="Show-up bonus" value={detail.league.showupbonuspoints} />
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <StandingsTable detail={detail} />
          <div className="space-y-4">
            <RankingTimeline detail={detail} />
            <FinalStackCard detail={detail} />
          </div>
        </div>
      </section>

      <PaymentTracker
        detail={detail}
        onSettings={(payload) => updateLeagueMutation.mutate(payload)}
        onDeletePayment={(paymentId) => deletePaymentMutation.mutate(paymentId)}
        settingsLoading={updateLeagueMutation.isPending}
        deleteLoading={deletePaymentMutation.isPending}
      />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-5">
          <LeagueMembersCard
            detail={detail}
            onAddGuest={(displayname) => addGuestMutation.mutate(displayname)}
            loading={addGuestMutation.isPending}
            error={addGuestMutation.error?.message}
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
              loading={resultMutation.isPending}
            />
          ) : (
            <p className="rounded-lg border border-pit-border bg-pit-bg/60 p-3 text-sm text-pit-text">
              Add an event to start logging finishes.
            </p>
          )}
        </section>
      </div>

      <CreateEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSubmit={(payload) => createEventMutation.mutate(payload)}
        nextEventNumber={detail.events.length + 1}
        loading={createEventMutation.isPending}
        error={createEventMutation.error?.message}
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
    </div>
  );
}

function StandingsTable({ detail }: { detail: LeagueDetail }) {
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
        <div key={standing.userid} className="grid grid-cols-[56px_minmax(0,1fr)_80px_80px_80px] gap-2 border-b border-pit-border/50 px-3 py-3 text-sm last:border-0">
          <span className="font-mono text-pit-teal">#{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{standing.displayname ?? 'Player'}</p>
            <p className="mt-1 text-xs text-pit-muted">Best: {standing.bestfinishes.length ? standing.bestfinishes.join(', ') : 'No finishes'}</p>
          </div>
          <span className="text-right font-bold text-white">{standing.totalpoints}</span>
          <span className="text-right text-pit-text">{standing.eventsplayed}</span>
          <span className="text-right text-pit-text">{standing.averagefinish ? standing.averagefinish.toFixed(1) : '-'}</span>
        </div>
      ))}
      {detail.standings.length === 0 && <p className="p-4 text-sm text-pit-text">No approved players yet.</p>}
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
          const width = detail.standings[0]?.totalpoints ? Math.max(8, (player.totalpoints / detail.standings[0].totalpoints) * 100) : 0;
          return (
            <div key={player.userid}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-pit-text">#{index + 1} {player.displayname}</span>
                <span className="font-mono text-white">{player.totalpoints}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-pit-border">
                <div className="h-full rounded-full bg-pit-teal" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-pit-muted">
        This starts as a slick current-rank visual. The event-by-event rank history can build from the same results table as the season grows.
      </p>
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
              <p className="text-pit-muted">{stack.totalpoints} pts x {stack.multiplier}</p>
            </div>
            <span className="text-right font-mono text-white">{formatNumber(stack.startingstack)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeagueMembersCard({
  detail,
  onAddGuest,
  loading,
  error,
}: {
  detail: LeagueDetail;
  onAddGuest: (displayname: string) => void;
  loading: boolean;
  error?: string;
}) {
  const [guestName, setGuestName] = useState('');
  const approvedMembers = detail.members.filter((member) => member.approved);
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
          <button className="btn-primary w-full justify-center px-3 py-2 text-xs" disabled={loading || !guestName.trim()} onClick={submitGuest}>
            <UserPlus size={13} />
            {loading ? 'Adding...' : 'Add guest'}
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
  const approvedMembers = detail.members.filter((member) => member.approved);
  const eventCount = detail.events.length;
  const totalDuePerPlayer = Number(detail.league.leaguefee || 0) + Number(detail.league.pereventfee || 0) * eventCount;
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
  loading,
}: {
  detail: LeagueDetail;
  event: LeagueEvent;
  onLog: (userId: string, placed: number | null, dnf: boolean) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const resultByUser = new Map(detail.results.filter((result) => result.eventid === event.eventid).map((result) => [result.userid, result]));
  const approvedMembers = detail.members.filter((member) => member.approved);

  return (
    <div className="space-y-2">
      {approvedMembers.map((member) => {
        const existing = resultByUser.get(member.userid);
        const value = drafts[member.userid] ?? (existing?.placed ? String(existing.placed) : '');
        return (
          <div key={member.userid} className="grid gap-2 rounded-lg border border-pit-border bg-pit-bg/60 p-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_100px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{member.displayname ?? 'Player'}</p>
              <p className="mt-1 text-xs text-pit-muted">
                {existing ? `${existing.dnf ? 'DNF' : `${existing.placed}${ordinal(existing.placed)} place`} - ${existing.points + existing.showupbonuspoints} pts` : 'No finish logged'}
              </p>
            </div>
            <input
              className="input py-2"
              inputMode="numeric"
              placeholder="Place"
              value={value}
              onChange={(eventValue) => setDrafts((current) => ({ ...current, [member.userid]: eventValue.target.value.replace(/\D/g, '') }))}
            />
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
          Updating these values recalculates all logged league finishes.
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
    setMultipliers((current) => [...current, { place: maxPlace + 1, multiplier: 0 }]);
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
          Final stacks use scored season points times the rank multiplier, rounded to your chip denomination, then add each player's total show-up bonus.
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
  onSubmit: (data: { name: string; approvalneeded: boolean; expectedplayercount: number; leaguefee: number; pereventfee: number; showupbonuspoints: number; bestfinishcount: number; pointslookup: LeaguePointRule[]; eventcount: number }) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState('Season Championship League');
  const [approvalneeded, setApprovalneeded] = useState(false);
  const [expectedplayercount, setExpectedplayercount] = useState('36');
  const [leaguefee, setLeaguefee] = useState('0');
  const [pereventfee, setPereventfee] = useState('0');
  const [showupbonuspoints, setShowupbonuspoints] = useState('300');
  const [bestfinishcount, setBestfinishcount] = useState('7');
  const [eventcount, setEventcount] = useState('10');
  const [pointslookup, setPointslookup] = useState<LeaguePointRule[]>(() => generateLeaguePoints(36));
  const playerCount = Math.max(2, Number(expectedplayercount) || 36);
  const startingEventCount = Math.max(0, Math.min(100, Number(eventcount) || 0));
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
            disabled={loading || !name.trim() || !Number(expectedplayercount)}
            onClick={() => onSubmit({
              name,
              approvalneeded,
              expectedplayercount: playerCount,
              leaguefee: Number(leaguefee) || 0,
              pereventfee: Number(pereventfee) || 0,
              showupbonuspoints: Number(showupbonuspoints) || 0,
              bestfinishcount: Number(bestfinishcount) || 7,
              pointslookup,
              eventcount: startingEventCount,
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
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Expected players</span>
            <input
              className="input"
              inputMode="numeric"
              value={expectedplayercount}
              onChange={(event) => setExpectedplayercount(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Show-up bonus</span>
            <input className="input" inputMode="numeric" value={showupbonuspoints} onChange={(event) => setShowupbonuspoints(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Best finishes scored</span>
            <input className="input" inputMode="numeric" value={bestfinishcount} onChange={(event) => setBestfinishcount(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Starting events</span>
            <input className="input" inputMode="numeric" value={eventcount} onChange={(event) => setEventcount(event.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
          Placement point rules will be configured next. This first step creates the league, invite code, and season scoring basics.
        </p>
        <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Suggested point chart</p>
              <p className="mt-1 text-xs text-pit-muted">
                {formatNumber(pointTotal)} points per event. Top 8 share about 50%; top 3 share {Math.round(TOP_THREE_SHARE * 10000) / 100}%.
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
  const members = detail.members.filter((member) => member.approved);
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
                setAmount(String(next === 'event' ? detail.league.pereventfee || '' : detail.league.leaguefee || ''));
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
            <select className="input" value={eventid} onChange={(event) => setEventid(event.target.value)}>
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
    multiplier: index === 0 ? 0 : Math.max(2, 19 - index),
  }));
}

function generateLeaguePoints(playerCount: number, totalPoints = playerCount * 100): LeaguePointRule[] {
  const players = Math.max(1, Math.min(500, Math.round(Number(playerCount || 36))));
  const total = Math.max(players, Math.round(Number(totalPoints || players * 100)));
  const baseByPlace = new Map<number, number>();
  for (const rule of BASE_POINTS_LOOKUP) {
    if (typeof rule.place === 'number') baseByPlace.set(rule.place, rule.points);
  }
  const weightForPlace = (place: number) => {
    if (baseByPlace.has(place)) return baseByPlace.get(place)!;
    const last = baseByPlace.get(36) ?? 1;
    return Math.max(1, last * Math.pow(0.96, place - 36));
  };
  const topCount = Math.min(8, players);
  const topThreeCount = Math.min(3, players);
  const buckets = [
    { start: 1, end: topThreeCount, share: players >= 3 ? TOP_THREE_SHARE : 1 },
    { start: 4, end: topCount, share: players >= 8 ? TOP_EIGHT_SHARE - TOP_THREE_SHARE : Math.max(0, 1 - TOP_THREE_SHARE) },
    { start: 9, end: players, share: players >= 9 ? 1 - TOP_EIGHT_SHARE : 0 },
  ].filter((bucket) => bucket.start <= bucket.end && bucket.share > 0);
  const raw = buckets.flatMap((bucket) => {
    const places = Array.from({ length: bucket.end - bucket.start + 1 }, (_, index) => bucket.start + index);
    const weightTotal = places.reduce((sum, place) => sum + weightForPlace(place), 0);
    return places.map((place) => ({
      place,
      value: (total * bucket.share * weightForPlace(place)) / weightTotal,
    }));
  });
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}
