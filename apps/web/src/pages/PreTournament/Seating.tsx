import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, SeatingAssignment } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Props { tournamentId: string; isOwner: boolean; }

export default function Seating({ tournamentId, isOwner }: Props) {
  const qc = useQueryClient();
  const [maxPerTable, setMaxPerTable] = useState(9);

  const { data: seating = [], isLoading } = useQuery({
    queryKey: ['seating', tournamentId],
    queryFn: () => api.getSeating(tournamentId),
  });

  const assignMutation = useMutation({
    mutationFn: () => api.assignSeats(tournamentId, maxPerTable),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seating', tournamentId] }),
  });
  const clearMutation = useMutation({
    mutationFn: () => api.clearSeating(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seating', tournamentId] }),
  });

  if (isLoading) return <LoadingSpinner className="mt-12" />;

  // Group by table
  const tables = new Map<number, SeatingAssignment[]>();
  for (const s of seating) {
    const list = tables.get(s.tablenumber) ?? [];
    list.push(s);
    tables.set(s.tablenumber, list);
  }
  const sortedTables = [...tables.entries()].sort(([a], [b]) => a - b);

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-pit-text block mb-1">Max per table</label>
            <input className="input w-24" type="number" min="2" max="12" value={maxPerTable}
              onChange={e => setMaxPerTable(Number(e.target.value))} />
          </div>
          <button className="btn-primary" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
            {assignMutation.isPending ? 'Assigning…' : 'Assign Seats'}
          </button>
          {seating.length > 0 && (
            <button className="btn-ghost text-red-400" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              Clear All
            </button>
          )}
          {assignMutation.error && (
            <p className="text-red-400 text-sm w-full">{assignMutation.error.message}</p>
          )}
        </div>
      )}

      {seating.length === 0 ? (
        <p className="text-pit-text text-center py-12">
          {isOwner ? 'Check in players then click "Assign Seats".' : 'Seats not yet assigned.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTables.map(([tableNum, seats]) => (
            <div key={tableNum} className="card">
              <h3 className="font-semibold text-white mb-3">Table {tableNum}</h3>
              <div className="space-y-1.5">
                {seats.sort((a, b) => a.seat - b.seat).map(s => (
                  <div key={s.userid} className="flex justify-between text-sm">
                    <span className="text-pit-text">Seat {s.seat}</span>
                    <span className="text-white truncate ml-2">{s.displayname ?? s.emailaddress}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
