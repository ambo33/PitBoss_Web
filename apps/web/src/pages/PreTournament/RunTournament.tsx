import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { ChevronDown, ChevronUp, Volume2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, BlindLevel, Tournament, TournamentPlayer } from '../../api/client';
import { featureFlags } from '../../features';
import { useAuthStore } from '../../store/auth';
import { announceCheckinGreeting, announceFiveMinuteWarning, announceLevel, announceOneMinuteWarning, isTimerAudioUnlocked, playCheckinGreetingClip, playLevelChangeTone, primeTimerAudio, unlockTimerAudio } from '../../utils/timerAudio';

interface TimerTick {
  remainingsecs: number;
  currentlevel: number;
  running: boolean;
}

interface TimerState extends TimerTick {
  blinds: BlindLevel[];
  tournamentid: string;
}

type PayoutMode = 'count' | 'percent';

interface PayoutStructureConfig {
  mode: PayoutMode;
  value: number;
}

interface GreetingQueueItem {
  id: string;
  name: string;
  audioDataUrl?: string | null;
  avatarImageUrl?: string | null;
}

export default function RunTournament({
  tournamentId,
  isOwner,
  tournament,
  players,
  mode = 'admin',
  queryKeysToRefresh,
}: {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
  players: TournamentPlayer[];
  mode?: 'admin' | 'display' | 'tv';
  queryKeysToRefresh?: unknown[][];
}) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const socketRef = useRef<Socket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [activeGreeting, setActiveGreeting] = useState<GreetingQueueItem | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => isTimerAudioUnlocked());
  const lastWarningRef = useRef<{ fiveMin: boolean; oneMin: boolean; level: number | null }>({
    fiveMin: false,
    oneMin: false,
    level: null,
  });
  const seenCheckedInRef = useRef<Set<string> | null>(null);
  const greetingQueueRef = useRef<GreetingQueueItem[]>([]);
  const greetingTimeoutRef = useRef<number | null>(null);

  const showAdminControls = isOwner && mode === 'admin';
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures);
  const tvMode = mode === 'tv';
  const displayMode = mode === 'display' || tvMode;
  const tvGreetingDisplayEnabled = tournament.tvgreetingdisplayenabled ?? true;
  const tvGreetingAudioEnabled = tournament.tvgreetingaudioenabled ?? true;
  const showKnockoutQr = mode === 'admin' || (displayMode && (tournament.tvshowknockoutqrenabled ?? true));

  const refreshTournamentData = () => {
    if (queryKeysToRefresh?.length) {
      queryKeysToRefresh.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      return;
    }
    qc.invalidateQueries({ queryKey: ['players', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
  };

  const rebuyMutation = useMutation({
    mutationFn: (userId: string) => api.addRebuy(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });
  const addonMutation = useMutation({
    mutationFn: (userId: string) => api.addAddon(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });
  const genericRebuyMutation = useMutation({
    mutationFn: () => api.addGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericRebuyMutation = useMutation({
    mutationFn: () => api.removeGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const genericAddonMutation = useMutation({
    mutationFn: () => api.addGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericAddonMutation = useMutation({
    mutationFn: () => api.removeGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const checkinMutation = useMutation({
    mutationFn: (userId: string) => api.toggleCheckin(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });

  useEffect(() => {
    primeTimerAudio();
    const syncSoundState = () => setSoundEnabled(isTimerAudioUnlocked());
    window.addEventListener('pb-audio-unlocked', syncSoundState);

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    const joinTournament = () => {
      socket.emit('join-tournament', tournamentId);
    };
    socket.on('connect', joinTournament);
    if (socket.connected) {
      joinTournament();
    }
    socket.on('timer-state', (state: TimerState) => {
      setTimerState(state);
      handleTimerCues(state, true);
    });
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimerState((current) => {
        if (!current) return null;
        const nextState = { ...current, ...tick };
        handleTimerCues(nextState);
        return nextState;
      });
    });
    socket.on('tournament-updated', () => {
      refreshTournamentData();
    });
    return () => {
      window.removeEventListener('pb-audio-unlocked', syncSoundState);
      socket.disconnect();
    };
  }, [qc, tournamentId]);

  useEffect(() => {
    if (!displayMode) return;

    const checkedInPlayers = players
      .filter((player) => player.checkedin && player.placed == null)
      .map((player) => ({
        id: player.userid,
        name: player.displayname ?? player.emailaddress ?? 'Player',
        audioDataUrl: player.checkinaudiodata ?? null,
        avatarImageUrl: player.avatarimagedata ?? null,
      }));
    const currentSet = new Set(checkedInPlayers.map((player) => player.id));
    const previousSet = seenCheckedInRef.current;

    if (previousSet) {
      checkedInPlayers
        .filter((player) => !previousSet.has(player.id))
        .forEach((player) => {
          if (tvGreetingAudioEnabled || tvGreetingDisplayEnabled) {
            greetingQueueRef.current.push(player);
            setActiveGreeting((current) => current ?? greetingQueueRef.current.shift() ?? null);
          }
        });
    }

    seenCheckedInRef.current = currentSet;
  }, [displayMode, players, tournament.name, tvGreetingAudioEnabled, tvGreetingDisplayEnabled]);

  useEffect(() => {
    if (!activeGreeting && greetingQueueRef.current.length > 0) {
      setActiveGreeting(greetingQueueRef.current.shift() ?? null);
    }
  }, [activeGreeting, players]);

  useEffect(() => {
    if (!activeGreeting) return;

    if (tvGreetingAudioEnabled) {
      if (activeGreeting.audioDataUrl) {
        playCheckinGreetingClip(activeGreeting.audioDataUrl);
      } else {
        announceCheckinGreeting(activeGreeting.name);
      }
    }

    greetingTimeoutRef.current = window.setTimeout(() => {
      setActiveGreeting(null);
    }, tvGreetingDisplayEnabled ? 5000 : 250);

    return () => {
      if (greetingTimeoutRef.current) {
        window.clearTimeout(greetingTimeoutRef.current);
      }
    };
  }, [activeGreeting, tvGreetingAudioEnabled, tvGreetingDisplayEnabled]);

  const actionablePlayers = useMemo(
    () => [...players]
      .filter((player) => player.placed == null)
      .sort((a, b) => {
        if (Boolean(b.checkedin) !== Boolean(a.checkedin)) return Number(b.checkedin) - Number(a.checkedin);
        return (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress);
      }),
    [players]
  );

  const selectedPlayer = actionablePlayers.find((player) => player.userid === selectedPlayerId) ?? actionablePlayers[0] ?? null;
  const selectedPlayerLabel = selectedPlayer ? (selectedPlayer.displayname ?? selectedPlayer.emailaddress) : 'No active players';
  const longestPlayerLabelLength = actionablePlayers.reduce((max, player) => {
    const label = player.displayname ?? player.emailaddress;
    return Math.max(max, label.length);
  }, selectedPlayerLabel.length);
  const playerSelectWidth = clamp((longestPlayerLabelLength * 8) + 56, 190, 360);

  useEffect(() => {
    if (!selectedPlayerId && actionablePlayers[0]) {
      setSelectedPlayerId(actionablePlayers[0].userid);
      return;
    }
    if (selectedPlayerId && !actionablePlayers.some((player) => player.userid === selectedPlayerId)) {
      setSelectedPlayerId(actionablePlayers[0]?.userid ?? '');
    }
  }, [actionablePlayers, selectedPlayerId]);

  useEffect(() => () => {
    if (greetingTimeoutRef.current) {
      window.clearTimeout(greetingTimeoutRef.current);
    }
  }, []);

  function emit(event: string, payload: Record<string, unknown> = {}) {
    socketRef.current?.emit(event, { tournamentId, ...payload });
  }

  async function enableSound() {
    const unlocked = await unlockTimerAudio({ announce: true });
    setSoundEnabled(unlocked);
  }

  function handleTimerCues(state: TimerState, initial = false) {
    const warningState = lastWarningRef.current;

    if (warningState.level !== state.currentlevel) {
      if (!initial && warningState.level != null) {
        const announcedBlind = state.blinds.find((blind) => Number(blind.level) === Number(state.currentlevel));
        if (announcedBlind) {
          playLevelChangeTone();
          announceLevel(state.currentlevel, announcedBlind.smallblind, announcedBlind.bigblind);
        }
      }
      warningState.level = state.currentlevel;
      warningState.fiveMin = false;
      warningState.oneMin = false;
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

  const effectiveBlinds = (timerState?.blinds ?? [])
    .map((blind) => ({
      ...blind,
      level: Number(blind.level),
      smallblind: Number(blind.smallblind),
      bigblind: Number(blind.bigblind),
      ante: Number(blind.ante),
      minutes: Number(blind.minutes),
    }))
    .sort((a, b) => a.level - b.level);
  const effectiveLevel = Number(timerState?.currentlevel ?? effectiveBlinds[0]?.level ?? 1);
  const currentBlindIndex = Math.max(effectiveBlinds.findIndex((blind) => blind.level === effectiveLevel), 0);
  const currentBlind = effectiveBlinds[currentBlindIndex] ?? effectiveBlinds[0];
  const nextBlind = effectiveBlinds[currentBlindIndex + 1] ?? null;
  const displayedLevel = currentBlind ? currentBlindIndex + 1 : 1;
  const secs = timerState?.remainingsecs ?? (currentBlind?.minutes ?? 0) * 60;
  const mins = Math.floor(secs / 60);
  const sec = secs % 60;
  const minsStr = String(mins).padStart(2, '0');
  const secsStr = String(sec).padStart(2, '0');
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';
  const timerTone = secs <= 60
    ? 'border-red-400/40 bg-red-500/10 animate-pulse'
    : secs <= 300
      ? 'border-yellow-300/40 bg-yellow-300/10'
      : 'border-pit-border bg-pit-bg/50';
  const playerLobbyUrl = `${window.location.origin}/lobby/${tournamentId}`;

  const checkedIn = players.filter((player) => player.checkedin).length;
  const registeredCount = players.length;
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const enteredFieldCount = players.filter((player) => player.checkedin || player.placed != null).length;
  const fieldSize = enteredFieldCount > 0 ? enteredFieldCount : registeredCount;
  const payoutPlaces = resolvePaidPlaces(parsePayoutStructure(tournament.payoutstructure), fieldSize);
  const payoutSplits = buildDefaultSplits(payoutPlaces);
  const grossPot = (toNumber(tournament.buyin) * checkedIn)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const totalPot = Math.max(grossPot - toNumber(tournament.rake), 0);
  const payouts = payoutSplits.map((pct) => (totalPot * pct) / 100);
  const paidFinishers = useMemo(
    () => players
      .filter((player) => player.placed != null && (player.placed ?? 999) <= payoutPlaces)
      .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999)),
    [players, payoutPlaces]
  );
  const knockoutLeader = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const player of players) {
      if (!player.knockedoutbyuserid || !player.knockedoutbyname) continue;
      const current = counts.get(player.knockedoutbyuserid) ?? { name: player.knockedoutbyname, count: 0 };
      current.count += 1;
      counts.set(player.knockedoutbyuserid, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [players]);
  const confettiPieces = useMemo(
    () => Array.from({ length: 26 }, (_, index) => ({
      id: `piece-${index}`,
      left: `${3 + ((index * 91) % 94)}%`,
      delay: `${(index % 7) * 0.07}s`,
      duration: `${3 + (index % 5) * 0.22}s`,
      rotation: `${((index * 39) % 90) - 45}deg`,
      color: ['#22d3ee', '#fde047', '#f97316', '#f472b6', '#a78bfa', '#34d399'][index % 6],
    })),
    []
  );
  const summaryStats = [
    { label: 'Players Left', value: activePlayers },
    { label: 'Checked In', value: checkedIn },
    ...(tournament.rebuyprice > 0 ? [{ label: 'Rebuys', value: totalRebuys }] : []),
    ...(tournament.addonprice > 0 ? [{ label: 'Add-Ons', value: totalAddons }] : []),
    { label: 'Net Pot', value: formatMoney(totalPot), accent: true },
    ...(knockoutLeader ? [{ label: 'Knockout Leader', value: `${knockoutLeader.name} (${knockoutLeader.count})` }] : []),
  ];
  const seatedPlayers = useMemo(
    () => players
      .filter((player) => player.tablenumber != null && player.seat != null && player.placed == null)
      .sort((a, b) => {
        const tableDelta = Number(a.tablenumber ?? 0) - Number(b.tablenumber ?? 0);
        if (tableDelta !== 0) return tableDelta;
        return Number(a.seat ?? 0) - Number(b.seat ?? 0);
      }),
    [players]
  );
  const showTvSeating = tvMode && !timerState?.running;

  return (
    <div className="space-y-4">
      <div
        ref={screenRef}
        className={`relative overflow-hidden space-y-3 ${
          displayMode
            ? 'p-1 md:p-1.5 xl:p-2'
            : 'p-0'
        }`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 ${displayMode ? 'min-h-0' : ''}`}>
          {showAdminControls ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input py-1.5 pr-8 text-sm"
                style={{ width: `${playerSelectWidth}px` }}
                value={selectedPlayer?.userid ?? ''}
                onChange={(event) => setSelectedPlayerId(event.target.value)}
              >
                {actionablePlayers.length === 0 ? (
                  <option value="">No active players</option>
                ) : (
                  actionablePlayers.map((player) => (
                    <option key={player.userid} value={player.userid}>
                      {player.displayname ?? player.emailaddress}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => selectedPlayer && checkinMutation.mutate(selectedPlayer.userid)}
                disabled={!selectedPlayer || checkinMutation.isPending}
              >
                {selectedPlayer?.checkedin ? 'Undo Check-In' : 'Check In'}
              </button>
              {canUseClubFeatures ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => selectedPlayer && rebuyMutation.mutate(selectedPlayer.userid)}
                    disabled={!selectedPlayer || !selectedPlayer.checkedin || rebuyMutation.isPending}
                  >
                    Rebuy
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => selectedPlayer && addonMutation.mutate(selectedPlayer.userid)}
                    disabled={!selectedPlayer || selectedPlayer.addedon || addonMutation.isPending}
                  >
                    {selectedPlayer?.addedon ? 'Add-On Used' : 'Add-On'}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div />
          )}

          {(showAdminControls || displayMode) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  soundEnabled
                    ? 'border-pit-teal/40 bg-pit-teal/15 text-pit-teal'
                    : 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200'
                }`}
                onClick={() => void enableSound()}
              >
                <Volume2 size={14} />
                {soundEnabled ? 'Sound On' : 'Enable Sound'}
              </button>
              {showAdminControls && featureFlags.tvBoard && tournament.tvdisplaycode && (
                <div className="rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2 text-right">
                  <p className="text-sm text-white">
                    <span className="mr-2 text-[11px] uppercase tracking-[0.2em] text-pit-muted">TV</span>
                    <span className="font-mono font-semibold tracking-[0.24em]">{tournament.tvdisplaycode ?? 'UNAVAILABLE'}</span>
                    <span className="ml-2 text-[11px] text-pit-muted">/tv</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {currentBlind ? (
          <>
            <div className={`grid items-start ${tvMode ? 'grid-cols-[248px_minmax(0,1fr)_248px] gap-3 2xl:grid-cols-[260px_minmax(0,1fr)_260px]' : displayMode ? 'grid-cols-[300px_minmax(0,1fr)_300px] gap-4 2xl:grid-cols-[320px_minmax(0,1fr)_320px]' : 'gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[240px_minmax(0,1fr)_240px]'}`}>
              <section className={`rounded-xl border border-pit-border bg-pit-bg/60 ${tvMode ? 'p-3' : displayMode ? 'p-4' : 'p-3'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={`${displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Structure</h3>
                  <span className={`${displayMode ? 'text-sm' : 'text-xs'} text-pit-muted`}>{effectiveBlinds.length} levels</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-pit-border">
                  <div className={`grid grid-cols-[42px_minmax(0,1fr)_52px] bg-pit-surface/70 px-2 py-1.5 font-semibold uppercase tracking-wide text-pit-muted ${displayMode ? 'text-xs' : 'text-[10px]'}`}>
                    <span>Level</span>
                    <span>Blinds</span>
                    <span>Time</span>
                  </div>
                  <div className={`${tvMode ? 'max-h-[40rem]' : displayMode ? 'max-h-[48rem]' : 'max-h-[34rem]'} overflow-y-auto`}>
                    {effectiveBlinds.map((blind) => {
                      const isCurrent = blind.level === effectiveLevel;
                      const isNext = nextBlind?.level === blind.level;
                      return (
                        <div
                          key={blind.id}
                          className={`grid grid-cols-[42px_minmax(0,1fr)_52px] items-center border-t px-2 py-1.5 leading-tight ${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} ${
                            isCurrent
                              ? 'border-l-2 border-l-yellow-200 border-t-yellow-200/60 bg-yellow-200/35 text-yellow-950 shadow-[inset_0_0_0_1px_rgba(254,240,138,0.55)]'
                              : isNext
                                ? 'border-pit-border bg-pit-surface/70 text-white'
                                : 'border-pit-border bg-pit-bg/30 text-pit-text'
                          }`}
                        >
                          <span className="font-semibold">{blind.level}</span>
                          <span>{blind.smallblind.toLocaleString()} / {blind.bigblind.toLocaleString()}{blind.ante > 0 ? ` - ${blind.ante.toLocaleString()}` : ''}</span>
                          <span>{blind.minutes}:00</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className={`min-w-0 ${displayMode ? 'space-y-3' : 'space-y-4'}`}>
                {showTvSeating ? (
                  <TvSeatingBoard players={seatedPlayers} />
                ) : (
                <div className={`rounded-xl border text-center ${tvMode ? 'px-3 py-3' : displayMode ? 'px-4 py-4' : 'px-3 py-4'} ${timerTone}`}>
                  {showAdminControls && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-pressed={showAdjustments}
                        className={`px-3 py-1.5 text-xs transition-none ${
                          showAdjustments
                            ? 'rounded-lg border border-yellow-300/70 bg-yellow-300/20 font-semibold text-yellow-200'
                            : 'btn-ghost text-pit-muted'
                        }`}
                        onClick={() => setShowAdjustments((current) => !current)}
                      >
                        Adjust Timer
                      </button>
                      {timerState?.running
                        ? <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => { void enableSound(); emit('timer-pause'); }}>Pause</button>
                        : <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => { void enableSound(); emit('timer-start'); }}>Start</button>
                      }
                    </div>
                  )}
                  <p className={`${displayMode ? 'text-sm md:text-base' : 'text-xs md:text-sm'} font-medium uppercase tracking-[0.22em] text-pit-text`}>
                    Level {displayedLevel} of {effectiveBlinds.length}
                    {!timerState?.running && <span className="ml-3 text-yellow-400">Paused</span>}
                  </p>
                  <div className="mt-2.5 flex items-center justify-center gap-2 md:gap-3">
                    {showAdminControls && showAdjustments && (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: 60 })}
                          aria-label="Add one minute"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: -60 })}
                          aria-label="Subtract one minute"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                    )}
                    <div
                      className={`flex items-center leading-none ${urgency} ${
                        tvMode
                          ? 'font-mono font-bold tabular-nums tracking-tight'
                          : showAdjustments
                            ? 'font-sans font-[300] tabular-nums tracking-tight text-[6.8rem] md:text-[9.5rem] lg:text-[10.4rem] xl:text-[11.2rem]'
                            : displayMode
                              ? 'font-sans font-[300] tabular-nums tracking-tight text-[10.75rem] md:text-[14.5rem] lg:text-[16.75rem] xl:text-[17.75rem]'
                              : 'font-mono font-bold tabular-nums text-[8.5rem] md:text-[12rem] lg:text-[12.9rem] xl:text-[13.8rem]'
                      }`}
                      style={tvMode
                        ? { fontSize: showAdjustments ? 'clamp(6.8rem, 11vw, 10.4rem)' : 'clamp(9.2rem, 14.4vw, 13.8rem)' }
                        : undefined}
                    >
                      <span>{minsStr}</span>
                      <span className="-mx-[0.08em]">:</span>
                      <span>{secsStr}</span>
                    </div>
                    {showAdminControls && showAdjustments && (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: 1 })}
                          aria-label="Add one second"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: -1 })}
                          aria-label="Subtract one second"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`mt-2 grid gap-2 ${displayMode ? 'grid-cols-2 xl:gap-3' : 'md:grid-cols-2'}`}>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-3 py-3' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Current Blinds</p>
                      <p
                        style={tvMode
                          ? {
                              fontSize: currentBlind.ante > 0 ? 'clamp(1.55rem, 3vw, 2.35rem)' : 'clamp(1.95rem, 3.8vw, 2.8rem)',
                              fontWeight: 700,
                              letterSpacing: '-0.045em',
                            }
                          : undefined}
                        className={`mt-1 font-bold leading-none text-white ${
                          tvMode
                            ? 'font-mono tabular-nums'
                            : currentBlind.ante > 0
                              ? 'font-sans font-[300] tracking-tight text-[2.5rem] md:text-[3.15rem] xl:text-[3.55rem]'
                              : 'font-sans font-[300] tracking-tight text-[3rem] md:text-[3.65rem] xl:text-[4.15rem]'
                        }`}
                      >
                        {currentBlind.smallblind.toLocaleString()} / {currentBlind.bigblind.toLocaleString()}
                      </p>
                      {currentBlind.ante > 0 && (
                        <p className="mt-1 text-sm text-pit-text md:text-base">Ante {currentBlind.ante.toLocaleString()}</p>
                      )}
                    </div>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-3 py-3' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Next Blinds</p>
                      {nextBlind ? (
                        <>
                          <p
                        style={tvMode
                          ? {
                                  fontSize: nextBlind.ante > 0 ? 'clamp(1.55rem, 3vw, 2.35rem)' : 'clamp(1.95rem, 3.8vw, 2.8rem)',
                                  fontWeight: 700,
                                  letterSpacing: '-0.045em',
                                }
                              : undefined}
                            className={`mt-1 font-bold leading-none text-white ${
                              tvMode
                                ? 'font-mono tabular-nums'
                                : nextBlind.ante > 0
                                  ? 'font-sans font-[300] tracking-tight text-[2.5rem] md:text-[3.15rem] xl:text-[3.55rem]'
                                  : 'font-sans font-[300] tracking-tight text-[3rem] md:text-[3.65rem] xl:text-[4.15rem]'
                            }`}
                          >
                            {nextBlind.smallblind.toLocaleString()} / {nextBlind.bigblind.toLocaleString()}
                          </p>
                          {nextBlind.ante > 0 && (
                            <p className="mt-1 text-sm text-pit-text md:text-base">Ante {nextBlind.ante.toLocaleString()}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className={`mt-1.5 font-bold leading-none text-white ${tvMode ? 'text-[1.55rem] xl:text-[1.9rem]' : 'text-[2rem] md:text-[2.5rem] xl:text-[2.9rem]'}`}>Final Level</p>
                          <p className={`mt-1.5 text-pit-text ${tvMode ? 'text-sm xl:text-base' : 'text-base md:text-lg'}`}>No further increase</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                )}

                {showAdminControls && showAdjustments && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-prev')}>Prev</button>
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-next')}>Next</button>
                  </div>
                )}

                <div className="grid gap-2 xl:grid-cols-1">
                  <div className={`grid gap-2 ${displayMode ? 'grid-cols-3' : 'sm:grid-cols-3'}`}>
                    {summaryStats.map((stat) => {
                      const canAdjustRebuys = showAdminControls && !canUseClubFeatures && stat.label === 'Rebuys';
                      const canAdjustAddons = showAdminControls && !canUseClubFeatures && stat.label === 'Add-Ons';
                      const canAdjust = canAdjustRebuys || canAdjustAddons;
                      return (
                        <div key={stat.label} className={`rounded-lg border border-pit-border bg-pit-bg/50 text-center ${tvMode ? 'px-2 py-1.5' : displayMode ? 'px-2 py-2.5' : 'px-2.5 py-3'}`}>
                          <p className={`${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>{stat.label}</p>
                          {canAdjust ? (
                            <div className="mt-1 flex items-center justify-center gap-2">
                              <button
                                type="button"
                                className="btn-ghost h-7 w-7 justify-center px-0 text-sm"
                                onClick={() => canAdjustRebuys ? removeGenericRebuyMutation.mutate() : removeGenericAddonMutation.mutate()}
                                disabled={
                                  canAdjustRebuys
                                    ? removeGenericRebuyMutation.isPending || toNumber(tournament.genericrebuys) <= 0
                                    : removeGenericAddonMutation.isPending || toNumber(tournament.genericaddons) <= 0
                                }
                                aria-label={`Remove one ${stat.label.toLowerCase()}`}
                              >
                                -
                              </button>
                              <p className={`${tvMode ? 'text-sm xl:text-base' : displayMode ? 'text-base md:text-lg' : 'text-base'} min-w-8 font-semibold text-white`}>{stat.value}</p>
                              <button
                                type="button"
                                className="btn-ghost h-7 w-7 justify-center px-0 text-sm"
                                onClick={() => canAdjustRebuys ? genericRebuyMutation.mutate() : genericAddonMutation.mutate()}
                                disabled={canAdjustRebuys ? genericRebuyMutation.isPending : genericAddonMutation.isPending}
                                aria-label={`Add one ${stat.label.toLowerCase()}`}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <p className={`mt-1 ${tvMode ? 'text-sm xl:text-base' : displayMode ? 'text-base md:text-lg' : 'text-base'} font-semibold ${'accent' in stat && stat.accent ? 'text-pit-teal' : 'text-white'}`}>{stat.value}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className={`space-y-2.5 ${displayMode ? 'pt-1' : ''}`}>
                {showKnockoutQr && (
                  <div className={`rounded-xl border border-pit-border bg-pit-bg/60 text-center ${tvMode ? 'p-1.5' : 'p-2.5'}`}>
                    <div className="mb-1 text-white">
                      <p className={`${tvMode ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-wide`}>Open Player Lobby</p>
                    </div>
                    <div className={`inline-block rounded-md bg-white ${tvMode ? 'p-0.5' : 'p-1.5'}`}>
                      <QRCodeSVG value={playerLobbyUrl} size={tvMode ? 58 : 88} />
                    </div>
                  </div>
                )}
                <div className={`rounded-xl border border-pit-border bg-pit-bg/60 ${tvMode ? 'p-2.5' : displayMode ? 'p-4' : 'p-3'}`}>
                  <div className="mb-2">
                    <h3 className={`${tvMode ? 'text-sm' : displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Payout Structure</h3>
                    <p className={`${tvMode ? 'text-[11px]' : displayMode ? 'text-sm' : 'text-xs'} text-pit-muted`}>
                      Paying {payoutPlaces} of {fieldSize || registeredCount || 0}
                    </p>
                  </div>

                  <div className={`mb-2 rounded-lg border border-pit-border bg-pit-bg/40 text-center ${tvMode ? 'px-2 py-1.5' : displayMode ? 'px-3 py-3' : 'px-2.5 py-2'}`}>
                    <p className={`${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>Prize Pool</p>
                    <p className={`${tvMode ? 'text-base' : displayMode ? 'text-xl' : 'text-base'} font-semibold text-pit-teal`}>{formatMoney(totalPot)}</p>
                  </div>

                  <div className={`${tvMode ? 'max-h-[40rem] space-y-1' : displayMode ? 'max-h-[48rem] space-y-1.5' : 'max-h-[26rem] space-y-1.5'} overflow-y-auto pr-1`}>
                    {payoutSplits.map((split, index) => {
                      const finisher = paidFinishers.find((player) => player.placed === index + 1);
                      return (
                        <div key={`${index}-${split}`} className={`flex items-center justify-between gap-2 rounded-lg border border-pit-border bg-pit-surface/40 ${tvMode ? 'px-2 py-1 text-xs' : displayMode ? 'px-3 py-2 text-base' : 'px-2.5 py-1.5 text-sm'}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-semibold text-white">{ordinal(index + 1)}</span>
                            {finisher ? (
                              <span className={`truncate font-medium text-pit-text ${tvMode ? 'text-[11px]' : 'text-xs'}`}>
                                {finisher.displayname ?? finisher.emailaddress}
                              </span>
                            ) : null}
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-pit-teal">{formatMoney(payouts[index] ?? 0)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-pit-text">No blind structure yet.</p>
        )}

        {displayMode && activeGreeting && tvGreetingDisplayEnabled && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center overflow-hidden rounded-[inherit]">
            <style>{`
              @keyframes tv-confetti-fall {
                0% { transform: translate3d(0, -18px, 0) rotate(0deg); opacity: 0; }
                12% { opacity: 1; }
                100% { transform: translate3d(0, 76vh, 0) rotate(540deg); opacity: 0; }
              }
            `}</style>
            {confettiPieces.map((piece) => (
              <span
                key={`${activeGreeting.id}-${piece.id}`}
                className="absolute top-0 h-4 w-2 rounded-full"
                style={{
                  left: piece.left,
                  backgroundColor: piece.color,
                  transform: `rotate(${piece.rotation})`,
                  animation: `tv-confetti-fall ${piece.duration} ease-out ${piece.delay} forwards`,
                  boxShadow: '0 0 10px rgba(255,255,255,0.15)',
                }}
              />
            ))}
            <div className="mt-10 rounded-2xl border border-white/15 bg-black/55 px-8 py-6 text-center shadow-2xl backdrop-blur-md">
              <p className="text-lg font-semibold uppercase tracking-[0.28em] text-yellow-200 xl:text-xl">Welcome To The Tournament</p>
              {activeGreeting.avatarImageUrl ? (
                <div className="mx-auto mt-5 h-28 w-28 overflow-hidden rounded-full border-4 border-white/25 shadow-xl xl:h-32 xl:w-32">
                  <img
                    src={activeGreeting.avatarImageUrl}
                    alt={activeGreeting.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-4xl font-semibold text-white shadow-xl xl:h-32 xl:w-32 xl:text-5xl">
                  {getInitials(activeGreeting.name)}
                </div>
              )}
              <h2 className="mt-4 text-7xl font-semibold tracking-tight text-white xl:text-8xl 2xl:text-[7rem]">
                {activeGreeting.name}
              </h2>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TvSeatingBoard({ players }: { players: TournamentPlayer[] }) {
  const tables = useMemo(() => {
    const grouped = new Map<number, TournamentPlayer[]>();
    for (const player of players) {
      const tableNumber = Number(player.tablenumber ?? 0);
      if (!tableNumber) continue;
      const tablePlayers = grouped.get(tableNumber) ?? [];
      tablePlayers.push(player);
      grouped.set(tableNumber, tablePlayers);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tableNumber, tablePlayers]) => ({
        tableNumber,
        players: tablePlayers.sort((a, b) => Number(a.seat ?? 0) - Number(b.seat ?? 0)),
      }));
  }, [players]);

  return (
    <div className="rounded-xl border border-yellow-200/35 bg-yellow-200/10 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-200">Timer Paused</p>
          <h3 className="text-xl font-semibold uppercase tracking-[0.2em] text-white">Table Seating</h3>
        </div>
        <span className="rounded-lg border border-pit-border bg-pit-bg/50 px-2 py-1 text-xs text-pit-text">
          {players.length} seated
        </span>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-lg border border-pit-border bg-pit-bg/45 px-4 py-14 text-center">
          <p className="text-3xl font-semibold text-white">Seats not assigned yet</p>
          <p className="mt-2 text-sm text-pit-text">Assigned seats will show here while the timer is paused.</p>
        </div>
      ) : (
        <div className="grid max-h-[23.5rem] gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
          {tables.map((table) => (
            <div key={table.tableNumber} className="rounded-lg border border-pit-border bg-pit-bg/55 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">Table {table.tableNumber}</p>
                <span className="text-xs text-pit-muted">{table.players.length} players</span>
              </div>
              <div className="space-y-1">
                {table.players.map((player) => (
                  <div key={player.userid} className="flex items-center justify-between gap-2 rounded-md border border-pit-border/70 bg-pit-surface/35 px-2 py-1.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {player.displayname ?? player.emailaddress}
                    </span>
                    <span className="shrink-0 rounded-md bg-pit-teal/15 px-2 py-0.5 text-xs font-semibold text-pit-teal">
                      Seat {player.seat}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

  const weights = Array.from({ length: normalizedCount }, (_, index) => normalizedCount - index);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => roundToTenth((weight / totalWeight) * 100));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function formatMoney(value: number): string {
  return `$${toNumber(value).toFixed(2)}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || '?';
}
