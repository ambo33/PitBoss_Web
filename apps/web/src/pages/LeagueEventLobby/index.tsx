import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { CalendarCheck, CalendarClock, CheckCircle2, Radio, RefreshCw, Trophy, UserMinus, Users, XCircle } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import LoadingSpinner from '../../components/LoadingSpinner';
import { api, type LeagueResult } from '../../api/client';

export default function LeagueEventLobbyPage() {
  const { leagueId, eventId } = useParams();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['league-event-lobby', leagueId, eventId], [leagueId, eventId]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getLeagueEventLobby(leagueId!, eventId!),
    enabled: Boolean(leagueId && eventId),
    refetchInterval: (query) => query.state.data?.event.hasstarted ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
  });

  const placedResults = useMemo(
    () => (data?.results ?? [])
      .filter((result) => !result.dnf && result.placed != null)
      .sort((a, b) => new Date(b.updatedat).getTime() - new Date(a.updatedat).getTime()),
    [data?.results]
  );
  const dnfCount = useMemo(
    () => (data?.results ?? []).filter((result) => result.dnf).length,
    [data?.results]
  );
  const playersRemaining = Math.max(0, Number(data?.participantcount ?? 0) - dnfCount - placedResults.length);

  const logMutation = useMutation({
    mutationFn: () => api.logLeagueSelfResult(leagueId!, eventId!, { auto: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ['league', leagueId] });
    },
    onError: () => void refetch(),
  });
  const rsvpMutation = useMutation({
    mutationFn: (status: 'going' | 'not_going') => api.rsvpLeagueEvent(leagueId!, eventId!, status),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (!eventId) return;
    const socket = io('/', { path: '/socket.io' });
    const refreshLobby = () => {
      void qc.invalidateQueries({ queryKey });
    };
    const joinRooms = () => {
      socket.emit('join-league-event', eventId);
      if (data?.event.tournamentid) {
        socket.emit('join-tournament', data.event.tournamentid);
      }
    };

    socket.on('connect', joinRooms);
    if (socket.connected) joinRooms();
    socket.on('league-event-updated', refreshLobby);
    socket.on('tournament-updated', refreshLobby);

    return () => {
      socket.disconnect();
    };
  }, [data?.event.tournamentid, eventId, qc, queryKey]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (!data) {
    return (
      <main className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto mt-16 max-w-lg overflow-hidden rounded-xl border border-pit-border bg-pit-card">
          <Link
            className="flex border-b border-pit-border bg-pit-bg/55 px-4 py-3 transition hover:bg-pit-teal/[0.07]"
            to="/"
            aria-label="Return to Command Center"
          >
            <BrandLockup compact showSlogan={false} />
          </Link>
          <p className="p-5 font-semibold">League event not found.</p>
        </div>
      </main>
    );
  }

  const { event, league, myresult: myResult, myrsvp: myRsvp } = data;
  const error = logMutation.error ?? rsvpMutation.error;
  const rsvpStatusLabel = myRsvp?.status === 'going' ? "You're going" : myRsvp?.status === 'not_going' ? "Can't go" : 'RSVP needed';
  const goingCount = Number(data.rsvpcounts?.going ?? 0);
  const notGoingCount = Number(data.rsvpcounts?.notgoing ?? 0);
  const rsvpButtonBase = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-black transition disabled:cursor-wait disabled:opacity-60';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(17,197,193,0.13),transparent_38%),#0d0d10] px-4 py-6 text-white sm:py-10">
      <section className="mx-auto w-full max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-pit-border bg-pit-bg/55 px-4 py-3 sm:px-5">
            <Link
              className="min-w-0 rounded-lg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal"
              to="/"
              aria-label="Return to Command Center"
            >
              <BrandLockup compact showSlogan={false} />
            </Link>
            <button
              type="button"
              className="btn-ghost shrink-0 px-3 py-2 text-xs"
              disabled={isFetching}
              onClick={() => void refetch()}
              title="Refresh knockouts and placements"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <header className="border-b border-pit-border bg-pit-teal/10 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pit-teal">{league.name}</p>
                <h1 className="mt-2 text-2xl font-black sm:text-3xl">{event.name}</h1>
                <p className="mt-2 text-sm text-pit-text">{formatEventSchedule(event.eventdate, event.eventtime)}</p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                event.hasstarted
                  ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                  : 'border-pit-border bg-pit-bg/70 text-pit-text'
              }`}>
                {event.hasstarted ? <Radio size={13} /> : <CalendarClock size={13} />}
                {event.hasstarted ? 'Event live' : 'Scheduled'}
              </span>
              {data.isparticipant && (
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  myRsvp?.status === 'going'
                    ? 'border-emerald-300/35 bg-emerald-400/12 text-emerald-200'
                    : myRsvp?.status === 'not_going'
                      ? 'border-red-300/35 bg-red-400/12 text-red-100'
                      : 'border-pit-gold/45 bg-pit-gold/15 text-pit-gold'
                }`}>
                  <CalendarCheck size={13} />
                  {rsvpStatusLabel}
                </span>
              )}
            </div>
          </header>

          <div className="grid grid-cols-3 border-b border-pit-border bg-pit-bg/45">
            <EventStat label="Event field" value={data.participantcount} />
            <EventStat label="Players left" value={playersRemaining} />
            <EventStat label="Finishes" value={placedResults.length} />
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {error && (
              <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {error.message}
              </p>
            )}

            {!data.isparticipant ? (
              <Notice title="You are not on this season's roster">
                Contact a league admin if you should be participating in this event.
              </Notice>
            ) : myResult ? (
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-center">
                <CheckCircle2 className="mx-auto text-emerald-300" size={34} />
                <p className="mt-3 text-lg font-black text-white">Your finish is recorded</p>
                <p className="mt-1 text-sm text-emerald-100">
                  {myResult.dnf
                    ? 'DNF'
                    : `${myResult.placed}${ordinal(myResult.placed)} place - ${resultPoints(myResult).toLocaleString()} points`}
                </p>
              </div>
            ) : !event.hasstarted ? (
              <Notice title="Knockout reporting opens at event time">
                Come back when play begins. This page will refresh automatically.
              </Notice>
            ) : data.nextplace ? (
              <div className="rounded-2xl border border-red-300/25 bg-red-400/[0.07] p-5 text-center sm:p-6">
                <UserMinus className="mx-auto text-red-300" size={34} />
                <p className="mt-3 text-sm text-pit-text">Just got knocked out?</p>
                <p className="mt-1 text-3xl font-black text-white">Next finish: {data.nextplace}{ordinal(data.nextplace)}</p>
                <button
                  className="mt-5 w-full justify-center rounded-xl bg-red-500 px-4 py-3.5 font-black text-white shadow-lg shadow-red-500/20 transition hover:bg-red-400 disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  disabled={logMutation.isPending || !data.canselflog}
                  onClick={() => logMutation.mutate()}
                >
                  <UserMinus size={18} />
                  {logMutation.isPending ? 'Recording finish...' : `Knock me out in ${data.nextplace}${ordinal(data.nextplace)}`}
                </button>
              </div>
            ) : (
              <Notice title="All finishes are recorded">The event field is complete.</Notice>
            )}

            {data.isparticipant && (
            <div className={`rounded-2xl border p-4 ${
              myRsvp?.status
                ? 'border-pit-border bg-pit-bg/55'
                : 'border-pit-gold/45 bg-pit-gold/[0.08] shadow-[0_18px_46px_rgba(244,178,74,0.12)]'
            }`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pit-gold/35 bg-pit-gold/15 text-pit-gold">
                  <CalendarCheck size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pit-gold">Are you coming?</p>
                  <p className="mt-1 text-sm text-pit-text">
                    {goingCount} going · {notGoingCount} can't go
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${rsvpButtonBase} ${myRsvp?.status === 'going' ? 'border-pit-teal bg-pit-teal text-pit-bg shadow-lg shadow-pit-teal/20' : 'border-pit-teal/45 bg-pit-teal/10 text-pit-teal hover:bg-pit-teal/18'}`}
                  disabled={rsvpMutation.isPending}
                  onClick={() => rsvpMutation.mutate('going')}
                >
                  <CheckCircle2 size={16} />
                  Going
                </button>
                <button
                  type="button"
                  className={`${rsvpButtonBase} ${myRsvp?.status === 'not_going' ? 'border-red-300/45 bg-red-400/20 text-red-100 shadow-inner' : 'border-red-300/30 bg-red-400/8 text-red-200 hover:bg-red-400/15'}`}
                  disabled={rsvpMutation.isPending}
                  onClick={() => rsvpMutation.mutate('not_going')}
                >
                  <XCircle size={16} />
                  Can't go
                </button>
              </div>
            </div>
            )}

            <div className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pit-muted">Recent knockouts</p>
                  <p className="mt-1 text-sm text-pit-text">Latest finishes update automatically.</p>
                </div>
                <span className="chip"><Users size={13} />{placedResults.length}</span>
              </div>
              {placedResults.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-pit-border px-3 py-5 text-center text-sm text-pit-muted">
                  No knockouts logged yet.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-pit-border overflow-hidden rounded-lg border border-pit-border">
                  {placedResults.slice(0, 12).map((result) => (
                    <div key={result.resultid} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-pit-card/65 px-3 py-3">
                      <span className="font-black text-pit-teal">{result.placed}{ordinal(result.placed)}</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-white">{result.displayname ?? 'Player'}</span>
                      <span className="font-mono text-xs font-bold text-pit-text">{resultPoints(result).toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function EventStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-pit-border px-2 py-3 text-center last:border-r-0 sm:py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted sm:text-xs">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-pit-teal/25 bg-pit-teal/[0.07] p-5 text-center">
      <Trophy className="mx-auto text-pit-teal" size={32} />
      <p className="mt-3 text-lg font-black text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-pit-text">{children}</p>
    </div>
  );
}

function resultPoints(result: LeagueResult) {
  return Number(result.points || 0) + Number(result.showupbonuspoints || 0);
}

function formatEventSchedule(dateValue?: string | null, timeValue?: string | null) {
  if (!dateValue) return 'Date and time not set';
  const date = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
  const dateText = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  if (!timeValue) return dateText;
  const [hour, minute] = String(timeValue).slice(0, 5).split(':').map(Number);
  const clock = new Date(2000, 0, 1, hour, minute);
  return `${dateText} at ${clock.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function ordinal(value?: number | null) {
  if (!value) return '';
  if ([11, 12, 13].includes(value % 100)) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
}
