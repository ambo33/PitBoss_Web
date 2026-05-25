export type LeaguePointRule = { place: number | 'DNF'; points: number };
export type LeagueFinalMultiplier = { place: number; multiplier: number };
export type LeagueMemberRow = {
  userid: string;
  emailaddress?: string | null;
  displayname: string | null;
  isadmin: boolean;
  approved: boolean;
  participating: boolean;
};
export type LeagueResultRow = {
  resultid?: string;
  eventid: string;
  leagueid: string;
  userid: string;
  displayname?: string | null;
  placed: number | null;
  dnf: boolean;
  points: number | string;
  showupbonuspoints: number | string;
  loggedby?: string | null;
  createdat?: string;
  updatedat?: string;
};

export type SerializedLeagueForFinals = {
  finalenabled: boolean;
  finalmultiplierlookup: LeagueFinalMultiplier[];
  finalchiprounding: number;
  finalstartingbigblind: number;
};

export const DEFAULT_POINTS_LOOKUP: LeaguePointRule[] = [
  { place: 'DNF', points: 0 },
  { place: 1, points: 671 },
  { place: 2, points: 448 },
  { place: 3, points: 336 },
  { place: 4, points: 269 },
  { place: 5, points: 224 },
  { place: 6, points: 192 },
  { place: 7, points: 168 },
  { place: 8, points: 150 },
  { place: 9, points: 135 },
  { place: 10, points: 122 },
  { place: 11, points: 112 },
  { place: 12, points: 104 },
  { place: 13, points: 96 },
  { place: 14, points: 90 },
  { place: 15, points: 84 },
  { place: 16, points: 79 },
  { place: 17, points: 75 },
  { place: 18, points: 71 },
  { place: 19, points: 68 },
  { place: 20, points: 64 },
  { place: 21, points: 61 },
  { place: 22, points: 59 },
  { place: 23, points: 56 },
  { place: 24, points: 54 },
  { place: 25, points: 52 },
  { place: 26, points: 50 },
  { place: 27, points: 48 },
  { place: 28, points: 47 },
  { place: 29, points: 45 },
  { place: 30, points: 44 },
  { place: 31, points: 42 },
  { place: 32, points: 41 },
  { place: 33, points: 40 },
  { place: 34, points: 39 },
  { place: 35, points: 38 },
  { place: 36, points: 37 },
];

export function normalizePointsLookup(value: unknown): LeaguePointRule[] {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      source = null;
    }
  }
  if (!Array.isArray(source)) return DEFAULT_POINTS_LOOKUP;
  const rules = source
    .map((raw) => {
      const item = raw as Partial<LeaguePointRule>;
      const rawPlace = String(item.place ?? '').trim().toUpperCase();
      const place = rawPlace === 'DNF' ? 'DNF' : Math.max(1, Math.round(Number(item.place)));
      const points = Math.max(0, Math.round(Number(item.points ?? 0)));
      if (place !== 'DNF' && !Number.isFinite(place)) return null;
      return { place, points };
    })
    .filter(Boolean) as LeaguePointRule[];
  return rules.length ? rules : DEFAULT_POINTS_LOOKUP;
}

export function generatePointsLookup(playerCount: number, totalPoints?: number): LeaguePointRule[] {
  const players = Math.max(1, Math.min(500, Math.round(Number(playerCount || 36))));
  const total = Math.max(players, Math.round(Number(totalPoints || players * 100)));
  const weights: Array<{ place: number; value: number }> = [];
  let lastWeight = 1;
  for (const rule of DEFAULT_POINTS_LOOKUP) {
    if (typeof rule.place !== 'number') continue;
    lastWeight = rule.points;
    if (rule.place <= players) weights.push({ place: rule.place, value: rule.points });
  }
  for (let place = weights.length + 1; place <= players; place += 1) {
    lastWeight = Math.max(1, lastWeight * 0.96);
    weights.push({ place, value: lastWeight });
  }
  const weightTotal = weights.reduce((sum, item) => sum + item.value, 0);
  const raw = weights.map((item) => ({
    place: item.place,
    value: (total * item.value) / weightTotal,
  }));
  const rounded = raw.map((item) => ({ ...item, points: Math.floor(item.value), remainder: item.value - Math.floor(item.value) }));
  let delta = total - rounded.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...rounded].sort((a, b) => b.remainder - a.remainder || a.place - b.place)) {
    if (delta <= 0) break;
    item.points += 1;
    delta -= 1;
  }
  return [{ place: 'DNF', points: 0 }, ...rounded.sort((a, b) => a.place - b.place).map(({ place, points }) => ({ place, points }))];
}

