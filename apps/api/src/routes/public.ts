import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool, query, queryOne } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { KnockoutOption, LobbyEntry, LobbyFieldStats, SeatingAssignment, Tournament } from '../types';
import { broadcastTournamentUpdate } from '../socket';

export const publicRouter = Router();

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.pokerplanner.bet`;
}

publicRouter.get('/tournaments/:id/lobby', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, 0 AS rebuychips,
            t.addoncost AS addonprice, t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const field = await queryOne<LobbyFieldStats>(
    `SELECT
        CAST(count(*) AS INT) AS registeredcount,
        CAST(COALESCE(sum(CASE WHEN checkedin = TRUE THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
        CAST(COALESCE(sum(CASE WHEN placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) AS knockedoutcount,
        CAST(GREATEST(
          COALESCE(sum(CASE WHEN checkedin = TRUE THEN 1 ELSE 0 END), 0) -
          COALESCE(sum(CASE WHEN placed IS NOT NULL THEN 1 ELSE 0 END), 0),
          0
        ) AS INT) AS activecount,
        CAST(COALESCE(sum(COALESCE(rebuys, 0)), 0) AS INT) AS totalrebuys,
        CAST(COALESCE(sum(CASE WHEN COALESCE(addedon, 0) != 0 THEN 1 ELSE 0 END), 0) AS INT) AS totaladdons,
        CAST(
          COALESCE(sum(CASE WHEN checkedin = TRUE THEN COALESCE($2::DECIMAL, 0::DECIMAL) ELSE 0::DECIMAL END), 0::DECIMAL) +
          COALESCE(sum(COALESCE(rebuys, 0) * COALESCE($3::DECIMAL, 0::DECIMAL)), 0::DECIMAL) +
          COALESCE(sum(CASE WHEN COALESCE(addedon, 0) != 0 THEN COALESCE($4::DECIMAL, 0::DECIMAL) ELSE 0::DECIMAL END), 0::DECIMAL)
          AS DECIMAL
        ) AS grosspot
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [req.params.id, Number(tournament.buyin ?? 0), Number(tournament.rebuyprice ?? 0), Number(tournament.addonprice ?? 0)]
  );

  const seating = await query<SeatingAssignment>(
    `SELECT CAST(ts."Table" AS INT) AS tablenumber, ts.seat, u.guid AS userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentseating ts
     JOIN users u ON u.guid = ts.userid
     LEFT JOIN usermetadata m ON m.userid = ts.userid
     WHERE ts.tournamentid = $1
     ORDER BY CAST(ts."Table" AS INT), ts.seat`,
    [req.params.id]
  );

  const guestUserId = typeof req.query.guestUserId === 'string' ? req.query.guestUserId : null;
  const entryUserId = req.userId ?? guestUserId;
  let entry: LobbyEntry | null = null;

  if (entryUserId) {
    entry = await queryOne<LobbyEntry>(
      `SELECT tp.userid, u.emailaddress,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
              COALESCE(tp.checkedin, FALSE) AS checkedin,
              CAST(tp.placed AS INT) AS placed,
              CAST(ts."Table" AS INT) AS tablenumber,
              ts.seat
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
  }

  res.json({
    tournament,
    field: field ?? {
      registeredcount: 0,
      checkedincount: 0,
      knockedoutcount: 0,
      activecount: 0,
      totalrebuys: 0,
      totaladdons: 0,
      grosspot: 0,
    },
    seating,
    entry,
  });
});

publicRouter.post('/tournaments/:id/checkin/self', requireAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<{
    tournamentid: string;
    ownerid: string;
    groupid: string | null;
    playerselftracking: boolean;
  }>(
    `SELECT tournamentid, userid AS ownerid, groupid, playerselftracking
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  let canRegister = tournament.ownerid === req.userId;
  if (!canRegister) {
    const existing = await queryOne(
      `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
      [req.params.id, req.userId]
    );
    canRegister = Boolean(existing);
  }
  if (!canRegister && tournament.groupid) {
    const member = await queryOne(
      `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
      [tournament.groupid, req.userId]
    );
    canRegister = Boolean(member);
  }
  if (!canRegister && !tournament.groupid) {
    canRegister = Boolean(tournament.playerselftracking);
  }

  if (!canRegister) {
    res.status(403).json({ error: 'You are not allowed to register for this tournament.' });
    return;
  }

  const existing = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, req.userId]
  );

  if (!existing) {
    await query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
       VALUES ($1, $2, TRUE)`,
      [req.params.id, req.userId]
    );
  } else {
    await query(
      `UPDATE tournamentplayers
       SET checkedin = TRUE
       WHERE tournamentid = $1 AND userid = $2`,
      [req.params.id, req.userId]
    );
  }

  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-checkin' });
  res.json({ success: true });
});

publicRouter.post('/tournaments/:id/checkin/guest', async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const displayname = String((req.body as { displayname?: string }).displayname ?? '').trim();

  if (guestUserId) {
    const existing = await queryOne(
      `SELECT 1
       FROM tournamentplayers tp
       JOIN usermetadata um ON um.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2 AND COALESCE(um.isguestuser, FALSE) = TRUE`,
      [req.params.id, guestUserId]
    );
    if (existing) {
      await query(
        `UPDATE tournamentplayers
         SET checkedin = TRUE
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.id, guestUserId]
      );
      broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-recheckin' });
      res.json({ success: true, guestUserId });
      return;
    }
  }

  if (!displayname) {
    res.status(400).json({ error: 'Guest name required' });
    return;
  }

  const tournament = await queryOne<{ ownerid: string }>(
    `SELECT userid AS ownerid FROM tournaments WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

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
      [createdUser.guid, displayname, tournament.ownerid]
    );

    await client.query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
       VALUES ($1, $2, TRUE)`,
      [req.params.id, createdUser.guid]
    );

    await client.query('COMMIT');
    broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-checkin' });
    res.status(201).json({ success: true, guestUserId: createdUser.guid });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

publicRouter.get('/tournaments/:id/knockout', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, 0 AS rebuychips,
            t.addoncost AS addonprice, t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const guestUserId = typeof req.query.guestUserId === 'string' ? req.query.guestUserId : null;
  const entryUserId = req.userId ?? guestUserId;

  let entry: LobbyEntry | null = null;
  if (entryUserId) {
    entry = await queryOne<LobbyEntry>(
      `SELECT tp.userid, u.emailaddress,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
              COALESCE(tp.checkedin, FALSE) AS checkedin,
              CAST(tp.placed AS INT) AS placed
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
  }

  const activePlayers = await query<KnockoutOption>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     WHERE tp.tournamentid = $1
       AND COALESCE(tp.checkedin, FALSE) = TRUE
       AND tp.placed IS NULL
       AND ($2::UUID IS NULL OR tp.userid <> $2::UUID)
     ORDER BY COALESCE(m.nickname, u.emailaddress)`,
    [req.params.id, entryUserId]
  );

  res.json({ tournament, entry, activePlayers });
});

publicRouter.post('/tournaments/:id/knockout/self', optionalAuth, async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const knockedoutByUserId = typeof (req.body as { knockedoutByUserId?: string }).knockedoutByUserId === 'string'
    ? String((req.body as { knockedoutByUserId?: string }).knockedoutByUserId)
    : null;
  const playerUserId = req.userId ?? guestUserId;

  if (!playerUserId) {
    res.status(401).json({ error: 'Sign in or return on the same device you used to check in.' });
    return;
  }

  const entry = await queryOne<{ checkedin: boolean; placed: number | null }>(
    `SELECT COALESCE(checkedin, FALSE) AS checkedin, CAST(placed AS INT) AS placed
     FROM tournamentplayers
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );
  if (!entry) {
    res.status(404).json({ error: 'You are not registered for this tournament on this device.' });
    return;
  }
  if (entry.placed != null) {
    res.status(409).json({ error: 'You have already been marked out.' });
    return;
  }
  if (!entry.checkedin) {
    res.status(409).json({ error: 'You must be checked in before reporting a knockout.' });
    return;
  }

  if (knockedoutByUserId) {
    const validKnockoutBy = await queryOne(
      `SELECT 1
       FROM tournamentplayers
       WHERE tournamentid = $1
         AND userid = $2
         AND COALESCE(checkedin, FALSE) = TRUE
         AND placed IS NULL`,
      [req.params.id, knockedoutByUserId]
    );
    if (!validKnockoutBy || knockedoutByUserId === playerUserId) {
      res.status(400).json({ error: 'Choose a valid player who knocked you out.' });
      return;
    }
  }

  const activeField = await queryOne<{ activecount: number }>(
    `SELECT CAST(GREATEST(
        COALESCE(sum(CASE WHEN COALESCE(checkedin, FALSE) = TRUE THEN 1 ELSE 0 END), 0) -
        COALESCE(sum(CASE WHEN placed IS NOT NULL THEN 1 ELSE 0 END), 0),
        0
      ) AS INT) AS activecount
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  const placed = Math.max(Number(activeField?.activecount ?? 0), 1);

  await query(
    `UPDATE tournamentplayers
     SET placed = $3,
         checkedin = FALSE,
         knockedoutbyuserid = $4,
         knockedoutat = now()
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId, placed, knockedoutByUserId]
  );

  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-knockout' });
  res.json({ success: true, placed });
});
