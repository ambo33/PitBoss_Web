import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import { Volume2 } from 'lucide-react';
import { api, BlindLevel } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { announceFiveMinuteWarning, announceOneMinuteWarning, isTimerAudioUnlocked, primeTimerAudio, unlockTimerAudio } from '../../utils/timerAudio';

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

export default function PlayerLobbyPage({ mode = 'lobby' }: { mode?: 'lobby' | 'checkin' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const lastWarningRef = useRef<{ fiveMin: boolean; oneMin: boolean; level: number | null }>({
    fiveMin: false,
    oneMin: false,
    level: null,
  });
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestUserId, setGuestUserId] = useState(() => {
    if (!id) return '';
    return localStorage.getItem(guestStorageKey(id)) ?? '';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => isTimerAudioUnlocked());

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-lobby', id, guestUserId, user?.guid],
    queryFn: () => api.getPublicLobby(id!, guestUserId || undefined),
    enabled: !!id,
  });

  const tournament = data?.tournament;
  const field = data?.field;
  const entry = data?.entry;
  const activePlayers = data?.activePlayers ?? [];
  const checkInMode = mode === 'checkin';
  const [knockedOutByUserId, setKnockedOutByUserId] = useState('');

  useEffect(() => {
    if (checkInMode && id && entry?.checkedin) {
      navigate(`/lobby/${id}`, { replace: true });
    }
  }, [checkInMode, entry?.checkedin, id, navigate]);

  const selfCheckinMutation = useMutation({
    mutationFn: () => api.lobbySelfCheckin(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
      if (checkInMode && id) navigate(`/lobby/${id}`, { replace: true });
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
      if (checkInMode) navigate(`/lobby/${id}`, { replace: true });
    },
  });

  const guestRecheckinMutation = useMutation({
    mutationFn: () => api.lobbyGuestCheckin(id!, {
      guestUserId,
      displayname: entry?.displayname ?? undefined,
    }),
    onSuccess: (result) => {
      if (!id) return;
      localStorage.setItem(guestStorageKey(id), result.guestUserId);
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
      if (checkInMode) navigate(`/lobby/${id}`, { replace: true });
    },
  });

  const selfRegisterMutation = useMutation({
    mutationFn: () => api.lobbySelfRegister(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    },
  });

  const guestRegisterMutation = useMutation({
    mutationFn: () => api.lobbyGuestRegister(id!, { displayname: guestName.trim() }),
    onSuccess: (result) => {
      if (!id) return;
      localStorage.setItem(guestStorageKey(id), result.guestUserId);
      setGuestUserId(result.guestUserId);
      setGuestName('');
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    },
  });

  const knockoutMutation = useMutation({
    mutationFn: () => api.publicSelfKnockout(id!, {
      guestUserId: guestUserId || undefined,
      knockedOutByUserId: knockedOutByUserId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
      setKnockedOutByUserId('');
    },
  });

  useEffect(() => {
    if (!id) return;
    primeTimerAudio();
    const syncSoundState = () => setSoundEnabled(isTimerAudioUnlocked());
    window.addEventListener('pb-audio-unlocked', syncSoundState);

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    const joinTournament = () => {
      socket.emit('join-tournament', id);
    };
    socket.on('connect', joinTournament);
    if (socket.connected) {
      joinTournament();
    }
    socket.on('timer-state', (state: TimerState) => {
      setTimer(state);
      handleLobbyCues(state, true);
    });
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimer((current) => {
        if (!current) return null;
        const nextState = { ...current, ...tick };
        handleLobbyCues(nextState);
        return nextState;
      });
    });
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    });
    return () => {
      window.removeEventListener('pb-audio-unlocked', syncSoundState);
      socket.disconnect();
    };
  }, [id, qc]);

  async function enableSound() {
    const unlocked = await unlockTimerAudio({ announce: true });
    setSoundEnabled(unlocked);
  }

  function handleLobbyCues(state: TimerState, initial = false) {
    const warningState = lastWarningRef.current;

    if (warningState.level !== state.currentlevel) {
      warningState.level = state.currentlevel;
      warningState.fiveMin = false;
      warningState.oneMin = false;
      if (initial) return;
    }

    if (state.remainingsecs > 300) {
      warningState.fiveMin = false;
      warningState.oneMin = false;
    } else if (state.remainingsecs > 60) {
      warningState.oneMin = false;
    }

    if (state.remainingsecs <= 300 && state.remainingsecs > 60 && !warningState.fiveMin) {
      warningState.fiveMin = true;
      announceFiveMinuteWarning();
    }
    if (state.remainingsecs <= 60 && state.remainingsecs > 0 && !warningState.oneMin) {
      warningState.oneMin = true;
      announceOneMinuteWarning();
    }
  }

  const currentBlind = timer?.blinds.find((blind) => blind.level === timer.currentlevel) ?? timer?.blinds[0];
  const nextBlind = timer?.blinds.find((blind) => blind.level === timer.currentlevel + 1) ?? null;
  const secs = timer?.remainingsecs ?? 0;
  const timeStr = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';
  const timerTone = secs <= 60
    ? 'border-red-400/40 bg-red-500/10 animate-pulse'
    : secs <= 300
      ? 'border-yellow-300/40 bg-yellow-300/10'
      : 'border-pit-border bg-pit-bg/50';

  function handleSignIn() {
    if (!id) return;
    navigate(`/login?next=${encodeURIComponent(checkInMode ? `/checkin/${id}` : `/lobby/${id}`)}`);
  }

  function handleSelfCheckin() {
    if (!token) {
      handleSignIn();
      return;
    }
    selfCheckinMutation.mutate();
  }

  function handleGuestRecheckin() {
    guestRecheckinMutation.mutate();
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
    { label: 'Players Left', value: field.activecount },
    ...(field.checkedincount > 0 ? [{ label: 'Checked In', value: field.checkedincount }] : []),
    ...(tournament.rebuyprice > 0 ? [{ label: 'Rebuys', value: field.totalrebuys }] : []),
    ...(tournament.addonprice > 0 ? [{ label: 'Add-Ons', value: field.totaladdons }] : []),
    { label: 'Prize Pool', value: formatMoney(Math.max(Number(field.grosspot ?? 0) - Number(tournament.rake ?? 0), 0)), accent: true },
  ];
  const payoutPlaces = resolvePaidPlaces(parsePayoutStructure(tournament.payoutstructure), field.checkedincount > 0 ? field.checkedincount : field.registeredcount);
  const payoutSplits = buildDefaultSplits(payoutPlaces);
  const prizePool = Math.max(Number(field.grosspot ?? 0) - Number(tournament.rake ?? 0), 0);
  const payoutAmounts = payoutSplits.map((split) => (prizePool * split) / 100);
  const seatMessage = entry?.placed == null && entry?.seat != null
    ? `PLEASE BE SEATED AT: TABLE ${entry.tablenumber} SEAT ${entry.seat}`
    : 'TABLE SEATS NOT YET ASSIGNED';
  const displayIdentity = entry?.displayname ?? entry?.emailaddress ?? user?.displayname ?? user?.emailaddress ?? (guestUserId ? 'Guest Player' : null);
  const registeredStatus = entry ? 'Registered' : 'Not registered';
  const checkInStatus = entry?.checkedin ? 'Checked in' : entry ? 'Not checked in' : 'Check-in required';

  return (
    <div className="min-h-screen bg-pit-bg p-3 text-white">
      <header className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
        {displayIdentity && <p className="mt-1 text-sm text-pit-text">PokerPlanner.bet - {displayIdentity}</p>}
        {entry && <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-pit-teal">{seatMessage}</p>}
        <button
          type="button"
          className={`mx-auto mt-3 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            soundEnabled
              ? 'border-pit-teal/40 bg-pit-teal/15 text-pit-teal'
              : 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200'
          }`}
          onClick={() => void enableSound()}
        >
          <Volume2 size={14} />
          {soundEnabled ? 'Sound On' : 'Enable Sound'}
        </button>
      </header>

      <div className="mx-auto max-w-md space-y-4">
        <section className="card grid grid-cols-2 gap-2 p-3">
          <LobbyStat label="Registration" value={registeredStatus} />
          <LobbyStat label="Check-In" value={checkInStatus} accent={Boolean(entry?.checkedin)} />
        </section>

        {currentBlind && (
          <div className={`card space-y-3 p-3 text-center ${timerTone}`}>
            <p className="text-xs uppercase tracking-wider text-pit-text">
              Level {timer?.currentlevel} of {timer?.blinds.length ?? 0}
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
            <p className="text-sm text-pit-text">
              {nextBlind
                ? <>Next: <strong className="text-white">{nextBlind.smallblind.toLocaleString()} / {nextBlind.bigblind.toLocaleString()}</strong>{nextBlind.ante > 0 && <> - Ante <strong className="text-white">{nextBlind.ante.toLocaleString()}</strong></>}</>
                : 'Final level'}
            </p>
          </div>
        )}

        {timer?.blinds && timer.blinds.length > 0 && (
          <section className="card space-y-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Blind Structure</h2>
              <span className="text-xs text-pit-muted">{timer.blinds.length} levels</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-pit-border">
              <div className="grid grid-cols-[40px_minmax(0,1fr)_52px] bg-pit-surface/70 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-pit-muted">
                <span>Lvl</span>
                <span>Blinds</span>
                <span>Time</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {timer.blinds
                  .map((blind) => ({
                    ...blind,
                    level: Number(blind.level),
                    smallblind: Number(blind.smallblind),
                    bigblind: Number(blind.bigblind),
                    ante: Number(blind.ante),
                    minutes: Number(blind.minutes),
                  }))
                  .sort((a, b) => a.level - b.level)
                  .map((blind) => {
                    const isCurrent = blind.level === timer.currentlevel;
                    const isNext = nextBlind?.level === blind.level;
                    return (
                      <div
                        key={`${blind.level}-${blind.smallblind}-${blind.bigblind}`}
                        className={`grid grid-cols-[40px_minmax(0,1fr)_52px] items-center border-t px-2 py-1.5 text-xs leading-tight ${
                          isCurrent
                            ? 'border-l-2 border-l-yellow-200 border-t-yellow-200/60 bg-yellow-200/35 text-yellow-950 shadow-[inset_0_0_0_1px_rgba(254,240,138,0.55)]'
                            : isNext
                              ? 'border-pit-border bg-pit-surface/70 text-white'
                              : 'border-pit-border bg-pit-bg/30 text-pit-text'
                        }`}
                      >
                        <span className="font-semibold">{blind.level}</span>
                        <span>
                          {blind.smallblind.toLocaleString()} / {blind.bigblind.toLocaleString()}
                          {blind.ante > 0 ? ` - ${blind.ante.toLocaleString()}` : ''}
                        </span>
                        <span>{blind.minutes}:00</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        <section className="card space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Payout Structure</h2>
            <span className="text-xs font-medium text-pit-muted">{field.activecount} remaining</span>
          </div>

          <div className="grid gap-2 grid-cols-2">
            {stats.map((stat) => (
              <LobbyStat key={stat.label} label={stat.label} value={stat.value} accent={stat.accent} />
            ))}
          </div>

          <div className="space-y-1.5">
            {payoutSplits.map((split, index) => (
              <div key={`${index}-${split}`} className="flex items-center justify-between rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-white">{ordinal(index + 1)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-pit-muted">{split.toFixed(1)}%</p>
                </div>
                <p className="text-sm font-semibold text-pit-teal">{formatMoney(payoutAmounts[index] ?? 0)}</p>
              </div>
            ))}
          </div>
        </section>

        {checkInMode && !entry ? (
          <div className="grid gap-4">
            <section className="card space-y-3 p-3">
              <div>
                <h2 className="text-base font-semibold text-white">Check In</h2>
              </div>

              <>
                <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
                  <p className="text-sm font-semibold text-white">Use your account</p>
                  <p className="mt-1 text-sm text-pit-text">
                    {token
                      ? 'You are signed in. Tap below to register and check in, then we will send you to your player lobby.'
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
                  <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
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
            </section>
          </div>
        ) : !checkInMode && !entry ? (
          <section className="card space-y-3 p-3">
            <h2 className="text-base font-semibold text-white">Player Lobby</h2>
            <p className="text-sm text-pit-text">
              You are not registered for this tournament yet. Register here, then see the host to complete check-in.
            </p>
            {token ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => selfRegisterMutation.mutate()}
                disabled={selfRegisterMutation.isPending}
              >
                {selfRegisterMutation.isPending ? 'Registering...' : 'Register for Tournament'}
              </button>
            ) : (
              <div className="space-y-3">
                <button type="button" className="btn-primary" onClick={handleSignIn}>Sign In to Register</button>
                <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
                  <p className="text-sm font-semibold text-white">Continue as guest</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input flex-1"
                      placeholder="Your name"
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => guestRegisterMutation.mutate()}
                      disabled={guestRegisterMutation.isPending || !guestName.trim()}
                    >
                      {guestRegisterMutation.isPending ? 'Registering...' : 'Register Guest'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {selfRegisterMutation.error && <p className="text-sm text-red-400">{selfRegisterMutation.error.message}</p>}
            {guestRegisterMutation.error && <p className="text-sm text-red-400">{guestRegisterMutation.error.message}</p>}
          </section>
        ) : entry?.placed != null ? (
          <section className="card p-3">
            <p className="text-sm text-pit-text">You have already finished in place #{entry?.placed}.</p>
          </section>
        ) : checkInMode && !entry?.checkedin ? (
          <section className="card space-y-3 p-3">
            <p className="text-sm text-pit-text">You are registered, but not currently checked in.</p>
            {token ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleSelfCheckin}
                disabled={selfCheckinMutation.isPending}
              >
                {selfCheckinMutation.isPending ? 'Checking in...' : 'Check In Again'}
              </button>
            ) : guestUserId ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleGuestRecheckin}
                disabled={guestRecheckinMutation.isPending}
              >
                {guestRecheckinMutation.isPending ? 'Checking in...' : 'Check In Again'}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={handleSignIn}>Sign In to Check In</button>
            )}
            {selfCheckinMutation.error && <p className="text-sm text-red-400">{selfCheckinMutation.error.message}</p>}
            {guestRecheckinMutation.error && <p className="text-sm text-red-400">{guestRecheckinMutation.error.message}</p>}
          </section>
        ) : !checkInMode && !entry?.checkedin ? (
          <section className="card p-3">
            <h2 className="text-base font-semibold text-white">{entry?.displayname ?? entry?.emailaddress ?? 'Player'}</h2>
            <p className="mt-2 text-sm text-pit-text">
              You are registered, but not checked in yet. Please see the host to pay and scan the check-in QR.
            </p>
          </section>
        ) : entry?.checkedin ? (
          <section className="card space-y-3 p-3">
            <div>
              <h2 className="text-base font-semibold text-white">{entry?.displayname ?? entry?.emailaddress ?? 'Player'}</h2>
              <p className="mt-1 text-sm text-pit-text">Still playing. Use this when you are knocked out.</p>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-pit-text">Who knocked you out? (optional)</span>
              <select
                className="input"
                value={knockedOutByUserId}
                onChange={(event) => setKnockedOutByUserId(event.target.value)}
              >
                <option value="">No selection</option>
                {activePlayers.map((player) => (
                  <option key={player.userid} value={player.userid}>
                    {player.displayname ?? player.emailaddress}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-danger"
              onClick={() => knockoutMutation.mutate()}
              disabled={knockoutMutation.isPending}
            >
              {knockoutMutation.isPending ? 'Reporting...' : 'I Have Been Knocked Out'}
            </button>
            {knockoutMutation.error && <p className="text-sm text-red-400">{knockoutMutation.error.message}</p>}
          </section>
        ) : null}
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
    <div className="rounded-lg border border-pit-border bg-pit-bg/50 px-3 py-2 text-center">
      <p className={`text-lg font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-pit-muted">{label}</p>
    </div>
  );
}

function formatMoney(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

type PayoutMode = 'count' | 'percent';

interface PayoutStructureConfig {
  mode: PayoutMode;
  value: number;
}

function parsePayoutStructure(value: string | null | undefined): PayoutStructureConfig {
  if (!value) return { mode: 'count', value: 3 };
  try {
    const parsed = JSON.parse(value) as Partial<PayoutStructureConfig>;
    if (parsed.mode !== 'count' && parsed.mode !== 'percent') {
      return { mode: 'count', value: 3 };
    }
    return {
      mode: parsed.mode,
      value: sanitizePayoutValue(parsed.mode, Number(parsed.value)),
    };
  } catch {
    return { mode: 'count', value: 3 };
  }
}

function sanitizePayoutValue(mode: PayoutMode, value: number): number {
  if (mode === 'percent') return clamp(Math.round(value), 1, 100);
  return Math.max(1, Math.round(value));
}

function resolvePaidPlaces(config: PayoutStructureConfig, fieldSize: number): number {
  if (config.mode === 'percent') {
    if (fieldSize <= 0) return 1;
    return clamp(Math.ceil((fieldSize * sanitizePayoutValue('percent', config.value)) / 100), 1, fieldSize);
  }
  const requested = sanitizePayoutValue('count', config.value);
  if (fieldSize <= 0) return requested;
  return clamp(requested, 1, fieldSize);
}

const DEFAULT_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 17, 11, 7],
  6: [37, 23, 16, 11, 8, 5],
};

function buildDefaultSplits(count: number): number[] {
  const normalizedCount = Math.max(1, count);
  if (DEFAULT_SPLITS[normalizedCount]) {
    return [...DEFAULT_SPLITS[normalizedCount]];
  }
  const weights = Array.from({ length: normalizedCount }, (_unused, index) => normalizedCount - index);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => roundToTenth((weight / totalWeight) * 100));
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
