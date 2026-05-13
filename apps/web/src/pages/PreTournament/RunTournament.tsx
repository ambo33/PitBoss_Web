import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChevronDown, ChevronUp, Expand, Minimize, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BlindLevel, Tournament, TournamentPlayer } from '../../api/client';
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
}: {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
  players: TournamentPlayer[];
}) {
  const socketRef = useRef<Socket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastWarningRef = useRef<{ fiveMin: boolean; oneMin: boolean; level: number | null }>({
    fiveMin: false,
    oneMin: false,
    level: null,
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
    return () => {
      socket.disconnect();
    };
  }, [tournamentId]);

  useEffect(() => {
    function syncFullscreen() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

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

  async function toggleFullscreen() {
    if (!screenRef.current) return;
    if (!document.fullscreenElement) {
      await screenRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
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
      <div ref={screenRef} className={`card space-y-4 ${isFullscreen ? 'min-h-screen rounded-none border-0 bg-pit-bg p-6' : 'p-3 md:p-3.5 xl:p-4'}`}>
        <div className="flex justify-end">
          {isOwner && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={16} /> : <Expand size={16} />}
              {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
          )}
        </div>

        {currentBlind ? (
          <>
            <div className={`grid gap-3 ${isFullscreen ? 'lg:grid-cols-[300px_minmax(0,1fr)_300px]' : 'lg:grid-cols-[230px_minmax(0,1fr)_240px] xl:grid-cols-[250px_minmax(0,1fr)_260px]'}`}>
              <section className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Structure</h3>
                  <span className="text-xs text-pit-muted">{effectiveBlinds.length} levels</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-pit-border">
                  <div className="grid grid-cols-[42px_minmax(0,1fr)_52px] bg-pit-surface/70 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-pit-muted">
                    <span>Level</span>
                    <span>Blinds</span>
                    <span>Time</span>
                  </div>
                  <div className="max-h-[34rem] overflow-y-auto">
                    {effectiveBlinds.map((blind) => {
                      const isCurrent = blind.level === effectiveLevel;
                      const isNext = nextBlind?.level === blind.level;
                      return (
                        <div
                          key={blind.id}
                          className={`grid grid-cols-[42px_minmax(0,1fr)_52px] items-center border-t px-2 py-1.5 text-xs leading-tight ${
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

              <section className="min-w-0 space-y-4">
                <div className={`rounded-xl border px-3 py-4 text-center ${timerTone}`}>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-pit-text md:text-sm">
                    Level {displayedLevel} of {effectiveBlinds.length}
                    {!timerState?.running && <span className="ml-3 text-yellow-400">Paused</span>}
                  </p>
                  <div className="mt-2.5 flex items-center justify-center gap-2 md:gap-3">
                    {isOwner && (
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
                    <div className={`flex items-center font-mono font-bold tabular-nums leading-none ${urgency} ${isFullscreen ? 'text-[15rem]' : 'text-[6.8rem] md:text-[9.5rem] lg:text-[10.4rem] xl:text-[11.2rem]'}`}>
                      <span>{minsStr}</span>
                      <span className="-mx-[0.08em]">:</span>
                      <span>{secsStr}</span>
                    </div>
                    {isOwner && (
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

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-pit-border bg-black/25 px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Current Blinds</p>
                      <p className="mt-1.5 text-2xl font-bold text-white">{currentBlind.smallblind.toLocaleString()} / {currentBlind.bigblind.toLocaleString()}</p>
                      <p className="mt-1 text-sm text-pit-text">Ante {currentBlind.ante > 0 ? currentBlind.ante.toLocaleString() : '-'}</p>
                    </div>
                    <div className="rounded-lg border border-pit-border bg-black/25 px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Next Blinds</p>
                      {nextBlind ? (
                        <>
                          <p className="mt-1.5 text-2xl font-bold text-white">{nextBlind.smallblind.toLocaleString()} / {nextBlind.bigblind.toLocaleString()}</p>
                          <p className="mt-1 text-sm text-pit-text">Ante {nextBlind.ante > 0 ? nextBlind.ante.toLocaleString() : '-'}</p>
                        </>
                      ) : (
                        <>
                          <p className="mt-1.5 text-2xl font-bold text-white">Final Level</p>
                          <p className="mt-1 text-sm text-pit-text">No further increase</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isOwner && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-prev')}>Prev</button>
                    {timerState?.running
                      ? <button className="btn-danger px-3 py-1.5" onClick={() => emit('timer-pause')}>Pause</button>
                      : <button className="btn-primary px-3 py-1.5" onClick={() => emit('timer-start')}>Start</button>
                    }
                    <button className="btn-ghost px-3 py-1.5" onClick={() => emit('timer-next')}>Next</button>
                  </div>
                )}

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_184px]">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {summaryStats.map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-pit-border bg-pit-bg/50 px-2.5 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-pit-muted">{stat.label}</p>
                        <p className={`mt-1.5 text-base font-semibold ${'accent' in stat && stat.accent ? 'text-pit-teal' : 'text-white'}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-pit-border bg-pit-bg/50 p-3 text-center">
                    <div className="mb-2 flex items-center justify-center gap-1.5 text-white">
                      <QrCode size={14} className="text-pit-teal" />
                      <p className="text-sm font-semibold">Report Knockout</p>
                    </div>
                    <div className="inline-block rounded-lg bg-white p-2">
                      <QRCodeSVG value={knockoutUrl} size={isFullscreen ? 170 : 118} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-pit-border bg-pit-bg/60 p-3">
                <div className="mb-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Payout Structure</h3>
                  <p className="mt-1 text-xs text-pit-muted">
                    Paying {payoutPlaces} of {fieldSize || registeredCount || 0}
                  </p>
                </div>

                <div className="mb-3 rounded-lg border border-pit-border bg-pit-bg/40 px-2.5 py-2.5 text-center">
                  <p className="text-xs uppercase tracking-wide text-pit-muted">Prize Pool</p>
                  <p className="mt-1.5 text-lg font-semibold text-pit-teal">{formatMoney(totalPot)}</p>
                </div>

                <div className="max-h-[34rem] space-y-1.5 overflow-y-auto pr-1">
                  {payoutSplits.map((split, index) => (
                    <div key={`${index}-${split}`} className="flex items-center justify-between rounded-lg border border-pit-border bg-pit-surface/40 px-2.5 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-white">{ordinal(index + 1)}</p>
                        <p className="text-xs uppercase tracking-wide text-pit-muted">{split.toFixed(1)}%</p>
                      </div>
                      <p className="text-base font-semibold text-pit-teal">{formatMoney(payouts[index] ?? 0)}</p>
                    </div>
                  ))}
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
