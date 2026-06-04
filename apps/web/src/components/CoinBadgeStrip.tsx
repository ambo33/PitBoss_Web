import type { PlayerCoinBadge } from '../api/client';

type CoinBadgeStripSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClasses: Record<CoinBadgeStripSize, string> = {
  xs: 'h-4 w-4',
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

const countClasses: Record<CoinBadgeStripSize, string> = {
  xs: 'text-[7px] px-0.5 leading-3',
  sm: 'text-[8px] px-1',
  md: 'text-[9px] px-1',
  lg: 'text-[10px] px-1.5',
};

export default function CoinBadgeStrip({
  coins = [],
  size = 'sm',
  limit = 5,
  className = '',
}: {
  coins?: PlayerCoinBadge[] | null;
  size?: CoinBadgeStripSize;
  limit?: number;
  className?: string;
}) {
  const allCoins = coins ?? [];
  const visibleCoins = allCoins.slice(0, limit);
  if (visibleCoins.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {visibleCoins.map((coin) => (
        <span
          key={coin.coinid}
          className="relative inline-flex shrink-0"
          title={`${coin.name}${coin.count > 1 ? ` x${coin.count}` : ''}`}
        >
          <img
            src={coin.imagedata ?? coin.imageurl ?? '/challenge-coins/defaults/big-stack.svg'}
            alt={coin.name}
            className={`${sizeClasses[size]} rounded-full border border-white/15 bg-pit-bg object-cover shadow-sm`}
          />
          {coin.count > 1 && (
            <span className={`absolute -bottom-1 -right-1 rounded-full bg-pit-teal font-bold leading-4 text-white shadow ${countClasses[size]}`}>
              x{coin.count}
            </span>
          )}
        </span>
      ))}
      {allCoins.length > limit && (
        <span className="rounded-full border border-pit-border bg-pit-bg/70 px-1.5 py-0.5 text-[10px] font-semibold text-pit-muted">
          +{allCoins.length - limit}
        </span>
      )}
    </div>
  );
}
