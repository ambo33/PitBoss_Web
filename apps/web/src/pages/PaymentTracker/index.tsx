import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Socket } from 'socket.io-client';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import { isEnabledFlag } from '../../utils/flags';
import { playerNameWithMedals } from '../../utils/playerAchievements';
import { createDebugSocket } from '../../utils/socketDebug';

export default function PaymentTrackerPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const { data: tournament, isLoading: loadingTournament, error: tournamentError } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
  });

  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', id],
    queryFn: () => api.getPlayers(id!),
    enabled: !!id && !!tournament,
  });

  const toggleMutation = useMutation({
    mutationFn: (uid: string) => api.togglePaid(id!, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players', id] }),
  });

  useEffect(() => {
    if (!id) return;
    const socket = createDebugSocket('payment-tracker');
    socketRef.current = socket;
    socket.emit('join-tournament', id);
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['players', id] });
      qc.invalidateQueries({ queryKey: ['tournament', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc]);

  const unpaid = players.filter((player) => !player.paid);
  const paid = players.filter((player) => player.paid);

  if (loadingTournament || isLoading) return <LoadingSpinner className="mt-24" />;

  if (tournamentError || !tournament || !isEnabledFlag(tournament.canmanage)) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white min-[1200px]:min-h-[calc(100vh-70px)] min-[1200px]:bg-[#080d12]" data-workspace-page="payment-tracker">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">Admins only</h1>
          <p className="mt-2 text-sm text-pit-text">The payment tracker is only available to tournament admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pit-bg p-4 text-white min-[1200px]:min-h-[calc(100vh-70px)] min-[1200px]:bg-[#080d12] min-[1200px]:p-6" data-workspace-page="payment-tracker">
      <header className="mb-6 text-center min-[1200px]:mx-auto min-[1200px]:max-w-5xl min-[1200px]:text-left">
        <p className="text-sm text-pit-text">ThePokerPlanner - Payment Tracker</p>
        <h1 className="text-xl font-bold text-white">{tournament.name}</h1>
        <p className="mt-1 text-sm text-pit-text">
          {paid.length}/{players.length} paid
          {Number(tournament.buyin) > 0 && ` - $${Number(tournament.buyin).toFixed(2)} buy-in`}
        </p>
      </header>

      <div className="mx-auto max-w-lg space-y-6 min-[1200px]:grid min-[1200px]:max-w-5xl min-[1200px]:grid-cols-2 min-[1200px]:items-start min-[1200px]:gap-6 min-[1200px]:space-y-0">
        {unpaid.length > 0 && (
          <div className="card min-[1200px]:only:col-span-2">
            <h2 className="mb-3 font-semibold text-yellow-400">Awaiting Payment ({unpaid.length})</h2>
            <div className="space-y-2">
              {unpaid.map((player) => (
                <div key={player.userid} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">{playerNameWithMedals(player)}</p>
                    {(player.rebuys > 0 || player.addedon) && (
                      <p className="text-xs text-pit-text">
                        +{player.rebuys} rebuy - +{player.addedon ? '1' : '0'} add-on
                      </p>
                    )}
                  </div>
                  <button
                    className="btn-primary px-3 py-1.5 text-xs"
                    onClick={() => toggleMutation.mutate(player.userid)}
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
          <div className="card min-[1200px]:only:col-span-2">
            <h2 className="mb-3 font-semibold text-pit-teal">Paid ({paid.length})</h2>
            <div className="space-y-1">
              {paid.map((player) => (
                <div key={player.userid} className="flex items-center justify-between gap-3">
                  <p className="line-through text-sm text-pit-text">{playerNameWithMedals(player)}</p>
                  <button
                    className="text-xs text-pit-text hover:text-white"
                    onClick={() => toggleMutation.mutate(player.userid)}
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {players.length === 0 && (
          <p className="py-12 text-center text-pit-text min-[1200px]:col-span-2">No players registered yet.</p>
        )}
      </div>
    </div>
  );
}
