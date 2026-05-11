import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Howl } from 'howler';
import { api, BlindLevel } from '../../api/client';

interface TimerTick { remainingsecs: number; currentlevel: number; running: boolean; }
interface TimerState extends TimerTick { blinds: BlindLevel[]; tournamentid: string; }

const beep5min = new Howl({ src: ['https://od.lk/s/NjFfMTU0NDk5NTdf/5minwarning.mp3'], volume: 0.7 });
const beep1min = new Howl({ src: ['https://od.lk/s/NjFfMTU0NDk5NThf/1minwarning.mp3'], volume: 0.7 });
const beepEnd  = new Howl({ src: ['https://od.lk/s/NjFfMTU0NDk5NTlf/levelend.mp3'], volume: 0.7 });

export default function BlindTimer({ tournamentId, isOwner }: { tournamentId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [editing, setEditing] = useState(false);
  const prevSecs = useRef<number>(0);

  const { data: blinds = [], isLoading } = useQuery({
    queryKey: ['blinds', tournamentId],
    queryFn: () => api.getBlinds(tournamentId),
  });

  const saveMutation = useMutation({
    mutationFn: (levels: Omit<BlindLevel, 'id'>[]) => api.saveBlinds(tournamentId, levels),
    onSuccess: (_data, levels) => {
      qc.invalidateQueries({ queryKey: ['blinds', tournamentId] });
      setEditing(false);
      socketRef.current?.emit('join-tournament', tournamentId);
      setTimerState({
        tournamentid: tournamentId,
        currentlevel: 1,
        remainingsecs: (levels[0]?.minutes ?? 20) * 60,
        running: false,
        blinds: levels.map((level, index) => ({ ...level, id: `draft-${index}` })),
      });
    },
  });

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', tournamentId);
    socket.on('timer-state', (state: TimerState) => setTimerState(state));
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimerState(prev => prev ? { ...prev, ...tick } : null);
      // Audio cues
      if (tick.remainingsecs === 300) beep5min.play();
      if (tick.remainingsecs === 60)  beep1min.play();
      if (tick.remainingsecs === 0)   beepEnd.play();
    });
    return () => { socket.disconnect(); };
  }, [tournamentId]);

  useEffect(() => { prevSecs.current = timerState?.remainingsecs ?? 0; }, [timerState?.remainingsecs]);

  function emit(event: string) {
    socketRef.current?.emit(event, { tournamentId });
  }

  const currentBlind = timerState?.blinds.find(b => b.level === timerState.currentlevel);
  const secs = timerState?.remainingsecs ?? 0;
  const mins = Math.floor(secs / 60);
  const sec  = secs % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';

  if (isLoading) return <div className="text-pit-text text-center mt-8">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Timer display */}
      <div className="card text-center space-y-4">
        {currentBlind ? (
          <>
            <p className="text-pit-text text-sm font-medium uppercase tracking-wider">{currentBlind.label} — Level {timerState?.currentlevel}</p>
            <p className={`text-7xl font-bold font-mono tabular-nums ${urgency}`}>{timeStr}</p>
            <div className="flex justify-center gap-8 text-lg">
              <span className="text-pit-text">SB: <strong className="text-white">{currentBlind.smallblind.toLocaleString()}</strong></span>
              <span className="text-pit-text">BB: <strong className="text-white">{currentBlind.bigblind.toLocaleString()}</strong></span>
              {currentBlind.ante > 0 && <span className="text-pit-text">Ante: <strong className="text-white">{currentBlind.ante.toLocaleString()}</strong></span>}
            </div>
          </>
        ) : (
          <p className="text-pit-text py-8">No blind structure set. Add levels below.</p>
        )}

        {isOwner && currentBlind && (
          <div className="flex justify-center gap-3 flex-wrap">
            <button className="btn-ghost" onClick={() => emit('timer-prev')}>← Prev</button>
            {timerState?.running
              ? <button className="btn-danger" onClick={() => emit('timer-pause')}>⏸ Pause</button>
              : <button className="btn-primary" onClick={() => emit('timer-start')}>▶ Start</button>
            }
            <button className="btn-ghost" onClick={() => emit('timer-next')}>Next →</button>
          </div>
        )}
      </div>

      {/* Level list / editor */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Blind Structure</h3>
          {isOwner && (
            <button className="btn-ghost text-sm" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>
        {editing ? (
          <BlindEditor
            initial={blinds}
            onSave={(levels) => saveMutation.mutate(levels)}
            loading={saveMutation.isPending}
            error={saveMutation.error?.message}
          />
        ) : (
          <BlindTable blinds={blinds} currentLevel={timerState?.currentlevel} />
        )}
      </div>
    </div>
  );
}

function BlindTable({ blinds, currentLevel }: { blinds: BlindLevel[]; currentLevel?: number }) {
  if (blinds.length === 0) return <p className="text-pit-text text-sm">No levels defined.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-pit-text border-b border-pit-border">
            <th className="text-left pb-2">Level</th>
            <th className="text-right pb-2">SB</th>
            <th className="text-right pb-2">BB</th>
            <th className="text-right pb-2">Ante</th>
            <th className="text-right pb-2">Min</th>
          </tr>
        </thead>
        <tbody>
          {blinds.map(b => (
            <tr key={b.id} className={`border-b border-pit-border/40 ${b.level === currentLevel ? 'bg-pit-teal/10' : ''}`}>
              <td className="py-1.5">{b.label || `Level ${b.level}`}{b.islastlevel && <span className="ml-1 text-xs text-pit-muted">(last)</span>}</td>
              <td className="text-right">{b.smallblind.toLocaleString()}</td>
              <td className="text-right">{b.bigblind.toLocaleString()}</td>
              <td className="text-right">{b.ante > 0 ? b.ante.toLocaleString() : '—'}</td>
              <td className="text-right">{b.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DraftLevel = Omit<BlindLevel, 'id'>;

function BlindEditor({ initial, onSave, loading, error }: {
  initial: BlindLevel[];
  onSave: (levels: DraftLevel[]) => void;
  loading: boolean;
  error?: string;
}) {
  const [levels, setLevels] = useState<DraftLevel[]>(
    initial.length > 0
      ? initial.map(({ id: _id, ...rest }) => rest)
      : [{ level: 1, label: 'Level 1', smallblind: 25, bigblind: 50, ante: 0, minutes: 20, islastlevel: false }]
  );

  function update(i: number, field: keyof DraftLevel, value: string | number | boolean) {
    setLevels(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function addLevel() {
    const last = levels[levels.length - 1];
    setLevels(prev => [...prev, {
      level: prev.length + 1,
      label: `Level ${prev.length + 1}`,
      smallblind: last ? last.bigblind : 25,
      bigblind: last ? last.bigblind * 2 : 50,
      ante: last?.ante ?? 0,
      minutes: last?.minutes ?? 20,
      islastlevel: false,
    }]);
  }

  function removeLevel(i: number) {
    setLevels(prev => prev.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, level: idx + 1 })));
  }

  function save() {
    const final = levels.map((l, i) => ({ ...l, islastlevel: i === levels.length - 1 }));
    onSave(final);
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {levels.map((l, i) => (
          <div key={i} className="grid grid-cols-6 gap-1.5 items-center text-sm">
            <input className="input col-span-2 text-xs" placeholder="Label" value={l.label} onChange={e => update(i, 'label', e.target.value)} />
            <input className="input text-xs" type="number" placeholder="SB" min="0" value={l.smallblind} onChange={e => update(i, 'smallblind', Number(e.target.value))} />
            <input className="input text-xs" type="number" placeholder="BB" min="0" value={l.bigblind} onChange={e => update(i, 'bigblind', Number(e.target.value))} />
            <input className="input text-xs" type="number" placeholder="Min" min="1" value={l.minutes} onChange={e => update(i, 'minutes', Number(e.target.value))} />
            <button onClick={() => removeLevel(i)} className="text-red-400 hover:text-red-300 text-lg leading-none">×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <button className="btn-ghost text-sm" onClick={addLevel}>+ Add Level</button>
        <button className="btn-primary text-sm" onClick={save} disabled={loading}>
          {loading ? 'Saving…' : 'Save Structure'}
        </button>
      </div>
    </div>
  );
}
