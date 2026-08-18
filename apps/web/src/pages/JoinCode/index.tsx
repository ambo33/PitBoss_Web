import { useEffect, useState } from 'react';
import { ArrowRight, Hash, Trophy, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';
import { clearPendingJoinPath, normalizeGroupInviteCode, setPendingJoinPath } from '../../utils/invites';

type JoinTarget = {
  code: string;
  type: 'group' | 'league';
  id: string;
  name: string;
};

export default function JoinCodePage() {
  const { inviteCode = '' } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const code = normalizeGroupInviteCode(inviteCode);
  const [target, setTarget] = useState<JoinTarget | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      navigate('/', { replace: true });
      return;
    }
    setTarget(null);
    setError('');
    api.resolveJoinCode(code).then(setTarget).catch((err) => {
      setError(err instanceof Error ? err.message : 'Join code not found.');
    });
  }, [code, navigate]);

  function continueToJoin() {
    if (!target) return;
    const destination = `/join/${target.type}/${encodeURIComponent(target.code)}`;
    if (!token) {
      setPendingJoinPath(destination);
      navigate(`/login?next=${encodeURIComponent(destination)}`, { replace: true });
      return;
    }
    clearPendingJoinPath();
    navigate(destination, { replace: true });
  }

  const Icon = target?.type === 'league' ? Trophy : Users;
  const label = target?.type === 'league' ? 'League' : 'Group';

  return (
    <div className="flex min-h-screen items-center justify-center bg-pit-bg px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-pit-border bg-pit-surface shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="h-1 bg-pit-teal" />
        <div className="p-5 text-center sm:p-6">
          {!target && !error && <LoadingSpinner className="my-8" />}
          {error && (
            <div className="space-y-4">
              <Hash className="mx-auto text-pit-muted" size={28} />
              <h1 className="text-xl font-bold text-white">Join code unavailable</h1>
              <p className="text-sm text-pit-text">{error}</p>
              <button type="button" className="btn-ghost w-full justify-center" onClick={() => navigate('/', { replace: true })}>Return to Command Center</button>
            </div>
          )}
          {target && (
            <div className="space-y-5">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-pit-teal/30 bg-pit-teal/15">
                <Icon size={24} className="text-pit-teal" />
              </div>
              <div>
                <p className="eyebrow">{label} join code</p>
                <h1 className="mt-1 text-xl font-bold text-white">Join {target.name}?</h1>
                <p className="mt-2 text-sm text-pit-text">You are about to join this {target.type}.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-ghost flex-1 justify-center" onClick={() => navigate('/', { replace: true })}>Cancel</button>
                <button type="button" className="btn-primary flex-1 justify-center gap-2" onClick={continueToJoin}>
                  Join {label} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