export function normalizeFinalMultipliers(value: unknown): LeagueFinalMultiplier[] {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      source = null;
    }
  }
  const list = Array.isArray(source) ? source : Array.from({ length: 36 }, (_, index) => ({
    place: index + 1,
    multiplier: Math.max(2, 20 - index),
  }));
  const rules = list
    .map((raw) => {
      const item = raw as Partial<LeagueFinalMultiplier>;
      const place = Math.max(1, Math.round(Number(item.place)));
      const multiplier = Math.max(0, Math.round(Number(item.multiplier ?? 0)));
      if (!Number.isFinite(place)) return null;
      return { place, multiplier };
    })
    .filter(Boolean) as LeagueFinalMultiplier[];
  const unique = new Map<number, LeagueFinalMultiplier>();
  for (const rule of rules) unique.set(rule.place, rule);
  return [...unique.values()].sort((a, b) => a.place - b.place);
}

export function pointsForPlace(pointsLookup: LeaguePointRule[], placed: number | null, dnf: boolean): number {
  if (dnf || !placed) return 0;
  const found = pointsLookup.find((rule) => Number(rule.place) === placed);
  return Number(found?.points ?? 0);
}

export function buildStandings(members: LeagueMemberRow[], results: LeagueResultRow[], bestFinishCount: number) {
  return members
    .filter((member) => member.approved && member.participating)
    .map((member) => {
      const playerResults = results.filter((result) => result.userid === member.userid);
      const scoredFinishes = playerResults
        .filter((result) => !result.dnf && result.placed != null)
        .map((result) => Number(result.points || 0))
        .sort((a, b) => b - a)
        .slice(0, bestFinishCount);
      const showupBonus = playerResults.reduce((sum, result) => sum + Number(result.showupbonuspoints || 0), 0);
      const scoredPoints = scoredFinishes.reduce((sum, points) => sum + Number(points || 0), 0);
      const placements = playerResults
        .filter((result) => !result.dnf && result.placed != null)
        .map((result) => Number(result.placed));
      const averageFinish = placements.length
        ? placements.reduce((sum, place) => sum + place, 0) / placements.length
        : null;
      return {
        userid: member.userid,
        displayname: member.displayname,
        isadmin: member.isadmin,
        eventsplayed: playerResults.filter((result) => !result.dnf && result.placed != null).length,
        showupbonus: showupBonus,
        scoredpoints: scoredPoints,
        totalpoints: scoredPoints + showupBonus,
        averagefinish: averageFinish,
        bestfinishes: scoredFinishes,
      };
    })
    .sort((a, b) => b.totalpoints - a.totalpoints || b.scoredpoints - a.scoredpoints || (a.averagefinish ?? 999) - (b.averagefinish ?? 999));
}

export function buildFinalStacks(standings: ReturnType<typeof buildStandings>, league: SerializedLeagueForFinals) {
  if (!league.finalenabled) return [];
  const rounding = Math.max(1, Math.round(Number(league.finalchiprounding || 100)));
  const bigBlind = Math.max(1, Math.round(Number(league.finalstartingbigblind || 100)));
  const multiplierByPlace = new Map(league.finalmultiplierlookup.map((rule) => [rule.place, rule.multiplier]));
  return standings.map((standing, index) => {
    const place = index + 1;
    const multiplier = multiplierByPlace.get(place) ?? 0;
    const multiplierChips = Math.round(standing.scoredpoints * multiplier);
    const roundedChips = Math.round(multiplierChips / rounding) * rounding;
    const startingstack = roundedChips + standing.showupbonus;
    return {
      ...standing,
      place,
      multiplier,
      multiplierchips: multiplierChips,
      roundedchips: roundedChips,
      startingstack,
      bbstostart: Math.round(startingstack / bigBlind),
    };
  });
}
