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
}

const DEFAULT_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 17, 11, 7],
  6: [37, 23, 16, 11, 8, 5],
};

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
  const registeredPlaceLimit = placementFieldSize > 0 ? placementFieldSize : 1;
  const maxCountPlaces = Math.max(1, canUseClubFeatures ? registeredPlaceLimit : Math.min(registeredPlaceLimit, 3));
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
    const nextConfig = normalizePayoutConfig({ mode, value: nextValue });
    setPayoutConfig(nextConfig);
    setSelectionInput(String(nextConfig.value));
  }

  function handlePayTopChange(raw: string) {
    if (!canManage) return;
    const nextValue = clamp(Number(raw), 1, maxCountPlaces);
    setPayoutConfig({ mode: 'count', value: nextValue });
    setSelectionInput(String(nextValue));
  }

  function handleSelectionInputChange(raw: string) {
    setSelectionInput(raw);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setPayoutConfig((current) => normalizePayoutConfig({
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

  const payouts = visibleSplits.map((pct) => (totalPot * pct) / 100);

  return (
      <div className="space-y-4">
      <div className="card space-y-3">
        <div className="space-y-3">
          <h3 className="font-semibold text-white">Payout Structure</h3>
          <div className="flex flex-wrap items-center justify-start gap-2">
            <div className="flex rounded-lg border border-pit-border bg-pit-surface/70 p-1">
              <button
                type="button"
                onClick={() => handleModeChange('count')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${payoutConfig.mode === 'count' ? 'bg-pit-teal text-white' : 'text-pit-text hover:text-white'}`}
                disabled={!canManage}
              >
                Count
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('percent')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${payoutConfig.mode === 'percent' ? 'bg-pit-teal text-white' : 'text-pit-text hover:text-white'}`}
                disabled={!canManage || !canUseClubFeatures}
              >
                Percent
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-pit-text">
              <span>{payoutConfig.mode === 'count' ? 'Pay Top' : 'Pay'}</span>
              {payoutConfig.mode === 'count' ? (
                <select
                  className="input w-24"
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
                  className="input w-24"
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
              <span>{payoutConfig.mode === 'percent' ? '% of Field' : 'Players'}</span>
            </label>
          </div>
        </div>

        {(canManage && (payoutStructureMutation.isPending || payoutStructureMutation.error)) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-pit-text">
          {canManage && payoutStructureMutation.isPending && <span className="text-pit-muted">Saving...</span>}
          {canManage && payoutStructureMutation.error && <span className="text-red-400">{payoutStructureMutation.error.message}</span>}
          </div>
        )}

        {!canUseClubFeatures && (
          <p className="text-xs text-pit-muted">
            Host tier payouts are limited to paying 1, 2, or 3 places. Club and Pro unlock percent-of-field payouts.
          </p>
        )}

        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-pit-muted">Rake</label>
              <input
                className="input w-28"
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
            </div>
            <button
              className="btn-primary"
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
              {rakeMutation.isPending ? 'Saving...' : 'Save Rake'}
            </button>
            {rakeError && <p className="text-sm text-red-400">{rakeError}</p>}
            {rakeMutation.error && <p className="text-sm text-red-400">{rakeMutation.error.message}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs text-pit-text">
          <span className="chip">Gross pot ${grossPot.toFixed(2)}</span>
          {tournament.bountyenabled && <span className="chip">Bounties ${bountyTotal.toFixed(2)}</span>}
          <span className="chip">Net pot ${totalPot.toFixed(2)}</span>
        </div>

        {pctError && (
          <p className="text-yellow-400 text-sm">Percentages must total 100% (currently {totalPct.toFixed(1)}%)</p>
        )}

        <div className="space-y-1.5">
          {Array.from({ length: places }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-pit-text text-sm w-12 shrink-0">{ordinal(i + 1)} place</span>
              <input
                className="input w-24"
                type="number" min="0" max="100" step="0.5"
                value={visibleSplits[i] ?? 0}
                onChange={e => updateSplit(i, Number(e.target.value))}
                disabled={!canUseClubFeatures}
              />
              <span className="text-pit-text text-sm">%</span>
              <span className="text-white text-sm font-semibold">
                ${totalPot > 0 ? (payouts[i] ?? 0).toFixed(2) : '0.00'}
              </span>
            </div>
          ))}
        </div>
      </div>

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
    });
  } catch {
    return { mode: 'count', value: 3 };
  }
}

function normalizePayoutConfig(config: PayoutStructureConfig): PayoutStructureConfig {
  return {
    mode: config.mode,
    value: sanitizePayoutValue(config.mode, config.value),
  };
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

  const requested = sanitizePayoutValue('count', config.value);
  if (fieldSize <= 0) return requested;
  return clamp(requested, 1, fieldSize);
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

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
