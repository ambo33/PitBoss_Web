import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, BlindLevel, Tournament, TournamentPlayer } from '../../api/client';
import { featureFlags } from '../../features';
import { announceFiveMinuteWarning, announceLevel, announceOneMinuteWarning, playLevelChangeTone, primeTimerAudio } from '../../utils/timerAudio';

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
  mode?: 'admin' | 'display';
  queryKeysToRefresh?: unknown[][];
}) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const lastWarningRef = useRef<{ fiveMin: boolean; oneMin: boolean; level: number | null }>({
    fiveMin: false,
    oneMin: false,
    level: null,
  });

  const showAdminControls = isOwner && mode === 'admin';
  const showKnockoutQr = mode === 'admin';
  const displayMode = mode === 'display';

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
  const checkinMutation = useMutation({
    mutationFn: (userId: string) => api.toggleCheckin(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });

  useEffect(() => {
    primeTimerAudio();

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', tournamentId);
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
      socket.disconnect();
    };
  }, [qc, tournamentId]);

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

  function emit(event: string, payload: Record<string, unknown> = {}) {
    socketRef.current?.emit(event, { tournamentId, ...payload });
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
  const knockoutUrl = `${window.location.origin}/bust/${tournamentId}`;

  const checkedIn = players.filter((player) => player.checkedin).length;
  const registeredCount = players.length;
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length;
  const fieldSize = checkedIn > 0 ? checkedIn : registeredCount;
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
  const summaryStats = [
    { label: 'Players Left', value: activePlayers },
    { label: 'Checked In', value: checkedIn },
    ...(tournament.rebuyprice > 0 ? [{ label: 'Rebuys', value: totalRebuys }] : []),
    ...(tournament.addonprice > 0 ? [{ label: 'Add-Ons', value: totalAddons }] : []),
    { label: 'Net Pot', value: formatMoney(totalPot), accent: true },
    ...(knockoutLeader ? [{ label: 'Knockout Leader', value: `${knockoutLeader.name} (${knockoutLeader.count})` }] : []),
  ];

  return (
    <div className="space-y-4">
      <div ref={screenRef} className={`card space-y-4 ${displayMode ? 'p-5 md:p-6 xl:p-8' : 'p-3 md:p-3.5 xl:p-4'}`}>
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
            </div>
          ) : (
            <div />
          )}

          {showAdminControls && featureFlags.tvBoard && (
            <div className="rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2 text-right">
              <p className="text-sm text-white">
                <span className="mr-2 text-[11px] uppercase tracking-[0.2em] text-pit-muted">TV</span>
                <span className="font-mono font-semibold tracking-[0.24em]">{tournament.tvdisplaycode ?? 'UNAVAILABLE'}</span>
                <span className="ml-2 text-[11px] text-pit-muted">/tv</span>
              </p>
            </div>
          )}
        </div>

        {currentBlind ? (
          <>
            <div className={`grid ${displayMode ? 'gap-5 lg:grid-cols-[320px_minmax(0,1fr)_320px] 2xl:grid-cols-[360px_minmax(0,1fr)_360px]' : 'gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[240px_minmax(0,1fr)_240px]'}`}>
              <section className={`rounded-xl border border-pit-border bg-pit-bg/60 ${displayMode ? 'p-4' : 'p-3'}`}>
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
                  <div className={`${displayMode ? 'max-h-[48rem]' : 'max-h-[34rem]'} overflow-y-auto`}>
                    {effectiveBlinds.map((blind) => {
                      const isCurrent = blind.level === effectiveLevel;
                      const isNext = nextBlind?.level === blind.level;
                      return (
                        <div
                          key={blind.id}
                          className={`grid grid-cols-[42px_minmax(0,1fr)_52px] items-center border-t px-2 py-1.5 leading-tight ${displayMode ? 'text-sm' : 'text-xs'} ${
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

              <section className={`min-w-0 ${displayMode ? 'space-y-5' : 'space-y-4'}`}>
                <div className={`rounded-xl border text-center ${displayMode ? 'px-5 py-6' : 'px-3 py-4'} ${timerTone}`}>
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
                        ? <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => emit('timer-pause')}>Pause</button>
                        : <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => emit('timer-start')}>Start</button>
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
                    <div className={`flex items-center font-mono font-bold tabular-nums leading-none ${urgency} ${
                      showAdjustments
                        ? 'text-[6.8rem] md:text-[9.5rem] lg:text-[10.4rem] xl:text-[11.2rem]'
                        : (displayMode ? 'text-[9.5rem] md:text-[13rem] lg:text-[15rem] xl:text-[16rem]' : 'text-[8.5rem] md:text-[12rem] lg:text-[12.9rem] xl:text-[13.8rem]')
                    }`}>
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

                  <div className={`mt-3 grid gap-2 md:grid-cols-2 ${displayMode ? 'xl:gap-3' : ''}`}>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-4 py-4' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Current Blinds</p>
                      <p className={`mt-1.5 font-bold leading-none text-white ${
                        currentBlind.ante > 0
                          ? 'text-[2rem] md:text-[2.5rem] xl:text-[2.9rem]'
                          : 'text-[2.35rem] md:text-[2.95rem] xl:text-[3.5rem]'
                      }`}>
                        {currentBlind.smallblind.toLocaleString()} / {currentBlind.bigblind.toLocaleString()}
                      </p>
                      {currentBlind.ante > 0 && (
                        <p className="mt-1.5 text-base text-pit-text md:text-lg">Ante {currentBlind.ante.toLocaleString()}</p>
                      )}
                    </div>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-4 py-4' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Next Blinds</p>
                      {nextBlind ? (
                        <>
                          <p className={`mt-1.5 font-bold leading-none text-white ${
                            nextBlind.ante > 0
                              ? 'text-[2rem] md:text-[2.5rem] xl:text-[2.9rem]'
                              : 'text-[2.35rem] md:text-[2.95rem] xl:text-[3.5rem]'
                          }`}>
                            {nextBlind.smallblind.toLocaleString()} / {nextBlind.bigblind.toLocaleString()}
                          </p>
                          {nextBlind.ante > 0 && (
                            <p className="mt-1.5 text-base text-pit-text md:text-lg">Ante {nextBlind.ante.toLocaleString()}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="mt-1.5 text-[2rem] font-bold leading-none text-white md:text-[2.5rem] xl:text-[2.9rem]">Final Level</p>
                          <p className="mt-1.5 text-base text-pit-text md:text-lg">No further increase</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {showAdminControls && showAdjustments && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-prev')}>Prev</button>
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-next')}>Next</button>
                  </div>
                )}

                <div className="grid gap-2 xl:grid-cols-1">
                  <div className={`grid gap-2 sm:grid-cols-3 ${displayMode ? 'xl:gap-3' : ''}`}>
                    {summaryStats.map((stat) => (
                      <div key={stat.label} className={`rounded-lg border border-pit-border bg-pit-bg/50 text-center ${displayMode ? 'px-3 py-4' : 'px-2.5 py-3'}`}>
                        <p className={`${displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>{stat.label}</p>
                        <p className={`mt-1.5 ${displayMode ? 'text-lg' : 'text-base'} font-semibold ${'accent' in stat && stat.accent ? 'text-pit-teal' : 'text-white'}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className={`space-y-2.5 ${displayMode ? 'lg:pt-1' : ''}`}>
                {showKnockoutQr && (
                  <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-2.5 text-center">
                    <div className="mb-1 text-white">
                      <p className="text-[11px] font-semibold uppercase tracking-wide">Report Your Knockout!</p>
                    </div>
                    <div className="inline-block rounded-md bg-white p-1.5">
                      <QRCodeSVG value={knockoutUrl} size={88} />
                    </div>
                  </div>
                )}
                <div className={`rounded-xl border border-pit-border bg-pit-bg/60 ${displayMode ? 'p-4' : 'p-3'}`}>
                  <div className="mb-2">
                    <h3 className={`${displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Payout Structure</h3>
                    <p className={`mt-1 ${displayMode ? 'text-sm' : 'text-xs'} text-pit-muted`}>
                      Paying {payoutPlaces} of {fieldSize || registeredCount || 0}
                    </p>
                  </div>

                  <div className={`mb-2 rounded-lg border border-pit-border bg-pit-bg/40 text-center ${displayMode ? 'px-3 py-3' : 'px-2.5 py-2'}`}>
                    <p className={`${displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>Prize Pool</p>
                    <p className={`mt-1 ${displayMode ? 'text-xl' : 'text-base'} font-semibold text-pit-teal`}>{formatMoney(totalPot)}</p>
                  </div>

                  <div className={`${displayMode ? 'max-h-[48rem]' : 'max-h-[26rem]'} space-y-1.5 overflow-y-auto pr-1`}>
                    {payoutSplits.map((split, index) => {
                      const finisher = paidFinishers.find((player) => player.placed === index + 1);
                      return (
                        <div key={`${index}-${split}`} className={`flex items-center justify-between gap-2 rounded-lg border border-pit-border bg-pit-surface/40 ${displayMode ? 'px-3 py-2 text-base' : 'px-2.5 py-1.5 text-sm'}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-semibold text-white">{ordinal(index + 1)}</span>
                            {finisher ? (
                              <span className="truncate text-xs font-medium text-pit-text">
                                {finisher.displayname ?? finisher.emailaddress}
                              </span>
                            ) : (
                              <span className="text-[11px] uppercase tracking-wide text-pit-muted">{split.toFixed(1)}%</span>
                            )}
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
      </div>
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
