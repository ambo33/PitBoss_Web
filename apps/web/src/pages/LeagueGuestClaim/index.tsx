import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Link2, ShieldAlert } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { api } from '../../api/client';

export default function LeagueGuestClaimPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const token = useMemo(() => params.get('token') ?? '', [params]);

  const claimMutation = useMutation({
    mutationFn: () => api.claimLeagueGuest(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });

  return (
    <main className="min-h-screen bg-pit-bg px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-pit-border bg-pit-card p-5 shadow-2xl">
        <BrandLockup compact showSlogan={false} />
        <div className="mt-6 rounded-2xl border border-pit-teal/25 bg-pit-teal/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-pit-teal/30 bg-pit-teal/15 text-pit-teal">
              <Link2 size={19} />
            </div>
            <div>
              <p className="eyebrow">League profile</p>
              <h1 className="text-2xl font-black text-white">Claim guest player</h1>
            </div>
          </div>

          {!token ? (
            <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
              <ShieldAlert className="mb-2 text-red-200" size={18} />
              This claim link is missing its invite token.
            </div>
          ) : claimMutation.isSuccess ? (
            <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <CheckCircle2 className="mb-2 text-emerald-200" size={18} />
              Your league guest profile is now connected to your account.
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-pit-text">
              This connects the guest player&apos;s league finishes, payments, and season history to the account you are signed into.
            </p>
          )}

          {claimMutation.error && (
            <p className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">
              {claimMutation.error.message}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {!claimMutation.isSuccess && (
              <button
                className="btn-primary justify-center px-4 py-2"
                disabled={!token || claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
                type="button"
              >
                {claimMutation.isPending ? 'Claiming...' : 'Claim profile'}
              </button>
            )}
            <Link className="btn-ghost justify-center px-4 py-2" to="/">
              Back to app
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
