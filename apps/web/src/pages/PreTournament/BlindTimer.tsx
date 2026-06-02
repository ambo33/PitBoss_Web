import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, GripVertical, Save, Wand2 } from 'lucide-react';
import { api, BlindLevel, Tournament } from '../../api/client';
import {
  calculateTotalChips,
  defaultChipUpDenominations,
  DEFAULT_CHIP_DENOMINATIONS,
  DEFAULT_COLOR_UPS,
  generateBlindStructure as buildBlindStructure,
} from '../../utils/blindCalculator';

interface BlindTimerProps {
  tournamentId: string;
  isOwner: boolean;
  playerCount: number;
  tournament: Tournament;
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

interface CalculatorSettings {
  players: string;
  startingStack: string;
  targetHours: string;
  levelMinutes: string;
  startingBigBlind: string;
  chipDenominations: string;
  finishBigBlinds: string;
  breakCount: string;
  breakMinutes: string;
  anteStartLevel: string;
  colorUps: string;
  expectedRebuys: string;
  expectedAddons: string;
}

interface ParsedCalculatorSettings {
  players: number;
  startingStack: number;
  targetHours: number;
  levelMinutes: number;
  startingBigBlind: number;
  chipDenominations: string;
  finishBigBlinds: number;
  breakCount: number;
  breakMinutes: number;
  anteStartLevel: number;
  colorUps: string;
  expectedRebuys: number;
  expectedAddons: number;
  rebuyChips: number;
  addonChips: number;
}

function toDraftLevel(level: BlindLevel): DraftLevel {
  return {
    level: Number(level.level),
    label: level.label ?? `Level ${level.level}`,
    smallblind: Number(level.smallblind),
    bigblind: Number(level.bigblind),
    ante: Number(level.ante),
    minutes: Number(level.minutes),
    islastlevel: Boolean(level.islastlevel),
  };
}

export default function BlindTimer({ tournamentId, isOwner, tournament }: BlindTimerProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saveStructureName, setSaveStructureName] = useState('');

  const { data: blinds = [], isLoading } = useQuery({
    queryKey: ['blinds', tournamentId],
    queryFn: () => api.getBlinds(tournamentId),
  });

  const saveMutation = useMutation({
    mutationFn: (levels: DraftLevel[]) => api.saveBlinds(tournamentId, levels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blinds', tournamentId] });
      setEditing(false);
    },
  });

  const saveGroupStructureMutation = useMutation({
    mutationFn: ({ name, levels }: { name: string; levels: DraftLevel[] }) =>
      api.createGroupBlindStructure(tournament.groupid!, { name, levels }),
    onSuccess: () => {
      setSaveStructureName('');
      qc.invalidateQueries({ queryKey: ['group', tournament.groupid, 'blind-structures'] });
    },
  });

  const visibleBlinds = blinds;

  if (isLoading) return <div className="mt-8 text-center text-pit-text">Loading...</div>;

