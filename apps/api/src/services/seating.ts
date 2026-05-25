import { query, queryOne } from '../db';
import { sendTournamentNotification } from '../lib/server/notifications/notificationService';

export async function clearSeatForPlayer(tournamentId: string, userId: string): Promise<void> {
  await query(
    `DELETE FROM tournamentseating WHERE tournamentid = $1 AND userid = $2`,
    [tournamentId, userId]
  );
}

export async function assignSeatIfSeatingStarted(tournamentId: string, userId: string): Promise<boolean> {
  const seatingConfig = await queryOne<{ seatingmaxpertable: number }>(
    `SELECT COALESCE(CAST(seatingmaxpertable AS INT), 9) AS seatingmaxpertable
     FROM tournaments
     WHERE tournamentid = $1`,
    [tournamentId]
  );
  const seatsPerTable = Math.max(2, Math.floor(Number(seatingConfig?.seatingmaxpertable ?? 9) || 9));

  const player = await queryOne<{ checkedin: boolean; placed: number | null }>(
    `SELECT COALESCE(checkedin, FALSE) AS checkedin, CAST(placed AS INT) AS placed
     FROM tournamentplayers
     WHERE tournamentid = $1 AND userid = $2`,
    [tournamentId, userId]
  );
  if (!player?.checkedin || player.placed != null) return false;

  const existingSeat = await queryOne(
    `SELECT 1 FROM tournamentseating WHERE tournamentid = $1 AND userid = $2`,
    [tournamentId, userId]
  );
  if (existingSeat) return false;

  const existingTableCount = await queryOne<{ count: string }>(
    `SELECT count(*)::STRING AS count FROM tournamentseating WHERE tournamentid = $1`,
    [tournamentId]
  );
  if (Number(existingTableCount?.count ?? 0) === 0) return false;

  const tableRows = await query<{ tablenumber: number; seated: number }>(
    `SELECT existingtables.tablenumber,
            CAST(count(tp.userid) AS INT) AS seated
     FROM (
       SELECT DISTINCT CAST("Table" AS INT) AS tablenumber
       FROM tournamentseating
       WHERE tournamentid = $1
     ) existingtables
     LEFT JOIN tournamentseating ts
       ON ts.tournamentid = $1
      AND CAST(ts."Table" AS INT) = existingtables.tablenumber
     LEFT JOIN tournamentplayers tp
       ON tp.tournamentid = ts.tournamentid
      AND tp.userid = ts.userid
      AND COALESCE(tp.checkedin, FALSE) = TRUE
      AND tp.placed IS NULL
     GROUP BY existingtables.tablenumber
     ORDER BY seated ASC, existingtables.tablenumber ASC`,
    [tournamentId]
  );
  const targetTable = tableRows[0];
  let targetTableNumber = Number(targetTable?.tablenumber ?? 0);
  if (!targetTableNumber || Number(targetTable?.seated ?? 0) >= seatsPerTable) {
    const maxTable = Math.max(0, ...tableRows.map((row) => Number(row.tablenumber)));
    targetTableNumber = maxTable + 1;
  }

  const occupiedSeats = await query<{ seat: number }>(
    `SELECT CAST(seat AS INT) AS seat
     FROM tournamentseating ts
     JOIN tournamentplayers tp ON tp.tournamentid = ts.tournamentid AND tp.userid = ts.userid
     WHERE ts.tournamentid = $1
       AND CAST(ts."Table" AS INT) = $2
       AND COALESCE(tp.checkedin, FALSE) = TRUE
       AND tp.placed IS NULL
     ORDER BY seat`,
    [tournamentId, targetTableNumber]
  );
  let nextSeat = 1;
  for (const row of occupiedSeats) {
    const occupiedSeat = Number(row.seat);
    if (occupiedSeat === nextSeat) {
      nextSeat += 1;
    } else if (occupiedSeat > nextSeat) {
      break;
    }
  }

  await query(
    `DELETE FROM tournamentseating
     WHERE tournamentid = $1
       AND CAST("Table" AS INT) = $2
       AND seat = $3
       AND userid IN (
         SELECT tp.userid
         FROM tournamentplayers tp
         WHERE tp.tournamentid = $1
           AND (COALESCE(tp.checkedin, FALSE) = FALSE OR tp.placed IS NOT NULL)
       )`,
    [tournamentId, targetTableNumber, nextSeat]
  );
  await query(
    `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
     VALUES ($1, $2, $3, $4)`,
    [tournamentId, userId, targetTableNumber, nextSeat]
  );
  await sendTournamentNotification(tournamentId, 'seat_assignment', {
    tableNumber: targetTableNumber,
    seatNumber: nextSeat,
  }, {
    targetUserIds: [userId],
    entityId: `${tournamentId}:${userId}`,
  });
  return true;
}
