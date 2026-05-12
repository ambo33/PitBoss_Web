import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import { api, BlindLevel } from '../../api/client';
import { useAuthStore } from '../../store/auth';

interface TimerTick {
  remainingsecs: number;
  currentlevel: number;
  running: boolean;
}

interface TimerState extends TimerTick {
  blinds: BlindLevel[];
}

function guestStorageKey(tournamentId: string) {
  return `pb_guest_lobby_${tournamentId}`;
}

export default function PlayerLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestUserId, setGuestUserId] = useState(() => {
    if (!id) return '';
    return localStorage.getItem(guestStorageKey(id)) ?? '';
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-lobby', id, guestUserId, user?.guid],
    queryFn: () => api.getPublicLobby(id!, guestUserId || undefined),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const selfCheckinMutation = useMutation({
    mutationFn: () => api.lobbySelfCheckin(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    },
  });

  const guestCheckinMutation = useMutation({
    mutationFn: () => api.lobbyGuestCheckin(id!, { displayname: guestName.trim() }),
    onSuccess: (result) => {
      if (!id) return;
      localStorage.setItem(guestStorageKey(id), result.guestUserId);
      setGuestUserId(result.guestUserId);
      setGuestName('');
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    },
  });

  useEffect(() => {
    if (!id) return;
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', id);
    socket.on('timer-state', (state: TimerState) => setTimer(state));
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimer((current) => (current ? { ...current, ...tick } : null));
    });
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc]);

  const tournament = data?.tournament;
  const field = data?.field;
  const seating = data?.seating ?? [];
  const entry = data?.entry;

  const currentBlind = timer?.blinds.find((blind) => blind.level === timer.currentlevel) ?? timer?.blinds[0];
  const secs = timer?.remainingsecs ?? 0;
  const timeStr = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';

  const tables = useMemo(() => {
    const grouped = new Map<number, typeof seating>();
    for (const seat of seating) {
      const list = grouped.get(seat.tablenumber) ?? [];
      list.push(seat);
      grouped.set(seat.tablenumber, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [seating]);

  function handleSignIn() {
    if (!id) return;
    navigate(`/login?next=${encodeURIComponent(`/lobby/${id}`)}`);
  }

  function handleSelfCheckin() {
    if (!token) {
      handleSignIn();
      return;
    }
    selfCheckinMutation.mutate();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto max-w-5xl py-16 text-center text-pit-text">Loading lobby...</div>
      </div>
    );
  }

  if (error || !tournament || !field) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">Lobby unavailable</h1>
          <p className="mt-2 text-sm text-pit-text">
            {error instanceof Error ? error.message : 'This tournament lobby could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Registered', value: field.registeredcount },
    { label: 'Checked In', value: field.checkedincount },
    { label: 'Still Playing', value: field.activecount },
    { label: 'Total Rebuys', value: field.totalrebuys },
    { label: 'Add-Ons', value: field.totaladdons },
    { label: 'Gross Pot', value: formatMoney(field.grosspot), accent: true },
  ];

  return (
    <div className="min-h-screen bg-pit-bg p-4 text-white">
      <header className="mb-6 text-center">
        <p className="text-sm text-pit-text">PokerPlanner.bet - Tournament Check-In</p>
        <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
        {tournament.groupname && <p className="mt-1 text-sm text-pit-text">{tournament.groupname}</p>}
      </header>

      <div className="mx-auto max-w-5xl space-y-6">
        {currentBlind && (
          <div className="card space-y-3 text-center">
            <p className="text-xs uppercase tracking-wider text-pit-text">
              {currentBlind.label} - Level {timer?.currentlevel}
              {!timer?.running && <span className="ml-2 text-yellow-400">Paused</span>}
            </p>
            <p className={`font-mono text-6xl font-bold tabular-nums ${urgency}`}>{timeStr}</p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-pit-text">
              <span>SB: <strong className="text-white">{currentBlind.smallblind.toLocaleString()}</strong></span>
              <span>BB: <strong className="text-white">{currentBlind.bigblind.toLocaleString()}</strong></span>
              {currentBlind.ante > 0 && (
                <span>Ante: <strong className="text-white">{currentBlind.ante.toLocaleString()}</strong></span>
              )}
            </div>
          </div>
        )}

        <section className="space-y-3">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">Field Status</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((stat) => (
              <LobbyStat key={stat.label} label={stat.label} value={stat.value} accent={stat.accent} />
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Your Check-In</h2>
              <p className="mt-1 text-sm text-pit-text">
                Sign in with your PokerPlanner.bet account, or continue as a guest if you are joining manually.
              </p>
            </div>

            {entry ? (
              <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-4">
                <p className="text-sm font-semibold text-white">{entry.displayname ?? entry.emailaddress ?? 'Guest Player'}</p>
                <p className="mt-1 text-sm text-pit-text">
                  {entry.checkedin ? 'You are checked in.' : 'You are registered for this tournament.'}
                </p>
                {entry.seat != null ? (
                  <p className="mt-3 text-base font-semibold text-pit-teal">Seat: Table {entry.tablenumber}, Seat {entry.seat}</p>
                ) : (
                  <p className="mt-3 text-sm text-pit-text">Seat assignment has not been posted yet.</p>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-4">
                  <p className="text-sm font-semibold text-white">Use your account</p>
                  <p className="mt-1 text-sm text-pit-text">
                    {token
                      ? 'You are signed in. Tap below to register and check in for this tournament.'
                      : 'Sign in first, then your registration and check-in will finish here automatically.'}
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-4"
                    onClick={handleSelfCheckin}
                    disabled={selfCheckinMutation.isPending}
                  >
                    {token
                      ? selfCheckinMutation.isPending ? 'Checking in...' : 'Register + Check In'
                      : 'Sign In to Check In'}
                  </button>
                  {selfCheckinMutation.error && (
                    <p className="mt-3 text-sm text-red-400">{selfCheckinMutation.error.message}</p>
                  )}
                </div>

                {!token && (
                  <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-4">
                    <p className="text-sm font-semibold text-white">Continue as guest</p>
                    <p className="mt-1 text-sm text-pit-text">
                      Enter your name and we&apos;ll add you to the tournament as a guest player.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        className="input flex-1"
                        placeholder="Your name"
                        value={guestName}
                        onChange={(event) => setGuestName(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => guestCheckinMutation.mutate()}
                        disabled={guestCheckinMutation.isPending || !guestName.trim()}
                      >
                        {guestCheckinMutation.isPending ? 'Checking in...' : 'Continue as Guest'}
                      </button>
                    </div>
                    {guestCheckinMutation.error && (
                      <p className="mt-3 text-sm text-red-400">{guestCheckinMutation.error.message}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Seating</h2>
              <p className="mt-1 text-sm text-pit-text">Seat assignments will appear here once the tournament admin posts them.</p>
            </div>

            {tables.length === 0 ? (
              <p className="text-sm text-pit-text">No seats have been assigned yet.</p>
            ) : (
              <div className="space-y-4">
                {tables.map(([tableNum, seats]) => (
                  <div key={tableNum}>
                    <p className="mb-2 text-sm font-semibold text-pit-teal">Table {tableNum}</p>
                    <div className="space-y-1.5">
                      {[...seats].sort((a, b) => a.seat - b.seat).map((seat) => (
                        <div key={seat.userid} className="flex justify-between rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2 text-sm">
                          <span className="text-pit-text">Seat {seat.seat}</span>
                          <span className={`truncate pl-4 ${entry?.userid === seat.userid ? 'font-semibold text-pit-teal' : 'text-white'}`}>
                            {seat.displayname ?? seat.emailaddress}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LobbyStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/50 px-3 py-3 text-center">
      <p className={`text-2xl font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-pit-muted">{label}</p>
    </div>
  );
}

function formatMoney(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}
