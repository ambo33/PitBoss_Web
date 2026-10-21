import { queryOne } from '../db';

interface PayoutSnapshot {
  payoutstructure: string | null;
  buyin: number;
  rebuyprice: number;
  addonprice: number;
  genericrebuys: number;
  genericaddons: number;
  rake: number;
  bountyenabled: boolean;
  bountymode: string | null;
  bountyprizepool: number;
  bountypooltype: string | null;
  bountyroundingdenomination: number;
  bountystartplace: number | null;
  registeredcount: number;
  enteredcount: number;
  activecount: number;
  winnercount: number;
  totalrebuys: number;
  totaladdons: number;
}

const DEFAULT_SPLITS: Record<number, number[]> = {
  1: [100], 2: [65, 35], 3: [50, 30, 20],
  4: [45, 27, 18, 10], 5: [40, 25, 17, 11, 7], 6: [37, 23, 16, 11, 8, 5],
};
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function ordinalPlace(place: number): string {
  const remainder = place % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th';
  return `${place}${suffix}`;
}

// Match the live runner's entered field, default splits, bounty deduction and
// denomination rounding. Do not infer money from the number of paid places alone.
export function nextPaidFinish(snapshot: PayoutSnapshot): { place: number; amount: number } | null {
  const place = number(snapshot.activecount);
  if (!Number.isInteger(place) || place < 2 || number(snapshot.winnercount) > 0) return null;
  const fieldSize = number(snapshot.enteredcount) || number(snapshot.registeredcount);
  let config: { mode?: string; value?: unknown; roundingdenomination?: unknown };
  try {
    config = snapshot.payoutstructure ? JSON.parse(snapshot.payoutstructure) : { mode: 'count', value: 3 };
  } catch { return null; }
  if (!config || !['count', 'percent'].includes(config.mode ?? '') || !Number.isFinite(Number(config.value))) return null;
  const value = Math.max(1, Math.round(Number(config.value)));
  const paidPlaces = config.mode === 'percent'
    ? Math.min(fieldSize, Math.max(1, Math.ceil(fieldSize * Math.min(100, value) / 100)))
    : value;
  // Malformed/unbounded settings should not allocate an arbitrary-size array.
  if (place > paidPlaces || paidPlaces > 1000) return null;

  const grossPot = number(snapshot.buyin) * fieldSize
    + number(snapshot.rebuyprice) * (number(snapshot.totalrebuys) + number(snapshot.genericrebuys))
    + number(snapshot.addonprice) * (number(snapshot.totaladdons) + number(snapshot.genericaddons));
  let bountyPool = 0;
  if (snapshot.bountyenabled) {
    if (snapshot.bountymode === 'mystery') {
      const configured = number(snapshot.bountyprizepool);
      const raw = snapshot.bountypooltype === 'percent'
        ? Math.max(0, grossPot) * Math.min(100, Math.max(0, configured)) / 100 : configured;
      const denomination = Math.max(0.01, number(snapshot.bountyroundingdenomination) || 5);
      bountyPool = Math.max(0, Math.round(raw / denomination) * denomination);
    } else {
      const startPlace = number(snapshot.bountystartplace) > 1 ? Math.round(number(snapshot.bountystartplace)) : null;
      const eligible = Math.max(0, (startPlace ? Math.min(startPlace, number(snapshot.enteredcount)) : number(snapshot.enteredcount)) - 1);
      bountyPool = Math.max(0, number(snapshot.bountyprizepool) * eligible);
    }
  }
  const pot = roundCurrency(Math.max(0, grossPot - number(snapshot.rake) - bountyPool));
  const totalWeight = paidPlaces * (paidPlaces + 1) / 2;
  const splits = DEFAULT_SPLITS[paidPlaces]
    ?? Array.from({ length: paidPlaces }, (_, index) => Math.round((paidPlaces - index) / totalWeight * 1000) / 10);
  const raw = splits.map(percent => pot * percent / 100);
  const denomination = [1, 5, 10, 25].includes(number(config.roundingdenomination)) ? number(config.roundingdenomination) : 0;
  const payouts = raw.map(roundCurrency);
  if (denomination > 0 && payouts.length > 1) {
    let lowerTotal = 0;
    for (let index = payouts.length - 1; index >= 1; index--) {
      payouts[index] = Math.max(0, Math.min(roundCurrency(Math.round(raw[index] / denomination) * denomination), roundCurrency(pot - lowerTotal)));
      lowerTotal = roundCurrency(lowerTotal + payouts[index]);
    }
    payouts[0] = roundCurrency(Math.max(pot - lowerTotal, 0));
  }
  const amount = payouts[place - 1];
  return Number.isFinite(amount) && amount > 0 ? { place, amount } : null;
}

export async function knockoutNotificationDetails(options: {
  playerName: string;
  placed: number;
  eventName?: string;
  tournamentId?: string | null;
}) {
  const { playerName, placed, eventName, tournamentId } = options;
  const placement = `${ordinalPlace(placed)} place`;
  let next: { place: number; amount: number } | null = null;
  if (tournamentId && placed > 1) {
    try {
      const snapshot = await queryOne<PayoutSnapshot>(
        `SELECT t.payoutstructure, t.buyin, t.rebuycost AS rebuyprice, t.addoncost AS addonprice,
                COALESCE(t.genericrebuys, 0) AS genericrebuys, COALESCE(t.genericaddons, 0) AS genericaddons,
                COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
                t.bountymode, t.bountyprizepool, t.bountypooltype, t.bountyroundingdenomination, t.bountystartplace,
                field.*
         FROM tournaments t
         CROSS JOIN (
           SELECT count(*) AS registeredcount,
                  COALESCE(sum(CASE WHEN checkedin = TRUE OR placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS enteredcount,
                  COALESCE(sum(CASE WHEN checkedin = TRUE AND placed IS NULL THEN 1 ELSE 0 END), 0) AS activecount,
                  COALESCE(sum(CASE WHEN placed = 1 THEN 1 ELSE 0 END), 0) AS winnercount,
                  COALESCE(sum(COALESCE(rebuys, 0)), 0) AS totalrebuys,
                  COALESCE(sum(CASE WHEN LOWER(COALESCE(CAST(addedon AS STRING), '0')) IN ('1', 'true', 't') THEN 1 ELSE 0 END), 0) AS totaladdons
           FROM tournamentplayers WHERE tournamentid = $1
         ) field
         WHERE t.tournamentid = $1`,
        [tournamentId]
      );
      if (snapshot) next = nextPaidFinish(snapshot);
    } catch (error) {
      // A payout lookup must never suppress the placement announcement.
      console.error('Knockout payout notification lookup failed', error instanceof Error ? error.message : error);
    }
  }
  const notice = next
    ? ` Next knockout payout: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(next.amount)}.`
    : '';
  return {
    placed,
    body: `${playerName} was knocked out${eventName ? ` of ${eventName}` : ''} in ${placement}.${notice}`,
    creditBody: `You knocked out ${playerName} in ${placement}.${notice}`,
    ...(next ? { nextPaidPlace: next.place, nextPayout: next.amount } : {}),
  };
}
