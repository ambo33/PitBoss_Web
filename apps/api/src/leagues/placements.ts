export type LeaguePlacementResult = {
  userid: string;
  placed: number | null;
  dnf: boolean;
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
