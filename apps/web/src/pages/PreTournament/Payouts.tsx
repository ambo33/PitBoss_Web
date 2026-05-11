import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Tournament } from '../../api/client';
import { useAuthStore } from '../../store/auth';

interface Props { tournamentId: string; tournament: Tournament; }

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
  const [places, setPlaces] = useState(3);
  const [splits, setSplits] = useState<number[]>(DEFAULT_SPLITS[3]);
  const [rakeInput, setRakeInput] = useState(String(toNumber(tournament.rake)));
  const isOwner = tournament.ownerid === user?.guid;

  const { data: players = [] } = useQuery({
    queryKey: ['players', tournamentId],
    queryFn: () => api.getPlayers(tournamentId),
  });

  useEffect(() => {
    setRakeInput(String(toNumber(tournament.rake)));
  }, [tournament.rake]);

  const rakeMutation = useMutation({
    mutationFn: (rake: number) => api.updateTournament(tournamentId, { rake }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const checkedIn = players.filter((player) => player.checkedin).length;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length;
  const grossPot = (toNumber(tournament.buyin) * checkedIn)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const rake = toNumber(tournament.rake);

  const totalPot = useMemo(() => {
    return Math.max(grossPot - rake, 0);
  }, [grossPot, rake]);

  const totalPct = splits.slice(0, places).reduce((a, b) => a + b, 0);
  const pctError = Math.abs(totalPct - 100) > 0.1;

  function handlePlacesChange(n: number) {
    setPlaces(n);
    setSplits(DEFAULT_SPLITS[n] ?? Array(n).fill(Math.round(100 / n)));
  }
  function updateSplit(i: number, val: number) {
    setSplits(prev => prev.map((s, idx) => idx === i ? val : s));
  }

  const payouts = splits.slice(0, places).map(pct => (totalPot * pct) / 100);

  // Placed players sorted by placement
  const finishers = players
    .filter(p => p.placed != null)
    .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999));

  return (
    <div className="space-y-4">
      {/* Pot summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Checked In" value={checkedIn} />
        <StatCard label="Total Rebuys" value={totalRebuys} />
        <StatCard label="Add-ons" value={totalAddons} />
        <StatCard label="Rake" value={`$${rake.toFixed(2)}`} />
        <StatCard label="Total Pot" value={`$${totalPot.toFixed(2)}`} accent />
      </div>

      {/* Payout calculator */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-semibold text-white">Payout Structure</h3>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-pit-muted">Players paid</p>
            <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button key={n} onClick={() => handlePlacesChange(n)}
                className={`w-8 h-8 rounded text-sm font-semibold transition-colors
                  ${places === n ? 'bg-pit-teal text-white' : 'bg-pit-surface text-pit-text hover:text-white border border-pit-border'}`}>
                {n}
              </button>
            ))}
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-pit-muted">Rake</label>
              <input
                className="input w-28"
                type="number"
                min="0"
                step="0.01"
                value={rakeInput}
                onChange={(e) => setRakeInput(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              onClick={() => rakeMutation.mutate(toNumber(rakeInput))}
              disabled={rakeMutation.isPending}
            >
              {rakeMutation.isPending ? 'Saving...' : 'Save Rake'}
            </button>
            {rakeMutation.error && <p className="text-sm text-red-400">{rakeMutation.error.message}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs text-pit-text">
          <span className="chip">Gross pot ${grossPot.toFixed(2)}</span>
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
                value={splits[i] ?? 0}
                onChange={e => updateSplit(i, Number(e.target.value))}
              />
              <span className="text-pit-text text-sm">%</span>
              <span className="text-white text-sm font-semibold">
                ${totalPot > 0 ? payouts[i].toFixed(2) : '0.00'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Standings */}
      {finishers.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Results</h3>
          <div className="space-y-1.5">
            {finishers.map(p => {
              const payout = payouts[((p.placed ?? 1) - 1)] ?? 0;
              return (
                <div key={p.userid} className="flex justify-between text-sm">
                  <div className="flex gap-3">
                    <span className="text-pit-text w-10">#{p.placed}</span>
                    <span className="text-white">{p.displayname ?? p.emailaddress}</span>
                  </div>
                  {payout > 0 && <span className="text-pit-teal font-semibold">${payout.toFixed(2)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card px-3 py-3 text-center">
      <p className={`text-xl font-bold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-pit-text mt-1">{label}</p>
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
