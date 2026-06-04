import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { query, queryOne } from './db';
import { getClientUrl } from './config';
import { BlindLevel, TimerState } from './types';
import { sendTournamentNotification } from './lib/server/notifications/notificationService';
import { decodeAuthToken } from './middleware/auth';
import { isDatabaseTrue } from './utils/booleans';

const activeTimers = new Map<string, NodeJS.Timeout>();
const timerState = new Map<string, TimerState>();

let io: Server;

export function initSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: { origin: getClientUrl() },
  });

  io.on('connection', (socket) => {
    socket.on('join-tournament', async (tournamentId: string) => {
      socket.join(`t:${tournamentId}`);
      const state = await loadTimerState(tournamentId);
      socket.emit('timer-state', state);
    });

    socket.on('timer-start', async ({ tournamentId }: { tournamentId: string }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = await loadTimerState(tournamentId);
      const previousLevel = state.currentlevel;
      if (isChipUpBlind(getCurrentBlind(state)) && state.remainingsecs <= 0) {
        advanceLevel(state, { acknowledgeChipUp: true });
      }
      if (state.running || state.blinds.length === 0) return;
      state.running = true;
      timerState.set(tournamentId, state);
      startInterval(tournamentId);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
      if (state.currentlevel !== previousLevel) notifyLevelChanged(state);
    });

    socket.on('timer-pause', async ({ tournamentId }: { tournamentId: string }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = timerState.get(tournamentId);
      if (!state) return;
      state.running = false;
      stopInterval(tournamentId);
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });

    socket.on('timer-next', async ({ tournamentId }: { tournamentId: string }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      const previousLevel = state.currentlevel;
      advanceLevel(state, { acknowledgeChipUp: true });
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
      if (state.currentlevel !== previousLevel) notifyLevelChanged(state);
    });

    socket.on('timer-prev', async ({ tournamentId }: { tournamentId: string }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      const previousLevel = state.currentlevel;
      const previousBlind = getPreviousBlind(state);
      if (previousBlind) {
        state.currentlevel = previousBlind.level;
      }
      state.remainingsecs = (getCurrentBlind(state)?.minutes ?? 20) * 60;
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
      if (state.currentlevel !== previousLevel) notifyLevelChanged(state);
    });

    socket.on('timer-adjust', async ({ tournamentId, deltaSeconds }: { tournamentId: string; deltaSeconds: number }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      const maxSeconds = Math.max((getCurrentBlind(state)?.minutes ?? 20) * 60, 60);
      state.remainingsecs = Math.min(Math.max(state.remainingsecs + Number(deltaSeconds || 0), 0), maxSeconds);
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });

    socket.on('timer-level', async ({ tournamentId, level }: { tournamentId: string; level: number }) => {
      if (!await canControlTournamentTimer(socket, tournamentId)) return;
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      const targetBlind = state.blinds.find((blind) => blind.level === Number(level));
      if (!targetBlind) return;
      const previousLevel = state.currentlevel;
      state.currentlevel = targetBlind.level;
      state.remainingsecs = isChipUpBlind(targetBlind) ? 0 : Math.max((targetBlind.minutes ?? 20) * 60, 60);
      if (isChipUpBlind(targetBlind)) {
        state.running = false;
        stopInterval(tournamentId);
      }
      timerState.set(tournamentId, state);
      if (state.running) startInterval(tournamentId);
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
      if (state.currentlevel !== previousLevel) notifyLevelChanged(state);
    });
  });
}

function getSocketUserId(socket: Socket): string | null {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') return null;
  return decodeAuthToken(token.startsWith('Bearer ') ? token.slice(7) : token);
}

async function canControlTournamentTimer(
  socket: Socket,
  tournamentId: string | undefined
): Promise<boolean> {
  if (!tournamentId) return false;
  const userId = getSocketUserId(socket);
  if (!userId) {
    socket.emit('timer-control-denied', { error: 'Unauthorized' });
    return false;
  }

  const row = await queryOne<{ canmanage: boolean }>(
    `SELECT CASE
        WHEN COALESCE(um.issuperadmin, FALSE) = TRUE THEN TRUE
        WHEN t.userid = $2 THEN TRUE
        WHEN t.groupid IS NOT NULL AND EXISTS (
          SELECT 1
          FROM groupmembers gm
          WHERE gm.groupid = t.groupid
            AND gm.userid = $2
            AND gm.approved = TRUE
            AND gm.admin = TRUE
        ) THEN TRUE
        ELSE FALSE
      END AS canmanage
     FROM tournaments t
     LEFT JOIN usermetadata um ON um.userid = $2
     WHERE t.tournamentid = $1`,
    [tournamentId, userId]
  );
  if (isDatabaseTrue(row?.canmanage)) return true;
  socket.emit('timer-control-denied', { error: 'Only tournament admins can control the timer.' });
  return false;
}