  return (
    <div className="space-y-6">
      {isOwner && (
        <BlindCalculator
          tournament={tournament}
          saving={saveMutation.isPending}
          error={saveMutation.error?.message}
          onSave={(levels) => saveMutation.mutate(levels)}
        />
      )}

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
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
          <BlindTable blinds={visibleBlinds} />
        )}
        {isOwner && tournament.groupid && visibleBlinds.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-pit-border bg-pit-bg/40 p-3 sm:flex-row sm:items-center">
            <input
              className="input flex-1"
              placeholder="Save this structure to group as..."
              value={saveStructureName}
              onChange={(event) => setSaveStructureName(event.target.value)}
            />
            <button
              className="btn-ghost shrink-0"
              onClick={() => saveGroupStructureMutation.mutate({
                name: saveStructureName.trim(),
                levels: visibleBlinds.map(toDraftLevel),
              })}
              disabled={saveGroupStructureMutation.isPending || !saveStructureName.trim()}
            >
              <Save size={14} />
              Save to Group
            </button>
          </div>
        )}
        {saveGroupStructureMutation.error && (
          <p className="text-sm text-red-400">{saveGroupStructureMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}

function BlindCalculator({
  tournament,
  saving,
  error,
  onSave,
}: {
  tournament: Tournament;
  saving: boolean;
  error?: string;
  onSave: (levels: DraftLevel[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const defaultCalculatorPlayers = getDefaultCalculatorPlayers(tournament);
  const [settings, setSettings] = useState<CalculatorSettings>({
    players: String(defaultCalculatorPlayers),
    startingStack: toNumber(tournament.rebuychips) > 0 ? String(toNumber(tournament.rebuychips)) : '10000',
    targetHours: '3',
    levelMinutes: '20',
    startingBigBlind: '50',
    chipDenominations: DEFAULT_CHIP_DENOMINATIONS,
    finishBigBlinds: '14',
    breakCount: '0',
    breakMinutes: '10',
    anteStartLevel: '0',
    colorUps: DEFAULT_COLOR_UPS,
    expectedRebuys: tournament.rebuyprice > 0 ? String(Math.max(Math.round(defaultCalculatorPlayers * 0.4), 0)) : '0',
    expectedAddons: tournament.addonprice > 0 ? String(Math.max(Math.round(defaultCalculatorPlayers * 0.5), 0)) : '0',
  });

  const parsedSettings = useMemo(
    () => parseCalculatorSettings(settings, tournament),
    [settings, tournament]
  );
  const generatedLevels = useMemo(() => generateBlindStructure(parsedSettings), [parsedSettings]);
  const totalChips = calculateTotalChips(parsedSettings);
  const rebuysEnabled = toNumber(tournament.rebuyprice) > 0 && toNumber(tournament.rebuychips) > 0;
  const addonsEnabled = toNumber(tournament.addonprice) > 0 && toNumber(tournament.addonchips) > 0;

  function update(field: keyof CalculatorSettings, value: string) {
    setSettings((current) => {
      if (field !== 'chipDenominations') return { ...current, [field]: value };
      const currentDefault = defaultChipUpDenominations(current.chipDenominations);
      return {
        ...current,
        chipDenominations: value,
        colorUps: current.colorUps.trim() === currentDefault ? defaultChipUpDenominations(value) : current.colorUps,
      };
    });
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
            <NumberField label="Breaks" value={settings.breakCount} min={0} onChange={(value) => update('breakCount', value)} />
            <NumberField label="Break minutes" value={settings.breakMinutes} min={1} onChange={(value) => update('breakMinutes', value)} />
            <NumberField label="Starting BB" value={settings.startingBigBlind} min={1} onChange={(value) => update('startingBigBlind', value)} />
            <TextField
              label="Chip denominations"
              value={settings.chipDenominations}
              placeholder="25,50,100,500,1000"
              onChange={(value) => update('chipDenominations', value)}
            />
            <TextField
              label="Chip up denominations"
              value={settings.colorUps}
              placeholder="25,50"
              onChange={(value) => update('colorUps', value)}
            />
            <NumberField label="Ante starts at level" value={settings.anteStartLevel} min={0} onChange={(value) => update('anteStartLevel', value)} />
            {rebuysEnabled && (
              <NumberField
                label={`Expected rebuys (${toNumber(tournament.rebuychips).toLocaleString()} chips ea)`}
                value={settings.expectedRebuys}
                min={0}
                onChange={(value) => update('expectedRebuys', value)}
              />
            )}
            {addonsEnabled && (
              <NumberField
                label={`Expected add-ons (${toNumber(tournament.addonchips).toLocaleString()} chips ea)`}
                value={settings.expectedAddons}
                min={0}
                onChange={(value) => update('expectedAddons', value)}
              />
            )}
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

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">{label}</span>
      <input
        className="input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
          {blinds.map((blind) => {
            const breakRow = isBreakLevel(blind);
            const breakLabel = formatBreakLabel(blind);
            return (
              <tr key={blind.id} className={`border-b border-pit-border/40 ${blind.level === currentLevel ? 'bg-pit-teal/10' : ''} ${breakRow ? 'bg-yellow-300/5 text-yellow-100' : ''}`}>
                <td className="py-1.5">
                  {breakRow ? breakLabel : `Level ${blind.level}`}
                  {blind.islastlevel && <span className="ml-1 text-xs text-pit-muted">(last)</span>}
                </td>
                {breakRow ? (
                  <td colSpan={3} className="text-right text-xs uppercase tracking-wide text-yellow-100/80">Break</td>
                ) : (
                  <>
                    <td className="text-right">{blind.smallblind.toLocaleString()}</td>
                    <td className="text-right">{blind.bigblind.toLocaleString()}</td>
                    <td className="text-right">{blind.ante > 0 ? blind.ante.toLocaleString() : '-'}</td>
                  </>
                )}
                <td className="text-right">{blind.minutes}</td>
              </tr>
            );
          })}
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
        level: rest.level,
        label: rest.label ?? `Level ${rest.level}`,
        smallblind: String(smallblind),
        bigblind: String(bigblind),
        ante: String(ante),
        minutes: String(minutes),
        islastlevel: Boolean(rest.islastlevel),
      }))
      : [{ level: 1, label: 'Level 1', smallblind: '25', bigblind: '50', ante: '0', minutes: '20', islastlevel: false }]
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const editorGridClass = 'grid grid-cols-[26px_150px_minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_90px_minmax(11rem,1.25fr)_30px] items-center gap-2';

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

  function addBreak() {
    setLevels((current) => [...current, {
      level: current.length + 1,
      label: `Break ${current.filter((level) => isBreakEditableLevel(level)).length + 1}`,
      smallblind: '0',
      bigblind: '0',
      ante: '0',
      minutes: '10',
      islastlevel: false,
    }]);
  }

  function removeLevel(index: number) {
    setLevels((current) => current
      .filter((_level, levelIndex) => levelIndex !== index)
      .map((level, levelIndex) => ({ ...level, level: levelIndex + 1 })));
  }

  function moveLevel(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setLevels((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return current;
      next.splice(toIndex, 0, moved);
      return next.map((level, levelIndex) => ({ ...level, level: levelIndex + 1 }));
    });
  }

  function save() {
    onSave(levels.map((level, index) => ({
      ...level,
      label: isBreakEditableLevel(level) ? normalizeEditableBreakLabel(level.label, index) : `Level ${index + 1}`,
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
      <div className="overflow-x-auto">
        <div className="min-w-[50rem]">
          <div className={`${editorGridClass} border-b border-pit-border px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-pit-muted`}>
            <span aria-hidden="true" />
            <span className="px-2 pb-1">Level</span>
            <span className="px-3 pb-1">SB</span>
            <span className="px-3 pb-1">BB</span>
            <span className="px-3 pb-1">Ante</span>
            <span className="px-3 pb-1">Min</span>
            <span className="px-3 pb-1">Break note</span>
            <span aria-hidden="true" />
          </div>
          <div className="space-y-2 pt-2">
            {levels.map((level, index) => {
              const breakRow = isBreakEditableLevel(level);
              const rowLabel = breakRow ? getBreakBaseLabel(level.label, index) : `Level ${index + 1}`;
              return (
                <div
                  key={index}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex != null) moveLevel(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`${editorGridClass} rounded-lg text-sm ${dragIndex === index ? 'bg-pit-teal/10' : ''}`}
                >
                  <div className="flex h-full cursor-grab items-center justify-center text-pit-muted active:cursor-grabbing">
                    <GripVertical size={15} />
                  </div>
                  <div className={`px-2 text-xs font-medium ${breakRow ? 'text-yellow-100' : 'text-pit-text'}`}>{rowLabel}</div>
                  {breakRow ? (
                    <div className="col-span-3 rounded-lg border border-yellow-300/15 bg-yellow-300/5 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-yellow-100">
                      Break
                    </div>
                  ) : (
                    <>
                      <input className="input text-xs" type="text" inputMode="numeric" placeholder="SB" aria-label={`Level ${index + 1} small blind`} value={level.smallblind} onChange={(event) => update(index, 'smallblind', event.target.value)} />
                      <input className="input text-xs" type="text" inputMode="numeric" placeholder="BB" aria-label={`Level ${index + 1} big blind`} value={level.bigblind} onChange={(event) => update(index, 'bigblind', event.target.value)} />
                      <input className="input text-xs" type="text" inputMode="numeric" placeholder="Ante" aria-label={`Level ${index + 1} ante`} value={level.ante} onChange={(event) => update(index, 'ante', event.target.value)} />
                    </>
                  )}
                  <input className="input text-xs" type="text" inputMode="numeric" placeholder="Min" aria-label={`Level ${index + 1} minutes`} value={level.minutes} onChange={(event) => update(index, 'minutes', event.target.value)} />
                  <input
                    className="input text-xs"
                    type="text"
                    placeholder={breakRow ? 'Optional break note' : '-'}
                    aria-label={`Level ${index + 1} break note`}
                    value={breakRow ? getBreakNote(level.label) : ''}
                    disabled={!breakRow}
                    onChange={(event) => update(index, 'label', buildBreakLabel(level.label, index, event.target.value))}
                  />
                  <button type="button" onClick={() => removeLevel(index)} className="text-lg leading-none text-red-400 hover:text-red-300">x</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-ghost text-sm" onClick={addLevel}>Add Level</button>
        <button type="button" className="btn-ghost text-sm" onClick={addBreak}>Add Break</button>
        <button type="button" className="btn-primary text-sm" onClick={save} disabled={loading}>
          {loading ? 'Saving...' : 'Save Structure'}
        </button>
      </div>
    </div>
  );
}

function parseCalculatorSettings(settings: CalculatorSettings, tournament: Tournament): ParsedCalculatorSettings {
  return {
    players: parseSetting(settings.players, 2),
    startingStack: parseSetting(settings.startingStack, 100),
    targetHours: parseSetting(settings.targetHours, 0.5),
    levelMinutes: parseSetting(settings.levelMinutes, 1),
    startingBigBlind: parseSetting(settings.startingBigBlind, 1),
    chipDenominations: settings.chipDenominations,
    finishBigBlinds: parseSetting(settings.finishBigBlinds, 14),
    breakCount: Math.max(0, Math.floor(parseSetting(settings.breakCount, 0))),
    breakMinutes: parseSetting(settings.breakMinutes, 1),
    anteStartLevel: parseSetting(settings.anteStartLevel, 0),
    colorUps: settings.colorUps,
    expectedRebuys: parseSetting(settings.expectedRebuys, 0),
    expectedAddons: parseSetting(settings.expectedAddons, 0),
    rebuyChips: toNumber(tournament.rebuychips),
    addonChips: toNumber(tournament.addonchips),
  };
}

function parseSetting(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function generateBlindStructure(settings: ParsedCalculatorSettings): DraftLevel[] {
  return buildBlindStructure(settings);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultCalculatorPlayers(tournament: Tournament): number {
  const maxPlayers = Math.floor(toNumber(tournament.maxplayers));
  return maxPlayers > 0 ? maxPlayers : 10;
}

function isBreakLevel(level: Pick<BlindLevel, 'label' | 'smallblind' | 'bigblind'>): boolean {
  return /^break\b/i.test(String(level.label ?? '')) || (Number(level.smallblind) === 0 && Number(level.bigblind) === 0);
}

function isBreakEditableLevel(level: EditableBlindLevel): boolean {
  return /^break\b/i.test(String(level.label ?? '')) || (parseSetting(level.smallblind, 0) === 0 && parseSetting(level.bigblind, 0) === 0);
}

function formatBreakLabel(level: Pick<BlindLevel, 'label' | 'level'>): string {
  const label = String(level.label ?? '').trim();
  if (/^chip\s*up\b/i.test(label)) return label;
  if (/^break\b/i.test(label)) return label;
  return label ? `Break ${label}` : `Break ${level.level}`;
}

function getBreakBaseLabel(label: string | undefined, index: number): string {
  const fallback = `Break ${index + 1}`;
  const trimmed = String(label ?? '').trim();
  if (!trimmed) return fallback;
  const breakMatch = trimmed.match(/^(Break\s+\d+)(?:\s*[-:]\s*.+)?$/i);
  if (breakMatch?.[1]) return breakMatch[1];
  const noteSplit = trimmed.split(/\s[-:]\s/)[0]?.trim();
  return noteSplit || trimmed;
}

function getBreakNote(label: string | undefined): string {
  const trimmed = String(label ?? '').trim();
  const noteMatch = trimmed.match(/^Break\s+\d+\s*[-:]\s*(.+)$/i);
  return noteMatch?.[1]?.trim() ?? '';
}

function buildBreakLabel(label: string | undefined, index: number, note: string): string {
  const baseLabel = getBreakBaseLabel(label, index);
  const cleanNote = note.trim();
  return cleanNote ? `${baseLabel} - ${cleanNote}` : baseLabel;
}

function normalizeEditableBreakLabel(label: string | undefined, index: number): string {
  return buildBreakLabel(label, index, getBreakNote(label));
}
