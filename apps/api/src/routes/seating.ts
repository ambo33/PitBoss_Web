import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { SeatingAssignment } from '../types';
import { broadcastTournamentUpdate } from '../socket';
import { sendTournamentNotification } from '../lib/server/notifications/notificationService';

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

type SeatAssignment = { userid: string; tablenumber: number; seat: number };

function buildBalancedAssignments(players: Array<{ userid: string }>, seatsPerTable: number): SeatAssignment[] {
  const numTables = Math.max(1, Math.ceil(players.length / seatsPerTable));
  return players.map((player, index) => ({
    userid: player.userid,
    tablenumber: Number((index % numTables) + 1),
    seat: Math.floor(index / numTables) + 1,
  }));
}

async function notifySeatAssignments(
  tournamentId: string,
  assignments: SeatAssignment[],
  action: 'assign' | 'reseat'
) {
  const batchId = `${Date.now()}`;
  const pushResults = await Promise.all(assignments.map((assignment) =>
    sendTournamentNotification(tournamentId, 'seat_assignment', {
      tableNumber: assignment.tablenumber,
      seatNumber: assignment.seat,
      ...(action === 'reseat'
        ? {
            title: 'New seat assignment',
            body: `You were re-seated at Table ${assignment.tablenumber}, Seat ${assignment.seat}.`,
          }
        : {}),
      tag: `tournament-${tournamentId}-seat-assignment-${assignment.userid}-${batchId}`,
    }, {
      targetUserIds: [assignment.userid],
      entityId: `${tournamentId}:${assignment.userid}:${batchId}`,
    })
  ));
  return pushResults.reduce((sum, result) => sum + result.sent, 0);
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

  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (assignMode === 'all') {
    await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);

    const assignments = buildBalancedAssignments(shuffled, seatsPerTable);

    for (const a of assignments) {
      await query(
        `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
         VALUES ($1, $2, $3, $4)`,
        [req.params.tid, a.userid, a.tablenumber, a.seat]
      );
    }

    broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'assign-seats' });
    const pushSent = await notifySeatAssignments(req.params.tid, assignments, 'assign');
    res.json({ assigned: assignments.length, pushSent });
    return;
  }

  await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);

  const assignments = buildBalancedAssignments(shuffled, seatsPerTable);

  for (const a of assignments) {
    await query(
      `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
       VALUES ($1, $2, $3, $4)`,
      [req.params.tid, a.userid, a.tablenumber, a.seat]
    );
  }

  broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'assign-seats' });
  const pushSent = await notifySeatAssignments(req.params.tid, assignments, 'reseat');
  res.json({ assigned: assignments.length, pushSent });
});

seatingRouter.delete('/:tid/seating', async (req: Request, res: Response) => {
  if (!await canManageSeating(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(`DELETE FROM tournamentseating WHERE tournamentid = $1`, [req.params.tid]);
  broadcastTournamentUpdate(req.params.tid, { players: true, seating: true, source: 'clear-seats' });
  res.json({ success: true });
});
