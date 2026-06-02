import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Tournament } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { getConfiguredBountyPool } from '../../utils/bountyMath';
import { isEnabledFlag } from '../../utils/flags';

interface Props { tournamentId: string; tournament: Tournament; }
type PayoutMode = 'count' | 'percent';

interface PayoutStructureConfig {
  mode: PayoutMode;
  value: number;
  roundingdenomination?: number;
}

const DEFAULT_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 17, 11, 7],
  6: [37, 23, 16, 11, 8, 5],
};
const DEFAULT_PAYOUT_PLANNING_LIMIT = 20;

export default function Payouts({ tournamentId, tournament }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures);
  const savedPayoutConfig = useMemo(
    () => parsePayoutStructure(tournament.payoutstructure),
    [tournament.payoutstructure]
  );
  const [payoutConfig, setPayoutConfig] = useState<PayoutStructureConfig>(savedPayoutConfig);
  const [selectionInput, setSelectionInput] = useState(String(savedPayoutConfig.value));
  const [splits, setSplits] = useState<number[]>(() => buildDefaultSplits(savedPayoutConfig.mode === 'count' ? savedPayoutConfig.value : 3));
  const [rakeInput, setRakeInput] = useState(String(toNumber(tournament.rake)));
  const [lastQueuedPayoutPayload, setLastQueuedPayoutPayload] = useState(() => JSON.stringify(savedPayoutConfig));
  const [rakeError, setRakeError] = useState('');
  const canManage = isEnabledFlag(tournament.canmanage) || tournament.ownerid === user?.guid;

  const { data: players = [] } = useQuery({
    queryKey: ['players', tournamentId],
    queryFn: () => api.getPlayers(tournamentId),
  });

  useEffect(() => {
    setRakeInput(String(toNumber(tournament.rake)));
  }, [tournament.rake]);

  useEffect(() => {
    setPayoutConfig(savedPayoutConfig);
    setSelectionInput(String(savedPayoutConfig.value));
    setLastQueuedPayoutPayload(JSON.stringify(savedPayoutConfig));
  }, [savedPayoutConfig]);

  const rakeMutation = useMutation({
    mutationFn: (rake: number) => api.updateTournament(tournamentId, { rake }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const payoutStructureMutation = useMutation({
    mutationFn: (config: PayoutStructureConfig) =>
      api.updateTournament(tournamentId, { payoutstructure: JSON.stringify(config) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const enteredFieldCount = players.filter((player) => player.checkedin || player.placed != null).length;
  const registeredCount = players.length;
  const placementFieldSize = registeredCount;
  const configuredMaxPlayers = Math.max(0, Math.floor(toNumber(tournament.maxplayers)));
  const countPlanningLimit = Math.max(
    1,
    configuredMaxPlayers,
    registeredCount,
    payoutConfig.mode === 'count' ? payoutConfig.value : 0,
    DEFAULT_PAYOUT_PLANNING_LIMIT
  );
  const maxCountPlaces = canUseClubFeatures ? countPlanningLimit : Math.min(countPlanningLimit, 3);
  const countDropdownValue = String(clamp(payoutConfig.value, 1, maxCountPlaces));
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const grossPot = (toNumber(tournament.buyin) * enteredFieldCount)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const rake = toNumber(tournament.rake);
  const bountyTotal = getConfiguredBountyPool(tournament, grossPot, players);

  const totalPot = useMemo(() => {
    return Math.max(grossPot - rake - bountyTotal, 0);
  }, [grossPot, rake, bountyTotal]);
  const rakeTooHigh = toNumber(rakeInput) > grossPot;

  const places = useMemo(
    () => resolvePaidPlaces(payoutConfig, placementFieldSize),
    [payoutConfig, placementFieldSize]
  );

  useEffect(() => {
    setSplits((current) => syncSplitsToPlaces(current, places));
  }, [places]);

  useEffect(() => {
    if (!canManage) return;
    const nextPayload = JSON.stringify(normalizePayoutConfig(payoutConfig));
    if (nextPayload === lastQueuedPayoutPayload) return;
    const timer = window.setTimeout(() => {
      setLastQueuedPayoutPayload(nextPayload);
      payoutStructureMutation.mutate(normalizePayoutConfig(payoutConfig));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [canManage, lastQueuedPayoutPayload, payoutConfig, payoutStructureMutation]);

  const visibleSplits = Array.from({ length: places }, (_, index) => splits[index] ?? 0);
  const totalPct = visibleSplits.reduce((a, b) => a + b, 0);
  const pctError = Math.abs(totalPct - 100) > 0.1;

  function handleModeChange(mode: PayoutMode) {
    if (!canManage) return;
    if (mode === 'percent' && !canUseClubFeatures) return;
    const nextValue = mode === payoutConfig.mode
      ? payoutConfig.value
      : mode === 'percent'
        ? 25
        : clamp(places, 1, maxCountPlaces);
    const nextConfig = normalizePayoutConfig({ ...payoutConfig, mode, value: nextValue });
    setPayoutConfig(nextConfig);
    setSelectionInput(String(nextConfig.value));
  }

  function handlePayTopChange(raw: string) {
    if (!canManage) return;
    const nextValue = clamp(Number(raw), 1, maxCountPlaces);
    setPayoutConfig((current) => normalizePayoutConfig({ ...current, mode: 'count', value: nextValue }));
    setSelectionInput(String(nextValue));
  }

  function handleRoundingChange(raw: string) {
    if (!canManage) return;
    setPayoutConfig((current) => normalizePayoutConfig({
      ...current,
      roundingdenomination: Number(raw),
    }));
  }

  function handleSelectionInputChange(raw: string) {
    setSelectionInput(raw);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setPayoutConfig((current) => normalizePayoutConfig({
      ...current,
      mode: current.mode,
      value: current.mode === 'count' && !canUseClubFeatures ? clamp(parsed, 1, 3) : parsed,
    }));
  }

  function handleSelectionInputBlur() {
    const parsed = Number(selectionInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSelectionInput(String(payoutConfig.value));
      return;
    }
    const nextValue = sanitizePayoutValue(payoutConfig.mode, parsed);
    setSelectionInput(String(payoutConfig.mode === 'count' && !canUseClubFeatures ? clamp(nextValue, 1, 3) : nextValue));
  }

  function updateSplit(i: number, val: number) {
    setSplits(prev => prev.map((s, idx) => idx === i ? val : s));
  }

  const payouts = buildRoundedPayouts(totalPot, visibleSplits, payoutConfig.roundingdenomination);

  return (
    <section className="overflow-hidden rounded-xl border border-pit-border bg-pit-card">
      <div className="flex flex-col gap-3 border-b border-pit-border bg-gradient-to-r from-pit-teal/12 via-pit-surface/60 to-pit-card px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Prize money</p>
          <h3 className="text-lg font-semibold text-white">Payout Structure</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
          <PayoutMetric label="Gross" value={`$${grossPot.toFixed(2)}`} />
          {tournament.bountyenabled && <PayoutMetric label="Bounties" value={`$${bountyTotal.toFixed(2)}`} tone="amber" />}
          <PayoutMetric label="Prize pool" value={`$${totalPot.toFixed(2)}`} tone="teal" />
          <PayoutMetric label="Paid spots" value={String(places)} />
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(260px,360px)_1fr] lg:gap-4">
        <div className="space-y-2.5 rounded-xl border border-pit-border bg-pit-bg/45 p-2.5 sm:space-y-3 sm:p-3">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted">Payout mode</p>
            <div className="grid grid-cols-2 rounded-lg border border-pit-border bg-pit-surface/70 p-1">
              <button
                type="button"
                onClick={() => handleModeChange('count')}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${payoutConfig.mode === 'count' ? 'bg-pit-teal text-white' : 'text-pit-text hover:text-white'}`}
                disabled={!canManage}
              >
                Count
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('percent')}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${payoutConfig.mode === 'percent' ? 'bg-pit-teal text-white' : 'text-pit-text hover:text-white'}`}
                disabled={!canManage || !canUseClubFeatures}
              >
                Percent
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm text-pit-text">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted">
                {payoutConfig.mode === 'count' ? 'Pay top' : 'Pay'}
              </span>
              {payoutConfig.mode === 'count' ? (
                <select
                  className="input w-full"
                  value={countDropdownValue}
                  onChange={(e) => handlePayTopChange(e.target.value)}
                  disabled={!canManage || maxCountPlaces <= 0}
                >
                  {Array.from({ length: maxCountPlaces }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input w-full"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={selectionInput}
                  onChange={(e) => handleSelectionInputChange(e.target.value)}
                  onBlur={handleSelectionInputBlur}
                  disabled={!canManage}
                />
              )}
              <span className="block text-[11px] text-pit-muted">
                {payoutConfig.mode === 'percent' ? '% of field' : 'players'}
              </span>
            </label>
            <label className="space-y-1 text-sm text-pit-text">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted">Round</span>
              <select
                className="input w-full"
                value={String(payoutConfig.roundingdenomination ?? 0)}
                onChange={(e) => handleRoundingChange(e.target.value)}
                disabled={!canManage}
              >
                <option value="0">None</option>
                <option value="1">$1</option>
                <option value="5">$5</option>
                <option value="10">$10</option>
                <option value="25">$25</option>
              </select>
              <span className="block text-[11px] text-pit-muted">lower places</span>
            </label>
          </div>

          {canManage && (
            <div className="rounded-lg border border-pit-border bg-pit-surface/35 p-2.5">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted">Rake</label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  className="input min-w-0 flex-1"
                  type="number"
                  min="0"
                  max={grossPot > 0 ? grossPot : undefined}
                  step="0.01"
                  value={rakeInput}
                  onChange={(e) => {
                    setRakeInput(e.target.value);
                    setRakeError('');
                  }}
                />
                <button
                  className="btn-primary shrink-0 px-3 text-sm"
                  onClick={() => {
                    if (rakeTooHigh) {
                      setRakeError('Rake cannot exceed the gross pot.');
                      return;
                    }
                    setRakeError('');
                    rakeMutation.mutate(toNumber(rakeInput));
                  }}
                  disabled={rakeMutation.isPending || rakeTooHigh}
                >
                  {rakeMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {rakeError && <p className="mt-2 text-xs text-red-400">{rakeError}</p>}
              {rakeMutation.error && <p className="mt-2 text-xs text-red-400">{rakeMutation.error.message}</p>}
            </div>
          )}

          {(canManage && (payoutStructureMutation.isPending || payoutStructureMutation.error)) && (
            <div className="rounded-lg border border-pit-border bg-pit-surface/35 px-3 py-2 text-xs text-pit-text">
              {payoutStructureMutation.isPending && <span className="text-pit-muted">Saving payout settings...</span>}
              {payoutStructureMutation.error && <span className="text-red-400">{payoutStructureMutation.error.message}</span>}
            </div>
          )}

          {!canUseClubFeatures && (
            <p className="rounded-lg border border-pit-border bg-pit-surface/35 px-3 py-2 text-xs text-pit-muted">
              Host tier payouts are limited to paying 1, 2, or 3 places.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {pctError && (
            <p className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
              Percentages must total 100% (currently {totalPct.toFixed(1)}%).
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/35">
            <div className="grid grid-cols-[minmax(3.5rem,1fr)_5.5rem_5.75rem] gap-2 border-b border-pit-border px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-pit-muted sm:grid-cols-[minmax(5rem,1fr)_7rem_8rem] sm:gap-3 sm:px-3 sm:text-[10px]">
              <span>Place</span>
              <span className="text-right">Split</span>
              <span className="text-right">Payout</span>
            </div>
            <div className="divide-y divide-pit-border/70">
              {Array.from({ length: places }).map((_, i) => (
                <div key={i} className="grid grid-cols-[minmax(3.5rem,1fr)_5.5rem_5.75rem] items-center gap-2 px-2.5 py-2 sm:grid-cols-[minmax(5rem,1fr)_7rem_8rem] sm:gap-3 sm:px-3">
                  <span className="font-semibold text-white">{ordinal(i + 1)}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <input
                      className="input h-9 w-16 px-2 text-right sm:w-20 sm:px-3"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={visibleSplits[i] ?? 0}
                      onChange={e => updateSplit(i, Number(e.target.value))}
                      disabled={!canUseClubFeatures}
                    />
                    <span className="text-sm text-pit-muted">%</span>
                  </div>
                  <span className="truncate text-right text-sm font-semibold text-pit-teal sm:text-base">
                    ${totalPot > 0 ? (payouts[i] ?? 0).toFixed(2) : '0.00'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {toNumber(payoutConfig.roundingdenomination) > 0 && (
            <p className="text-xs text-pit-muted">
              Lower payouts are rounded to ${toNumber(payoutConfig.roundingdenomination)}. First place absorbs the difference so payouts still equal the prize pool.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PayoutMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'teal' | 'amber';
}) {
  const toneClass = tone === 'teal'
    ? 'text-pit-teal'
    : tone === 'amber'
      ? 'text-amber-200'
      : 'text-white';
  return (
    <div className="min-w-0 rounded-lg border border-pit-border bg-pit-bg/55 px-2.5 py-2 sm:px-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-pit-muted">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePayoutStructure(value: string | null | undefined): PayoutStructureConfig {
  if (!value) return { mode: 'count', value: 3 };
  try {
    const parsed = JSON.parse(value) as Partial<PayoutStructureConfig>;
    if (parsed.mode !== 'count' && parsed.mode !== 'percent') {
      return { mode: 'count', value: 3 };
    }
    return normalizePayoutConfig({
      mode: parsed.mode,
      value: Number(parsed.value),
      roundingdenomination: Number(parsed.roundingdenomination ?? 0),
    });
  } catch {
    return { mode: 'count', value: 3 };
  }
}

function normalizePayoutConfig(config: PayoutStructureConfig): PayoutStructureConfig {
  return {
    mode: config.mode,
    value: sanitizePayoutValue(config.mode, config.value),
    roundingdenomination: sanitizePayoutRounding(config.roundingdenomination),
  };
}

function sanitizePayoutRounding(value: number | undefined): number {
  const parsed = Number(value ?? 0);
  return [0, 1, 5, 10, 25].includes(parsed) ? parsed : 0;
}

function sanitizePayoutValue(mode: PayoutMode, value: number): number {
  if (mode === 'percent') {
    return clamp(Math.round(value), 1, 100);
  }
  return Math.max(1, Math.round(value));
}

function resolvePaidPlaces(config: PayoutStructureConfig, fieldSize: number): number {
  if (config.mode === 'percent') {
    if (fieldSize <= 0) return 1;
    return clamp(Math.ceil((fieldSize * sanitizePayoutValue('percent', config.value)) / 100), 1, fieldSize);
  }

  return sanitizePayoutValue('count', config.value);
}

function buildDefaultSplits(count: number): number[] {
  const normalizedCount = Math.max(1, count);
  if (DEFAULT_SPLITS[normalizedCount]) {
    return [...DEFAULT_SPLITS[normalizedCount]];
  }

  const weights = Array.from({ length: normalizedCount }, (_, index) => normalizedCount - index);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const splits = weights.map((weight) => roundToTenth((weight / totalWeight) * 100));
  const runningTotal = splits.slice(0, -1).reduce((sum, split) => sum + split, 0);
  splits[splits.length - 1] = roundToTenth(Math.max(100 - runningTotal, 0));
  return splits;
}

function syncSplitsToPlaces(current: number[], places: number): number[] {
  if (places <= 0) return [];
  if (current.length === places) return current;

  const defaults = buildDefaultSplits(places);
  const next = Array.from({ length: places }, (_, index) => current[index] ?? defaults[index]);
  const total = next.reduce((sum, value) => sum + toNumber(value), 0);

  if (Math.abs(total - 100) <= 0.1) return next;
  if (total <= 0) return defaults;

  const normalized = next.map((value) => roundToTenth((toNumber(value) / total) * 100));
  const adjustedTotal = normalized.slice(0, -1).reduce((sum, value) => sum + value, 0);
  normalized[normalized.length - 1] = roundToTenth(Math.max(100 - adjustedTotal, 0));
  return normalized;
}

function buildRoundedPayouts(totalPot: number, splits: number[], denominationValue?: number): number[] {
  const pot = roundCurrency(totalPot);
  const raw = splits.map((pct) => (pot * pct) / 100);
  const denomination = sanitizePayoutRounding(denominationValue);
  if (denomination <= 0 || raw.length <= 1) {
    return raw.map(roundCurrency);
  }

  const payouts = raw.map(roundCurrency);
  let lowerPlacesTotal = 0;
  for (let index = raw.length - 1; index >= 1; index -= 1) {
    const rounded = roundCurrency(Math.round(raw[index] / denomination) * denomination);
    payouts[index] = Math.max(0, Math.min(rounded, roundCurrency(pot - lowerPlacesTotal)));
    lowerPlacesTotal = roundCurrency(lowerPlacesTotal + payouts[index]);
  }
  payouts[0] = roundCurrency(Math.max(pot - lowerPlacesTotal, 0));
  return payouts;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
