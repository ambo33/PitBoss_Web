import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { clearPendingGroupInvite, setPendingGroupInvite } from '../../utils/invites';

export default function JoinGroupPage() {
  const { inviteCode = '' } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const normalizedCode = inviteCode.trim().toUpperCase();
  const [message, setMessage] = useState('Preparing your group invite...');
  const [error, setError] = useState('');

  useEffect(() => {
    async function join() {
      if (!normalizedCode) {
        navigate('/', { replace: true });
        return;
      }

      if (!token) {
        setPendingGroupInvite(normalizedCode);
        navigate(`/login?invite=${encodeURIComponent(normalizedCode)}`, { replace: true });
        return;
      }

      setMessage('Joining group...');
      try {
        await api.joinGroup(normalizedCode);
        clearPendingGroupInvite();
        navigate('/', { replace: true, state: { tab: 'groups' } });
      } catch (err) {
        const messageText = err instanceof Error ? err.message : 'Failed to join group';
        if (messageText === 'Already a member') {
          clearPendingGroupInvite();
          navigate('/', { replace: true, state: { tab: 'groups' } });
          return;
        }
        setError(messageText);
      }
    }

    void join();
  }, [navigate, normalizedCode, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-pit-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-pit-border bg-pit-surface p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-pit-teal/30 bg-pit-teal/15">
          <Users size={24} className="text-pit-teal" />
        </div>
        <h1 className="text-xl font-bold text-white">Group Invite</h1>
        {!error ? (
          <p className="mt-3 text-sm text-pit-text">{message}</p>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-red-400">{error}</p>
            <button
              className="btn-primary w-full"
              onClick={() => navigate('/', { replace: true, state: { tab: 'groups' } })}
            >
              Back to Groups
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
