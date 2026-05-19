import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { api, BlindLevel, TournamentPlayer } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';
import { announceTimerPaused, announceTimerStarted, isTimerAudioUnlocked, primeTimerAudio, unlockTimerAudio } from '../../utils/timerAudio';
import { playerNameWithMedals } from '../../utils/playerAchievements';

interface TimerTick {
  remainingsecs: number;
  currentlevel: number;
  running: boolean;
}

interface TimerState extends TimerTick {
  blinds: BlindLevel[];
  tournamentid: string;
}

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

export default function PocketAdminPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const socketRef = useRef<Socket | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const keepAwakeWantedRef = useRef(false);
  const lastRunningRef = useRef<boolean | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLockError, setWakeLockError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => isTimerAudioUnlocked());

  const { data: tournament, isLoading: loadingTournament, error: tournamentError } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
    enabled: !!id,
  });

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    enabled: !!id,
  });

  const canManage = tournament?.canmanage;
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures);
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const checkinMutation = useMutation({
    mutationFn: (userId: string) => api.toggleCheckin(id!, userId),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const rebuyMutation = useMutation({
    mutationFn: (userId: string) => api.addRebuy(id!, userId),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const removeRebuyMutation = useMutation({
    mutationFn: (userId: string) => api.removeRebuy(id!, userId),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const addonMutation = useMutation({
    mutationFn: (userId: string) => api.addAddon(id!, userId),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const genericRebuyMutation = useMutation({
    mutationFn: () => api.addGenericRebuy(id!),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const removeGenericRebuyMutation = useMutation({
    mutationFn: () => api.removeGenericRebuy(id!),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const genericAddonMutation = useMutation({
    mutationFn: () => api.addGenericAddon(id!),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const removeGenericAddonMutation = useMutation({
    mutationFn: () => api.removeGenericAddon(id!),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const removeAddonMutation = useMutation({
    mutationFn: (userId: string) => api.removeAddon(id!, userId),
    onSuccess: () => refreshTournamentData(qc, id!),
  });
  const knockMutation = useMutation({
    mutationFn: ({ userId, placed }: { userId: string; placed: number | null }) => api.knockPlayer(id!, userId, placed),
    onSuccess: () => refreshTournamentData(qc, id!),
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
      setTimerState(state);
      handleTimerRunningCue(state, true);
    });
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimerState((current) => {
        if (!current) return null;
        const nextState = { ...current, ...tick };
        handleTimerRunningCue(nextState);
        return nextState;
      });
    });
    socket.on('tournament-updated', () => {
      refreshTournamentData(qc, id);
    });
    return () => {
      window.removeEventListener('pb-audio-unlocked', syncSoundState);
      socket.disconnect();
    };
  }, [id, qc]);

  useEffect(() => {
    if (!selectedPlayerId && players[0]) {
      setSelectedPlayerId(players[0].userid);
      return;
    }
    if (selectedPlayerId && !players.some((player) => player.userid === selectedPlayerId)) {
      setSelectedPlayerId(players[0]?.userid ?? '');
    }
  }, [players, selectedPlayerId]);

  useEffect(() => {
    if (!wakeLockSupported) return;

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && keepAwakeWantedRef.current) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [wakeLockSupported]);

  useEffect(() => () => {
    void releaseWakeLock();
  }, []);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => {
      if (Boolean(b.checkedin) !== Boolean(a.checkedin)) return Number(b.checkedin) - Number(a.checkedin);
      return (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress);
    }),
    [players]
  );

  const selectedPlayer = sortedPlayers.find((player) => player.userid === selectedPlayerId) ?? null;
  const effectiveBlinds = useMemo(
    () => (timerState?.blinds ?? [])
      .map((blind) => ({
        ...blind,
        level: Number(blind.level),
        smallblind: Number(blind.smallblind),
        bigblind: Number(blind.bigblind),
        ante: Number(blind.ante),
        minutes: Number(blind.minutes),
      }))
      .sort((a, b) => a.level - b.level),
    [timerState]
  );
  const currentBlind = effectiveBlinds.find((blind) => blind.level === Number(timerState?.currentlevel ?? 1)) ?? effectiveBlinds[0];
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const secs = timerState?.remainingsecs ?? ((currentBlind?.minutes ?? 0) * 60);
  const minsStr = String(Math.floor(secs / 60)).padStart(2, '0');
  const secsStr = String(secs % 60).padStart(2, '0');

  function emit(event: string, payload: Record<string, unknown> = {}) {
    socketRef.current?.emit(event, { tournamentId: id, ...payload });
  }

  function handleTimerRunningCue(state: TimerState, initial = false) {
    if (lastRunningRef.current !== state.running) {
      if (!initial && lastRunningRef.current != null) {
        if (state.running) announceTimerStarted();
        else announceTimerPaused();
      }
      lastRunningRef.current = state.running;
    }
  }

  async function enableSound() {
    const unlocked = await unlockTimerAudio({ announce: true });
    setSoundEnabled(unlocked);
  }

  async function warmTimerAudio() {
    const unlocked = await unlockTimerAudio();
    setSoundEnabled(unlocked);
  }

  async function requestWakeLock() {
    try {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock?.request) return;
      const lock = await nav.wakeLock.request('screen');
      wakeLockRef.current = lock;
      keepAwakeWantedRef.current = true;
      setWakeLockEnabled(true);
      setWakeLockError(null);
      lock.addEventListener?.('release', () => {
        setWakeLockEnabled(false);
      });
    } catch (error) {
      setWakeLockEnabled(false);
      setWakeLockError(error instanceof Error ? error.message : 'Wake lock unavailable');
    }
  }

  async function releaseWakeLock() {
    keepAwakeWantedRef.current = false;
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      await wakeLockRef.current.release();
    }
    wakeLockRef.current = null;
    setWakeLockEnabled(false);
  }

  async function toggleWakeLock() {
    if (wakeLockEnabled) {
      await releaseWakeLock();
    } else {
      await requestWakeLock();
    }
  }

  if (loadingTournament || loadingPlayers) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <LoadingSpinner className="mt-24" />
      </div>
    );
  }

  if (tournamentError || !tournament || !canManage) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">Pocket Admin is for tournament admins</h1>
          <p className="mt-2 text-sm text-pit-text">
            {tournamentError instanceof Error ? tournamentError.message : 'You do not have access to this screen.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pit-bg p-3 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <header className="flex items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <Link to={`/tournament/${id}`} className="mb-1 inline-flex items-center gap-1 text-sm text-pit-muted hover:text-white">
              <ChevronLeft size={16} />
              Back
            </Link>
            <p className="text-xs uppercase tracking-[0.24em] text-pit-muted">Pocket Admin</p>
            <h1 className="truncate text-xl font-semibold text-white">{tournament.name}</h1>
          </div>
          {wakeLockSupported && (
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-wide ${
                wakeLockEnabled
                  ? 'border-yellow-300/70 bg-yellow-300/15 text-yellow-200'
                  : 'border-pit-border bg-pit-surface text-pit-text'
              }`}
              onClick={toggleWakeLock}
            >
              {wakeLockEnabled ? 'Awake' : 'Keep Awake'}
            </button>
          )}
        </header>

        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold ${
            soundEnabled
              ? 'border-pit-teal/40 bg-pit-teal/15 text-pit-teal'
              : 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200'
          }`}
          onClick={() => void enableSound()}
        >
          {soundEnabled ? 'Sound On' : 'Enable Sound'}
        </button>

        {wakeLockError && (
          <p className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-xs text-yellow-200">
            Wake lock unavailable: {wakeLockError}
          </p>
        )}

        <section className="card space-y-4 p-3">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-pit-text">
              Level {timerState?.currentlevel ?? currentBlind?.level ?? 1} of {effectiveBlinds.length || 0}
              {!timerState?.running && <span className="ml-2 text-yellow-400">Paused</span>}
            </p>
            <p className="mt-2 font-mono text-7xl font-bold tabular-nums text-white">
              {minsStr}:{secsStr}
            </p>
            {currentBlind && (
              <p className="mt-2 text-sm text-pit-text">
                {currentBlind.smallblind.toLocaleString()} / {currentBlind.bigblind.toLocaleString()}
                {currentBlind.ante > 0 ? ` - Ante ${currentBlind.ante.toLocaleString()}` : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary justify-center" onClick={() => { void warmTimerAudio(); emit(timerState?.running ? 'timer-pause' : 'timer-start'); }}>
              {timerState?.running ? 'Pause' : 'Start'}
            </button>
            <button type="button" className="btn-ghost justify-center" onClick={() => emit('timer-prev')}>
              Prev Level
            </button>
            <button type="button" className="btn-ghost justify-center" onClick={() => emit('timer-adjust', { deltaSeconds: -60 })}>
              -1 Min
            </button>
            <button type="button" className="btn-ghost justify-center" onClick={() => emit('timer-adjust', { deltaSeconds: 60 })}>
              +1 Min
            </button>
            <button type="button" className="btn-ghost justify-center" onClick={() => emit('timer-adjust', { deltaSeconds: -1 })}>
              -1 Sec
            </button>
            <button type="button" className="btn-ghost justify-center" onClick={() => emit('timer-adjust', { deltaSeconds: 1 })}>
              +1 Sec
            </button>
            <button type="button" className="btn-ghost col-span-2 justify-center" onClick={() => emit('timer-next')}>
              Next Level
            </button>
          </div>
        </section>

        <section className="card space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Player Actions</h2>
            <button type="button" className="btn-ghost h-9 w-9 justify-center px-0" onClick={() => refreshTournamentData(qc, id!)}>
              <RefreshCw size={16} />
            </button>
          </div>

          <select
            className="input"
            value={selectedPlayer?.userid ?? ''}
            onChange={(event) => setSelectedPlayerId(event.target.value)}
          >
            {sortedPlayers.map((player) => (
              <option key={player.userid} value={player.userid}>
                {playerNameWithMedals(player)}{seatLabel(player) ? ` - ${seatLabel(player)}` : ''}
              </option>
            ))}
          </select>

          {selectedPlayer && (
            <div className="rounded-lg border border-pit-border bg-pit-bg/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-medium text-white">{playerNameWithMedals(selectedPlayer)}</p>
                {seatLabel(selectedPlayer) && (
                  <span className="shrink-0 rounded-full border border-pit-teal/30 bg-pit-teal/10 px-2 py-0.5 text-[11px] font-semibold text-pit-teal">
                    {seatLabel(selectedPlayer)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-pit-text">
                {selectedPlayer.checkedin ? 'Checked in' : 'Not checked in'}
                {selectedPlayer.placed != null ? ` - finished #${selectedPlayer.placed}` : ''}
                {selectedPlayer.rebuys > 0 ? ` - ${selectedPlayer.rebuys} rebuy` : ''}
                {selectedPlayer.addedon ? ' - add-on used' : ''}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-ghost justify-center"
                  onClick={() => checkinMutation.mutate(selectedPlayer.userid)}
                  disabled={checkinMutation.isPending}
                >
                  {selectedPlayer.checkedin ? 'Undo Check-In' : 'Check In'}
                </button>
                {canUseClubFeatures ? (
                  <>
                    <button
                      type="button"
                      className="btn-ghost justify-center"
                      onClick={() => rebuyMutation.mutate(selectedPlayer.userid)}
                      disabled={!selectedPlayer.checkedin || rebuyMutation.isPending}
                    >
                      Add Rebuy
                    </button>
                    <button
                      type="button"
                      className="btn-ghost justify-center"
                      onClick={() => selectedPlayer.rebuys > 0 && removeRebuyMutation.mutate(selectedPlayer.userid)}
                      disabled={selectedPlayer.rebuys <= 0 || removeRebuyMutation.isPending}
                    >
                      Remove Rebuy
                    </button>
                    <button
                      type="button"
                      className="btn-ghost justify-center"
                      onClick={() => selectedPlayer.addedon ? removeAddonMutation.mutate(selectedPlayer.userid) : addonMutation.mutate(selectedPlayer.userid)}
                      disabled={!selectedPlayer.checkedin || addonMutation.isPending || removeAddonMutation.isPending}
                    >
                      {selectedPlayer.addedon ? 'Undo Add-On' : 'Add Add-On'}
                    </button>
                  </>
                ) : (
                  <>
                    {tournament.rebuyprice > 0 && (
                      <button
                        type="button"
                        className="btn-ghost justify-center"
                        onClick={() => removeGenericRebuyMutation.mutate()}
                        disabled={removeGenericRebuyMutation.isPending || Number(tournament.genericrebuys ?? 0) <= 0}
                      >
                        Rebuy -
                      </button>
                    )}
                    {tournament.rebuyprice > 0 && (
                      <button
                        type="button"
                        className="btn-ghost justify-center"
                        onClick={() => genericRebuyMutation.mutate()}
                        disabled={genericRebuyMutation.isPending}
                      >
                        Rebuy +
                      </button>
                    )}
                    {tournament.addonprice > 0 && (
                      <button
                        type="button"
                        className="btn-ghost justify-center"
                        onClick={() => removeGenericAddonMutation.mutate()}
                        disabled={removeGenericAddonMutation.isPending || Number(tournament.genericaddons ?? 0) <= 0}
                      >
                        Add-On -
                      </button>
                    )}
                    {tournament.addonprice > 0 && (
                      <button
                        type="button"
                        className="btn-ghost justify-center"
                        onClick={() => genericAddonMutation.mutate()}
                        disabled={genericAddonMutation.isPending}
                      >
                        Add Add-On
                      </button>
                    )}
                  </>
                )}
                {selectedPlayer.placed == null ? (
                  <button
                    type="button"
                    className="btn-danger col-span-2 justify-center"
                    onClick={() => knockMutation.mutate({ userId: selectedPlayer.userid, placed: Math.max(activePlayers, 1) })}
                    disabled={!selectedPlayer.checkedin || knockMutation.isPending}
                  >
                    Knockout Player
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost col-span-2 justify-center"
                    onClick={() => knockMutation.mutate({ userId: selectedPlayer.userid, placed: null })}
                    disabled={knockMutation.isPending}
                  >
                    Restore to Field
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {sortedPlayers.map((player) => (
              <button
                key={player.userid}
                type="button"
                onClick={() => setSelectedPlayerId(player.userid)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                  selectedPlayer?.userid === player.userid
                    ? 'border-pit-teal bg-pit-teal/10'
                    : 'border-pit-border bg-pit-bg/40'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-white">{playerNameWithMedals(player)}</p>
                    {seatLabel(player) && (
                      <span className="shrink-0 rounded-full border border-pit-border bg-pit-surface px-1.5 py-0.5 text-[10px] font-semibold text-pit-teal">
                        {seatLabel(player)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-pit-text">
                    {player.checkedin ? 'Checked in' : 'Not checked in'}
                    {player.rebuys > 0 ? ` - ${player.rebuys} rebuy` : ''}
                    {player.addedon ? ' - add-on' : ''}
                  </p>
                </div>
                <span className="text-xs text-pit-muted">{player.placed == null ? 'Active' : `#${player.placed}`}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function refreshTournamentData(qc: ReturnType<typeof useQueryClient>, tournamentId: string) {
  qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
  qc.invalidateQueries({ queryKey: ['players', tournamentId] });
}

function seatLabel(player: Pick<TournamentPlayer, 'tablenumber' | 'seat'>) {
  if (player.tablenumber == null || player.seat == null) return '';
  return `T${player.tablenumber} S${player.seat}`;
}
