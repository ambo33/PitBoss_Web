import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';

function guestStorageKey(tournamentId: string) {
  return `pb_guest_lobby_${tournamentId}`;
}

export default function KnockoutLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [knockedOutByUserId, setKnockedOutByUserId] = useState('');
  const [guestUserId] = useState(() => {
    if (!id) return '';
    return localStorage.getItem(guestStorageKey(id)) ?? '';
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-knockout', id, guestUserId, user?.guid],
    queryFn: () => api.getPublicKnockout(id!, guestUserId || undefined),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const knockoutMutation = useMutation({
    mutationFn: () => api.publicSelfKnockout(id!, {
      guestUserId: guestUserId || undefined,
      knockedOutByUserId: knockedOutByUserId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-knockout', id] });
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
    },
  });

  useEffect(() => {
    if (!id) return;
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', id);
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['public-knockout', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc]);

  const tournament = data?.tournament;
  const entry = data?.entry;
  const activePlayers = data?.activePlayers ?? [];

  function handleSignIn() {
    if (!id) return;
    navigate(`/login?next=${encodeURIComponent(`/bust/${id}`)}`);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto max-w-3xl py-16 text-center text-pit-text">Loading knockout station...</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">Knockout station unavailable</h1>
          <p className="mt-2 text-sm text-pit-text">{error instanceof Error ? error.message : 'This tournament could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pit-bg p-4 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="pt-6 text-center">
          <p className="text-sm text-pit-text">PokerPlanner.bet - Knockout Station</p>
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <p className="mt-2 text-sm text-pit-text">Use this after you bust out so the tournament state stays current.</p>
        </header>

        {!token && !guestUserId && (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">Find your player record</h2>
            <p className="mt-2 text-sm text-pit-text">Sign in with the same account you used to register, or use the same device you checked in with as a guest.</p>
            <button type="button" className="btn-primary mt-4" onClick={handleSignIn}>Sign In</button>
          </section>
        )}

        {entry?.placed != null ? (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">You&apos;re already marked out</h2>
            <p className="mt-2 text-sm text-pit-text">Finish position: #{entry.placed}</p>
          </section>
        ) : entry ? (
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{entry.displayname ?? entry.emailaddress ?? 'Player'}</h2>
              <p className="mt-1 text-sm text-pit-text">
                {entry.checkedin
                  ? 'Report your knockout below. You can optionally note who knocked you out.'
                  : 'You are not currently checked in. Head back to the check-in QR first if this player should still be active.'}
              </p>
            </div>

            {entry.checkedin && (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-pit-text">Who knocked you out? (optional)</span>
                  <select
                    className="input"
                    value={knockedOutByUserId}
                    onChange={(event) => setKnockedOutByUserId(event.target.value)}
                  >
                    <option value="">No selection</option>
                    {activePlayers.map((player) => (
                      <option key={player.userid} value={player.userid}>
                        {player.displayname ?? player.emailaddress}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => knockoutMutation.mutate()}
                  disabled={knockoutMutation.isPending}
                >
                  {knockoutMutation.isPending ? 'Reporting...' : 'I Have Been Knocked Out'}
                </button>
                {knockoutMutation.error && (
                  <p className="text-sm text-red-400">{knockoutMutation.error.message}</p>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">No active player found on this device</h2>
            <p className="mt-2 text-sm text-pit-text">Use the check-in QR first so we know which player should be marked out.</p>
          </section>
        )}
      </div>
    </div>
  );
}
