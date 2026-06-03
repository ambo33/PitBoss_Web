import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Play, RotateCcw } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';

export default function DemoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((state) => state.setAuth);
  const startedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Getting demo ready...');

  async function startDemo() {
    setError('');
    setStatus('Getting demo ready...');
    try {
      const demo = await api.startDemo();
      localStorage.setItem('pb_token', demo.token);
      setStatus('Loading the tournament room...');
      const profile = await api.me();
      setAuth(demo.token, profile);
      setStatus('Loading the blind structure...');
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['tournament', demo.tournamentId],
          queryFn: () => api.getTournament(demo.tournamentId),
        }),
        queryClient.fetchQuery({
          queryKey: ['players', demo.tournamentId],
          queryFn: () => api.getPlayers(demo.tournamentId),
        }),
        queryClient.fetchQuery({
          queryKey: ['blinds', demo.tournamentId],
          queryFn: () => api.getBlinds(demo.tournamentId),
        }),
        queryClient.fetchQuery({
          queryKey: ['timer', demo.tournamentId],
          queryFn: () => api.getTimer(demo.tournamentId),
        }),
      ]);
      setStatus('Opening Run Tournament...');
      navigate(`/tournament/${demo.tournamentId}`, {
        replace: true,
        state: { tab: 'run', demoCoach: 'start' },
      });
    } catch (err) {
      startedRef.current = false;
      setError(err instanceof Error ? err.message : 'Demo could not be created. Please try again.');
      setStatus('Demo setup hit a snag.');
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startDemo();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-pit-bg px-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(20,184,166,0.22),transparent_35%),radial-gradient(circle_at_85%_85%,rgba(245,184,75,0.10),transparent_28%),linear-gradient(180deg,#122E30_0%,#0B0B0D_58%)]" />
      <section className="relative w-full max-w-lg rounded-2xl border border-pit-border bg-pit-card/85 p-6 text-center shadow-2xl backdrop-blur">
        <div className="mx-auto mb-7 flex justify-center">
          <BrandLockup compact />
        </div>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-pit-teal/30 bg-pit-teal/10 text-pit-teal">
          <Play size={28} fill="currentColor" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-pit-teal">Live demo</p>
        <h1 className="mt-3 text-3xl font-black text-white">{status}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-pit-text">
          We are bringing you right into the middle of the action in a 40-person game, with players seated, payouts live, and the clock ready to run.
        </p>
        {!error && (
          <div className="mx-auto mt-7 h-2 w-full max-w-xs overflow-hidden rounded-full bg-pit-bg">
            <div className="h-full w-1/2 animate-[pp-demo-load_1.1s_ease-in-out_infinite] rounded-full bg-pit-teal" />
          </div>
        )}
        {error && (
          <div className="mt-7 rounded-xl border border-red-300/30 bg-red-500/10 p-4 text-left">
            <p className="text-sm font-semibold text-red-100">{error}</p>
            <button className="btn-primary mt-4 w-full justify-center" type="button" onClick={() => void startDemo()}>
              <RotateCcw size={16} />
              Try again
            </button>
            <Link className="btn-ghost mt-2 w-full justify-center" to="/landing">Back to overview</Link>
          </div>
        )}
      </section>
      <style>{`
        @keyframes pp-demo-load {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(230%); }
        }
      `}</style>
    </main>
  );
}
