import crypto from 'crypto';
import { query, queryOne } from '../db';
import type { Tournament } from '../types';

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
}

export function normalizeBountyMode(value: unknown): 'manual' | 'mystery' {
  return value === 'mystery' ? 'mystery' : 'manual';
}

export function normalizeBountyPoolType(value: unknown): 'amount' | 'percent' {
  return value === 'percent' ? 'percent' : 'amount';
}

export function normalizeMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

export function normalizeBountyDenomination(value: unknown): number {
  const parsed = normalizeMoney(value);
  return parsed > 0 ? parsed : 5;
}

export function normalizeBountyStartPlace(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return null;
  return Math.round(parsed);
}

export function normalizeBountyMinPayout(value: unknown): number {
  return normalizeMoney(value);
}

export function getBountyEligibleCount(fieldSize: number, startPlaceValue: unknown): number {
  const field = Math.max(0, Math.floor(Number(fieldSize) || 0));
  const startPlace = normalizeBountyStartPlace(startPlaceValue);
  return startPlace ? Math.min(startPlace, field) : field;
}

export function validateStandardKnockoutBounty({
  buyin,
  maxPlayers,
  bountyPerKnockout,
  startPlace,
}: {
  buyin: unknown;
  maxPlayers: unknown;
  bountyPerKnockout: unknown;
  startPlace: unknown;
}): string | null {
  const field = Math.max(0, Math.floor(Number(maxPlayers) || 0));
  const perKnockout = normalizeMoney(bountyPerKnockout);
  const entry = normalizeMoney(buyin);
  const normalizedStartPlace = normalizeBountyStartPlace(startPlace);
  if (field <= 0) return 'Set max players before enabling bounties so the bounty cap is defined.';
  if (!normalizedStartPlace && perKnockout > entry) {
    return `Bounty per knockout cannot exceed the ${formatMoney(entry)} buy-in when it applies to the whole field.`;
  }
  const eligibleCount = getBountyEligibleCount(field, normalizedStartPlace);
  const maxPool = entry * field;
  const configuredPool = perKnockout * eligibleCount;
  if (configuredPool > maxPool) {
    return `Configured bounties can pay up to ${formatMoney(configuredPool)}, but the expected cap is ${formatMoney(maxPool)} from ${field} players.`;
  }
  return null;
}

function formatMoney(value: number): string {
  return `$${normalizeMoney(value).toFixed(2)}`;
}

export function normalizePercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

