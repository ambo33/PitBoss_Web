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

// Assign seats: randomise checked-in, non-placed players across balanced tables
seatingRouter.post('/:tid/seating/assign', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { maxPerTable = 9 } = req.body as { maxPerTable?: number };

  const players = await query<{ userid: string }>(
    `SELECT tp.userid FROM tournamentplayers tp
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     WHERE tp.tournamentid = $1 AND tp.checkedin = TRUE AND tp.placed IS NULL AND ts.userid IS NULL`,
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

  // Get the highest existing table number so we can continue numbering
  const existingMax = await queryOne<{ max: number }>(
    `SELECT COALESCE(MAX(CAST("Table" AS INT)), 0) AS max FROM tournamentseating WHERE tournamentid = $1`,
    [req.params.tid]
  );
  const tableOffset = (existingMax?.max ?? 0);
  const numTables = Math.ceil(shuffled.length / maxPerTable);

  const assignments = shuffled.map((p, i) => ({
    userid: p.userid,
    tablenumber: tableOffset + (i % numTables) + 1,
    seat: Math.floor(i / numTables) + 1,
  }));

  for (const a of assignments) {
    await query(
      `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM tournamentseating WHERE tournamentid = $1 AND userid = $2
       )`,
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