function startInterval(tournamentId: string): void {
  stopInterval(tournamentId);
  let tickCount = 0;

  const interval = setInterval(async () => {
    const state = timerState.get(tournamentId);
    if (!state || !state.running) return;

    state.remainingsecs -= 1;
    tickCount += 1;

    if (state.remainingsecs <= 0) {
      const previousLevel = state.currentlevel;
      advanceLevel(state);
      if (state.currentlevel !== previousLevel) notifyLevelChanged(state);
      if (!state.running) {
        await persistTimer(state);
        io.to(`t:${tournamentId}`).emit('timer-state', state);
        return;
      }
    }

    maybeNotifyTimerWarnings(state);

    io.to(`t:${tournamentId}`).emit('timer-tick', {
      remainingsecs: state.remainingsecs,
      currentlevel: state.currentlevel,
      running: state.running,
    });

    if (tickCount % 10 === 0) {
      await persistTimer(state);
    }
  }, 1000);

  activeTimers.set(tournamentId, interval);
}

function stopInterval(tournamentId: string): void {
  const existing = activeTimers.get(tournamentId);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(tournamentId);
  }
}

function advanceLevel(state: TimerState, options: { acknowledgeChipUp?: boolean } = {}): void {
  const currentBlind = getCurrentBlind(state);
  if (isChipUpBlind(currentBlind) && !options.acknowledgeChipUp) {
    state.remainingsecs = 0;
    state.running = false;
    stopInterval(state.tournamentid);
    return;
  }
  if (currentBlind?.islastlevel) {
    state.running = false;
    stopInterval(state.tournamentid);
    return;
  }
  const nextBlind = getNextBlind(state);
  if (!nextBlind) {
    state.running = false;
    stopInterval(state.tournamentid);
    return;
  }
  state.currentlevel = nextBlind.level;
  state.remainingsecs = (nextBlind?.minutes ?? 20) * 60;
  if (isChipUpBlind(nextBlind)) {
    state.remainingsecs = 0;
    state.running = false;
    stopInterval(state.tournamentid);
  }
}

function isBreakBlind(blind: BlindLevel | undefined): boolean {
  return Boolean(blind && (/^break\b/i.test(String(blind.label ?? '')) || (Number(blind.smallblind) === 0 && Number(blind.bigblind) === 0)));
}

function isChipUpBlind(blind: BlindLevel | undefined): boolean {
  return Boolean(blind && /^chip\s*up\b/i.test(String(blind.label ?? '')));
}

function notifyLevelChanged(state: TimerState): void {
  const blind = getCurrentBlind(state);
  if (!blind) return;
  const isBreak = isBreakBlind(blind);
  void sendTournamentNotification(state.tournamentid, isBreak ? 'break_started' : 'blinds_level_up', {
    levelNumber: state.currentlevel,
    smallBlind: Number(blind.smallblind ?? 0),
    bigBlind: Number(blind.bigblind ?? 0),
    ante: Number(blind.ante ?? 0),
    breakMinutes: Number(blind.minutes ?? 0),
  }, {
    audience: 'active-participants-and-admins',
    entityId: `${state.tournamentid}:level:${state.currentlevel}`,
  }).catch((err) => {
    console.error('Timer push notification failed', err instanceof Error ? err.message : err);
  });
}

function maybeNotifyTimerWarnings(state: TimerState): void {
  const blind = getCurrentBlind(state);
  if (!blind) return;
  if (isBreakBlind(blind) && state.remainingsecs === 120) {
    void sendTournamentNotification(state.tournamentid, 'break_ending_soon', {
      levelNumber: state.currentlevel,
      minutesRemaining: 2,
    }, {
      audience: 'active-participants-and-admins',
      entityId: `${state.tournamentid}:break-ending:${state.currentlevel}`,
    }).catch((err) => {
      console.error('Break ending push notification failed', err instanceof Error ? err.message : err);
    });
  }

  if (state.remainingsecs !== 300 && state.remainingsecs !== 60) return;
  void notifyRebuyPeriodEnding(state);
}

async function notifyRebuyPeriodEnding(state: TimerState): Promise<void> {
  const row = await queryOne<{ rebuylastlevel: number | null }>(
    `SELECT CAST(rebuylastlevel AS INT) AS rebuylastlevel
     FROM tournaments
     WHERE tournamentid = $1`,
    [state.tournamentid]
  );
  if (row?.rebuylastlevel == null || Number(row.rebuylastlevel) !== Number(state.currentlevel)) return;
  await sendTournamentNotification(state.tournamentid, 'rebuy_period_ending', {
    levelNumber: state.currentlevel,
    minutesRemaining: Math.ceil(state.remainingsecs / 60),
  }, {
    audience: 'active-participants-and-admins',
    entityId: `${state.tournamentid}:rebuy-ending:${state.currentlevel}:${state.remainingsecs}`,
  });
}

