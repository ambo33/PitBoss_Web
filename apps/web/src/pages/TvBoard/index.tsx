import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import RunTournament from '../PreTournament/RunTournament';

export default function TvBoardPage() {
  const { code } = useParams<{ code: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-tv-board', code],
    queryFn: () => api.getPublicTvBoard(code!),
    enabled: !!code,
  });

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
    <div className="h-screen w-screen overflow-hidden bg-[#090a0f] text-white">
      <div className="flex h-full flex-col bg-pit-bg px-3 py-3 xl:px-4 xl:py-4">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-pit-border bg-pit-surface/80 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.34)] xl:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-pit-muted xl:text-xs">Tournament Display</p>
            <h1 className="mt-1 break-words text-2xl font-semibold leading-none tracking-tight text-white xl:text-4xl">
              {data.tournament.name}
            </h1>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-xl font-semibold tracking-tight text-white xl:text-2xl">PokerPlanner.bet</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.24em] text-pit-muted xl:text-xs">Run Better Poker Nights</p>
            </div>
            <img
              src="/branding/pokerplanner-logo-compact.png"
              alt="PokerPlanner.bet"
              className="h-10 w-10 object-contain xl:h-12 xl:w-12"
            />
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <RunTournament
            tournamentId={data.tournament.tournamentid}
            isOwner={false}
            tournament={data.tournament}
            players={data.players}
            mode="tv"
            queryKeysToRefresh={[['public-tv-board', code]]}
          />
        </div>
      </div>
    </div>
  );
}
