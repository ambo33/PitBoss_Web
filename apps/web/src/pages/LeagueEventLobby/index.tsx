import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Trophy, UserMinus, XCircle } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import LoadingSpinner from '../../components/LoadingSpinner';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';

export default function LeagueEventLobbyPage() {
  const { leagueId, eventId } = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [place, setPlace] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.getLeague(leagueId!),
    enabled: Boolean(leagueId),
  });

  const event = useMemo(
    () => data?.events.find((candidate) => candidate.eventid === eventId) ?? null,
    [data, eventId]
  );
  const myResult = useMemo(
    () => data?.results.find((result) => result.eventid === eventId && result.userid === user?.guid) ?? null,
    [data, eventId, user?.guid]
  );
  const myRsvp = useMemo(
    () => data?.rsvps.find((rsvp) => rsvp.eventid === eventId && rsvp.userid === user?.guid) ?? null,
    [data?.rsvps, eventId, user?.guid]
  );
  const eventResults = useMemo(
    () => (data?.results ?? [])
      .filter((result) => result.eventid === eventId && !result.dnf && result.placed != null)
      .sort((a, b) => Number(b.placed || 0) - Number(a.placed || 0)),
    [data?.results, eventId]
  );
  const activePlayerCount = useMemo(
    () => (data?.members ?? []).filter((member) => member.approved && member.participating).length,
    [data?.members]
  );
  const nextOpenPlace = useMemo(() => {
    if (myResult?.placed) return Number(myResult.placed);
    if (!activePlayerCount) return '';
    const usedPlaces = new Set(
      eventResults
        .filter((result) => result.userid !== user?.guid)
        .map((result) => Number(result.placed || 0))
        .filter(Boolean)
    );
    for (let placeValue = activePlayerCount; placeValue >= 1; placeValue -= 1) {
      if (!usedPlaces.has(placeValue)) return String(placeValue);
    }
    return '';
  }, [activePlayerCount, eventResults, myResult?.placed, user?.guid]);

  useEffect(() => {
    if (nextOpenPlace) setPlace(String(nextOpenPlace));
  }, [nextOpenPlace]);

  const logMutation = useMutation({
    mutationFn: () => api.logLeagueSelfResult(leagueId!, eventId!, { placed: Number(place), dnf: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', leagueId] }),
  });
  const rsvpMutation = useMutation({
    mutationFn: (status: 'going' | 'not_going') => api.rsvpLeagueEvent(leagueId!, eventId!, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', leagueId] }),
  });

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (!data || !event) {
    return (
      <main className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto max-w-lg rounded-xl border border-pit-border bg-pit-card p-5">
          <p className="font-semibold">League event not found.</p>
          <Link className="mt-4 inline-flex text-sm text-pit-teal" to="/">Back to app</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-pit-bg px-4 py-8 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-pit-border bg-pit-card p-5 shadow-2xl">
        <BrandLockup compact showSlogan={false} />
        <div className="mt-6 rounded-2xl border border-pit-teal/25 bg-pit-teal/10 p-5 text-center">
          <Trophy className="mx-auto text-pit-teal" size={34} />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-pit-teal">{data.league.name}</p>
          <h1 className="mt-2 text-3xl font-black">{event.name}</h1>
          <p className="mt-2 text-sm text-pit-text">No timer, no board. Just log your finish for league points.</p>
        </div>

        {myResult && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 size={18} />
            <span>
              Logged: {myResult.placed}{ordinal(myResult.placed)} place, {Number(myResult.points || 0) + Number(myResult.showupbonuspoints || 0)} points.
            </span>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-pit-border bg-pit-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pit-muted">RSVP</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`justify-center px-3 py-2 text-sm ${myRsvp?.status === 'going' ? 'btn-primary' : 'btn-ghost'}`}
              disabled={rsvpMutation.isPending}
              onClick={() => rsvpMutation.mutate('going')}
            >
              <CheckCircle2 size={16} />
              Going
            </button>
            <button
              type="button"
              className={`justify-center px-3 py-2 text-sm ${myRsvp?.status === 'not_going' ? 'border-red-300/30 bg-red-400/15 text-red-100 hover:bg-red-400/20' : 'btn-ghost text-red-200'}`}
              disabled={rsvpMutation.isPending}
              onClick={() => rsvpMutation.mutate('not_going')}
            >
              <XCircle size={16} />
              Can't go
            </button>
          </div>
          {myRsvp && (
            <p className="mt-2 text-xs text-pit-muted">
              Saved as {myRsvp.status === 'going' ? 'going' : "can't go"}.
            </p>
          )}
        </div>

        {logMutation.error && (
          <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {logMutation.error.message}
          </p>
        )}
        {rsvpMutation.error && (
          <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {rsvpMutation.error.message}
          </p>
        )}

        <div className="mt-5 space-y-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">I was knocked out in place</span>
            <input
              className="input text-center text-3xl font-black"
              inputMode="numeric"
              placeholder="9"
              value={place}
              onChange={(eventValue) => setPlace(eventValue.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button
            className="btn-primary w-full py-3"
            type="button"
            disabled={logMutation.isPending || !place}
            onClick={() => logMutation.mutate()}
          >
            <UserMinus size={17} />
            {logMutation.isPending ? 'Logging...' : `Knock me out${place ? ` in ${place}${ordinal(Number(place))}` : ''}`}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-pit-border bg-pit-bg/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white">Knockout tracker</h2>
            <span className="chip">{eventResults.length} out</span>
          </div>
          {eventResults.length === 0 ? (
            <p className="mt-3 text-sm text-pit-text">No knockouts logged yet.</p>
          ) : (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {eventResults.map((result) => {
                const points = Number(result.points || 0) + Number(result.showupbonuspoints || 0);
                const isMe = result.userid === user?.guid;
                return (
                  <div
                    key={result.resultid ?? `${result.userid}-${result.placed}`}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                      isMe ? 'border-pit-teal/40 bg-pit-teal/10' : 'border-pit-border bg-pit-card/65'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{result.displayname ?? 'Player'}</p>
                      <p className="mt-1 text-xs text-pit-muted">{result.placed}{ordinal(result.placed)} place</p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold text-pit-teal">{points.toLocaleString()} pts</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Link className="mt-5 inline-flex text-sm text-pit-muted hover:text-white" to="/">
          Back to PokerPlanner
        </Link>
      </section>
    </main>
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
