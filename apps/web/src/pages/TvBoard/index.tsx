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
    refetchInterval: 15_000,
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
    <div className="min-h-screen bg-pit-bg px-4 py-4 md:px-6 md:py-6 xl:px-8 xl:py-8">
      <div className="mx-auto max-w-[2200px] space-y-4">
        <header className="text-center">
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{data.tournament.name}</h1>
        </header>
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
  );
}
