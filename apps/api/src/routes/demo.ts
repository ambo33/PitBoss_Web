import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, queryOne } from '../db';
import { signToken, requireAuth, optionalAuth } from '../middleware/auth';
import { encryptEmail, hashEmail, privateEmailPlaceholder } from '../privacy';

export const demoRouter = Router();

const DEMO_PLAYER_NAMES = [
  'All-In Alex', 'Velvet Vicky', 'River Rob', 'Chipstack Chris', 'Button Ben',
  'Queen Kim', 'Turbo Tony', 'Lucky Laura', 'Pocket Pete', 'Dealer Dee',
  'Broadway Brian', 'Bounty Beth', 'Suited Steve', 'Orbit Olivia', 'Cooler Carl',
  'Final Table Fran', 'Ace High Amy', 'Stacked Sam', 'Check-Raise Charlie', 'Nuts Nate',
  'Big Blind Blake', 'Small Blind Sofia', 'Muck Mike', 'Splash Pot Sarah', 'Runner Ryan',
  'Card Dead Cody', 'Monster Molly', 'Chip Up Chase', 'Fold Equity Emma', 'Action Abby',
  'Value Bet Val', 'Limping Larry', 'Table Captain Tara', 'Hero Call Henry', 'Bubble Bob',
  'Seat Draw Sean', 'Royal Rosa', 'Grinder Grace', 'Kicker Kyle', 'Poker Pat',
];

const DEMO_LEVELS = [
  [1, 'Level 1', 25, 50, 50, 20],
  [2, 'Level 2', 50, 100, 100, 20],
  [3, 'Level 3', 75, 150, 150, 20],
  [4, 'Level 4', 100, 200, 200, 20],
  [5, 'Break 1', 0, 0, 0, 10],
  [6, 'Level 6', 200, 400, 400, 20],
  [7, 'Level 7', 300, 600, 600, 20],
  [8, 'Level 8', 500, 1000, 1000, 20],
  [9, 'Level 9', 800, 1600, 1600, 20],
  [10, 'Level 10', 1200, 2400, 2400, 20],
  [11, 'Level 11', 2000, 4000, 4000, 20],
  [12, 'Level 12', 3000, 6000, 6000, 20],
] as const;

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

type DbClient = PoolClient;
const APP_TIMEZONE = 'America/New_York';

function buildInsertValues(rows: unknown[][]): { placeholders: string; values: unknown[] } {
  const values: unknown[] = [];
  let index = 1;
  const placeholders = rows
    .map((row) => `(${row.map(() => `$${index++}`).join(', ')})`)
    .join(', ');
  for (const row of rows) {
    values.push(...row);
  }
  return { placeholders, values };
}

