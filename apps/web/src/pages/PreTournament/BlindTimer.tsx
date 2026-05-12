import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Howl } from 'howler';
import { Calculator, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { api, BlindLevel, TournamentChip } from '../../api/client';

interface TimerTick {
  remainingsecs: number;
  currentlevel: number;
  running: boolean;
}

interface TimerState extends TimerTick {
  blinds: BlindLevel[];
  tournamentid: string;
}

interface BlindTimerProps {
  tournamentId: string;
  isOwner: boolean;
  playerCount: number;
}

type DraftLevel = Omit<BlindLevel, 'id'>;

interface EditableBlindLevel {
  level: number;
  label: string;
  smallblind: string;
  bigblind: string;
  ante: string;
  minutes: string;
  islastlevel: boolean;
}

interface EditableChip {
  denomination: string;
  color: string;
  quantity: string;
  sortorder: number;
}

interface CalculatorSettings {
  players: string;
  startingStack: string;
  targetHours: string;
  levelMinutes: string;
  startingBigBlind: string;
  chipIncrement: string;
  finishBigBlinds: string;
  anteStartLevel: string;
  antePercent: string;
}

interface ParsedCalculatorSettings {
  players: number;
  startingStack: number;
  targetHours: number;
  levelMinutes: number;
  startingBigBlind: number;
  chipIncrement: number;
  finishBigBlinds: number;
  anteStartLevel: number;
  antePercent: number;
}

function createSound(src: string): Howl | null {
  try {
    return new Howl({ src: [src], volume: 0.7 });
  } catch (error) {
    console.error('Unable to initialize timer sound', error);
    return null;
  }
}

const CHIP_COLORS = [
  { name: 'White', value: '#f8fafc' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Black', value: '#111827' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#64748b' },
];

const DEFAULT_CHIPS: EditableChip[] = [
  { denomination: '25', color: 'Green', quantity: '0', sortorder: 0 },
  { denomination: '100', color: 'Black', quantity: '0', sortorder: 1 },
  { denomination: '500', color: 'Purple', quantity: '0', sortorder: 2 },
  { denomination: '1000', color: 'Yellow', quantity: '0', sortorder: 3 },
  { denomination: '5000', color: 'Red', quantity: '0', sortorder: 4 },
];

export default function BlindTimer({ tournamentId, isOwner, playerCount }: BlindTimerProps) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const soundsRef = useRef<{
    beep5min: Howl | null;
    beep1min: Howl | null;
    beepEnd: Howl | null;
  } | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [editing, setEditing] = useState(false);

  const { data: blinds = [], isLoading } = useQuery({
    queryKey: ['blinds', tournamentId],
    queryFn: () => api.getBlinds(tournamentId),
  });

  const { data: chips = [] } = useQuery({
    queryKey: ['chips', tournamentId],
    queryFn: () => api.getChips(tournamentId),
  });

  const saveMutation = useMutation({
    mutationFn: (levels: DraftLevel[]) => api.saveBlinds(tournamentId, levels),
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

  const saveChipsMutation = useMutation({
    mutationFn: (values: Omit<TournamentChip, 'id'>[]) => api.saveChips(tournamentId, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chips', tournamentId] }),
  });

  useEffect(() => {
    if (!soundsRef.current) {
      soundsRef.current = {
        beep5min: createSound('https://od.lk/s/NjFfMTU0NDk5NTdf/5minwarning.mp3'),
        beep1min: createSound('https://od.lk/s/NjFfMTU0NDk5NThf/1minwarning.mp3'),
        beepEnd: createSound('https://od.lk/s/NjFfMTU0NDk5NTlf/levelend.mp3'),
      };
    }

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', tournamentId);
    socket.on('timer-state', (state: TimerState) => setTimerState(state));
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimerState((current) => (current ? { ...current, ...tick } : null));
      if (tick.remainingsecs === 300) soundsRef.current?.beep5min?.play();
      if (tick.remainingsecs === 60) soundsRef.current?.beep1min?.play();
      if (tick.remainingsecs === 0) soundsRef.current?.beepEnd?.play();
    });
    return () => {
      socket.disconnect();
    };
  }, [tournamentId]);

  function emit(event: string) {
    socketRef.current?.emit(event, { tournamentId });
  }

  const effectiveBlinds = (timerState?.blinds.length ? timerState.blinds : blinds)
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
  const currentBlind = effectiveBlinds.find((blind) => blind.level === effectiveLevel) ?? effectiveBlinds[0];
  const visibleBlinds = blinds.length > 0 ? blinds : effectiveBlinds;
  const secs = timerState?.remainingsecs ?? (currentBlind?.minutes ?? 0) * 60;
  const mins = Math.floor(secs / 60);
  const sec = secs % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';

  if (isLoading) return <div className="mt-8 text-center text-pit-text">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="card space-y-4 text-center">
        {currentBlind ? (
          <>
            <p className="text-sm font-medium uppercase tracking-wider text-pit-text">
              {currentBlind.label} - Level {effectiveLevel}
            </p>
            <p className={`font-mono text-7xl font-bold tabular-nums ${urgency}`}>{timeStr}</p>
            <div className="flex flex-wrap justify-center gap-8 text-lg">
              <span className="text-pit-text">SB: <strong className="text-white">{currentBlind.smallblind.toLocaleString()}</strong></span>
              <span className="text-pit-text">BB: <strong className="text-white">{currentBlind.bigblind.toLocaleString()}</strong></span>
              {currentBlind.ante > 0 && (
                <span className="text-pit-text">Ante: <strong className="text-white">{currentBlind.ante.toLocaleString()}</strong></span>
              )}
            </div>
          </>
        ) : effectiveBlinds.length === 0 ? (
          <p className="py-8 text-pit-text">No blind structure yet.</p>
        ) : null}

        {isOwner && currentBlind && (
          <div className="flex flex-wrap justify-center gap-3">
            <button className="btn-ghost" onClick={() => emit('timer-prev')}>Prev</button>
            {timerState?.running
              ? <button className="btn-danger" onClick={() => emit('timer-pause')}>Pause</button>
              : <button className="btn-primary" onClick={() => emit('timer-start')}>Start</button>
            }
            <button className="btn-ghost" onClick={() => emit('timer-next')}>Next</button>
          </div>
        )}

        {(visibleBlinds.length > 0 || editing || isOwner) && (
          <div className="border-t border-pit-border pt-4 text-left">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Blind Structure</h3>
              {isOwner && (
                <button className="btn-ghost text-sm" onClick={() => setEditing(!editing)}>
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              )}
            </div>
            {editing ? (
              <BlindEditor
                initial={visibleBlinds}
                onSave={(levels) => saveMutation.mutate(levels)}
                loading={saveMutation.isPending}
                error={saveMutation.error?.message}
              />
            ) : (
              <BlindTable blinds={visibleBlinds} currentLevel={effectiveLevel} />
            )}
          </div>
        )}
      </div>

      <ChipSet
        chips={chips}
        isOwner={isOwner}
        saving={saveChipsMutation.isPending}
        error={saveChipsMutation.error?.message}
        onSave={(values) => saveChipsMutation.mutate(values)}
      />

      {isOwner && (
        <BlindCalculator
          playerCount={playerCount}
          saving={saveMutation.isPending}
          error={saveMutation.error?.message}
          onSave={(levels) => saveMutation.mutate(levels)}
        />
      )}
    </div>
  );
}

function BlindCalculator({
  playerCount,
  saving,
  error,
  onSave,
}: {
  playerCount: number;
  saving: boolean;
  error?: string;
  onSave: (levels: DraftLevel[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<CalculatorSettings>({
    players: String(Math.max(playerCount || 9, 2)),
    startingStack: '10000',
    targetHours: '3',
    levelMinutes: '20',
    startingBigBlind: '50',
    chipIncrement: '25',
    finishBigBlinds: '10',
    anteStartLevel: '0',
    antePercent: '10',
  });

  const parsedSettings = useMemo(() => parseCalculatorSettings(settings), [settings]);
  const generatedLevels = useMemo(() => generateBlindStructure(parsedSettings), [parsedSettings]);
  const totalChips = parsedSettings.players * parsedSettings.startingStack;

  function update(field: keyof CalculatorSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <Calculator size={18} className="text-pit-teal" />
          <h3 className="font-semibold">Blind Structure Calculator</h3>
        </div>
        <button type="button" className="btn-ghost text-sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <>
          {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <NumberField label="Players" value={settings.players} min={2} onChange={(value) => update('players', value)} />
            <NumberField label="Starting stack" value={settings.startingStack} min={100} step={100} onChange={(value) => update('startingStack', value)} />
            <NumberField label="Target hours" value={settings.targetHours} min={0.5} step={0.5} onChange={(value) => update('targetHours', value)} />
            <NumberField label="Level minutes" value={settings.levelMinutes} min={1} onChange={(value) => update('levelMinutes', value)} />
            <NumberField label="Starting BB" value={settings.startingBigBlind} min={1} onChange={(value) => update('startingBigBlind', value)} />
            <NumberField label="Chip increment" value={settings.chipIncrement} min={1} onChange={(value) => update('chipIncrement', value)} />
            <NumberField label="Finish BBs in play" value={settings.finishBigBlinds} min={4} onChange={(value) => update('finishBigBlinds', value)} />
            <NumberField label="Ante from level" value={settings.anteStartLevel} min={0} onChange={(value) => update('anteStartLevel', value)} />
          </div>

          <div className="rounded-lg border border-pit-border bg-pit-bg/50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-pit-text">
              <div className="flex items-center gap-2">
                <Wand2 size={15} className="text-pit-teal" />
                Total chips: <span className="font-semibold text-white">{totalChips.toLocaleString()}</span>
              </div>
              <button className="btn-primary gap-2" onClick={() => onSave(generatedLevels)} disabled={saving || generatedLevels.length === 0}>
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Generated'}
              </button>
            </div>
            <BlindTable blinds={generatedLevels.map((level, index) => ({ ...level, id: `generated-${index}` }))} />
          </div>
        </>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">{label}</span>
      <input
        className="input"
        type="text"
        inputMode={step % 1 === 0 ? 'numeric' : 'decimal'}
        aria-valuemin={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ChipSet({
  chips,
  isOwner,
  saving,
  error,
  onSave,
}: {
  chips: TournamentChip[];
  isOwner: boolean;
  saving: boolean;
  error?: string;
  onSave: (chips: Omit<TournamentChip, 'id'>[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const totalBank = chips.reduce((sum, chip) => sum + (Number(chip.denomination) * Number(chip.quantity)), 0);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Chips In Play</h3>
          {chips.length > 0 && <p className="mt-1 text-sm text-pit-text">Bank: {totalBank.toLocaleString()}</p>}
        </div>
        {isOwner && (
          <button type="button" className="btn-ghost text-sm" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Cancel' : 'Edit chips'}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {editing ? (
        <ChipEditor
          initial={chips}
          saving={saving}
          onSave={(values) => {
            onSave(values);
            setEditing(false);
          }}
        />
      ) : (
        <ChipLegend chips={chips} />
      )}
    </div>
  );
}

function ChipLegend({ chips }: { chips: TournamentChip[] }) {
  if (chips.length === 0) return <p className="text-sm text-pit-text">No chip set configured.</p>;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {chips.map((chip) => (
        <div key={chip.id} className="flex items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2">
          <ChipSwatch color={chip.color} />
          <div className="min-w-0">
            <p className="font-semibold text-white">{Number(chip.denomination).toLocaleString()}</p>
            <p className="text-xs text-pit-muted">{chip.quantity.toLocaleString()} chips</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChipEditor({
  initial,
  saving,
  onSave,
}: {
  initial: TournamentChip[];
  saving: boolean;
  onSave: (chips: Omit<TournamentChip, 'id'>[]) => void;
}) {
  const [chips, setChips] = useState<EditableChip[]>(
    initial.length > 0
      ? initial.map((chip, index) => ({
        denomination: String(chip.denomination),
        color: chip.color,
        quantity: String(chip.quantity),
        sortorder: chip.sortorder ?? index,
      }))
      : DEFAULT_CHIPS
  );

  function update(index: number, field: keyof EditableChip, value: string | number) {
    setChips((current) => current.map((chip, chipIndex) => chipIndex === index ? { ...chip, [field]: value } : chip));
  }

  function addChip() {
    setChips((current) => [...current, { denomination: '', color: 'White', quantity: '', sortorder: current.length }]);
  }

  function removeChip(index: number) {
    setChips((current) => current
      .filter((_chip, chipIndex) => chipIndex !== index)
      .map((chip, chipIndex) => ({ ...chip, sortorder: chipIndex })));
  }

  function save() {
    onSave(chips
      .map((chip, index) => ({
        denomination: parseSetting(chip.denomination, 0),
        color: chip.color,
        quantity: parseSetting(chip.quantity, 0),
        sortorder: index,
      }))
      .filter((chip) => chip.denomination > 0));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {chips.map((chip, index) => (
          <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Denom</span>
              <input className="input" type="text" inputMode="numeric" value={chip.denomination} onChange={(event) => update(index, 'denomination', event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Color</span>
              <select className="input" value={chip.color} onChange={(event) => update(index, 'color', event.target.value)}>
                {CHIP_COLORS.map((color) => (
                  <option key={color.name} value={color.name}>{color.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Qty</span>
              <input className="input" type="text" inputMode="numeric" value={chip.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} />
            </label>
            <button type="button" className="btn-ghost h-10 w-10 px-0" onClick={() => removeChip(index)} aria-label="Remove chip">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost text-sm" onClick={addChip}>
          <Plus size={15} />
          Add chip
        </button>
        <button type="button" className="btn-primary text-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save chips'}
        </button>
      </div>
    </div>
  );
}

function ChipSwatch({ color }: { color: string }) {
  const hex = CHIP_COLORS.find((chipColor) => chipColor.name === color)?.value ?? color;
  return (
    <span
      className="h-9 w-9 shrink-0 rounded-full border-4 border-white/20 shadow-inner"
      style={{ backgroundColor: hex }}
      title={color}
    />
  );
}

function BlindTable({ blinds, currentLevel }: { blinds: BlindLevel[]; currentLevel?: number }) {
  if (blinds.length === 0) return <p className="text-sm text-pit-text">No levels defined.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-pit-border text-pit-text">
            <th className="pb-2 text-left">Level</th>
            <th className="pb-2 text-right">SB</th>
            <th className="pb-2 text-right">BB</th>
            <th className="pb-2 text-right">Ante</th>
            <th className="pb-2 text-right">Min</th>
          </tr>
        </thead>
        <tbody>
          {blinds.map((blind) => (
            <tr key={blind.id} className={`border-b border-pit-border/40 ${blind.level === currentLevel ? 'bg-pit-teal/10' : ''}`}>
              <td className="py-1.5">
                {blind.label || `Level ${blind.level}`}
                {blind.islastlevel && <span className="ml-1 text-xs text-pit-muted">(last)</span>}
              </td>
              <td className="text-right">{blind.smallblind.toLocaleString()}</td>
              <td className="text-right">{blind.bigblind.toLocaleString()}</td>
              <td className="text-right">{blind.ante > 0 ? blind.ante.toLocaleString() : '-'}</td>
              <td className="text-right">{blind.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlindEditor({
  initial,
  onSave,
  loading,
  error,
}: {
  initial: BlindLevel[];
  onSave: (levels: DraftLevel[]) => void;
  loading: boolean;
  error?: string;
}) {
  const [levels, setLevels] = useState<EditableBlindLevel[]>(
    initial.length > 0
      ? initial.map(({ id: _id, smallblind, bigblind, ante, minutes, ...rest }) => ({
        ...rest,
        smallblind: String(smallblind),
        bigblind: String(bigblind),
        ante: String(ante),
        minutes: String(minutes),
      }))
      : [{ level: 1, label: 'Level 1', smallblind: '25', bigblind: '50', ante: '0', minutes: '20', islastlevel: false }]
  );

  function update(index: number, field: keyof EditableBlindLevel, value: string | number | boolean) {
    setLevels((current) => current.map((level, levelIndex) => levelIndex === index ? { ...level, [field]: value } : level));
  }

  function addLevel() {
    const last = levels[levels.length - 1];
    const lastBigBlind = parseSetting(last?.bigblind ?? '', 50);
    setLevels((current) => [...current, {
      level: current.length + 1,
      label: `Level ${current.length + 1}`,
      smallblind: String(lastBigBlind),
      bigblind: String(lastBigBlind * 2),
      ante: last?.ante ?? '0',
      minutes: last?.minutes ?? '20',
      islastlevel: false,
    }]);
  }

  function removeLevel(index: number) {
    setLevels((current) => current
      .filter((_level, levelIndex) => levelIndex !== index)
      .map((level, levelIndex) => ({ ...level, level: levelIndex + 1 })));
  }

  function save() {
    onSave(levels.map((level, index) => ({
      ...level,
      smallblind: parseSetting(level.smallblind, 0),
      bigblind: parseSetting(level.bigblind, 0),
      ante: parseSetting(level.ante, 0),
      minutes: parseSetting(level.minutes, 1),
      islastlevel: index === levels.length - 1,
    })));
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {levels.map((level, index) => (
          <div key={index} className="grid grid-cols-6 items-center gap-1.5 text-sm">
            <input className="input col-span-2 text-xs" placeholder="Label" value={level.label} onChange={(event) => update(index, 'label', event.target.value)} />
            <input className="input text-xs" type="text" inputMode="numeric" placeholder="SB" value={level.smallblind} onChange={(event) => update(index, 'smallblind', event.target.value)} />
            <input className="input text-xs" type="text" inputMode="numeric" placeholder="BB" value={level.bigblind} onChange={(event) => update(index, 'bigblind', event.target.value)} />
            <input className="input text-xs" type="text" inputMode="numeric" placeholder="Min" value={level.minutes} onChange={(event) => update(index, 'minutes', event.target.value)} />
            <button type="button" onClick={() => removeLevel(index)} className="text-lg leading-none text-red-400 hover:text-red-300">x</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-ghost text-sm" onClick={addLevel}>Add Level</button>
        <button type="button" className="btn-primary text-sm" onClick={save} disabled={loading}>
          {loading ? 'Saving...' : 'Save Structure'}
        </button>
      </div>
    </div>
  );
}

function parseCalculatorSettings(settings: CalculatorSettings): ParsedCalculatorSettings {
  return {
    players: parseSetting(settings.players, 2),
    startingStack: parseSetting(settings.startingStack, 100),
    targetHours: parseSetting(settings.targetHours, 0.5),
    levelMinutes: parseSetting(settings.levelMinutes, 1),
    startingBigBlind: parseSetting(settings.startingBigBlind, 1),
    chipIncrement: parseSetting(settings.chipIncrement, 1),
    finishBigBlinds: parseSetting(settings.finishBigBlinds, 4),
    anteStartLevel: parseSetting(settings.anteStartLevel, 0),
    antePercent: parseSetting(settings.antePercent, 0),
  };
}

function parseSetting(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function generateBlindStructure(settings: ParsedCalculatorSettings): DraftLevel[] {
  const safePlayers = Math.max(settings.players || 0, 2);
  const safeStack = Math.max(settings.startingStack || 0, 100);
  const safeMinutes = Math.max(settings.levelMinutes || 0, 1);
  const safeHours = Math.max(settings.targetHours || 0, 0.5);
  const increment = Math.max(settings.chipIncrement || 0, 1);
  const startBigBlind = roundTo(Math.max(settings.startingBigBlind || 0, increment), increment);
  const totalChips = safePlayers * safeStack;
  const targetBigBlind = roundTo(Math.max(startBigBlind, totalChips / Math.max(settings.finishBigBlinds || 0, 4)), increment);
  const levelCount = clamp(Math.round((safeHours * 60) / safeMinutes), 4, 30);
  const growthFactor = levelCount <= 1 ? 1 : Math.pow(targetBigBlind / startBigBlind, 1 / (levelCount - 1));

  let previousBigBlind = 0;
  return Array.from({ length: levelCount }, (_unused, index) => {
    const level = index + 1;
    const rawBigBlind = startBigBlind * Math.pow(growthFactor, index);
    let bigblind = roundTo(rawBigBlind, increment);
    if (bigblind <= previousBigBlind) bigblind = previousBigBlind + increment;
    previousBigBlind = bigblind;

    const smallblind = Math.max(increment, roundTo(bigblind / 2, increment));
    const ante = settings.anteStartLevel > 0 && level >= settings.anteStartLevel
      ? roundTo((bigblind * Math.max(settings.antePercent, 0)) / 100, increment)
      : 0;

    return {
      level,
      label: `Level ${level}`,
      smallblind,
      bigblind,
      ante,
      minutes: safeMinutes,
      islastlevel: level === levelCount,
    };
  });
}

function roundTo(value: number, increment: number) {
  return Math.max(increment, Math.round(value / increment) * increment);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
