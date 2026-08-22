import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Clock3,
  Coffee,
  Coins,
  GripVertical,
  Layers3,
  RotateCcw,
  Save,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api, BlindLevel, Tournament } from '../../api/client';
import {
  calculateTotalChips,
  defaultChipUpDenominations,
  DEFAULT_CHIP_DENOMINATIONS,
  DEFAULT_COLOR_UPS,
  generateBlindStructure as buildBlindStructure,
  parseChipDenominations,
} from '../../utils/blindCalculator';

interface BlindTimerProps {
  tournamentId: string;
  isOwner: boolean;
  playerCount: number;
  tournament: Tournament;
}

export type BlindStructureDraftLevel = Omit<BlindLevel, 'id'>;
export type BlindStructureCalculatorContext = Pick<
  Tournament,
  'maxplayers' | 'rebuychips' | 'addonchips' | 'rebuyprice' | 'addonprice'
>;

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

type CalculatorField = keyof CalculatorSettings;
type CalculatorErrors = Partial<Record<CalculatorField, string>>;

function createDefaultCalculatorSettings(tournament: BlindStructureCalculatorContext): CalculatorSettings {
  const players = getDefaultCalculatorPlayers(tournament);
  return {
    players: String(players),
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
    expectedRebuys: tournament.rebuyprice > 0 ? String(Math.max(Math.round(players * 0.4), 0)) : '0',
    expectedAddons: tournament.addonprice > 0 ? String(Math.max(Math.round(players * 0.5), 0)) : '0',
  };
}

