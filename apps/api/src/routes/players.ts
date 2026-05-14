import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, pool } from '../db';
import { getAccountProfile } from '../account';
import { requireAuth } from '../middleware/auth';
import { TournamentPlayer } from '../types';
import { broadcastTournamentUpdate } from '../socket';

export const playersRouter = Router();
playersRouter.use(requireAuth);

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.pokerplanner.bet`;
}

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
}

async function isOwner(tournamentId: string, userId: string): Promise<boolean> {
  const row = await queryOne(`SELECT 1 FROM tournaments WHERE tournamentid = $1 AND userid = $2`, [tournamentId, userId]);
  return !!row;
}

async function isGroupAdmin(tournamentId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1
     FROM tournaments t
     JOIN groupmembers gm ON gm.groupid = t.groupid
     WHERE t.tournamentid = $1
       AND gm.userid = $2
       AND gm.approved = TRUE
       AND gm.admin = TRUE`,
    [tournamentId, userId]
  );
  return !!row;
}

async function canManagePlayers(tournamentId: string, userId: string): Promise<boolean> {
  return await isOwner(tournamentId, userId) || await isGroupAdmin(tournamentId, userId);
}

async function canUsePlayerAccounting(userId: string): Promise<boolean> {
  const profile = await getAccountProfile(userId);
  return Boolean(profile?.canuseclubfeatures);
}

function parsePlaced(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.round(parsed));
}

playersRouter.get('/:tid/players', async (req: Request, res: Response) => {
  const rows = await query<TournamentPlayer>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            m.avatarimagedata,
            COALESCE(tp.checkedin, FALSE) AS checkedin,
            COALESCE(CAST(tp.rebuys AS INT), 0) AS rebuys,
            CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(tp.placed AS INT) AS placed,
            tp.knockedoutbyuserid,
            COALESCE(km.nickname, NULLIF(trim(concat(coalesce(km.firstname, ''), ' ', coalesce(km.lastname, ''))), ''), ku.emailaddress) AS knockedoutbyname,
            COALESCE(tp.paid, FALSE) AS paid,
            tp.createdate AS registeredat,
            CAST(ts."Table" AS INT) AS tablenumber, ts.seat
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN users ku ON ku.guid = tp.knockedoutbyuserid
     LEFT JOIN usermetadata km ON km.userid = tp.knockedoutbyuserid
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY tp.createdate`,
    [req.params.tid]
  );
  res.json(rows);
});

// Admin registers an existing user or creates a guest player by name
playersRouter.post('/:tid/players', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
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
         VALUES ($1, $2, TRUE) RETURNING guid`,
        [createGuestEmail(), `guest:${crypto.randomUUID()}`]
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
      broadcastTournamentUpdate(req.params.tid, { players: true, source: 'admin-add-player' });
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
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'admin-add-player' });
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
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'group-register' });
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
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'self-register' });
  res.status(201).json({ success: true });
});

playersRouter.delete('/:tid/players/self', async (req: Request, res: Response) => {
  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (!exists) { res.status(404).json({ error: 'Not registered' }); return; }

  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'leave-tournament' });
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/checkin', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ checkedin: boolean }>(
    `UPDATE tournamentplayers
     SET checkedin = NOT COALESCE(checkedin, FALSE)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(checkedin, FALSE) AS checkedin`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'checkin' });
  res.json({ success: true, checkedin: updated.checkedin });
});

playersRouter.post('/:tid/players/:uid/rebuy', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level rebuy tracking.' }); return;
  }
  const updated = await queryOne<{ rebuys: number }>(
    `UPDATE tournamentplayers
     SET rebuys = COALESCE(rebuys, 0) + 1
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(CAST(rebuys AS INT), 0) AS rebuys`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'rebuy' });
  res.json({ success: true, rebuys: updated.rebuys });
});

playersRouter.delete('/:tid/players/:uid/rebuy', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level rebuy tracking.' }); return;
  }
  const updated = await queryOne<{ rebuys: number }>(
    `UPDATE tournamentplayers
     SET rebuys = GREATEST(COALESCE(rebuys, 0) - 1, 0)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(CAST(rebuys AS INT), 0) AS rebuys`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'rebuy-undo' });
  res.json({ success: true, rebuys: updated.rebuys });
});

