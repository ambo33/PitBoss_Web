import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { SeatingAssignment } from '../types';
import { broadcastTournamentUpdate } from '../socket';

export const seatingRouter = Router();
seatingRouter.use(requireAuth);

async function isOwner(tid: string, uid: string): Promise<boolean> {
  return !!(await queryOne(`SELECT 1 FROM tournaments WHERE tournamentid = $1 AND userid = $2`, [tid, uid]));
}

async function isGroupAdmin(tid: string, uid: string): Promise<boolean> {
  return !!(await queryOne(
    `SELECT 1
     FROM tournaments t
     JOIN groupmembers gm ON gm.groupid = t.groupid
     WHERE t.tournamentid = $1
       AND gm.userid = $2
       AND gm.approved = TRUE
       AND gm.admin = TRUE`,
    [tid, uid]
  ));
}

async function canManageSeating(tid: string, uid: string): Promise<boolean> {
  return await isOwner(tid, uid) || await isGroupAdmin(tid, uid);
}

seatingRouter.get('/:tid/seating', async (req: Request, res: Response) => {
  const rows = await query<SeatingAssignment>(
    `SELECT CAST(ts."Table" AS INT) AS tablenumber, ts.seat, u.guid AS userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentseating ts
     JOIN users u ON u.guid = ts.userid
     LEFT JOIN usermetadata m ON m.userid = ts.userid
     WHERE ts.tournamentid = $1
     ORDER BY CAST(ts."Table" AS INT), ts.seat`,
    [req.params.tid]
  );
  res.json(rows);
});

seatingRouter.post('/:tid/seating/assign', async (req: Request, res: Response) => {
  if (!await canManageSeating(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { maxPerTable = 9, mode = 'all' } = req.body as { maxPerTable?: number; mode?: 'all' | 'remaining' };
  const seatsPerTable = Math.max(2, Math.floor(Number(maxPerTable) || 9));
  const assignMode = mode === 'remaining' ? 'remaining' : 'all';

  await query(
    `UPDATE tournaments SET seatingmaxpertable = $2 WHERE tournamentid = $1`,
    [req.params.tid, seatsPerTable]
  );

  const players = await query<{ userid: string }>(
    `SELECT tp.userid FROM tournamentplayers tp
     WHERE tp.tournamentid = $1 AND tp.checkedin = TRUE AND tp.placed IS NULL`,
    [req.params.tid]
  );

  if (players.length === 0) {
    res.status(400).json({ error: 'No eligible players to seat' }); return;
  }

  const seatedRows = await query<{ userid: string; tablenumber: number; seat: number }>(
    `SELECT ts.userid, CAST(ts."Table" AS INT) AS tablenumber, CAST(ts.seat AS INT) AS seat
     FROM tournamentseating ts
     JOIN tournamentplayers tp ON tp.tournamentid = ts.tournamentid AND tp.userid = ts.userid
     WHERE ts.tournamentid = $1
       AND tp.checkedin = TRUE
       AND tp.placed IS NULL`,
    [req.params.tid]
  );
  const alreadySeated = new Set(seatedRows.map((row) => row.userid));
  const playersToSeat = assignMode === 'remaining'
    ? players.filter((player) => !alreadySeated.has(player.userid))
    : players;

  if (playersToSeat.length === 0) {
    res.json({ assigned: 0 });
    return;
  }

  const shuffled = [...playersToSeat];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (assignMode === 'all') {
    await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);

    const numTables = Math.max(1, Math.ceil(shuffled.length / seatsPerTable));

    const assignments = shuffled.map((p, i) => ({
      userid: p.userid,
      tablenumber: Number((i % numTables) + 1),
      seat: Math.floor(i / numTables) + 1,
    }));

    for (const a of assignments) {
      await query(
        `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
         VALUES ($1, $2, $3, $4)`,
        [req.params.tid, a.userid, a.tablenumber, a.seat]
      );
    }

    broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'assign-seats' });
    res.json({ assigned: assignments.length });
    return;
  }

  const tableMap = new Map<number, Set<number>>();
  for (const row of seatedRows) {
    const table = Number(row.tablenumber);
    const seat = Number(row.seat);
    if (!tableMap.has(table)) tableMap.set(table, new Set());
    tableMap.get(table)!.add(seat);
  }

  const assignments: Array<{ userid: string; tablenumber: number; seat: number }> = [];
  for (const player of shuffled) {
    const openTable = [...tableMap.entries()]
      .filter(([, seats]) => seats.size < seatsPerTable)
      .sort((a, b) => a[1].size - b[1].size || a[0] - b[0])[0];
    const tableNumber = openTable?.[0] ?? (Math.max(0, ...tableMap.keys()) + 1);
    if (!tableMap.has(tableNumber)) tableMap.set(tableNumber, new Set());
    const occupiedSeats = tableMap.get(tableNumber)!;
    let seat = 1;
    while (occupiedSeats.has(seat)) seat += 1;
    occupiedSeats.add(seat);
    assignments.push({ userid: player.userid, tablenumber: tableNumber, seat });
  }

  for (const a of assignments) {
    await query(
      `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
       VALUES ($1, $2, $3, $4)`,
      [req.params.tid, a.userid, a.tablenumber, a.seat]
    );
  }

  broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'assign-seats' });
  res.json({ assigned: assignments.length });
});

seatingRouter.delete('/:tid/seating', async (req: Request, res: Response) => {
  if (!await canManageSeating(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);
  broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'clear-seats' });
  res.json({ success: true });
});
