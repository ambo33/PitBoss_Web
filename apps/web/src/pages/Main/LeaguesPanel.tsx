import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Copy, Crown, Hash, ListOrdered, Plus, Save, Trophy, UserMinus, Users } from 'lucide-react';
import { api, League, LeagueDetail, LeagueEvent } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';

const DEFAULT_POINTS_PREVIEW = '1st 671 / 2nd 448 / 3rd 336';

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
  const [selectedEvent, setSelectedEvent] = useState<LeagueEvent | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['league', league.leagueid],
    queryFn: () => api.getLeague(league.leagueid),
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: { name: string; eventdate?: string | null; eventnumber?: number }) => api.createLeagueEvent(league.leagueid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', league.leagueid] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
      setEventModalOpen(false);
    },
  });

  const resultMutation = useMutation({
    mutationFn: ({ eventId, userId, placed, dnf }: { eventId: string; userId: string; placed?: number | null; dnf?: boolean }) =>
      api.logLeagueResult(league.leagueid, eventId, userId, { placed, dnf }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', league.leagueid] }),
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
            <button className="btn-primary gap-2 px-3 py-2 text-xs" onClick={() => setEventModalOpen(true)}>
              <Plus size={14} />
              Event
            </button>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border bg-[radial-gradient(circle_at_20%_0%,rgba(19,173,173,0.22),transparent_28%),linear-gradient(135deg,#17181f,#101116)] p-5">
          <p className="eyebrow">League standings</p>
          <h2 className="mt-1 text-3xl font-black text-white">{detail.league.name}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <LeagueHeroStat label="Players" value={detail.members.filter((member) => member.approved).length} />
            <LeagueHeroStat label="Events" value={detail.events.length} />
            <LeagueHeroStat label="Best finishes" value={detail.league.bestfinishcount} />
            <LeagueHeroStat label="Show-up bonus" value={detail.league.showupbonuspoints} />
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <StandingsTable detail={detail} />
          <RankingTimeline detail={detail} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
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

function CreateLeagueModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; approvalneeded: boolean; showupbonuspoints: number; bestfinishcount: number }) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState('Season Championship League');
  const [approvalneeded, setApprovalneeded] = useState(false);
  const [showupbonuspoints, setShowupbonuspoints] = useState('300');
  const [bestfinishcount, setBestfinishcount] = useState('7');

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
            disabled={loading || !name.trim()}
            onClick={() => onSubmit({
              name,
              approvalneeded,
              showupbonuspoints: Number(showupbonuspoints) || 0,
              bestfinishcount: Number(bestfinishcount) || 7,
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Show-up bonus</span>
            <input className="input" inputMode="numeric" value={showupbonuspoints} onChange={(event) => setShowupbonuspoints(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Best finishes scored</span>
            <input className="input" inputMode="numeric" value={bestfinishcount} onChange={(event) => setBestfinishcount(event.target.value)} />
          </label>
        </div>
        <p className="text-sm leading-6 text-pit-text">
          Placement point rules will be configured next. This first step creates the league, invite code, and season scoring basics.
        </p>
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
  onSubmit: (data: { name: string; eventdate?: string | null; eventnumber?: number }) => void;
  nextEventNumber: number;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(`Event #${nextEventNumber}`);
  const [eventdate, setEventdate] = useState('');
  const [eventnumber, setEventnumber] = useState(String(nextEventNumber));

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
            disabled={loading || !name.trim()}
            onClick={() => onSubmit({ name, eventdate: eventdate || null, eventnumber: Number(eventnumber) || nextEventNumber })}
          >
            {loading ? 'Saving...' : 'Save event'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Event name" />
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" type="date" value={eventdate} onChange={(event) => setEventdate(event.target.value)} />
          <input className="input" inputMode="numeric" value={eventnumber} onChange={(event) => setEventnumber(event.target.value)} placeholder="Event number" />
        </div>
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
