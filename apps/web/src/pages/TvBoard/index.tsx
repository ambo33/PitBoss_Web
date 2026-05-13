import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import RunTournament from '../PreTournament/RunTournament';

export default function TvBoardPage() {
  const { code } = useParams<{ code: string }>();
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth || 1920,
        height: window.innerHeight || 1080,
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-tv-board', code],
    queryFn: () => api.getPublicTvBoard(code!),
    enabled: !!code,
  });

  const stage = useMemo(() => {
    const baseWidth = 1920;
    const baseHeight = 1080;
    const scale = Math.min(viewport.width / baseWidth, viewport.height / baseHeight);
    return {
      baseWidth,
      baseHeight,
      scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    };
  }, [viewport.height, viewport.width]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pit-bg px-4 py-8 text-white">
        <LoadingSpinner className="mt-24" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-pit-bg px-4 py-8 text-white">
        <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-pit-border bg-pit-surface/70 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">TV board unavailable</h1>
          <p className="mt-2 text-sm text-pit-text">
            {error instanceof Error ? error.message : 'This tournament display could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#090a0f] text-white">
      <div
        className="origin-center"
        style={{
          width: `${stage.baseWidth}px`,
          height: `${stage.baseHeight}px`,
          transform: `scale(${stage.scale})`,
        }}
      >
        <div className="flex h-full flex-col bg-pit-bg px-10 py-8">
          <header className="mb-6 flex items-center justify-between rounded-2xl border border-pit-border bg-pit-surface/75 px-8 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="flex items-center gap-4">
              <img
                src="/branding/pokerplanner-logo-compact.png"
                alt="PokerPlanner.bet"
                className="h-16 w-16 object-contain"
              />
              <div>
                <p className="text-3xl font-semibold tracking-tight text-white">PokerPlanner.bet</p>
                <p className="mt-1 text-sm uppercase tracking-[0.28em] text-pit-muted">Run Better Poker Nights</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm uppercase tracking-[0.28em] text-pit-muted">Tournament Display</p>
              <h1 className="mt-1 text-5xl font-semibold tracking-tight text-white">{data.tournament.name}</h1>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            <RunTournament
              tournamentId={data.tournament.tournamentid}
              isOwner={false}
              tournament={data.tournament}
              players={data.players}
              mode="display"
              queryKeysToRefresh={[['public-tv-board', code]]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
