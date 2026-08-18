export type LeagueRsvpStatus = 'going' | 'not_going';

export type LeagueRsvpResult = {
  placed: number | null;
  dnf: boolean;
};

export type LeagueRsvpResultMutation = 'mark_dnf' | 'clear' | 'none';

export function getLeagueRsvpResultMutation(
  status: LeagueRsvpStatus,
  result: LeagueRsvpResult | null
): LeagueRsvpResultMutation {
  if (status === 'not_going') {
    return result?.dnf && result.placed == null ? 'none' : 'mark_dnf';
  }

  return result ? 'clear' : 'none';
}