playersRouter.post('/:tid/players/:uid/addon', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level add-on tracking.' }); return;
  }
  const updated = await queryOne<{ addedon: boolean }>(
    `UPDATE tournamentplayers
     SET addedon = TRUE
     WHERE tournamentid = $1 AND userid = $2
     RETURNING CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'addon' });
  res.json({ success: true, addedon: updated.addedon });
});

playersRouter.delete('/:tid/players/:uid/addon', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level add-on tracking.' }); return;
  }
  const updated = await queryOne<{ addedon: boolean }>(
    `UPDATE tournamentplayers
     SET addedon = FALSE
     WHERE tournamentid = $1 AND userid = $2
     RETURNING CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'addon-undo' });
  res.json({ success: true, addedon: updated.addedon });
});

playersRouter.post('/:tid/rebuys', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericrebuys: number }>(
    `UPDATE tournaments
     SET genericrebuys = COALESCE(genericrebuys, 0) + 1
     WHERE tournamentid = $1
     RETURNING COALESCE(genericrebuys, 0) AS genericrebuys`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-rebuy' });
  res.json({ success: true, genericrebuys: updated.genericrebuys });
});

playersRouter.delete('/:tid/rebuys', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericrebuys: number }>(
    `UPDATE tournaments
     SET genericrebuys = GREATEST(COALESCE(genericrebuys, 0) - 1, 0)
     WHERE tournamentid = $1
     RETURNING COALESCE(genericrebuys, 0) AS genericrebuys`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-rebuy-undo' });
  res.json({ success: true, genericrebuys: updated.genericrebuys });
});

playersRouter.post('/:tid/addons', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericaddons: number }>(
    `UPDATE tournaments
     SET genericaddons = COALESCE(genericaddons, 0) + 1
     WHERE tournamentid = $1
     RETURNING COALESCE(genericaddons, 0) AS genericaddons`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-addon' });
  res.json({ success: true, genericaddons: updated.genericaddons });
});

playersRouter.delete('/:tid/addons', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericaddons: number }>(
    `UPDATE tournaments
     SET genericaddons = GREATEST(COALESCE(genericaddons, 0) - 1, 0)
     WHERE tournamentid = $1
     RETURNING COALESCE(genericaddons, 0) AS genericaddons`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-addon-undo' });
  res.json({ success: true, genericaddons: updated.genericaddons });
});

playersRouter.delete('/:tid/players/:uid', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'remove-player' });
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/knock', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { placed, knockedoutbyuserid } = req.body as { placed?: number | null; knockedoutbyuserid?: string | null };
  const nextPlaced = parsePlaced(placed);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query<{ placed: number | null }>(
      `SELECT CAST(placed AS INT) AS placed
       FROM tournamentplayers
       WHERE tournamentid = $1 AND userid = $2
       FOR UPDATE`,
      [req.params.tid, req.params.uid]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const currentPlaced = current.placed == null ? null : Number(current.placed);

    if (nextPlaced == null) {
      if (currentPlaced != null) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed - 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed > $3`,
          [req.params.tid, req.params.uid, currentPlaced]
        );
      }
      await client.query(
        `UPDATE tournamentplayers
         SET placed = NULL,
             checkedin = TRUE,
             knockedoutbyuserid = NULL,
             knockedoutat = NULL,
             paid = FALSE
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.tid, req.params.uid]
      );
    } else {
      if (currentPlaced == null) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed + 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed >= $3`,
          [req.params.tid, req.params.uid, nextPlaced]
        );
      } else if (nextPlaced < currentPlaced) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed + 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed >= $3
             AND placed < $4`,
          [req.params.tid, req.params.uid, nextPlaced, currentPlaced]
        );
      } else if (nextPlaced > currentPlaced) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed - 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed <= $3
             AND placed > $4`,
          [req.params.tid, req.params.uid, nextPlaced, currentPlaced]
        );
      }

      await client.query(
        `UPDATE tournamentplayers
         SET placed = $3,
             checkedin = FALSE,
             knockedoutbyuserid = $4,
             knockedoutat = now()
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.tid, req.params.uid, nextPlaced, knockedoutbyuserid ?? null]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'knockout' });
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/paid', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ paid: boolean }>(
    `UPDATE tournamentplayers
     SET paid = NOT COALESCE(paid, FALSE)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(paid, FALSE) AS paid`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'payment' });
  res.json({ success: true, paid: updated.paid });
});