export async function getGrossPot(tournamentId: string, overrides: Partial<Tournament> = {}): Promise<number> {
  const tournament = await queryOne<{
    buyin: number;
    rebuyprice: number;
    genericrebuys: number;
    addonprice: number;
    genericaddons: number;
  }>(
    `SELECT buyin, rebuycost AS rebuyprice, COALESCE(genericrebuys, 0) AS genericrebuys,
            addoncost AS addonprice, COALESCE(genericaddons, 0) AS genericaddons
     FROM tournaments
     WHERE tournamentid = $1`,
    [tournamentId]
  );
  if (!tournament) return 0;

  const field = await queryOne<{
    checkedincount: number;
    totalrebuys: number;
    totaladdons: number;
  }>(
    `SELECT
        CAST(COALESCE(sum(CASE WHEN checkedin = TRUE OR placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
        CAST(COALESCE(sum(COALESCE(rebuys, 0)), 0) AS INT) AS totalrebuys,
        CAST(COALESCE(sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END), 0) AS INT) AS totaladdons
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [tournamentId]
  );

  const buyin = Number(overrides.buyin ?? tournament.buyin ?? 0);
  const rebuyprice = Number(overrides.rebuyprice ?? tournament.rebuyprice ?? 0);
  const addonprice = Number(overrides.addonprice ?? tournament.addonprice ?? 0);
  const checkedIn = Number(field?.checkedincount ?? 0);
  const totalRebuys = Number(field?.totalrebuys ?? 0);
  const totalAddons = Number(field?.totaladdons ?? 0);
  const genericRebuys = Number(overrides.genericrebuys ?? tournament.genericrebuys ?? 0);
  const genericAddons = Number(overrides.genericaddons ?? tournament.genericaddons ?? 0);

  return (buyin * checkedIn) + (rebuyprice * (totalRebuys + genericRebuys)) + (addonprice * (totalAddons + genericAddons));
}

export async function resolveBountyPrizepool(tournamentId: string, value: number, poolType: 'amount' | 'percent'): Promise<number> {
  if (poolType === 'amount') return normalizeMoney(value);
  const grossPot = await getGrossPot(tournamentId);
  return normalizeMoney((grossPot * normalizePercent(value)) / 100);
}

export async function assignMysteryBounties(
  tournamentId: string,
  prizepool: number,
  denominationValue: number = 5,
  startPlaceValue: number | null = null,
  minPayoutValue: number = 0
): Promise<{ assigned: number; total: number; denomination: number; locked: boolean }> {
  const startPlace = normalizeBountyStartPlace(startPlaceValue);
  const denominationCents = Math.max(1, Math.round(normalizeBountyDenomination(denominationValue) * 100));
  const minUnits = Math.max(0, Math.ceil(normalizeBountyMinPayout(minPayoutValue) * 100 / denominationCents));
  const claimed = await queryOne<{ total: number; count: number }>(
    `SELECT CAST(COALESCE(sum(COALESCE(bountyamount, 0)), 0) AS DECIMAL) AS total,
            CAST(count(*) AS INT) AS count
     FROM tournamentplayers
     WHERE tournamentid = $1
       AND bountyclaimedat IS NOT NULL`,
    [tournamentId]
  );
  const claimedTotal = normalizeMoney(claimed?.total ?? 0);

  const eligiblePlayers = await query<{ userid: string }>(
    `SELECT userid
     FROM tournamentplayers
     WHERE tournamentid = $1
       AND COALESCE(checkedin, FALSE) = TRUE
       AND bountyclaimedat IS NULL
       AND (
         placed IS NULL
         OR $2::INT IS NULL
         OR placed <= $2::INT
       )
     ORDER BY createdate, userid`,
    [tournamentId, startPlace]
  );
  const players = eligiblePlayers;
  const remainingPrizepool = Math.max(0, normalizeMoney(prizepool) - claimedTotal);
  const totalUnits = Math.max(0, Math.round(remainingPrizepool * 100 / denominationCents));

  await query(
    `UPDATE tournamentplayers
     SET bountyamount = 0,
         bountyclaimedbyuserid = NULL,
         bountyclaimedat = NULL
     WHERE tournamentid = $1
       AND bountyclaimedat IS NULL
       AND (
         COALESCE(checkedin, FALSE) = FALSE
         OR (
           placed IS NOT NULL
           AND $2::INT IS NOT NULL
           AND placed > $2::INT
         )
       )`,
    [tournamentId, startPlace]
  );

  if (players.length === 0 || totalUnits <= 0) {
    return { assigned: players.length, total: claimedTotal, denomination: denominationCents / 100, locked: Number(claimed?.count ?? 0) > 0 };
  }
  const enforceMinimum = !startPlace || players.length <= startPlace;
  const startingUnits = enforceMinimum ? minUnits : 0;
  if (startingUnits > 0 && startingUnits * players.length > totalUnits) {
    throw new Error(`Minimum bounty payout is too high for the bounty pool and eligible players.`);
  }

  const amounts = new Array(players.length).fill(startingUnits);
  let remainingUnits = totalUnits;
  remainingUnits -= startingUnits * players.length;

  if (startingUnits === 0 && totalUnits >= players.length) {
    amounts.fill(1);
    remainingUnits -= players.length;
  }

  const weights = players.map((_, index) => crypto.randomInt(25, 300) + ((index % 5) * 15));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedUnits = weights.map((weight) => Math.floor((remainingUnits * weight) / weightTotal));
  weightedUnits.forEach((units, index) => { amounts[index] += units; });
  let remainder = remainingUnits - weightedUnits.reduce((sum, units) => sum + units, 0);
  while (remainder > 0) {
    amounts[crypto.randomInt(0, amounts.length)] += 1;
    remainder -= 1;
  }

  const totalCents = totalUnits * denominationCents;
  await Promise.all(players.map((player, index) => query(
    `UPDATE tournamentplayers
     SET bountyamount = $3,
         bountyclaimedbyuserid = CASE
           WHEN placed IS NOT NULL AND knockedoutbyuserid IS NOT NULL AND $3::DECIMAL > 0 THEN knockedoutbyuserid
           ELSE bountyclaimedbyuserid
         END,
         bountyclaimedat = CASE
           WHEN placed IS NOT NULL AND knockedoutbyuserid IS NOT NULL AND $3::DECIMAL > 0 THEN COALESCE(bountyclaimedat, now())
           ELSE bountyclaimedat
         END
     WHERE tournamentid = $1 AND userid = $2`,
    [tournamentId, player.userid, (amounts[index] * denominationCents) / 100]
  )));

  return { assigned: players.length, total: claimedTotal + (totalCents / 100), denomination: denominationCents / 100, locked: Number(claimed?.count ?? 0) > 0 };
}

async function assignStandardKnockoutBounties(tournamentId: string, bountyPerKnockout: number): Promise<void> {
  await query(
    `UPDATE tournamentplayers
     SET bountyamount = $2
     WHERE tournamentid = $1
       AND bountyclaimedat IS NULL`,
    [tournamentId, normalizeMoney(bountyPerKnockout)]
  );
}

export async function redistributeMysteryBountiesForTournament(tournamentId: string): Promise<void> {
  const tournament = await queryOne<{
    bountyenabled: boolean;
    bountymode: string | null;
    bountyprizepool: number;
    bountypooltype: string | null;
    bountyroundingdenomination: number;
    bountystartplace: number | null;
    bountyminpayout: number;
  }>(
    `SELECT COALESCE(bountyenabled, FALSE) AS bountyenabled,
            COALESCE(bountymode, 'manual') AS bountymode,
            COALESCE(CAST(bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(bountyminpayout AS DECIMAL), 0) AS bountyminpayout
     FROM tournaments
     WHERE tournamentid = $1`,
    [tournamentId]
  );
  if (!tournament?.bountyenabled) {
    await query(
      `UPDATE tournamentplayers
       SET bountyamount = 0,
           bountyclaimedbyuserid = NULL,
           bountyclaimedat = NULL
       WHERE tournamentid = $1
         AND bountyclaimedat IS NULL`,
      [tournamentId]
    );
    return;
  }
  if (normalizeBountyMode(tournament.bountymode) !== 'mystery') {
    await assignStandardKnockoutBounties(tournamentId, tournament.bountyprizepool);
    return;
  }
  const poolType = normalizeBountyPoolType(tournament.bountypooltype);
  const configuredValue = poolType === 'percent'
    ? normalizePercent(tournament.bountyprizepool)
    : normalizeMoney(tournament.bountyprizepool);
  const total = await resolveBountyPrizepool(tournamentId, configuredValue, poolType);
  await assignMysteryBounties(
    tournamentId,
    total,
    normalizeBountyDenomination(tournament.bountyroundingdenomination),
    normalizeBountyStartPlace(tournament.bountystartplace),
    normalizeBountyMinPayout(tournament.bountyminpayout)
  );
}
