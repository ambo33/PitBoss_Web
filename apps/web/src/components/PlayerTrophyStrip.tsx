import { playerAchievementStats, type PlayerAchievementCarrier } from '../utils/playerAchievements';

type PlayerTrophyStripSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClasses: Record<PlayerTrophyStripSize, string> = {
  xs: 'gap-0.5 text-[9px]',
  sm: 'gap-1 text-[11px]',
  md: 'gap-1.5 text-xs',
  lg: 'gap-2 text-sm',
};

const chipClasses: Record<PlayerTrophyStripSize, string> = {
  xs: 'px-1 py-0',
  sm: 'px-1.5 py-0.5',
  md: 'px-2 py-0.5',
  lg: 'px-2.5 py-1',
};

export default function PlayerTrophyStrip({
  player,
  size = 'sm',
  limit = 5,
  className = '',
}: {
  player?: PlayerAchievementCarrier | null;
  size?: PlayerTrophyStripSize;
  limit?: number;
  className?: string;
}) {
  const stats = player ? playerAchievementStats(player).slice(0, limit) : [];
  if (stats.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center ${sizeClasses[size]} ${className}`}>
      {stats.map((stat) => (
        <span
          key={stat.label}
          className={`inline-flex items-center gap-0.5 rounded-full border border-pit-border bg-pit-surface/60 font-semibold text-pit-text ${chipClasses[size]}`}
          title={stat.label}
          aria-label={`${stat.label}: ${stat.count}`}
        >
          <span aria-hidden="true">{stat.icon}</span>
          <span>x{stat.count}</span>
        </span>
      ))}
    </div>
  );
}
