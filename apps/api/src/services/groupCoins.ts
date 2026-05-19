import { query } from '../db';
import type { PlayerCoinBadge } from '../types';

export async function attachPlayerCoinBadges<T extends { userid: string; awardedcoins?: PlayerCoinBadge[] }>(
  players: T[],
  groupId: string | null | undefined
): Promise<T[]> {
  if (!groupId || players.length === 0) return players.map((player) => ({ ...player, awardedcoins: [] }));
  const userIds = [...new Set(players.map((player) => player.userid).filter(Boolean))];
  if (userIds.length === 0) return players.map((player) => ({ ...player, awardedcoins: [] }));

  const rows = await query<{
    userid: string;
    coinid: string;
    name: string;
    description: string | null;
    imagedata: string | null;
    imageurl: string | null;
    count: number;
  }>(
    `SELECT gca.userid, gc.id AS coinid, gc.name, gc.description, gc.imagedata, gc.imageurl,
            CAST(count(gca.id) AS INT) AS count
     FROM groupcoinawards gca
     JOIN groupcoins gc ON gc.id = gca.coinid
     LEFT JOIN usermetadata um ON um.userid = gca.userid
     WHERE gca.groupid = $1
       AND gca.userid = ANY($2::UUID[])
       AND COALESCE(gc.active, TRUE) = TRUE
       AND COALESCE(um.isguestuser, FALSE) = FALSE
     GROUP BY gca.userid, gc.id, gc.name, gc.description, gc.imagedata, gc.imageurl
     ORDER BY count(gca.id) DESC, gc.name ASC`,
    [groupId, userIds]
  );

  const byUserId = new Map<string, PlayerCoinBadge[]>();
  for (const row of rows) {
    const current = byUserId.get(row.userid) ?? [];
    current.push({
      coinid: row.coinid,
      name: row.name,
      description: row.description,
      imagedata: row.imagedata,
      imageurl: row.imageurl,
      count: Number(row.count ?? 0),
    });
    byUserId.set(row.userid, current);
  }

  return players.map((player) => ({
    ...player,
    awardedcoins: byUserId.get(player.userid) ?? [],
  }));
}