function toDraftLevel(level: BlindLevel): BlindStructureDraftLevel {
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
    mutationFn: (levels: BlindStructureDraftLevel[]) => api.saveBlinds(tournamentId, levels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blinds', tournamentId] });
      setEditing(false);
    },
  });

  const saveGroupStructureMutation = useMutation({
    mutationFn: ({ name, levels }: { name: string; levels: BlindStructureDraftLevel[] }) =>
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
        <BlindStructureCalculator
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

export function BlindStructureCalculator({
  tournament,
  saving,
  error,
  onSave,
  initiallyExpanded = false,
  title = 'Blind Structure Calculator',
  saveLabel = 'Save Generated',
  saveDisabled = false,
}: {
  tournament: BlindStructureCalculatorContext;
  saving: boolean;
  error?: string;
  onSave: (levels: BlindStructureDraftLevel[]) => void;
  initiallyExpanded?: boolean;
  title?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const initialSettings = useMemo(() => createDefaultCalculatorSettings(tournament), [tournament]);
  const [settings, setSettings] = useState<CalculatorSettings>(initialSettings);

  const parsedSettings = useMemo(
    () => parseCalculatorSettings(settings, tournament),
    [settings, tournament]
  );
  const validationErrors = useMemo(() => validateCalculatorSettings(settings), [settings]);
  const generatedLevels = useMemo(
    () => Object.keys(validationErrors).length === 0 ? generateBlindStructure(parsedSettings) : [],
    [parsedSettings, validationErrors]
  );
  const totalChips = useMemo(() => calculateTotalChips(parsedSettings), [parsedSettings]);
  const rebuysEnabled = toNumber(tournament.rebuyprice) > 0 && toNumber(tournament.rebuychips) > 0;
  const addonsEnabled = toNumber(tournament.addonprice) > 0 && toNumber(tournament.addonchips) > 0;
  const chipDenominationOptions = useMemo(
    () => parseChipDenominations(settings.chipDenominations),
    [settings.chipDenominations]
  );
  const selectedChipUps = useMemo(
    () => selectedChipUpDenominations(settings.colorUps, chipDenominationOptions),
    [chipDenominationOptions, settings.colorUps]
  );
  const blindLevelCount = generatedLevels.filter((level) => !isBreakLevel(level)).length;
  const estimatedMinutes = generatedLevels.reduce((total, level) => total + Number(level.minutes || 0), 0);
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(initialSettings);
  const isValid = Object.keys(validationErrors).length === 0 && generatedLevels.length > 0;

  function update(field: keyof CalculatorSettings, value: string) {
    setSettings((current) => {
      if (field !== 'chipDenominations') return { ...current, [field]: value };
      const currentChipOptions = parseChipDenominations(current.chipDenominations);
      const currentDefault = defaultChipUpDenominations(current.chipDenominations);
      const currentSelected = selectedChipUpDenominations(current.colorUps, currentChipOptions);
      const defaultSelected = selectedChipUpDenominations(currentDefault, currentChipOptions);
      const shouldUseNextDefault = currentSelected.join(',') === defaultSelected.join(',');
      const nextChipOptions = parseChipDenominations(value);
      return {
        ...current,
        chipDenominations: value,
        colorUps: (shouldUseNextDefault
          ? nextChipOptions.slice(0, 2)
          : currentSelected.filter((denomination) => nextChipOptions.includes(denomination)))
          .join(','),
      };
    });
  }

  function toggleChipUpDenomination(denomination: number) {
    setSettings((current) => {
      const available = parseChipDenominations(current.chipDenominations);
      const selected = selectedChipUpDenominations(current.colorUps, available);
      const next = selected.includes(denomination)
        ? selected.filter((value) => value !== denomination)
        : [...selected, denomination].sort((a, b) => a - b);
      return { ...current, colorUps: next.join(',') };
    });
  }

  function reset() {
    setSettings(initialSettings);
  }

  function save() {
    if (!isValid || saving || saveDisabled) return;
    onSave(generatedLevels);
  }

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <section className="card overflow-hidden !p-0">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-white">
            <Layers3 size={19} className="shrink-0 text-pit-teal" />
            <h3 className="truncate text-base font-semibold sm:text-lg">{title}</h3>
          </div>
          <button
            type="button"
            className="btn-ghost min-h-11 gap-2 px-3 text-sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Collapse' : 'Expand'}
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {expanded && (
          <div className="border-t border-pit-border px-3 py-4 sm:px-5 sm:py-5">
            {error && <p className="mb-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
              <WizardSection number="1" title="Tournament setup" icon={<Users size={16} />}>
                <div className="grid min-w-0 grid-cols-2 gap-3 max-[349px]:grid-cols-1">
                  <NumberField field="players" label="Players" value={settings.players} min={2} error={validationErrors.players} onChange={(value) => update('players', value)} />
                  <NumberField field="startingStack" label="Starting stack" value={settings.startingStack} min={100} step={100} error={validationErrors.startingStack} onChange={(value) => update('startingStack', value)} />
                  <NumberField field="targetHours" label="Target hours" value={settings.targetHours} min={0.5} step={0.5} error={validationErrors.targetHours} onChange={(value) => update('targetHours', value)} />
                  <NumberField field="levelMinutes" label="Level minutes" value={settings.levelMinutes} min={1} error={validationErrors.levelMinutes} onChange={(value) => update('levelMinutes', value)} />
                  {rebuysEnabled && (
                    <NumberField field="expectedRebuys" label="Expected rebuys" value={settings.expectedRebuys} min={0} error={validationErrors.expectedRebuys} onChange={(value) => update('expectedRebuys', value)} />
                  )}
                  {addonsEnabled && (
                    <NumberField field="expectedAddons" label="Expected add-ons" value={settings.expectedAddons} min={0} error={validationErrors.expectedAddons} onChange={(value) => update('expectedAddons', value)} />
                  )}
                </div>
              </WizardSection>

              <WizardSection number="2" title="Breaks & antes" icon={<Coffee size={16} />}>
                <div className="grid min-w-0 grid-cols-2 gap-3 max-[349px]:grid-cols-1">
                  <NumberField field="breakCount" label="Breaks" value={settings.breakCount} min={0} error={validationErrors.breakCount} onChange={(value) => update('breakCount', value)} />
                  <NumberField field="breakMinutes" label="Break minutes" value={settings.breakMinutes} min={1} error={validationErrors.breakMinutes} onChange={(value) => update('breakMinutes', value)} />
                  <NumberField field="startingBigBlind" label="Starting BB" value={settings.startingBigBlind} min={1} error={validationErrors.startingBigBlind} onChange={(value) => update('startingBigBlind', value)} />
                  <NumberField field="anteStartLevel" label="Ante starts at level" value={settings.anteStartLevel} min={0} error={validationErrors.anteStartLevel} onChange={(value) => update('anteStartLevel', value)} />
                </div>
              </WizardSection>

              <WizardSection number="3" title="Chips" icon={<Coins size={16} />} className="lg:col-span-2 xl:col-span-1">
                <TextField
                  field="chipDenominations"
                  label="Chip denominations"
                  value={settings.chipDenominations}
                  placeholder="25, 50, 100, 500, 1000"
                  error={validationErrors.chipDenominations}
                  helper="Enter the chip values in play, separated by commas."
                  onChange={(value) => update('chipDenominations', value)}
                />
                <div className="min-w-0 space-y-2">
                  <span className="block text-xs font-medium text-pit-text">Chip-up denominations</span>
                  <div className="flex min-h-11 flex-wrap items-center gap-2">
                    {chipDenominationOptions.map((denomination) => {
                      const selected = selectedChipUps.includes(denomination);
                      return (
                        <button
                          key={denomination}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleChipUpDenomination(denomination)}
                          className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? 'border-pit-teal bg-pit-teal/12 text-pit-teal shadow-[0_0_14px_rgba(20,184,166,0.08)]'
                              : 'border-pit-border bg-pit-bg text-pit-text hover:border-pit-teal/40 hover:text-white'
                          }`}
                        >
                          {denomination.toLocaleString()}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-4 text-pit-muted">Selected chips are removed at natural pause points in the generated schedule.</p>
                </div>
              </WizardSection>
            </div>
          </div>
        )}
      </section>

      {expanded && (
        <section className="card !p-0">
          <div className="flex flex-col gap-4 border-b border-pit-border p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold text-white">Blind schedule</h4>
              <StructureSummary
                totalChips={totalChips}
                levelCount={blindLevelCount}
                minutes={estimatedMinutes}
                valid={isValid}
              />
            </div>
            <div className="hidden shrink-0 gap-2 md:flex">
              <button type="button" className="btn-ghost min-h-11 gap-2" onClick={reset} disabled={!hasChanges || saving}>
                <RotateCcw size={16} /> Reset
              </button>
              <button type="button" className="btn-primary min-h-11 min-w-40 gap-2" onClick={save} disabled={!isValid || saving || saveDisabled}>
                <Save size={16} /> {saving ? 'Saving...' : saveLabel}
              </button>
            </div>
          </div>

          {!isValid ? (
            <div className="p-4 sm:p-5">
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">
                Fix the highlighted settings to generate a blind schedule.
              </div>
            </div>
          ) : (
            <GeneratedBlindSchedule levels={generatedLevels} />
          )}
        </section>
      )}

      {expanded && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pit-border bg-pit-surface/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-screen-sm gap-2">
            <button type="button" className="btn-ghost min-h-11 w-12 shrink-0 px-0" aria-label="Reset blind structure" onClick={reset} disabled={!hasChanges || saving}>
              <RotateCcw size={18} />
            </button>
            <button type="button" className="btn-primary min-h-11 min-w-0 flex-1 gap-2 whitespace-nowrap" onClick={save} disabled={!isValid || saving || saveDisabled}>
              <Save size={17} /> {saving ? 'Saving...' : saveLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WizardSection({
  number,
  title,
  icon,
  className = '',
  children,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 space-y-4 rounded-xl border border-pit-border bg-pit-bg/45 p-3.5 sm:p-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-pit-teal/30 bg-pit-teal/10 text-xs text-pit-teal">{number}</span>
        <span className="text-pit-teal">{icon}</span>
        <h4>{title}</h4>
      </div>
      {children}
    </section>
  );
}

function TextField({
  field,
  label,
  value,
  placeholder,
  helper,
  error,
  onChange,
}: {
  field: CalculatorField;
  label: string;
  value: string;
  placeholder?: string;
  helper?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = error ? `${field}-error` : undefined;
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-medium text-pit-text">{label}</span>
      <input
        className={`input min-h-11 w-full min-w-0 ${error ? 'border-red-400/60 focus:border-red-400' : ''}`}
        type="text"
        placeholder={placeholder}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error
        ? <p id={errorId} className="text-[11px] leading-4 text-red-300">{error}</p>
        : helper && <p className="text-[11px] leading-4 text-pit-muted">{helper}</p>}
    </label>
  );
}

function NumberField({
  field,
  label,
  value,
  min,
  step = 1,
  error,
  onChange,
}: {
  field: CalculatorField;
  label: string;
  value: string;
  min: number;
  step?: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = error ? `${field}-error` : undefined;
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block min-h-4 text-xs font-medium leading-4 text-pit-text">{label}</span>
      <input
        className={`input min-h-11 w-full min-w-0 tabular-nums ${error ? 'border-red-400/60 focus:border-red-400' : ''}`}
        type="text"
        inputMode={step % 1 === 0 ? 'numeric' : 'decimal'}
        aria-valuemin={min}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p id={errorId} className="text-[11px] leading-4 text-red-300">{error}</p>}
    </label>
  );
}

function StructureSummary({
  totalChips,
  levelCount,
  minutes,
  valid,
}: {
  totalChips: number;
  levelCount: number;
  minutes: number;
  valid: boolean;
}) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const duration = hours > 0 ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
  const metrics = [
    { label: 'Total chips', value: totalChips.toLocaleString(), icon: <Coins size={18} /> },
    { label: 'Blind levels', value: valid ? levelCount.toLocaleString() : '-', icon: <Layers3 size={18} /> },
    { label: 'Est. duration', value: valid ? duration : '-', icon: <Clock3 size={18} /> },
    { label: 'Status', value: valid ? 'Ready' : 'Needs attention', icon: valid ? <ShieldCheck size={18} /> : <CircleGauge size={18} />, warning: !valid },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 rounded-xl border border-pit-border bg-pit-bg/55 p-3">
          <div className={`mb-2 ${metric.warning ? 'text-amber-300' : 'text-pit-teal'}`}>{metric.icon}</div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-pit-muted">{metric.label}</p>
          <p className={`mt-1 truncate text-sm font-semibold tabular-nums sm:text-base ${metric.warning ? 'text-amber-200' : 'text-white'}`}>{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function GeneratedBlindSchedule({ levels }: { levels: BlindStructureDraftLevel[] }) {
  return (
    <div>
      <div className="hidden max-h-[34rem] overflow-y-auto md:block">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-pit-surface text-xs uppercase tracking-[0.1em] text-pit-muted">
            <tr className="border-b border-pit-border">
              <th className="w-[24%] px-5 py-3 text-left">Level</th>
              <th className="px-3 py-3 text-right">Small blind</th>
              <th className="px-3 py-3 text-right">Big blind</th>
              <th className="px-3 py-3 text-right">Ante</th>
              <th className="px-3 py-3 text-right">Duration</th>
              <th className="w-[18%] px-5 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, index) => {
              const chipUp = isChipUpLevel(level);
              const breakRow = isBreakLevel(level);
              return (
                <tr
                  key={`${level.level}-${level.label}-${index}`}
                  className={`border-b border-pit-border/45 transition-colors hover:bg-white/[0.025] ${chipUp ? 'bg-pit-teal/[0.07]' : breakRow ? 'bg-amber-300/[0.06]' : ''}`}
                >
                  <td className={`px-5 py-3 font-semibold ${chipUp ? 'text-pit-teal' : breakRow ? 'text-amber-200' : 'text-white'}`}>{level.label}</td>
                  {breakRow ? (
                    <>
                      <td className="px-3 py-3 text-right text-pit-muted">-</td>
                      <td className="px-3 py-3 text-right text-pit-muted">-</td>
                      <td className="px-3 py-3 text-right text-pit-muted">-</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums text-pit-text">{level.smallblind.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{level.bigblind.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-pit-text">{level.ante > 0 ? level.ante.toLocaleString() : '-'}</td>
                    </>
                  )}
                  <td className="px-3 py-3 text-right tabular-nums text-pit-text">{level.minutes > 0 ? `${level.minutes} min` : '-'}</td>
                  <td className={`px-5 py-3 text-xs ${chipUp ? 'text-pit-teal' : breakRow ? 'text-amber-200' : 'text-pit-muted'}`}>{chipUp ? 'Chip up' : breakRow ? 'Break' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-3 md:hidden">
        {levels.map((level, index) => {
          const chipUp = isChipUpLevel(level);
          const breakRow = isBreakLevel(level);
          if (breakRow) {
            return (
              <div
                key={`${level.level}-${level.label}-${index}`}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${chipUp ? 'border-pit-teal/35 bg-pit-teal/[0.08] text-pit-teal' : 'border-amber-300/30 bg-amber-300/[0.07] text-amber-100'}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{level.label}</p>
                  <p className="mt-0.5 text-[11px] opacity-75">{chipUp ? 'Chip-up pause' : 'Scheduled break'}</p>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums">{level.minutes > 0 ? `${level.minutes} min` : 'Pause'}</span>
              </div>
            );
          }
          return (
            <div key={`${level.level}-${level.label}-${index}`} className="min-h-14 rounded-xl border border-pit-border bg-pit-bg/45 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{level.label}</p>
                <span className="text-xs tabular-nums text-pit-muted">{level.minutes} min</span>
              </div>
              <p className="mt-1 truncate text-xs tabular-nums text-pit-text">
                SB {level.smallblind.toLocaleString()} <span className="px-1 text-pit-muted">·</span>
                BB {level.bigblind.toLocaleString()} <span className="px-1 text-pit-muted">·</span>
                Ante {level.ante > 0 ? level.ante.toLocaleString() : '-'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
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
  onSave: (levels: BlindStructureDraftLevel[]) => void;
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

function parseCalculatorSettings(settings: CalculatorSettings, tournament: BlindStructureCalculatorContext): ParsedCalculatorSettings {
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

function validateCalculatorSettings(settings: CalculatorSettings): CalculatorErrors {
  const errors: CalculatorErrors = {};
  const validateNumber = (
    field: CalculatorField,
    label: string,
    minimum: number,
    options: { integer?: boolean; maximum?: number } = {}
  ) => {
    const raw = settings[field].trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) {
      errors[field] = `${label} is required.`;
      return;
    }
    if (value < minimum) {
      errors[field] = `${label} must be at least ${minimum}.`;
      return;
    }
    if (options.maximum !== undefined && value > options.maximum) {
      errors[field] = `${label} cannot exceed ${options.maximum}.`;
      return;
    }
    if (options.integer && !Number.isInteger(value)) errors[field] = `${label} must be a whole number.`;
  };

  validateNumber('players', 'Players', 2, { integer: true });
  validateNumber('startingStack', 'Starting stack', 100);
  validateNumber('targetHours', 'Target hours', 0.5);
  validateNumber('levelMinutes', 'Level minutes', 1, { integer: true });
  validateNumber('breakCount', 'Breaks', 0, { integer: true, maximum: 10 });
  validateNumber('breakMinutes', 'Break minutes', 1, { integer: true });
  validateNumber('startingBigBlind', 'Starting BB', 1);
  validateNumber('anteStartLevel', 'Ante start level', 0, { integer: true });
  validateNumber('expectedRebuys', 'Expected rebuys', 0, { integer: true });
  validateNumber('expectedAddons', 'Expected add-ons', 0, { integer: true });

  const denominationPieces = settings.chipDenominations
    .split(/[,;\s]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const denominationsAreValid = denominationPieces.length > 0
    && denominationPieces.every((piece) => /^\d+(?:\.\d+)?$/.test(piece) && Number(piece) > 0);
  if (!denominationsAreValid) {
    errors.chipDenominations = 'Use positive chip values separated by commas.';
  }

  return errors;
}

function parseSetting(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedChipUpDenominations(value: string, allowedDenominations: number[]): number[] {
  const allowed = new Set(allowedDenominations);
  const selected = value
    .split(/[,;\s]+/)
    .map((piece) => Math.round(Number(piece.trim())))
    .filter((denomination) => Number.isFinite(denomination) && allowed.has(denomination));
  return Array.from(new Set(selected)).sort((a, b) => a - b);
}

function generateBlindStructure(settings: ParsedCalculatorSettings): BlindStructureDraftLevel[] {
  return buildBlindStructure(settings);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultCalculatorPlayers(tournament: BlindStructureCalculatorContext): number {
  const maxPlayers = Math.floor(toNumber(tournament.maxplayers));
  return maxPlayers > 0 ? maxPlayers : 10;
}

function isBreakLevel(level: Pick<BlindLevel, 'label' | 'smallblind' | 'bigblind'>): boolean {
  return /^break\b/i.test(String(level.label ?? '')) || (Number(level.smallblind) === 0 && Number(level.bigblind) === 0);
}

function isChipUpLevel(level: Pick<BlindLevel, 'label'>): boolean {
  return /^chip\s*up\b/i.test(String(level.label ?? ''));
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
