import type { Tournament, TournamentPlayer } from '../api/client';

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundToBountyDenomination(value: number, denominationValue: number) {
  const denomination = Math.max(0.01, toNumber(denominationValue) || 5);
  return Math.max(0, Math.round(value / denomination) * denomination);
}

export function getAssignedBountyPool(players: Pick<TournamentPlayer, 'bountyamount'>[]) {
  return players.reduce((sum, player) => sum + toNumber(player.bountyamount), 0);
}

export function getBountyStartPlace(tournament: Pick<Tournament, 'bountystartplace'>) {
  const parsed = Number(tournament.bountystartplace);
  return Number.isFinite(parsed) && parsed > 1 ? Math.round(parsed) : null;
}

export function isBountyPlacementEligible(tournament: Pick<Tournament, 'bountystartplace'>, placement: number | null | undefined) {
  if (placement == null || Number(placement) <= 1) return false;
  const startPlace = getBountyStartPlace(tournament);
  if (!startPlace) return true;
  return Number(placement) <= startPlace;
}

export function isBountyLive(tournament: Pick<Tournament, 'bountystartplace'>, activePlayers: number) {
  const startPlace = getBountyStartPlace(tournament);
  return !startPlace || activePlayers <= startPlace;
}

export function getConfiguredBountyPool(
  tournament: Pick<Tournament, 'bountyenabled' | 'bountymode' | 'bountyprizepool' | 'bountypooltype' | 'bountyroundingdenomination' | 'bountystartplace'>,
  grossPot: number,
  players: Pick<TournamentPlayer, 'bountyamount' | 'placed' | 'bountyclaimedat' | 'checkedin'>[]
) {
  if (!tournament.bountyenabled) return 0;
  if (tournament.bountymode !== 'mystery') {
    const enteredFieldCount = players.filter((player) => Boolean(player.checkedin) || player.placed != null).length;
    const startPlace = getBountyStartPlace(tournament);
    const eligibleKnockouts = Math.max(0, (startPlace ? Math.min(startPlace, enteredFieldCount) : enteredFieldCount) - 1);
    return Math.max(0, toNumber(tournament.bountyprizepool) * eligibleKnockouts);
  }

  return getConfiguredBountyPoolFromAssigned(tournament, grossPot, getAssignedBountyPool(players), false);
}

export function getConfiguredBountyPoolFromAssigned(
  tournament: Pick<Tournament, 'bountyenabled' | 'bountymode' | 'bountyprizepool' | 'bountypooltype' | 'bountyroundingdenomination'>,
  grossPot: number,
  assignedBountyPool: number,
  locked = false
) {
  if (!tournament.bountyenabled) return 0;
  if (tournament.bountymode !== 'mystery' || locked) return Math.max(0, toNumber(assignedBountyPool));

  const configured = toNumber(tournament.bountyprizepool);
  const rawPool = tournament.bountypooltype === 'percent'
    ? (Math.max(0, grossPot) * Math.min(100, Math.max(0, configured))) / 100
    : configured;
  return roundToBountyDenomination(rawPool, toNumber(tournament.bountyroundingdenomination) || 5);
}
