import type { GroupMember, TournamentPlayer } from '../api/client';

type MedalCarrier = Pick<TournamentPlayer | GroupMember, 'firstplacecount' | 'secondplacecount' | 'thirdplacecount'>;

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function playerMedalSuffix(player: MedalCarrier) {
  const first = count(player.firstplacecount);
  const second = count(player.secondplacecount);
  const third = count(player.thirdplacecount);
  return [
    first > 0 ? `🥇x${first}` : '',
    second > 0 ? `🥈x${second}` : '',
    third > 0 ? `🥉x${third}` : '',
  ].filter(Boolean).join(' ');
}

export function playerNameWithMedals(player: MedalCarrier & { displayname?: string | null; emailaddress?: string | null }) {
  const name = player.displayname ?? player.emailaddress ?? 'Player';
  const medals = playerMedalSuffix(player);
  return medals ? `${name} ${medals}` : name;
}