async function createUniqueTvCode(client: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await client.query<{ tournamentid: string }>(
      `SELECT tournamentid FROM tournaments WHERE tvdisplaycode = $1`,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  throw new Error('Failed to create demo TV code.');
}

async function createUniqueInviteCode(client: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = generateInviteCode();
    const existing = await client.query<{ groupid: string }>(
      `SELECT groupid FROM groups WHERE invitecode = $1`,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  throw new Error('Failed to create demo invite code.');
}

async function createUniqueLeagueInviteCode(client: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = generateInviteCode();
    const existing = await client.query<{ leagueid: string }>(
      `SELECT leagueid FROM leagues WHERE invitecode = $1`,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  throw new Error('Failed to create demo league invite code.');
}

function formatAppDateTimeForDb(date: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function demoDateTimeAfter(days: number, hour: number, minute = 0): { date: Date; appDate: string; appTime: string } {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  const { date: appDate, time: appTime } = formatAppDateTimeForDb(date);
  return { date, appDate, appTime };
}

async function purgeDemoSessions(client: DbClient, userId?: string): Promise<void> {
  const sessionRows = userId
    ? await client.query<{ demosessionid: string }>(
        `SELECT DISTINCT demosessionid
         FROM usermetadata
         WHERE userid = $1::UUID
           AND COALESCE(isdemo, FALSE) = TRUE
           AND demosessionid IS NOT NULL`,
        [userId]
      )
    : await client.query<{ demosessionid: string }>(
        `SELECT DISTINCT um.demosessionid
         FROM usermetadata um
         WHERE COALESCE(um.isdemo, FALSE) = TRUE
           AND um.demosessionid IS NOT NULL
           AND COALESCE(um.democreatedat, now()) < now() - INTERVAL '24 hours'`
      );
  const sessionIds = sessionRows.rows.map((row) => row.demosessionid).filter(Boolean);
  if (sessionIds.length === 0) {
    return;
  }

  const userRows = await client.query<{ userid: string }>(
    `SELECT userid
     FROM usermetadata
     WHERE COALESCE(isdemo, FALSE) = TRUE
       AND demosessionid = ANY($1::STRING[])`,
    [sessionIds]
  );
  const demoUserIds = userRows.rows.map((row) => row.userid).filter(Boolean);

  if (demoUserIds.length > 0) {
    await client.query(
      `DELETE FROM tournamentdeclines
       WHERE userid = ANY($1::UUID[])
          OR tournamentid IN (
            SELECT tournamentid
            FROM tournaments
            WHERE demosessionid = ANY($2::STRING[])
               OR userid = ANY($1::UUID[])
          )`,
      [demoUserIds, sessionIds]
    );
    await client.query(
      `DELETE FROM tournaments
       WHERE demosessionid = ANY($2::STRING[])
          OR userid = ANY($1::UUID[])`,
      [demoUserIds, sessionIds]
    );
    await client.query(
      `DELETE FROM leagues
       WHERE demosessionid = ANY($2::STRING[])
          OR userid = ANY($1::UUID[])`,
      [demoUserIds, sessionIds]
    );
    await client.query(
      `DELETE FROM games
       WHERE demosessionid = ANY($2::STRING[])
          OR createdbyuserid = ANY($1::UUID[])`,
      [demoUserIds, sessionIds]
    );
    await client.query(
      `DELETE FROM groups
       WHERE demosessionid = ANY($2::STRING[])
          OR userid = ANY($1::UUID[])`,
      [demoUserIds, sessionIds]
    );
  } else {
    await client.query(
      `DELETE FROM tournamentdeclines
       WHERE tournamentid IN (
         SELECT tournamentid FROM tournaments WHERE demosessionid = ANY($1::STRING[])
       )`,
      [sessionIds]
    );
    await client.query(`DELETE FROM tournaments WHERE demosessionid = ANY($1::STRING[])`, [sessionIds]);
    await client.query(`DELETE FROM leagues WHERE demosessionid = ANY($1::STRING[])`, [sessionIds]);
    await client.query(`DELETE FROM games WHERE demosessionid = ANY($1::STRING[])`, [sessionIds]);
    await client.query(`DELETE FROM groups WHERE demosessionid = ANY($1::STRING[])`, [sessionIds]);
  }
  await client.query(
    `DELETE FROM usermetadata
     WHERE COALESCE(isdemo, FALSE) = TRUE
       AND demosessionid = ANY($1::STRING[])`,
    [sessionIds]
  );
  if (demoUserIds.length > 0) {
    await client.query(
      `DELETE FROM users
       WHERE guid = ANY($1::UUID[])`,
      [demoUserIds]
    );
  }
}

function scheduleDemoPurge(userId?: string) {
  setTimeout(() => {
    void purgeDemoSessionsInTransaction(userId).catch((err) => {
      console.error('Demo purge failed', err instanceof Error ? err.message : err);
    });
  }, 0);
}

async function purgeDemoSessionsInTransaction(userId?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await purgeDemoSessions(client, userId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

demoRouter.post('/start', optionalAuth, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionId = crypto.randomUUID();
    const demoUserId = crypto.randomUUID();
    const demoEmail = `demo+${sessionId}@demo.thepokerplanner.com`;
    const passwordHash = await bcrypt.hash(`demo:${sessionId}`, 4);

    await client.query(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [demoUserId, privateEmailPlaceholder(demoUserId), hashEmail(demoEmail), encryptEmail(demoEmail), passwordHash]
    );
    await client.query(
      `INSERT INTO usermetadata (userid, fullname, nickname, tierid, accounttier, issuperadmin, hostedtournamentcount, termsacceptedat, onboardingtourcompletedat, aicreditsremaining, aicreditsrefreshedat, isdemo, demosessionid)
       VALUES ($1, 'Demo Host', 'Demo Host', 2, 'premium', FALSE, 0, now(), now(), 25, now(), TRUE, $2)`,
      [demoUserId, sessionId]
    );

    const inviteCode = await createUniqueInviteCode(client);
    const groupResult = await client.query<{ groupid: string }>(
      `INSERT INTO groups (userid, name, invitecode, approvalneeded, defaulttrackingmode, tvseatingwelcomemessage, aiannouncerenabled, aiannouncerpreset, aiannouncerclassicmode, postapprovalrequired, demosessionid)
       VALUES ($1, 'Demo Poker Room', $2, FALSE, 'standard', 'Demo table assignments are live. Scan to follow along.', TRUE, 'all_in_alex', FALSE, FALSE, $3)
       RETURNING groupid`,
      [demoUserId, inviteCode, sessionId]
    );
    const groupId = groupResult.rows[0]?.groupid;
    if (!groupId) throw new Error('Failed to create demo group.');
    await client.query(
      `INSERT INTO groupmembers (groupid, userid, admin, approved)
       VALUES ($1, $2, TRUE, TRUE)`,
      [groupId, demoUserId]
    );

    const tvCode = await createUniqueTvCode(client);
    const demoStart = new Date(Date.now() + 60 * 60 * 1000);
    const { date: demoDate, time: demoTime } = formatAppDateTimeForDb(demoStart);
    const payoutStructure = JSON.stringify({
      mode: 'count',
      value: 8,
      roundingdenomination: 5,
      splits: [32, 22, 15, 10, 7, 5, 5, 4],
    });
    const tournamentResult = await client.query<{ tournamentid: string }>(
      `INSERT INTO tournaments
       (userid, name, date, time, buyin, adjustment, rebuycost, rebuychips, rebuylastlevel, addoncost, addonchips, maxplayers, playerselftracking, groupid, payoutstructure, tvdisplaycode, tvdisplaymode, seatingmaxpertable, bountyenabled, bountymode, bountyprizepool, bountypooltype, bountyroundingdenomination, demosessionid)
       VALUES ($1, 'Demo Championship Night', $2, $3, 25, 0, 25, 10000, 6, 20, 15000, 40, TRUE, $4, $5, $6, 'timer', 8, FALSE, 'manual', 0, 'amount', 5, $7)
       RETURNING tournamentid`,
      [demoUserId, demoDate, demoTime, groupId, payoutStructure, tvCode, sessionId]
    );
    const tournamentId = tournamentResult.rows[0]?.tournamentid;
    if (!tournamentId) throw new Error('Failed to create demo tournament.');

    const levelInsert = buildInsertValues(
      DEMO_LEVELS.map(([level, label, smallBlind, bigBlind, ante, minutes]) => [
        tournamentId,
        level,
        label,
        smallBlind,
        bigBlind,
        ante,
        minutes,
        level === DEMO_LEVELS.length,
      ])
    );
    await client.query(
      `INSERT INTO blindstructure (tournamentid, level, label, smallblind, bigblind, ante, minutes, islastlevel)
       VALUES ${levelInsert.placeholders}`,
      levelInsert.values
    );
    await client.query(
      `INSERT INTO tournamenttimer (tournamentid, currentlevel, remainingsecs, running, lastupdated)
       VALUES ($1, 8, 732, FALSE, now())`,
      [tournamentId]
    );

    const now = Date.now();
    const demoPlayers = DEMO_PLAYER_NAMES.map((name, index) => {
      const playerId = crypto.randomUUID();
      const email = `demo-player-${index + 1}+${sessionId}@demo.thepokerplanner.com`;
      const placed = index < 34 ? 40 - index : null;
      return {
        email,
        index,
        name,
        playerId,
        placed,
        knockedOutAt: placed == null ? null : new Date(now - placed * 4 * 60 * 1000),
      };
    });

    const demoUserInsert = buildInsertValues(
      demoPlayers.map((player) => [
        player.playerId,
        privateEmailPlaceholder(player.playerId),
        hashEmail(player.email),
        encryptEmail(player.email),
        `guest:${sessionId}:${player.index}`,
        true,
      ])
    );
    await client.query(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ${demoUserInsert.placeholders}`,
      demoUserInsert.values
    );

    const demoMetadataInsert = buildInsertValues(
      demoPlayers.map((player) => [
        player.playerId,
        player.name,
        player.name,
        true,
        demoUserId,
        true,
        sessionId,
      ])
    );
    await client.query(
      `INSERT INTO usermetadata (userid, fullname, nickname, isguestuser, guestofuserid, isdemo, demosessionid)
       VALUES ${demoMetadataInsert.placeholders}`,
      demoMetadataInsert.values
    );

    const demoMembersInsert = buildInsertValues(
      demoPlayers.map((player) => [groupId, player.playerId, false, true])
    );
    await client.query(
      `INSERT INTO groupmembers (groupid, userid, admin, approved)
       VALUES ${demoMembersInsert.placeholders}`,
      demoMembersInsert.values
    );

    const cashGameRows = [
      {
        gameId: crypto.randomUUID(),
        title: 'Friday Night Cash Crew',
        startsAt: demoDateTimeAfter(2, 20, 30).date,
        stakes: '$1/$2',
        minBuyIn: 100,
        maxBuyIn: 300,
        seats: 8,
        playerCount: 5,
        notes: 'Friendly demo cash game with open seating and running buy-in totals.',
      },
      {
        gameId: crypto.randomUUID(),
        title: 'Deep Stack Cash Session',
        startsAt: demoDateTimeAfter(6, 19, 45).date,
        stakes: '$2/$5',
        minBuyIn: 300,
        maxBuyIn: 1000,
        seats: 9,
        playerCount: 7,
        notes: 'Bigger-stakes demo night for showing off the cash-game ledger.',
      },
    ];
    const cashGameInsert = buildInsertValues(
      cashGameRows.map((cashGame) => [
        cashGame.gameId,
        groupId,
        demoUserId,
        'cash',
        cashGame.title,
        'scheduled',
        'group_public',
        cashGame.startsAt.toISOString(),
        sessionId,
      ])
    );
    await client.query(
      `INSERT INTO games (id, groupid, createdbyuserid, gametype, title, status, visibility, startsat, demosessionid)
       VALUES ${cashGameInsert.placeholders}`,
      cashGameInsert.values
    );
    const cashDetailsInsert = buildInsertValues(
      cashGameRows.map((cashGame) => [
        cashGame.gameId,
        cashGame.stakes,
        cashGame.minBuyIn,
        cashGame.maxBuyIn,
        cashGame.seats,
        cashGame.notes,
      ])
    );
    await client.query(
      `INSERT INTO cashgamedetails (gameid, stakeslabel, minbuyin, maxbuyin, seatsavailable, notes)
       VALUES ${cashDetailsInsert.placeholders}`,
      cashDetailsInsert.values
    );
    const cashPlayerRows = cashGameRows.flatMap((cashGame) =>
      demoPlayers
        .slice(0, cashGame.playerCount)
        .map((player) => [cashGame.gameId, player.playerId, player.name, 'interested'])
    );
    const cashPlayerInsert = buildInsertValues(cashPlayerRows);
    await client.query(
      `INSERT INTO cashgameplayers (gameid, userid, displaynamesnapshot, status)
       VALUES ${cashPlayerInsert.placeholders}`,
      cashPlayerInsert.values
    );

    const leagueInviteCode = await createUniqueLeagueInviteCode(client);
    const pointsLookup = JSON.stringify([
      { place: 'DNF', points: 0 },
      { place: 1, points: 500 },
      { place: 2, points: 350 },
      { place: 3, points: 250 },
      { place: 4, points: 175 },
      { place: 5, points: 125 },
      { place: 6, points: 100 },
      { place: 7, points: 75 },
      { place: 8, points: 50 },
    ]);
    const finalMultipliers = JSON.stringify([
      { place: 1, multiplier: 18 },
      { place: 2, multiplier: 16 },
      { place: 3, multiplier: 14 },
      { place: 4, multiplier: 12 },
      { place: 5, multiplier: 10 },
      { place: 6, multiplier: 8 },
      { place: 7, multiplier: 6 },
      { place: 8, multiplier: 4 },
    ]);
    const leagueResult = await client.query<{ leagueid: string }>(
      `INSERT INTO leagues
       (userid, name, invitecode, approvalneeded, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount, pointslookup, finalenabled, finalmultiplierlookup, finalchiprounding, finalstartingbigblind, memberledgervisible, demosessionid)
       VALUES ($1, 'Demo Season League', $2, FALSE, 24, 100, 35, 100, 6, $3::JSONB, TRUE, $4::JSONB, 100, 100, TRUE, $5)
       RETURNING leagueid`,
      [demoUserId, leagueInviteCode, pointsLookup, finalMultipliers, sessionId]
    );
    const leagueId = leagueResult.rows[0]?.leagueid;
    if (!leagueId) throw new Error('Failed to create demo league.');
    const seasonStart = demoDateTimeAfter(1, 12, 0);
    const seasonEnd = demoDateTimeAfter(90, 12, 0);
    const seasonResult = await client.query<{ seasonid: string }>(
      `INSERT INTO leagueseasons (leagueid, name, begindate, enddate, pereventfee)
       VALUES ($1, 'Spring Demo Season', $2, $3, 35)
       RETURNING seasonid`,
      [leagueId, seasonStart.appDate, seasonEnd.appDate]
    );
    const seasonId = seasonResult.rows[0]?.seasonid;
    if (!seasonId) throw new Error('Failed to create demo league season.');
    const leagueMemberRows = [
      [leagueId, demoUserId, true, true],
      ...demoPlayers.slice(0, 16).map((player) => [leagueId, player.playerId, false, true]),
    ];
    const leagueMemberInsert = buildInsertValues(leagueMemberRows);
    await client.query(
      `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
       VALUES ${leagueMemberInsert.placeholders}`,
      leagueMemberInsert.values
    );
    const seasonParticipantInsert = buildInsertValues(
      leagueMemberRows.map((row) => [seasonId, row[0], row[1], true])
    );
    await client.query(
      `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
       VALUES ${seasonParticipantInsert.placeholders}`,
      seasonParticipantInsert.values
    );
    const leagueEventRows = [
      { name: 'League Event #1 - Opening Night', when: demoDateTimeAfter(3, 19, 0), number: 1 },
      { name: 'League Event #2 - Bounty Night', when: demoDateTimeAfter(10, 19, 30), number: 2 },
      { name: 'League Event #3 - Final Table Chase', when: demoDateTimeAfter(17, 20, 0), number: 3 },
    ];
    const leagueEventInsert = buildInsertValues(
      leagueEventRows.map((event) => [
        leagueId,
        seasonId,
        event.name,
        event.when.appDate,
        event.when.appTime,
        event.number,
        35,
      ])
    );
    await client.query(
      `INSERT INTO leagueevents (leagueid, seasonid, name, eventdate, eventtime, eventnumber, eventfee)
       VALUES ${leagueEventInsert.placeholders}`,
      leagueEventInsert.values
    );

    const demoTournamentPlayersInsert = buildInsertValues(
      demoPlayers.map((player) => [
        tournamentId,
        player.playerId,
        true,
        true,
        player.index % 9 === 0 ? 1 : 0,
        player.index % 5 === 0 ? 1 : 0,
        player.placed,
        player.knockedOutAt,
        0,
        null,
        null,
      ])
    );
    await client.query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin, paid, rebuys, addedon, placed, knockedoutat, bountyamount, bountyclaimedbyuserid, bountyclaimedat)
       VALUES ${demoTournamentPlayersInsert.placeholders}`,
      demoTournamentPlayersInsert.values
    );

    const activeSeatRows = demoPlayers
      .filter((player) => player.placed == null)
      .map((player, activeIndex) => [
        tournamentId,
        player.playerId,
        activeIndex < 3 ? 1 : 2,
        (activeIndex % 3) + 1,
      ]);
    if (activeSeatRows.length > 0) {
      const demoSeatingInsert = buildInsertValues(activeSeatRows);
      await client.query(
        `INSERT INTO tournamentseating (tournamentid, userid, "Table", seat)
         VALUES ${demoSeatingInsert.placeholders}`,
        demoSeatingInsert.values
      );
    }

    await client.query(
      `INSERT INTO groupposts (groupid, createdby, posttype, message, active, status, approvedat, approvedby)
       VALUES
       ($1, $2, 'message', 'Demo room is open. Seat draw is live and the final table is getting close.', TRUE, 'approved', now(), $2),
       ($1, $2, 'message', 'Try editing players, re-seating the field, opening the TV board, and moving blind levels around.', TRUE, 'approved', now(), $2)`,
      [groupId, demoUserId]
    );

    await client.query('COMMIT');
    res.status(201).json({
      token: signToken(demoUserId),
      tournamentId,
      groupId,
      tvCode,
    });
    scheduleDemoPurge(req.userId);
    scheduleDemoPurge();
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    console.error('Demo start failed', err);
    res.status(500).json({
      error: 'Demo could not be created. Please try again.',
      ...(process.env.NODE_ENV !== 'production' ? { detail: message } : {}),
    });
  } finally {
    client.release();
  }
});

demoRouter.post('/end', requireAuth, async (req: Request, res: Response) => {
  const demo = await queryOne<{ isdemo: boolean | null }>(
    `SELECT COALESCE(isdemo, FALSE) AS isdemo FROM usermetadata WHERE userid = $1`,
    [req.userId]
  );
  if (!demo?.isdemo) {
    res.json({ success: true, cleaned: false });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await purgeDemoSessions(client, req.userId!);
    await client.query('COMMIT');
    res.json({ success: true, cleaned: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Demo cleanup failed', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Demo cleanup failed.' });
  } finally {
    client.release();
  }
});
