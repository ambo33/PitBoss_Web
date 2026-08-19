import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { CalendarClock, RefreshCw, Trophy, UserMinus, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import BrandLockup from '../../components/BrandLockup';
import LeagueLiveResultsTable from '../../components/LeagueLiveResultsTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { api } from '../../api/client';

export default function LeagueGuestKnockoutPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const queryKey = useMemo(() => ['public-league-knockout', token], [token]);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getPublicLeagueKnockout(token!),
    enabled: Boolean(token),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!data?.signedin) return;
    navigate(`/league/${data.league.leagueid}/event/${data.event.eventid}`, { replace: true });
  }, [data, navigate]);

  useEffect(() => {
    if (!data?.event.eventid) return;
    const socket = io('/', { path: '/socket.io' });
    const refresh = () => void qc.invalidateQueries({ queryKey });
    const joinRoom = () => socket.emit('join-league-event', data.event.eventid);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();
    socket.on('league-event-updated', refresh);
    return () => {
      socket.disconnect();
    };
  }, [data?.event.eventid, qc, queryKey]);

  useEffect(() => {
    if (!data?.remainingplayers?.some((player) => player.userid === selectedUserId)) {
      setSelectedUserId('');
    }
  }, [data?.remainingplayers, selectedUserId]);

  const knockoutMutation = useMutation({
    mutationFn: () => api.recordPublicLeagueKnockout(token!, selectedUserId),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (!data) {
    return (
      <main className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-pit-border bg-pit-card p-5 text-center">
          <p className="font-semibold">Knockout station unavailable</p>
          <p className="mt-2 text-sm text-pit-text">Ask the event admin for a new QR code.</p>
        </div>
      </main>
    );
  }

  const selectedPlayer = data.remainingplayers.find((player) => player.userid === selectedUserId) ?? null;
  const error = knockoutMutation.error instanceof Error ? knockoutMutation.error.message : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(17,197,193,0.13),transparent_38%),#0d0d10] px-4 py-6 text-white sm:py-10">
      <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-pit-border bg-pit-card shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-pit-border bg-pit-bg/55 px-4 py-3 sm:px-5">
          <BrandLockup compact showSlogan={false} />
          <button
            type="button"
            className="btn-ghost shrink-0 px-3 py-2 text-xs"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        <div className="border-b border-pit-border bg-pit-teal/10 px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pit-teal">{data.league.name}</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">{data.event.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-pit-text">
            <span className="chip"><Users size={13} />{data.participantcount} in the field</span>
            <span className="chip"><CalendarClock size={13} />{data.event.hasstarted ? 'Event live' : 'Starts soon'}</span>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {error && <p className="rounded-lg border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>}
          {!data.event.hasstarted ? (
            <div className="rounded-2xl border border-pit-teal/25 bg-pit-teal/[0.07] p-5 text-center">
              <CalendarClock className="mx-auto text-pit-teal" size={32} />
              <p className="mt-3 text-lg font-black">Knockout reporting opens at event time</p>
              <p className="mt-1 text-sm text-pit-text">This page will update when the event is live.</p>
            </div>
          ) : data.nextplace && data.remainingplayers.length > 1 ? (
            <div className="rounded-2xl border border-red-300/25 bg-red-400/[0.07] p-5">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-pit-muted">
                Remaining player
                <select
                  className="input mt-2 w-full py-3 text-base"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={knockoutMutation.isPending}
                >
                  <option value="">Choose a player</option>
                  {data.remainingplayers.map((player) => (
                    <option key={player.userid} value={player.userid}>{player.displayname ?? 'Player'}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3.5 font-black text-white shadow-lg shadow-red-500/20 transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedPlayer || knockoutMutation.isPending}
                onClick={() => knockoutMutation.mutate()}
              >
                <UserMinus size={18} />
                {knockoutMutation.isPending ? 'Recording knockout...' : selectedPlayer ? `Record ${selectedPlayer.displayname ?? 'player'} in ${ordinal(data.nextplace)}` : 'Choose a player'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-center">
              <Trophy className="mx-auto text-emerald-300" size={34} />
              <p className="mt-3 text-lg font-black">The event field is complete</p>
            </div>
          )}

          {data.event.hasstarted && (
            <LeagueLiveResultsTable
              finishOptions={(data.remainingfinishes ?? []).map((finish) => ({ place: finish.place, points: finish.placementpoints }))}
              results={data.results}
              nextPlace={data.nextplace}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
}
