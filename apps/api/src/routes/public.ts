import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool, query, queryOne } from '../db';
import { getAccountProfile } from '../account';
import { isFeatureEnabled } from '../features';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { isTvBoardAvailable } from '../schedule';
import { KnockoutOption, LobbyEntry, LobbyFieldStats, SeatingAssignment, Tournament } from '../types';
import { broadcastTournamentUpdate } from '../socket';
import { assignSeatIfSeatingStarted } from '../services/seating';
import { encryptEmail, hashEmail, privateEmailPlaceholder } from '../privacy';

export const publicRouter = Router();

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.pokerplanner.bet`;
}

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
}

publicRouter.get('/tv/:code', async (req: Request, res: Response) => {
  const normalizedCode = String(req.params.code ?? '').trim();
  if (!normalizedCode) {
    res.status(400).json({ error: 'TV code required' });
    return;
  }

  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname, t.tvdisplaycode,
            COALESCE(t.tvgreetingdisplayenabled, TRUE) AS tvgreetingdisplayenabled,
            COALESCE(t.tvgreetingaudioenabled, TRUE) AS tvgreetingaudioenabled,
            COALESCE(t.tvshowknockoutqrenabled, TRUE) AS tvshowknockoutqrenabled,
            COALESCE(t.tvdisplaymode, 'timer') AS tvdisplaymode,
            COALESCE(t.seatingmaxpertable, 9) AS seatingmaxpertable,
            COALESCE(g.tvseatingwelcomemessage, 'Welcome! Please see host to check-in!') AS tvseatingwelcomemessage,
            COALESCE(g.speechfiveminutemessage, 'There are 5 minutes remaining in the current blind.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in the current blind.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'professional') AS aiannouncerpreset,
            g.aiannouncercustomprompt,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tvdisplaycode = $1`,
    [normalizedCode]
  );
  if (!tournament) {
    res.status(404).json({ error: 'TV board not found' });
    return;
  }
  if (!isFeatureEnabled('tvBoard')) {
    res.status(403).json({ error: 'TV board is not enabled for this tournament.' });
    return;
  }
  if (!isTvBoardAvailable(tournament.tourneydate)) {
    res.status(403).json({ error: 'TV board is only available on the tournament date and the day after.' });
    return;
  }

  const players = await query(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            m.checkinaudiodata,
            m.avatarimagedata,
            COALESCE(tp.checkedin, FALSE) AS checkedin,
            CAST(COALESCE(tp.rebuys, 0) AS INT) AS rebuys,
            CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(tp.placed AS INT) AS placed,
            COALESCE(km.nickname, NULLIF(trim(concat(coalesce(km.firstname, ''), ' ', coalesce(km.lastname, ''))), ''), ku.emailaddress) AS knockedoutbyname,
            tp.knockedoutbyuserid,
            COALESCE(tp.paid, FALSE) AS paid,
            tp.createdate AS registeredat,
            CAST(ts."Table" AS INT) AS tablenumber,
            CAST(ts.seat AS INT) AS seat
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN users ku ON ku.guid = tp.knockedoutbyuserid
     LEFT JOIN usermetadata km ON km.userid = ku.guid
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY tp.createdate`,
    [tournament.tournamentid]
  );

  res.json({ tournament, players });
});

publicRouter.get('/tournaments/:id/lobby', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            COALESCE(g.speechfiveminutemessage, 'There are 5 minutes remaining in the current blind.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in the current blind.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'professional') AS aiannouncerpreset,
            g.aiannouncercustomprompt
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
        CAST(COALESCE(sum(COALESCE(rebuys, 0)), 0) + COALESCE($5::INT, 0) AS INT) AS totalrebuys,
        CAST(COALESCE(sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END), 0) + COALESCE($6::INT, 0) AS INT) AS totaladdons,
        CAST(
          COALESCE(sum(CASE WHEN checkedin = TRUE THEN COALESCE($2::DECIMAL, 0::DECIMAL) ELSE 0::DECIMAL END), 0::DECIMAL) +
          COALESCE((sum(COALESCE(rebuys, 0)) + COALESCE($5::INT, 0)) * COALESCE($3::DECIMAL, 0::DECIMAL), 0::DECIMAL) +
          COALESCE((sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END) + COALESCE($6::INT, 0)) * COALESCE($4::DECIMAL, 0::DECIMAL), 0::DECIMAL)
          AS DECIMAL
        ) AS grosspot
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [
      req.params.id,
      Number(tournament.buyin ?? 0),
      Number(tournament.rebuyprice ?? 0),
      Number(tournament.addonprice ?? 0),
      Number(tournament.genericrebuys ?? 0),
      Number(tournament.genericaddons ?? 0),
    ]
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
              CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
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
    activePlayers,
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

  await assignSeatIfSeatingStarted(req.params.id, req.userId!);
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
      await assignSeatIfSeatingStarted(req.params.id, guestUserId);
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
    const guestId = crypto.randomUUID();
    const guestEmail = createGuestEmail();
    const createdUserResult = await client.query<{ guid: string }>(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING guid`,
      [guestId, privateEmailPlaceholder(guestId), hashEmail(guestEmail), encryptEmail(guestEmail), `guest:${crypto.randomUUID()}`]
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
    await assignSeatIfSeatingStarted(req.params.id, createdUser.guid);
    broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-checkin' });
    res.status(201).json({ success: true, guestUserId: createdUser.guid });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

publicRouter.post('/tournaments/:id/register/self', requireAuth, async (req: Request, res: Response) => {
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

  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
     VALUES ($1, $2, FALSE)
     ON CONFLICT DO NOTHING`,
    [req.params.id, req.userId]
  );

  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-register-lobby' });
  res.json({ success: true });
});

publicRouter.post('/tournaments/:id/register/guest', async (req: Request, res: Response) => {
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
    const guestId = crypto.randomUUID();
    const guestEmail = createGuestEmail();
    const createdUserResult = await client.query<{ guid: string }>(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING guid`,
      [guestId, privateEmailPlaceholder(guestId), hashEmail(guestEmail), encryptEmail(guestEmail), `guest:${crypto.randomUUID()}`]
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
       VALUES ($1, $2, FALSE)`,
      [req.params.id, createdUser.guid]
    );

    await client.query('COMMIT');
    broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-register-lobby' });
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
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
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

publicRouter.get('/tournaments/:id/addon', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
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
              CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
              CAST(tp.placed AS INT) AS placed
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
  }

  res.json({ tournament, entry });
});

publicRouter.post('/tournaments/:id/addon/self', optionalAuth, async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const playerUserId = req.userId ?? guestUserId;

  if (!playerUserId) {
    res.status(401).json({ error: 'Sign in or return on the same device you used to check in.' });
    return;
  }

  const tournament = await queryOne<{ ownerid: string; addonprice: number; addonchips: number }>(
    `SELECT userid AS ownerid, addoncost AS addonprice, addonchips
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  if (Number(tournament.addonprice ?? 0) <= 0 || Number(tournament.addonchips ?? 0) <= 0) {
    res.status(400).json({ error: 'Add-ons are not enabled for this tournament.' });
    return;
  }
  const ownerProfile = await getAccountProfile(tournament.ownerid);
  if (!ownerProfile?.canuseclubfeatures) {
    res.status(403).json({ error: 'Player-level add-on tracking is available on Club and Pro tiers.' });
    return;
  }

  const entry = await queryOne<{ checkedin: boolean; addedon: boolean; placed: number | null }>(
    `SELECT COALESCE(checkedin, FALSE) AS checkedin,
            CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(placed AS INT) AS placed
     FROM tournamentplayers
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );
  if (!entry) {
    res.status(404).json({ error: 'You are not registered for this tournament on this device.' });
    return;
  }
  if (!entry.checkedin) {
    res.status(409).json({ error: 'You must be checked in before using the add-on QR.' });
    return;
  }
  if (entry.placed != null) {
    res.status(409).json({ error: 'You cannot add on after being knocked out.' });
    return;
  }
  if (entry.addedon) {
    res.json({ success: true, addedon: true });
    return;
  }

  await query(
    `UPDATE tournamentplayers
     SET addedon = 1
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );

  broadcastTournamentUpdate(req.params.id, { players: true, source: 'public-addon' });
  res.json({ success: true, addedon: true });
});

publicRouter.post('/tournaments/:id/knockout/self', optionalAuth, async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const body = req.body as { knockedoutByUserId?: string; knockedOutByUserId?: string };
  const knockedoutByUserId = typeof (body.knockedoutByUserId ?? body.knockedOutByUserId) === 'string'
    ? String(body.knockedoutByUserId ?? body.knockedOutByUserId)
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
