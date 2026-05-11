import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { TournamentPlayer } from '../types';

export const playersRouter = Router();
playersRouter.use(requireAuth);

async function isOwner(tournamentId: string, userId: string): Promise<boolean> {
  const row = await queryOne(`SELECT 1 FROM tournaments WHERE tournamentid = $1 AND userid = $2`, [tournamentId, userId]);
  return !!row;
}

playersRouter.get('/:tid/players', async (req: Request, res: Response) => {
  const rows = await query<TournamentPlayer>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            tp.checkedin = TRUE AS checkedin,
            COALESCE(CAST(tp.rebuys AS INT), 0) AS rebuys,
            COALESCE(tp.addedon, 0) != 0 AS addedon,
            CAST(tp.placed AS INT) AS placed,
            tp.paid = TRUE AS paid,
            tp.createdate AS registeredat,
            CAST(ts."Table" AS INT) AS tablenumber, ts.seat
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY tp.createdate`,
    [req.params.tid]
  );
  res.json(rows);
});

// Admin registers an existing user or creates a guest player by name
playersRouter.post('/:tid/players', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { email, userid, displayname } = req.body as {
    email?: string;
    userid?: string;
    displayname?: string;
  };
  const trimmedName = displayname?.trim();

  let targetUserId: string | null = null;

  if (userid) {
    targetUserId = userid;
  } else if (email?.trim()) {
    const user = await queryOne<{ guid: string }>(
      `SELECT guid FROM users WHERE LOWER(emailaddress) = $1`, [email.trim().toLowerCase()]
    );
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    targetUserId = user.guid;
  } else if (trimmedName) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const createdUserResult = await client.query<{ guid: string }>(
        `INSERT INTO users (emailaddress, password, emailverified)
         VALUES (NULL, $1, TRUE) RETURNING guid`,
        [`guest:${crypto.randomUUID()}`]
      );
      const createdUser = createdUserResult.rows[0];
      if (!createdUser) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create guest player' });
        return;
      }

      await client.query(
        `INSERT INTO usermetadata (userid, nickname, isguestuser, guestofuserid)
         VALUES ($1, $2, TRUE, $3)`,
        [createdUser.guid, trimmedName, req.userId]
      );
      await client.query(
        `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
        [req.params.tid, createdUser.guid]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    res.status(400).json({ error: 'Choose a group user or enter a player name' });
    return;
  }

  if (!targetUserId) {
    res.status(400).json({ error: 'Choose a group user or enter a player name' });
    return;
  }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, targetUserId]
  );
  if (exists) { res.status(409).json({ error: 'Player already registered' }); return; }

  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, targetUserId]
  );
  res.status(201).json({ success: true });
});

// Register as a group member (bypasses playerselftracking; requires group membership)
playersRouter.post('/:tid/players/group-register', async (req: Request, res: Response) => {
  const t = await queryOne<{ groupid: string | null }>(
    `SELECT groupid FROM tournaments WHERE tournamentid = $1`, [req.params.tid]
  );
  if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
  if (!t.groupid) { res.status(403).json({ error: 'Tournament is not associated with a group' }); return; }

  const member = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
    [t.groupid, req.userId]
  );
  if (!member) { res.status(403).json({ error: 'Not an approved group member' }); return; }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (exists) { res.status(409).json({ error: 'Already registered' }); return; }

  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, req.userId]
  );
  res.status(201).json({ success: true });
});

// Self-register
playersRouter.post('/:tid/players/self', async (req: Request, res: Response) => {
  const t = await queryOne<{ playerselftracking: boolean }>(
    `SELECT playerselftracking FROM tournaments WHERE tournamentid = $1`, [req.params.tid]
  );
  if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
  if (!t.playerselftracking) { res.status(403).json({ error: 'Self-registration not enabled' }); return; }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (exists) { res.status(409).json({ error: 'Already registered' }); return; }

  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, req.userId]
  );
  res.status(201).json({ success: true });
});

playersRouter.delete('/:tid/players/:uid', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/checkin', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `UPDATE tournamentplayers SET checkedin = NOT checkedin
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  res.json({ success: true });
});

playersRouter.post('/:tid/players/:uid/rebuy', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `UPDATE tournamentplayers SET rebuys = rebuys + 1 WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  res.json({ success: true });
});

playersRouter.post('/:tid/players/:uid/addon', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `UPDATE tournamentplayers SET addedon = 1 WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/knock', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { placed } = req.body as { placed: number };
  await query(
    `UPDATE tournamentplayers SET placed = $3 WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid, placed]
  );
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/paid', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `UPDATE tournamentplayers SET paid = NOT paid WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  res.json({ success: true });
});
