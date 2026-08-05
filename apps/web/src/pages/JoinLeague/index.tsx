import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Trophy, UserRoundCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, JoinLeagueResponse, LeagueClaimablePlayer } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';
import { clearPendingJoinPath, setPendingJoinPath } from '../../utils/invites';

export default function JoinLeaguePage() {
  const { inviteCode = '' } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const normalizedCode = inviteCode.trim().toUpperCase();
  const startedRef = useRef(false);
  const [result, setResult] = useState<JoinLeagueResponse | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!normalizedCode) {
      navigate('/', { replace: true });
      return;
    }
    const joinPath = `/join/league/${encodeURIComponent(normalizedCode)}`;
    if (!token) {
      setPendingJoinPath(joinPath);
      navigate(`/login?next=${encodeURIComponent(joinPath)}`, { replace: true });
      return;
    }
    api.joinLeague(normalizedCode)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not join this league.'));
  }, [navigate, normalizedCode, token]);

  function finish(joinResult: JoinLeagueResponse) {
    clearPendingJoinPath();
    navigate(joinResult.seasonJoined
      ? `/?section=leagues&league=${encodeURIComponent(joinResult.leagueid)}`
      : '/?section=leagues', { replace: true });
  }

  async function claimPlayer(player: LeagueClaimablePlayer) {
    setError('');
    setClaimingId(player.userid);
    try {
      finish(await api.joinLeague(normalizedCode, player.userid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim that player spot.');
      setClaimingId(null);
    }
  }

  async function skipClaim() {
    setError('');
    setClaimingId('skip');
    try {
      finish(await api.joinLeague(normalizedCode, null, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this league.');
      setClaimingId(null);
    }
  }

  const claimablePlayers = result?.claimablePlayers ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-pit-bg px-4 py-8">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-pit-border bg-pit-surface shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="h-1 bg-pit-teal" />
        <div className="p-5 sm:p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-pit-teal/30 bg-pit-teal/15">
            <Trophy size={24} className="text-pit-teal" />
          </div>
          <h1 className="text-center text-xl font-bold text-white">Join League</h1>

          {!result && !error && <LoadingSpinner className="mt-8" />}

          {error && (
            <div className="mt-5 space-y-4 text-center">
              <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-sm text-red-300">{error}</p>
              <button type="button" className="btn-ghost w-full justify-center" onClick={() => navigate('/', { replace: true })}>
                Return to Command Center
              </button>
            </div>
          )}

          {result && result.pending && (
            <div className="mt-5 space-y-4 text-center">
              <p className="text-sm leading-6 text-pit-text">Your request was sent to the league admins for approval.</p>
              <button type="button" className="btn-primary w-full justify-center" onClick={() => finish(result)}>
                Return to Command Center
              </button>
            </div>
          )}

          {result && !result.pending && claimablePlayers.length === 0 && (
            <div className="mt-5 space-y-4 text-center">
              <p className="text-sm text-pit-text">You are ready to enter the league.</p>
              <button type="button" className="btn-primary w-full justify-center gap-2" onClick={() => finish(result)}>
                Open League <ArrowRight size={16} />
              </button>
            </div>
          )}

          {result && !result.pending && claimablePlayers.length > 0 && (
            <div className="mt-5 space-y-4">
              <div className="text-center">
                <h2 className="font-bold text-white">Is one of these players you?</h2>
              <p className="mt-1 text-sm leading-5 text-pit-muted">Claim your existing league history, or join as a new player.</p>
              </div>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {claimablePlayers.map((player) => (
                  <button
                    key={player.userid}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg px-3 py-3 text-left transition hover:border-pit-teal/50 hover:bg-pit-teal/10"
                    onClick={() => void claimPlayer(player)}
                    disabled={Boolean(claimingId)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{player.displayname ?? 'League player'}</span>
                      {player.seasonname && <span className="mt-0.5 block text-xs text-pit-muted">Seasons: {player.seasonname}</span>}
                    </span>
                    <UserRoundCheck size={18} className="shrink-0 text-pit-teal" />
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost w-full justify-center" onClick={() => void skipClaim()} disabled={Boolean(claimingId)}>
                None of these are me
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
