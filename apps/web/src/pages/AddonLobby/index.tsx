import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';

function guestStorageKey(tournamentId: string) {
  return `pb_guest_lobby_${tournamentId}`;
}

export default function AddonLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [guestUserId] = useState(() => {
    if (!id) return '';
    return localStorage.getItem(guestStorageKey(id)) ?? '';
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-addon', id, guestUserId, user?.guid],
    queryFn: () => api.getPublicAddon(id!, guestUserId || undefined),
    enabled: !!id,
  });

  const addonMutation = useMutation({
    mutationFn: () => api.publicSelfAddon(id!, { guestUserId: guestUserId || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-addon', id] });
      qc.invalidateQueries({ queryKey: ['public-lobby', id] });
      qc.invalidateQueries({ queryKey: ['public-knockout', id] });
    },
  });

  useEffect(() => {
    if (!id) return;
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', id);
    socket.on('tournament-updated', () => {
      qc.invalidateQueries({ queryKey: ['public-addon', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, qc]);

  const tournament = data?.tournament;
  const entry = data?.entry;

  function handleSignIn() {
    if (!id) return;
    navigate(`/login?next=${encodeURIComponent(`/addon/${id}`)}`);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="mx-auto max-w-3xl py-16 text-center text-pit-text">Loading add-on station...</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold text-white">Add-on station unavailable</h1>
          <p className="mt-2 text-sm text-pit-text">{error instanceof Error ? error.message : 'This tournament could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pit-bg p-4 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="pt-6 text-center">
          <p className="text-sm text-pit-text">ThePokerPlanner - Add-On Station</p>
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <p className="mt-2 text-sm text-pit-text">Use this after paying for your add-on.</p>
        </header>

        {!token && !guestUserId && (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">Find your player record</h2>
            <p className="mt-2 text-sm text-pit-text">Sign in with the same account you used to register, or use the same device you checked in with as a guest.</p>
            <button type="button" className="btn-primary mt-4" onClick={handleSignIn}>Sign In</button>
          </section>
        )}

        {entry?.addedon ? (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">Add-on already recorded</h2>
            <p className="mt-2 text-sm text-pit-text">You are all set for this tournament.</p>
          </section>
        ) : entry ? (
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{entry.displayname ?? entry.emailaddress ?? 'Player'}</h2>
              <p className="mt-1 text-sm text-pit-text">
                {entry.checkedin
                  ? `Tap below to record your add-on of ${tournament.addonchips.toLocaleString()} chips.`
                  : 'You are not currently checked in. Head back to the check-in QR first if this player should still be active.'}
              </p>
            </div>

            {entry.checkedin && (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => addonMutation.mutate()}
                  disabled={addonMutation.isPending}
                >
                  {addonMutation.isPending ? 'Recording...' : 'Record My Add-On'}
                </button>
                {addonMutation.error && (
                  <p className="text-sm text-red-400">{addonMutation.error.message}</p>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="card text-center">
            <h2 className="text-lg font-semibold text-white">No active player found on this device</h2>
            <p className="mt-2 text-sm text-pit-text">Use the check-in QR first so we know who should receive the add-on.</p>
          </section>
        )}
      </div>
    </div>
  );
}
