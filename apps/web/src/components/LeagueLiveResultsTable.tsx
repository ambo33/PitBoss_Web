import { useEffect, useRef } from 'react';
import type { LeagueResult } from '../api/client';

type FinishOption = {
  place: number;
  points: number;
};

type LiveFinishRow = {
  place: number;
  points: number;
  displayname: string | null;
  isNext: boolean;
  isRecorded: boolean;
};

export default function LeagueLiveResultsTable({
  finishOptions,
  results,
  nextPlace,
}: {
  finishOptions: FinishOption[];
  results: LeagueResult[];
  nextPlace: number | null;
}) {
  const nextRowRef = useRef<HTMLDivElement | null>(null);
  const completed = results
    .filter((result) => !result.dnf && result.placed != null)
    .sort((a, b) => new Date(b.updatedat).getTime() - new Date(a.updatedat).getTime());
  const usedPlaces = new Set(completed.map((result) => Number(result.placed)));
  const openRows = finishOptions
    .filter((finish) => !usedPlaces.has(finish.place))
    .sort((a, b) => b.place - a.place)
    .map<LiveFinishRow>((finish) => ({
      ...finish,
      displayname: null,
      isNext: finish.place === nextPlace,
      isRecorded: false,
    }));
  const recordedRows = completed.map<LiveFinishRow>((result) => ({
    place: Number(result.placed),
    points: Number(result.points || 0),
    displayname: result.displayname ?? 'Player',
    isNext: false,
    isRecorded: true,
  }));
  const rows = [...new Map([...openRows, ...recordedRows].map((row) => [row.place, row])).values()]
    .sort((a, b) => a.place - b.place);

  useEffect(() => {
    nextRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [nextPlace]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-pit-border bg-pit-bg/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pit-muted">Live results</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-pit-border">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] gap-2 border-b border-pit-border bg-pit-card/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-pit-muted">
          <span>Place</span>
          <span>Name</span>
          <span className="text-right">Points</span>
        </div>
        <div className="max-h-[23rem] touch-pan-y overflow-y-auto overscroll-contain">
        {rows.map((row) => (
          <div
            key={row.place}
            ref={row.isNext ? nextRowRef : undefined}
            className={`grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] items-center gap-2 border-b border-pit-border px-3 py-2.5 text-sm last:border-b-0 ${row.isRecorded
              ? 'bg-pit-teal/[0.08]'
              : row.isNext
                ? 'bg-pit-gold/[0.10]'
                : 'bg-pit-card/55'
              }`}
          >
            <span className={`font-black ${row.isNext ? 'text-pit-gold' : row.isRecorded ? 'text-pit-teal' : 'text-white'}`}>{ordinal(row.place)}</span>
            <span className={`min-w-0 truncate font-semibold ${row.isRecorded ? 'text-white' : row.isNext ? 'text-pit-gold' : 'text-pit-muted'}`}>
              {row.displayname ?? (row.isNext ? 'Next knockout' : '')}
            </span>
            <span className="text-right font-mono text-xs font-black text-pit-gold">{row.points.toLocaleString()}</span>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
}