async function loadTimerState(tournamentId: string): Promise<TimerState> {
  const cached = timerState.get(tournamentId);
  if (cached) {
    normalizeTimerState(cached);
    return cached;
  }

  const blindRows = await query<BlindLevel>(
    `SELECT id, level, label, smallblind, bigblind, ante, minutes, islastlevel
     FROM blindstructure WHERE tournamentid = $1 ORDER BY level`,
    [tournamentId]
  );
  const blinds = blindRows.map(normalizeBlindLevel);

  const saved = await queryOne<{ currentlevel: number; remainingsecs: number; running: boolean }>(
    `SELECT currentlevel, remainingsecs, running FROM tournamenttimer WHERE tournamentid = $1`,
    [tournamentId]
  );

  const state: TimerState = {
    tournamentid: tournamentId,
    currentlevel: Number(saved?.currentlevel ?? blinds[0]?.level ?? 1),
    remainingsecs: Number(saved?.remainingsecs ?? 0),
    running: false, // never auto-resume on reconnect
    blinds,
  };
  normalizeTimerState(state);

  timerState.set(tournamentId, state);
  if (saved && (saved.currentlevel !== state.currentlevel || saved.remainingsecs !== state.remainingsecs || saved.running !== false)) {
    await persistTimer(state);
  }

  if (state.running) startInterval(tournamentId);

  return state;
}

function normalizeBlindLevel(blind: BlindLevel): BlindLevel {
  return {
    ...blind,
    level: Number(blind.level),
    smallblind: Number(blind.smallblind),
    bigblind: Number(blind.bigblind),
    ante: Number(blind.ante),
    minutes: Number(blind.minutes),
    islastlevel: parseBoolean(blind.islastlevel),
  };
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 't';
  }
  return false;
}

function getCurrentBlind(state: TimerState): BlindLevel | undefined {
  return state.blinds.find((blind) => blind.level === state.currentlevel) ?? state.blinds[0];
}

function getCurrentBlindIndex(state: TimerState): number {
  return state.blinds.findIndex((blind) => blind.level === state.currentlevel);
}

function getPreviousBlind(state: TimerState): BlindLevel | undefined {
  const currentIndex = getCurrentBlindIndex(state);
  if (currentIndex <= 0) return state.blinds[0];
  return state.blinds[currentIndex - 1];
}

function getNextBlind(state: TimerState): BlindLevel | undefined {
  const currentIndex = getCurrentBlindIndex(state);
  if (currentIndex < 0) return state.blinds[0];
  return state.blinds[currentIndex + 1];
}

function normalizeTimerState(state: TimerState): void {
  const firstBlind = state.blinds[0];
  if (!firstBlind) {
    state.currentlevel = 1;
    state.remainingsecs = 0;
    state.running = false;
    return;
  }

  const matchingBlind = state.blinds.find((blind) => blind.level === Number(state.currentlevel));
  const currentBlind = matchingBlind ?? firstBlind;
  state.currentlevel = currentBlind.level;

  const maxSeconds = Math.max((currentBlind.minutes ?? 20) * 60, 60);
  const rawRemaining = Number(state.remainingsecs);
  state.remainingsecs = Number.isFinite(rawRemaining) && rawRemaining > 0
    ? Math.min(rawRemaining, maxSeconds)
    : maxSeconds;
}

async function persistTimer(state: TimerState): Promise<void> {
  await query(
    `INSERT INTO tournamenttimer (tournamentid, currentlevel, remainingsecs, running, lastupdated)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (tournamentid) DO UPDATE
     SET currentlevel = $2, remainingsecs = $3, running = $4, lastupdated = now()`,
    [state.tournamentid, state.currentlevel, state.remainingsecs, state.running]
  );
}

export function invalidateTimerCache(tournamentId: string): void {
  timerState.delete(tournamentId);
  stopInterval(tournamentId);
}

export async function pauseTournamentTimer(
  tournamentId: string,
  options: { reason?: 'tournament-completed' } = {}
): Promise<void> {
  const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
  state.running = false;
  state.pauseReason = options.reason;
  stopInterval(tournamentId);
  await persistTimer(state);
  if (io) {
    const emittedState = options.reason ? { ...state, pauseReason: options.reason } : state;
    io.to(`t:${tournamentId}`).emit('timer-state', emittedState);
  }
  state.pauseReason = undefined;
}

export function broadcastTournamentUpdate(tournamentId: string, payload: Record<string, unknown> = { players: true }): void {
  if (!io) return;
  io.to(`t:${tournamentId}`).emit('tournament-updated', payload);
}
