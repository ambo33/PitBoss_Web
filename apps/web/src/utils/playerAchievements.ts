import type { GroupMember, TournamentPlayer } from '../api/client';

export type PlayerAchievementCarrier = Partial<Pick<
  TournamentPlayer | GroupMember,
  'firstplacecount' | 'secondplacecount' | 'thirdplacecount' | 'cashfinishcount' | 'finaltablecount'
>>;

export const PLAYER_ACHIEVEMENT_LEGEND = [
  { icon: '🏆', label: '1st place', key: 'firstplacecount' },
  { icon: '🥈', label: '2nd place', key: 'secondplacecount' },
  { icon: '🥉', label: '3rd place', key: 'thirdplacecount' },
  { icon: '💰', label: 'Cash finishes', key: 'cashfinishcount' },
  { icon: '🏁', label: 'Final tables', key: 'finaltablecount' },
] as const;

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function playerAchievementStats(player: PlayerAchievementCarrier) {
  return PLAYER_ACHIEVEMENT_LEGEND
    .map((item) => ({
      icon: item.icon,
      label: item.label,
      count: count(player[item.key]),
    }))
    .filter((item) => item.count > 0);
}

export function playerMedalSuffix(player: PlayerAchievementCarrier) {
  return playerAchievementStats(player)
    .map((stat) => `${stat.icon}x${stat.count}`)
    .join(' ');
}

export function playerNameWithMedals(player: PlayerAchievementCarrier & { displayname?: string | null; emailaddress?: string | null }) {
  const name = player.displayname ?? player.emailaddress ?? 'Player';
  const medals = playerMedalSuffix(player);
  return medals ? `${name} ${medals}` : name;
}
