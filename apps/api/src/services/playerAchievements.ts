import { query } from '../db';

type PayoutMode = 'count' | 'percent';

interface PayoutConfig {
  mode: PayoutMode;
  value: number;
}

export interface PlayerAchievementCounts {
  firstplacecount?: number;
  secondplacecount?: number;
  thirdplacecount?: number;
  cashfinishcount?: number;
  finaltablecount?: number;
}

function parsePayoutStructure(value: string | null | undefined): PayoutConfig {
  if (!value) return { mode: 'count', value: 3 };
  try {
    const parsed = JSON.parse(value) as Partial<PayoutConfig>;
    if (parsed.mode !== 'count' && parsed.mode !== 'percent') return { mode: 'count', value: 3 };
    return {
      mode: parsed.mode,
      value: sanitizePayoutValue(parsed.mode, Number(parsed.value)),
    };
  } catch {
    return { mode: 'count', value: 3 };
  }
}

function sanitizePayoutValue(mode: PayoutMode, value: number): number {
  const fallback = mode === 'percent' ? 3 : 3;
  const parsed = Number.isFinite(value) ? value : fallback;
  if (mode === 'percent') return Math.min(100, Math.max(1, Math.round(parsed)));
  return Math.max(1, Math.round(parsed));
}

function resolvePaidPlaces(config: PayoutConfig, fieldSize: number): number {
  if (config.mode === 'percent') {
    if (fieldSize <= 0) return 1;
    return Math.min(fieldSize, Math.max(1, Math.ceil((fieldSize * config.value) / 100)));
  }
  return config.value;
}

function emptyCounts(): Required<PlayerAchievementCounts> {
  return {
    firstplacecount: 0,
    secondplacecount: 0,
    thirdplacecount: 0,
    cashfinishcount: 0,
    finaltablecount: 0,
  };
}

export async function attachPlayerAchievementCounts<T extends { userid: string }>(
  players: T[],
  groupId: string | null | undefined
): Promise<Array<T & Required<PlayerAchievementCounts>>> {
  if (players.length === 0) return [];
  const userIds = [...new Set(players.map((player) => player.userid).filter(Boolean))];
  if (userIds.length === 0) {
    return players.map((player) => ({ ...player, ...emptyCounts() }));
  }

  const placementRows = await query<{
    userid: string;
    placed: number;
    payoutstructure: string | null;
    fieldsize: number;
  }>(
    `SELECT hp.userid,
            CAST(hp.placed AS INT) AS placed,
            ht.payoutstructure,
            CAST((
              SELECT count(*)
              FROM tournamentplayers field
              WHERE field.tournamentid = hp.tournamentid
            ) AS INT) AS fieldsize
     FROM tournamentplayers hp
     JOIN tournaments ht ON ht.tournamentid = hp.tournamentid
     LEFT JOIN usermetadata hm ON hm.userid = hp.userid
     WHERE hp.userid = ANY($1::UUID[])
       AND hp.placed IS NOT NULL
       AND COALESCE(hm.isguestuser, FALSE) = FALSE
       AND ($2::UUID IS NULL OR ht.groupid = $2)`,
    [userIds, groupId ?? null]
  );

  const countsByUserId = new Map<string, Required<PlayerAchievementCounts>>();
  for (const userId of userIds) {
    countsByUserId.set(userId, emptyCounts());
  }

  for (const row of placementRows) {
    const counts = countsByUserId.get(row.userid);
    if (!counts) continue;
    const placed = Number(row.placed);
    if (!Number.isFinite(placed) || placed <= 0) continue;
    if (placed === 1) counts.firstplacecount += 1;
    if (placed === 2) counts.secondplacecount += 1;
    if (placed === 3) counts.thirdplacecount += 1;
    if (placed <= 9) counts.finaltablecount += 1;
    const paidPlaces = resolvePaidPlaces(parsePayoutStructure(row.payoutstructure), Number(row.fieldsize ?? 0));
    if (placed <= paidPlaces) counts.cashfinishcount += 1;
  }

  return players.map((player) => ({
    ...player,
    ...(countsByUserId.get(player.userid) ?? emptyCounts()),
  }));
}
