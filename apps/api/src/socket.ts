import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { query, queryOne } from './db';
import { getClientUrl } from './config';
import { BlindLevel, TimerState } from './types';

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
      const state = await loadTimerState(tournamentId);
      if (state.running || state.blinds.length === 0) return;
      state.running = true;
      timerState.set(tournamentId, state);
      startInterval(tournamentId);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });

    socket.on('timer-pause', async ({ tournamentId }: { tournamentId: string }) => {
      const state = timerState.get(tournamentId);
      if (!state) return;
      state.running = false;
      stopInterval(tournamentId);
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });

    socket.on('timer-next', async ({ tournamentId }: { tournamentId: string }) => {
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      advanceLevel(state);
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });

    socket.on('timer-prev', async ({ tournamentId }: { tournamentId: string }) => {
      const state = timerState.get(tournamentId) ?? await loadTimerState(tournamentId);
      if (state.currentlevel > 1) {
        state.currentlevel -= 1;
        state.remainingsecs = (state.blinds.find(b => b.level === state.currentlevel)?.minutes ?? 20) * 60;
      }
      await persistTimer(state);
      io.to(`t:${tournamentId}`).emit('timer-state', state);
    });
  });
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
      advanceLevel(state);
    }

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

function advanceLevel(state: TimerState): void {
  const currentBlind = state.blinds.find(b => b.level === state.currentlevel);
  if (currentBlind?.islastlevel) {
    state.running = false;
    stopInterval(state.tournamentid);
    return;
  }
  state.currentlevel += 1;
  const nextBlind = state.blinds.find(b => b.level === state.currentlevel);
  state.remainingsecs = (nextBlind?.minutes ?? 20) * 60;
}

async function loadTimerState(tournamentId: string): Promise<TimerState> {
  const cached = timerState.get(tournamentId);
  if (cached) return cached;

  const blinds = await query<BlindLevel>(
    `SELECT id, level, label, smallblind, bigblind, ante, minutes, islastlevel
     FROM blindstructure WHERE tournamentid = $1 ORDER BY level`,
    [tournamentId]
  );

  const saved = await queryOne<{ currentlevel: number; remainingsecs: number; running: boolean }>(
    `SELECT currentlevel, remainingsecs, running FROM tournamenttimer WHERE tournamentid = $1`,
    [tournamentId]
  );

  const firstBlind = blinds[0];
  const state: TimerState = {
    tournamentid: tournamentId,
    currentlevel: saved?.currentlevel ?? 1,
    remainingsecs: saved?.remainingsecs ?? (firstBlind?.minutes ?? 20) * 60,
    running: false, // never auto-resume on reconnect
    blinds,
  };

  timerState.set(tournamentId, state);

  if (state.running) startInterval(tournamentId);

  return state;
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
