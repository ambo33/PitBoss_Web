import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function PaymentTrackerPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
  });
  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    refetchInterval: 15_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (uid: string) => api.togglePaid(id!, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players', id] }),
  });

  const unpaid = players.filter(p => !p.paid);
  const paid = players.filter(p => p.paid);

  if (isLoading) return <LoadingSpinner className="mt-24" />;

  return (
    <div className="min-h-screen bg-pit-bg text-white p-4">
      <header className="text-center mb-6">
        <p className="text-pit-text text-sm">PitBoss · Payment Tracker</p>
        <h1 className="text-xl font-bold text-white">{tournament?.name ?? '…'}</h1>
        <p className="text-pit-text text-sm mt-1">
          {paid.length}/{players.length} paid
          {tournament?.buyin && Number(tournament.buyin) > 0 && ` · $${Number(tournament.buyin).toFixed(2)} buy-in`}
        </p>
      </header>

      <div className="max-w-lg mx-auto space-y-6">
        {unpaid.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-yellow-400 mb-3">Awaiting Payment ({unpaid.length})</h2>
            <div className="space-y-2">
              {unpaid.map(p => (
                <div key={p.userid} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{p.displayname ?? p.emailaddress}</p>
                    {p.rebuys > 0 && (
                      <p className="text-xs text-pit-text">+{p.rebuys} rebuy · +{p.addedon ? '1' : '0'} add-on</p>
                    )}
                  </div>
                  <button
                    className="btn-primary text-xs px-3 py-1.5"
                    onClick={() => toggleMutation.mutate(p.userid)}
                    disabled={toggleMutation.isPending}
                  >
                    Mark Paid
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {paid.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-pit-teal mb-3">Paid ({paid.length})</h2>
            <div className="space-y-1">
              {paid.map(p => (
                <div key={p.userid} className="flex items-center justify-between">
                  <p className="text-sm text-pit-text line-through">{p.displayname ?? p.emailaddress}</p>
                  <button
                    className="text-xs text-pit-text hover:text-white"
                    onClick={() => toggleMutation.mutate(p.userid)}
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {players.length === 0 && (
          <p className="text-pit-text text-center py-12">No players registered yet.</p>
        )}
      </div>
    </div>
  );
}
