import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { api, TournamentPlayer, SeatingAssignment, BlindLevel } from '../../api/client';

interface TimerTick { remainingsecs: number; currentlevel: number; running: boolean; }
interface TimerState extends TimerTick { blinds: BlindLevel[]; }

export default function PlayerLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const socketRef = useRef<Socket | null>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);

  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
    refetchInterval: 30_000,
  });
  const { data: players = [] } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    refetchInterval: 15_000,
  });
  const { data: seating = [] } = useQuery({
    queryKey: ['seating', id],
    queryFn: () => api.getSeating(id!),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', id);
    socket.on('timer-state', (s: TimerState) => setTimer(s));
    socket.on('timer-tick', (tick: TimerTick) =>
      setTimer(prev => prev ? { ...prev, ...tick } : null)
    );
    return () => { socket.disconnect(); };
  }, [id]);

  const currentBlind = timer?.blinds.find(b => b.level === timer.currentlevel);
  const secs = timer?.remainingsecs ?? 0;
  const timeStr = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';

  // Group seating by table
  const tables = new Map<number, SeatingAssignment[]>();
  for (const s of seating) {
    const list = tables.get(s.tablenumber) ?? [];
    list.push(s);
    tables.set(s.tablenumber, list);
  }

  // Knock-out standings
  const finishers: TournamentPlayer[] = players
    .filter(p => p.placed != null)
    .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999));

  return (
    <div className="min-h-screen bg-pit-bg text-white p-4">
      <header className="text-center mb-6">
        <p className="text-pit-text text-sm">PitBoss · Player Lobby</p>
        <h1 className="text-xl font-bold text-white">{tournament?.name ?? '…'}</h1>
      </header>

      {/* Timer */}
      {currentBlind && (
        <div className="max-w-md mx-auto card text-center mb-6 space-y-2">
          <p className="text-pit-text text-xs uppercase tracking-wider">
            {currentBlind.label} — Level {timer?.currentlevel}
            {!timer?.running && <span className="ml-2 text-yellow-400">⏸ Paused</span>}
          </p>
          <p className={`text-6xl font-bold font-mono tabular-nums ${urgency}`}>{timeStr}</p>
          <div className="flex justify-center gap-6 text-sm text-pit-text">
            <span>SB: <strong className="text-white">{currentBlind.smallblind.toLocaleString()}</strong></span>
            <span>BB: <strong className="text-white">{currentBlind.bigblind.toLocaleString()}</strong></span>
            {currentBlind.ante > 0 && <span>Ante: <strong className="text-white">{currentBlind.ante.toLocaleString()}</strong></span>}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2">
        {/* Seating */}
        {tables.size > 0 && (
          <div className="card">
            <h2 className="font-semibold text-white mb-3">Seating</h2>
            {[...tables.entries()].sort(([a], [b]) => a - b).map(([tableNum, seats]) => (
              <div key={tableNum} className="mb-4">
                <p className="text-pit-teal text-sm font-semibold mb-1">Table {tableNum}</p>
                {seats.sort((a, b) => a.seat - b.seat).map(s => (
                  <div key={s.userid} className="flex justify-between text-sm py-0.5">
                    <span className="text-pit-text">Seat {s.seat}</span>
                    <span className="text-white">{s.displayname ?? s.emailaddress}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Standings */}
        {finishers.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-white mb-3">Results</h2>
            {finishers.map(p => (
              <div key={p.userid} className="flex gap-3 text-sm py-0.5">
                <span className="text-pit-text w-8">#{p.placed}</span>
                <span className="text-white">{p.displayname ?? p.emailaddress}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
