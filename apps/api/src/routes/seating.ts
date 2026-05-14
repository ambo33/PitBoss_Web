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

// Assign seats: randomise checked-in, non-placed players across balanced tables.
// Reassignment is intentionally a full reseat so table numbers restart at 1.
seatingRouter.post('/:tid/seating/assign', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { maxPerTable = 9 } = req.body as { maxPerTable?: number };
  const seatsPerTable = Math.max(2, Math.floor(Number(maxPerTable) || 9));

  const players = await query<{ userid: string }>(
    `SELECT tp.userid FROM tournamentplayers tp
     WHERE tp.tournamentid = $1 AND tp.checkedin = TRUE AND tp.placed IS NULL`,
    [req.params.tid]
  );

  if (players.length === 0) {
    res.status(400).json({ error: 'No eligible players to seat' }); return;
  }

  // Fisher-Yates shuffle
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

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
});

seatingRouter.delete('/:tid/seating', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);
  broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'clear-seats' });
  res.json({ success: true });
});
