export type LeaguePlacementResult = {
  userid: string;
  placed: number | null;
  dnf: boolean;
};

export type LeagueFinishPointRule = {
  place: number | 'DNF';
  points: number;
};

export type LeagueFinishOutlook = {
  place: number;
  placementpoints: number;
  showupbonuspoints: number;
  totalpoints: number;
};

export function getAvailableLeaguePlacements(
  participantCount: number,
  results: LeaguePlacementResult[],
  targetUserId: string
) {
  const otherResults = results.filter((result) => result.userid !== targetUserId);
  const dnfCount = otherResults.filter((result) => result.dnf).length;
  const placementLimit = Math.max(0, Math.floor(Number(participantCount) || 0) - dnfCount);
  const usedPlaces = new Set(
    otherResults
      .filter((result) => !result.dnf && result.placed != null)
      .map((result) => Number(result.placed))
      .filter((place) => Number.isInteger(place) && place > 0)
  );
  const availablePlaces = Array.from({ length: placementLimit }, (_, index) => index + 1)
    .filter((place) => !usedPlaces.has(place));

  return {
    placementLimit,
    usedPlaces,
    availablePlaces,
    nextPlace: availablePlaces.at(-1) ?? null,
  };
}

export function getLeagueFinishOutlook(
  participantCount: number,
  results: LeaguePlacementResult[],
  pointsLookup: LeagueFinishPointRule[],
  showupBonus: number
) {
  // The live board describes the whole event, not the currently viewing player.
  // A player-specific calculation is still used separately for self-knockout actions.
  const dnfCount = results.filter((result) => result.dnf).length;
  const placementLimit = Math.max(0, Math.floor(Number(participantCount) || 0) - dnfCount);
  const usedPlaces = new Set(
    results
      .filter((result) => !result.dnf && result.placed != null)
      .map((result) => Number(result.placed))
      .filter((place) => Number.isInteger(place) && place > 0)
  );
  const availablePlaces = Array.from({ length: placementLimit }, (_, index) => index + 1)
    .filter((place) => !usedPlaces.has(place));
  const normalizedShowupBonus = Math.max(0, Math.round(Number(showupBonus) || 0));
  const remainingFinishes = availablePlaces
    .sort((a, b) => a - b)
    .map((place) => {
      const placementpoints = Math.max(0, Math.round(Number(pointsLookup.find((rule) => Number(rule.place) === place)?.points) || 0));
      return {
        place,
        placementpoints,
        showupbonuspoints: normalizedShowupBonus,
        totalpoints: placementpoints + normalizedShowupBonus,
      };
    });
  const nextPlace = availablePlaces.length > 0 ? availablePlaces[availablePlaces.length - 1] : null;
  const nextFinish = remainingFinishes.find((finish) => finish.place === nextPlace) ?? null;

  return {
    nextFinish,
    remainingFinishes,
  };
}
