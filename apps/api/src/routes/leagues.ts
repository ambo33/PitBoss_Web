import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../middleware/auth';
import {
  buildFinalStacks,
  buildStandings,
  generatePointsLookup,
  normalizeFinalMultipliers,
  normalizePointsLookup,
  pointsForPlace,
  type LeagueFinalMultiplier,
  type LeagueMemberRow,
  type LeaguePointRule,
  type LeagueResultRow,
} from '../leagues/scoring';
import { encryptEmail, hashEmail, isGuestEmail, normalizeEmail, privateEmailPlaceholder, publicEmail } from '../privacy';
import { sendLeagueNotification } from '../lib/server/notifications/notificationService';
import { sendLeagueGuestClaimEmail } from '../services/email';

export const leaguesRouter = Router();
leaguesRouter.use(requireAuth);

type LeagueRow = {
  leagueid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  expectedplayercount: number;
  leaguefee: number;
  pereventfee: number;
  showupbonuspoints: number;
  bestfinishcount: number;
  pointslookup: LeaguePointRule[] | string;
  finalenabled: boolean;
  finalmultiplierlookup: LeagueFinalMultiplier[] | string | null;
  finalchiprounding: number;
  finalstartingbigblind: number;
  active: boolean;
  createdat: string;
  isadmin?: boolean;
  approved?: boolean;
  membercount?: number;
  eventcount?: number;
};
type LeagueSeasonRow = {
  seasonid: string;
  leagueid: string;
  name: string;
  begindate: string;
  enddate: string;
  pereventfee: number;
  active: boolean;
  createdat: string;
};
type LeagueEventRow = {
  eventid: string;
  leagueid: string;
  seasonid: string | null;
  name: string;
  eventdate: string | null;
  eventtime: string | null;
  eventnumber: number | null;
  eventfee: number | null;
  resultcount?: number;
  active: boolean;
  createdat: string;
};
type LeaguePaymentRow = {
  paymentid: string;
  leagueid: string;
  seasonid: string | null;
  userid: string;
  displayname: string | null;
  eventid: string | null;
  eventname: string | null;
  paymenttype: string;
  amount: number;
  paidat: string;
  note: string | null;
  recordedby: string | null;
  createdat: string;
};
type LeagueAuditRow = {
  auditid: string;
  leagueid: string;
  seasonid: string | null;
  seasonname?: string | null;
  eventid: string | null;
  eventname?: string | null;
  actorid: string | null;
  actorname?: string | null;
  targetuserid: string | null;
  targetname?: string | null;
  action: string;
  summary: string;
  details: unknown;
  createdat: string;
};

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function normalizeInviteCode(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function isoDate(value: unknown, fallback: string): string {
  const raw = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.thepokerplanner.com`;
}

function createClaimToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashClaimToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type LeagueAuditInput = {
  leagueId: string;
  seasonId?: string | null;
  eventId?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
};

async function recordLeagueAudit(client: Pick<PoolClient, 'query'>, input: LeagueAuditInput) {
  await client.query(
    `INSERT INTO leagueauditlogs (leagueid, seasonid, eventid, actorid, targetuserid, action, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)`,
    [
      input.leagueId,
      input.seasonId ?? null,
      input.eventId ?? null,
      input.actorId ?? null,
      input.targetUserId ?? null,
      input.action,
      input.summary.slice(0, 500),
      JSON.stringify(input.details ?? {}),
    ]
  );
}

function serializeLeagueAudit(row: LeagueAuditRow) {
  let details = row.details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details) as unknown;
    } catch {
      details = {};
    }
  }
  return { ...row, details: details ?? {} };
}

function normalizeEventTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function serializeLeague(row: LeagueRow) {
  return {
    ...row,
    expectedplayercount: Number(row.expectedplayercount || 36),
    leaguefee: Number(row.leaguefee || 0),
    pereventfee: Number(row.pereventfee || 0),
    showupbonuspoints: Number(row.showupbonuspoints || 0),
    bestfinishcount: Number(row.bestfinishcount || 7),
    finalchiprounding: Number(row.finalchiprounding || 100),
    finalstartingbigblind: Number(row.finalstartingbigblind || 100),
    pointslookup: typeof row.pointslookup === 'string'
      ? JSON.parse(row.pointslookup) as LeaguePointRule[]
      : row.pointslookup,
    finalmultiplierlookup: normalizeFinalMultipliers(
      typeof row.finalmultiplierlookup === 'string'
        ? JSON.parse(row.finalmultiplierlookup) as LeagueFinalMultiplier[]
        : row.finalmultiplierlookup
    ),
  };
}

function serializeSeason(row: LeagueSeasonRow) {
  return {
    ...row,
    pereventfee: Number(row.pereventfee || 0),
  };
}

function seasonEventFee(season: LeagueSeasonRow | null | undefined, fallback = 0) {
  return Math.max(0, Math.round(Number(season?.pereventfee ?? fallback ?? 0) * 100) / 100);
}

async function requireLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1 FROM leaguemembers WHERE leagueid = $1 AND userid = $2 AND approved = TRUE AND admin = TRUE`,
    [leagueId, userId]
  ));
}

async function requireLeagueSeasonParticipant(leagueId: string, seasonId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1
     FROM leaguemembers lm
     JOIN leagueseasonparticipants lsp ON lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid
     WHERE lm.leagueid = $1 AND lsp.seasonid = $2 AND lm.userid = $3 AND lm.approved = TRUE AND lsp.participating = TRUE`,
    [leagueId, seasonId, userId]
  ));
}

async function getLeagueSeasonParticipantCount(leagueId: string, seasonId: string): Promise<number> {
  const row = await queryOne<{ count: string | number }>(
    `SELECT count(*) AS count
     FROM leaguemembers lm
     JOIN leagueseasonparticipants lsp ON lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid
     WHERE lm.leagueid = $1 AND lsp.seasonid = $2 AND lm.approved = TRUE AND lsp.participating = TRUE`,
    [leagueId, seasonId]
  );
  return Number(row?.count || 0);
}

async function getLeagueSeasons(leagueId: string) {
  return query<LeagueSeasonRow>(
    `SELECT seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat
     FROM leagueseasons
     WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY begindate DESC, createdat DESC`,
    [leagueId]
  );
}

async function getSelectedSeason(leagueId: string, seasonId?: string | null) {
  if (seasonId) {
    return queryOne<LeagueSeasonRow>(
      `SELECT seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat
       FROM leagueseasons
       WHERE leagueid = $1 AND seasonid = $2 AND COALESCE(active, TRUE) = TRUE`,
      [leagueId, seasonId]
    );
  }
  return queryOne<LeagueSeasonRow>(
    `SELECT seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat
     FROM leagueseasons
     WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY begindate DESC, createdat DESC
     LIMIT 1`,
    [leagueId]
  );
}

async function addSeasonParticipant(client: PoolClient, leagueId: string, seasonId: string, userId: string, participating = true) {
  await client.query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (seasonid, userid) DO UPDATE SET participating = $4`,
    [seasonId, leagueId, userId, participating]
  );
}

async function addApprovedMembersToSeason(client: PoolClient, leagueId: string, seasonId: string) {
  const latestSeason = await client.query<{ seasonid: string }>(
    `SELECT seasonid
     FROM leagueseasons
     WHERE leagueid = $1
       AND seasonid <> $2
       AND COALESCE(active, TRUE) = TRUE
     ORDER BY begindate DESC, createdat DESC
     LIMIT 1`,
    [leagueId, seasonId]
  );

  if (latestSeason.rows[0]) {
    await client.query(
      `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
       SELECT $2, lsp.leagueid, lsp.userid, TRUE
       FROM leagueseasonparticipants lsp
       JOIN leaguemembers lm ON lm.leagueid = lsp.leagueid AND lm.userid = lsp.userid
       WHERE lsp.leagueid = $1
         AND lsp.seasonid = $3
         AND lsp.participating = TRUE
         AND lm.approved = TRUE
       ON CONFLICT (seasonid, userid) DO UPDATE SET participating = TRUE`,
      [leagueId, seasonId, latestSeason.rows[0].seasonid]
    );
    return;
  }

  await client.query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     SELECT $2, lm.leagueid, lm.userid, TRUE
     FROM leaguemembers lm
     WHERE lm.leagueid = $1 AND lm.approved = TRUE
     ON CONFLICT (seasonid, userid) DO NOTHING`,
    [leagueId, seasonId]
  );
}

async function addMemberToActiveSeasons(client: PoolClient, leagueId: string, userId: string) {
  await client.query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     SELECT s.seasonid, s.leagueid, $2, TRUE
     FROM leagueseasons s
     WHERE s.leagueid = $1 AND COALESCE(s.active, TRUE) = TRUE
     ON CONFLICT (seasonid, userid) DO UPDATE SET participating = TRUE`,
    [leagueId, userId]
  );
}

async function getLeagueForUser(leagueId: string, userId: string) {
  return queryOne<LeagueRow>(
    `SELECT l.leagueid, l.userid AS ownerid, l.name, l.invitecode, l.approvalneeded,
            l.expectedplayercount, l.leaguefee, l.pereventfee, l.showupbonuspoints, l.bestfinishcount, l.pointslookup,
            l.finalenabled, l.finalmultiplierlookup, l.finalchiprounding, l.finalstartingbigblind,
            l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*)
             FROM leagueseasons s
             JOIN leagueseasonparticipants lsp ON lsp.seasonid = s.seasonid
             JOIN leaguemembers lm2 ON lm2.leagueid = lsp.leagueid AND lm2.userid = lsp.userid
             WHERE s.leagueid = l.leagueid AND COALESCE(s.active, TRUE) = TRUE AND lm2.approved = TRUE AND lsp.participating = TRUE
               AND s.seasonid = (SELECT s2.seasonid FROM leagueseasons s2 WHERE s2.leagueid = l.leagueid AND COALESCE(s2.active, TRUE) = TRUE ORDER BY s2.begindate DESC, s2.createdat DESC LIMIT 1)) AS membercount,
            (SELECT count(*)
             FROM leagueevents e
             WHERE e.leagueid = l.leagueid AND e.active = TRUE
               AND e.seasonid = (SELECT s2.seasonid FROM leagueseasons s2 WHERE s2.leagueid = l.leagueid AND COALESCE(s2.active, TRUE) = TRUE ORDER BY s2.begindate DESC, s2.createdat DESC LIMIT 1)) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $2
     WHERE l.leagueid = $1 AND COALESCE(l.active, TRUE) = TRUE`,
    [leagueId, userId]
  );
}

async function createLeagueEventStubs(client: PoolClient, leagueId: string, seasonId: string, startNumber: number, count: number) {
  const rows: LeagueEventRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const number = startNumber + index;
    const result = await client.query<LeagueEventRow>(
      `INSERT INTO leagueevents (leagueid, seasonid, name, eventdate, eventtime, eventnumber)
       VALUES ($1, $2, $3, NULL, NULL, $4)
       RETURNING eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat`,
      [leagueId, seasonId, `Event #${number}`, number]
    );
    if (result.rows[0]) rows.push(result.rows[0]);
  }
  return rows;
}

leaguesRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<LeagueRow>(
    `SELECT l.leagueid, l.userid AS ownerid, l.name, l.invitecode, l.approvalneeded,
            l.expectedplayercount, l.leaguefee, l.pereventfee, l.showupbonuspoints, l.bestfinishcount, l.pointslookup,
            l.finalenabled, l.finalmultiplierlookup, l.finalchiprounding, l.finalstartingbigblind,
            l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*)
             FROM leagueseasons s
             JOIN leagueseasonparticipants lsp ON lsp.seasonid = s.seasonid
             JOIN leaguemembers lm2 ON lm2.leagueid = lsp.leagueid AND lm2.userid = lsp.userid
             WHERE s.leagueid = l.leagueid AND COALESCE(s.active, TRUE) = TRUE AND lm2.approved = TRUE AND lsp.participating = TRUE
               AND s.seasonid = (SELECT s2.seasonid FROM leagueseasons s2 WHERE s2.leagueid = l.leagueid AND COALESCE(s2.active, TRUE) = TRUE ORDER BY s2.begindate DESC, s2.createdat DESC LIMIT 1)) AS membercount,
            (SELECT count(*)
             FROM leagueevents e
             WHERE e.leagueid = l.leagueid AND e.active = TRUE
               AND e.seasonid = (SELECT s2.seasonid FROM leagueseasons s2 WHERE s2.leagueid = l.leagueid AND COALESCE(s2.active, TRUE) = TRUE ORDER BY s2.begindate DESC, s2.createdat DESC LIMIT 1)) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $1
     WHERE COALESCE(l.active, TRUE) = TRUE
     ORDER BY lm.admin DESC, lower(l.name) ASC`,
    [req.userId]
  );
  res.json(rows.map(serializeLeague));
});

leaguesRouter.get('/schedule', async (req: Request, res: Response) => {
  const rows = await query<{
    leagueid: string;
    leaguename: string;
    eventid: string;
    name: string;
    eventdate: string | null;
    eventtime: string | null;
    eventnumber: number | null;
    eventfee: number | null;
    isadmin: boolean;
  }>(
    `SELECT l.leagueid,
            l.name AS leaguename,
            e.eventid,
            e.name,
            e.eventdate,
            e.eventtime,
            e.eventnumber,
            CAST(COALESCE(s.pereventfee, l.pereventfee, 0) AS DECIMAL) AS eventfee,
            lm.admin AS isadmin
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $1
     JOIN leagueseasons s
       ON s.leagueid = l.leagueid
      AND COALESCE(s.active, TRUE) = TRUE
      AND s.seasonid = (
        SELECT s2.seasonid
        FROM leagueseasons s2
        WHERE s2.leagueid = l.leagueid
          AND COALESCE(s2.active, TRUE) = TRUE
        ORDER BY s2.begindate DESC, s2.createdat DESC
        LIMIT 1
      )
     JOIN leagueevents e ON e.leagueid = l.leagueid AND e.seasonid = s.seasonid
     WHERE COALESCE(l.active, TRUE) = TRUE
       AND lm.approved = TRUE
       AND e.active = TRUE
     ORDER BY e.eventdate ASC NULLS LAST, e.eventtime ASC NULLS LAST, e.eventnumber ASC NULLS LAST, lower(e.name) ASC`,
    [req.userId]
  );
  res.json(rows.map((row) => ({
    ...row,
    eventnumber: row.eventnumber == null ? null : Number(row.eventnumber),
    eventfee: Number(row.eventfee || 0),
  })));
});

leaguesRouter.patch('/:id', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as {
    name?: string;
    approvalneeded?: boolean;
    expectedplayercount?: number;
    leaguefee?: number;
    pereventfee?: number;
    showupbonuspoints?: number;
    bestfinishcount?: number;
    pointslookup?: unknown;
    finalenabled?: boolean;
    finalmultiplierlookup?: unknown;
    finalchiprounding?: number;
    finalstartingbigblind?: number;
  };
  const current = await getLeagueForUser(req.params.id, req.userId!);
  if (!current) {
    res.status(404).json({ error: 'League not found.' });
    return;
  }
  const name = body.name == null ? current.name : String(body.name).trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'League name required.' });
    return;
  }
  const showupBonus = body.showupbonuspoints == null ? Number(current.showupbonuspoints || 0) : Math.max(0, Math.round(Number(body.showupbonuspoints)));
  const leagueFee = body.leaguefee == null ? Number(current.leaguefee || 0) : Math.max(0, Math.round(Number(body.leaguefee) * 100) / 100);
  const perEventFee = body.pereventfee == null ? Number(current.pereventfee || 0) : Math.max(0, Math.round(Number(body.pereventfee) * 100) / 100);
  const bestFinishCount = body.bestfinishcount == null ? Number(current.bestfinishcount || 7) : Math.max(1, Math.min(100, Math.round(Number(body.bestfinishcount))));
  const expectedPlayerCount = body.expectedplayercount == null ? Number(current.expectedplayercount || 36) : Math.max(2, Math.min(500, Math.round(Number(body.expectedplayercount))));
  const pointsLookup = body.pointslookup == null ? normalizePointsLookup(current.pointslookup) : normalizePointsLookup(body.pointslookup);
  const finalEnabled = body.finalenabled == null ? Boolean(current.finalenabled) : Boolean(body.finalenabled);
  const finalMultipliers = body.finalmultiplierlookup == null ? normalizeFinalMultipliers(current.finalmultiplierlookup) : normalizeFinalMultipliers(body.finalmultiplierlookup);
  const finalChipRounding = body.finalchiprounding == null ? Number(current.finalchiprounding || 100) : Math.max(1, Math.round(Number(body.finalchiprounding)));
  const finalStartingBigBlind = body.finalstartingbigblind == null ? Number(current.finalstartingbigblind || 100) : Math.max(1, Math.round(Number(body.finalstartingbigblind)));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let recalculatedResults = 0;
    const updated = await client.query<LeagueRow>(
      `UPDATE leagues
       SET name = $2,
           approvalneeded = $3,
           expectedplayercount = $4,
           leaguefee = $5,
           pereventfee = $6,
           showupbonuspoints = $7,
           bestfinishcount = $8,
           pointslookup = $9,
           finalenabled = $10,
           finalmultiplierlookup = $11,
           finalchiprounding = $12,
           finalstartingbigblind = $13
       WHERE leagueid = $1
       RETURNING leagueid, userid AS ownerid, name, invitecode, approvalneeded, expectedplayercount, leaguefee, pereventfee, showupbonuspoints,
                 bestfinishcount, pointslookup, finalenabled, finalmultiplierlookup,
                 finalchiprounding, finalstartingbigblind, active, createdat`,
      [
        req.params.id,
        name,
        Boolean(body.approvalneeded ?? current.approvalneeded),
        expectedPlayerCount,
        leagueFee,
        perEventFee,
        showupBonus,
        bestFinishCount,
        JSON.stringify(pointsLookup),
        finalEnabled,
        JSON.stringify(finalMultipliers),
        finalChipRounding,
        finalStartingBigBlind,
      ]
    );
    if (body.pointslookup != null || body.showupbonuspoints != null) {
      const results = await client.query<{ resultid: string; placed: number | null; dnf: boolean }>(
        `SELECT resultid, placed, dnf FROM leagueresults WHERE leagueid = $1`,
        [req.params.id]
      );
      for (const result of results.rows) {
        await client.query(
          `UPDATE leagueresults SET points = $2, showupbonuspoints = $3, updatedat = now() WHERE resultid = $1`,
          [
            result.resultid,
            pointsForPlace(pointsLookup, result.placed, result.dnf),
            result.dnf ? 0 : showupBonus,
          ]
        );
      }
      recalculatedResults = results.rowCount ?? results.rows.length;
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        actorId: req.userId,
        action: 'scoring_updated',
        summary: 'League scoring settings were updated.',
        details: {
          previous: {
            pointslookup: normalizePointsLookup(current.pointslookup),
            showupbonuspoints: Number(current.showupbonuspoints || 0),
          },
          current: {
            pointslookup: pointsLookup,
            showupbonuspoints: showupBonus,
          },
          recalculatedResults,
        },
      });
    }
    if (body.leaguefee != null || body.pereventfee != null) {
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        actorId: req.userId,
        action: 'fee_settings_updated',
        summary: 'League fee settings were updated.',
        details: {
          previous: {
            leaguefee: Number(current.leaguefee || 0),
            pereventfee: Number(current.pereventfee || 0),
          },
          current: {
            leaguefee: leagueFee,
            pereventfee: perEventFee,
          },
        },
      });
    }
    await client.query('COMMIT');
    res.json({ league: serializeLeague({ ...updated.rows[0], isadmin: true, approved: true }), recalculatedResults });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  await query(`UPDATE leagues SET active = FALSE WHERE leagueid = $1`, [req.params.id]);
  res.json({ success: true });
});

leaguesRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { name?: string; approvalneeded?: boolean; expectedplayercount?: number; leaguefee?: number; pereventfee?: number; showupbonuspoints?: number; bestfinishcount?: number; pointslookup?: unknown; eventcount?: number; seasonname?: string; seasonbegindate?: string; seasonenddate?: string };
  const name = String(body.name ?? '').trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'League name required.' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const seasonName = String(body.seasonname ?? 'Season 1').trim().slice(0, 160) || 'Season 1';
  const seasonBeginDate = isoDate(body.seasonbegindate, today);
  const seasonEndDate = isoDate(body.seasonenddate, daysFromNow(365));
  if (seasonEndDate < seasonBeginDate) {
    res.status(400).json({ error: 'Season end date must be after the begin date.' });
    return;
  }
  const expectedPlayerCount = Math.max(2, Math.min(500, Math.round(Number(body.expectedplayercount ?? 36))));
  const leagueFee = Math.max(0, Math.round(Number(body.leaguefee ?? 0) * 100) / 100);
  const perEventFee = Math.max(0, Math.round(Number(body.pereventfee ?? 0) * 100) / 100);
  const showupBonus = Math.max(0, Math.round(Number(body.showupbonuspoints ?? 300)));
  const eventCount = Math.max(1, Math.min(100, Math.round(Number(body.eventcount ?? 1))));
  const bestFinishCount = Math.max(1, Math.min(100, Math.round(Number(body.bestfinishcount ?? 7))));
  if (bestFinishCount > eventCount) {
    res.status(400).json({ error: 'Top events scored cannot exceed total events.' });
    return;
  }
  const pointsLookup = body.pointslookup == null
    ? generatePointsLookup(expectedPlayerCount)
    : normalizePointsLookup(body.pointslookup);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitecode = generateInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const leagueResult = await client.query<{ leagueid: string }>(
        `INSERT INTO leagues (userid, name, invitecode, approvalneeded, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount, pointslookup, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
         RETURNING leagueid`,
        [req.userId, name, invitecode, Boolean(body.approvalneeded), expectedPlayerCount, leagueFee, perEventFee, showupBonus, bestFinishCount, JSON.stringify(pointsLookup)]
      );
      const league = leagueResult.rows[0];
      await client.query(
        `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
         VALUES ($1, $2, TRUE, TRUE)`,
        [league.leagueid, req.userId]
      );
      const seasonResult = await client.query<LeagueSeasonRow>(
        `INSERT INTO leagueseasons (leagueid, name, begindate, enddate, pereventfee)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat`,
        [league.leagueid, seasonName, seasonBeginDate, seasonEndDate, perEventFee]
      );
      const season = seasonResult.rows[0];
      await addSeasonParticipant(client, league.leagueid, season.seasonid, req.userId!, true);
      let createdEventCount = 0;
      if (eventCount > 0) {
        const createdEvents = await createLeagueEventStubs(client, league.leagueid, season.seasonid, 1, eventCount);
        createdEventCount = createdEvents.length;
      }
      await recordLeagueAudit(client, {
        leagueId: league.leagueid,
        seasonId: season.seasonid,
        actorId: req.userId,
        targetUserId: req.userId,
        action: 'league_created',
        summary: 'League was created.',
        details: {
          name,
          seasonName,
          expectedPlayerCount,
          eventCount: createdEventCount,
          leagueFee,
          perEventFee,
          showupBonus,
        },
      });
      await client.query('COMMIT');
      res.status(201).json({ leagueid: league.leagueid, invitecode, seasonid: season.seasonid });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === '23505') continue;
      console.error(err);
      res.status(500).json({ error: 'Failed to create league.' });
      return;
    } finally {
      client.release();
    }
  }
  res.status(500).json({ error: 'Failed to create a unique league code.' });
});

leaguesRouter.post('/join', async (req: Request, res: Response) => {
  const invitecode = normalizeInviteCode((req.body as { invitecode?: string }).invitecode);
  const league = await queryOne<LeagueRow>(
    `SELECT leagueid, approvalneeded FROM leagues WHERE invitecode = $1 AND COALESCE(active, TRUE) = TRUE`,
    [invitecode]
  );
  if (!league) {
    res.status(404).json({ error: 'League invite code not found.' });
    return;
  }
  const approved = !league.approvalneeded;
  const existingMembership = await queryOne<{ approved: boolean }>(
    `SELECT approved FROM leaguemembers WHERE leagueid = $1 AND userid = $2`,
    [league.leagueid, req.userId]
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
       VALUES ($1, $2, FALSE, $3)
       ON CONFLICT (leagueid, userid) DO UPDATE SET approved = CASE WHEN leaguemembers.approved THEN TRUE ELSE $3 END`,
      [league.leagueid, req.userId, approved]
    );
    if (approved) {
      await addMemberToActiveSeasons(client, league.leagueid, req.userId!);
    }
    if (!existingMembership || (approved && !existingMembership.approved)) {
      await recordLeagueAudit(client, {
        leagueId: league.leagueid,
        actorId: req.userId,
        targetUserId: req.userId,
        action: approved ? 'member_joined' : 'member_join_requested',
        summary: approved ? 'Member joined the league.' : 'Member requested to join the league.',
        details: { approved },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ leagueid: league.leagueid, pending: Boolean(league.approvalneeded) });
});

leaguesRouter.post('/:id/seasons', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { name?: string; begindate?: string; enddate?: string; eventcount?: number; pereventfee?: number };
  const name = String(body.name ?? 'New Season').trim().slice(0, 160) || 'New Season';
  const today = new Date().toISOString().slice(0, 10);
  const beginDate = isoDate(body.begindate, today);
  const endDate = isoDate(body.enddate, daysFromNow(365));
  if (endDate < beginDate) {
    res.status(400).json({ error: 'Season end date must be after the begin date.' });
    return;
  }
  const eventCount = Math.max(0, Math.min(100, Math.round(Number(body.eventcount ?? 0))));
  const league = await getLeagueForUser(req.params.id, req.userId!);
  const perEventFee = Math.max(0, Math.round(Number(body.pereventfee ?? league?.pereventfee ?? 0) * 100) / 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seasonResult = await client.query<LeagueSeasonRow>(
      `INSERT INTO leagueseasons (leagueid, name, begindate, enddate, pereventfee)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat`,
      [req.params.id, name, beginDate, endDate, perEventFee]
    );
    const season = seasonResult.rows[0];
    await addApprovedMembersToSeason(client, req.params.id, season.seasonid);
    const events = eventCount > 0 ? await createLeagueEventStubs(client, req.params.id, season.seasonid, 1, eventCount) : [];
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: season.seasonid,
      actorId: req.userId,
      action: 'season_created',
      summary: 'Season was created.',
      details: {
        name,
        begindate: beginDate,
        enddate: endDate,
        perEventFee,
        eventCount: events.length,
      },
    });
    await client.query('COMMIT');
    res.status(201).json({ season: serializeSeason(season), events });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.patch('/:id/seasons/:seasonId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { name?: string; begindate?: string; enddate?: string; pereventfee?: number };
  const existing = await queryOne<LeagueSeasonRow>(
    `SELECT seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat
     FROM leagueseasons
     WHERE leagueid = $1 AND seasonid = $2 AND COALESCE(active, TRUE) = TRUE`,
    [req.params.id, req.params.seasonId]
  );
  if (!existing) {
    res.status(404).json({ error: 'Season not found.' });
    return;
  }
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasBeginDate = Object.prototype.hasOwnProperty.call(body, 'begindate');
  const hasEndDate = Object.prototype.hasOwnProperty.call(body, 'enddate');
  const hasPerEventFee = Object.prototype.hasOwnProperty.call(body, 'pereventfee');
  const name = hasName ? String(body.name ?? '').trim().slice(0, 160) : existing.name;
  if (!name) {
    res.status(400).json({ error: 'Season name required.' });
    return;
  }
  const beginDate = hasBeginDate ? isoDate(body.begindate, String(existing.begindate).slice(0, 10)) : String(existing.begindate).slice(0, 10);
  const endDate = hasEndDate ? isoDate(body.enddate, String(existing.enddate).slice(0, 10)) : String(existing.enddate).slice(0, 10);
  if (endDate < beginDate) {
    res.status(400).json({ error: 'Season end date must be after the begin date.' });
    return;
  }
  const perEventFee = hasPerEventFee ? Math.max(0, Math.round(Number(body.pereventfee ?? 0) * 100) / 100) : Number(existing.pereventfee || 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<LeagueSeasonRow>(
      `UPDATE leagueseasons
       SET name = $3,
           begindate = $4::DATE,
           enddate = $5::DATE,
           pereventfee = $6
       WHERE leagueid = $1 AND seasonid = $2 AND COALESCE(active, TRUE) = TRUE
       RETURNING seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat`,
      [req.params.id, req.params.seasonId, name, beginDate, endDate, perEventFee]
    );
    const row = updated.rows[0];
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: req.params.seasonId,
      actorId: req.userId,
      action: hasPerEventFee ? 'season_fee_updated' : 'season_updated',
      summary: hasPerEventFee ? 'Season event fee was updated.' : 'Season settings were updated.',
      details: {
        previous: {
          name: existing.name,
          begindate: existing.begindate,
          enddate: existing.enddate,
          pereventfee: Number(existing.pereventfee || 0),
        },
        current: {
          name: row.name,
          begindate: row.begindate,
          enddate: row.enddate,
          pereventfee: Number(row.pereventfee || 0),
        },
      },
    });
    await client.query('COMMIT');
    res.json({ season: serializeSeason(row) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.delete('/:id/seasons/:seasonId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const season = await queryOne<LeagueSeasonRow>(
    `SELECT seasonid, leagueid, name, begindate, enddate, CAST(pereventfee AS DECIMAL) AS pereventfee, active, createdat
     FROM leagueseasons
     WHERE leagueid = $1 AND seasonid = $2 AND COALESCE(active, TRUE) = TRUE`,
    [req.params.id, req.params.seasonId]
  );
  if (!season) {
    res.status(404).json({ error: 'Season not found.' });
    return;
  }
  const activeCount = await queryOne<{ count: string }>(
    `SELECT count(*)::TEXT AS count
     FROM leagueseasons
     WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE`,
    [req.params.id]
  );
  if (Number(activeCount?.count || 0) <= 1) {
    res.status(400).json({ error: 'A league needs at least one active season.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE leagueseasons SET active = FALSE WHERE leagueid = $1 AND seasonid = $2`,
      [req.params.id, req.params.seasonId]
    );
    await client.query(
      `UPDATE leagueevents SET active = FALSE WHERE leagueid = $1 AND seasonid = $2`,
      [req.params.id, req.params.seasonId]
    );
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: req.params.seasonId,
      actorId: req.userId,
      action: 'season_deleted',
      summary: 'Season was deleted.',
      details: { name: season.name },
    });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.post('/:id/members/guest', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { displayname?: string; seasonid?: string };
  const displayname = String(body.displayname ?? '').trim().slice(0, 120);
  if (!displayname) {
    res.status(400).json({ error: 'Guest player name required.' });
    return;
  }
  const season = await getSelectedSeason(req.params.id, body.seasonid);
  if (!season) {
    res.status(400).json({ error: 'Season not found.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const guestId = crypto.randomUUID();
    const guestEmail = createGuestEmail();
    const createdUserResult = await client.query<{ guid: string }>(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING guid`,
      [guestId, privateEmailPlaceholder(guestId), hashEmail(guestEmail), encryptEmail(guestEmail), `guest:${crypto.randomUUID()}`]
    );
    const createdUser = createdUserResult.rows[0];
    if (!createdUser) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to create guest player.' });
      return;
    }
    await client.query(
      `INSERT INTO usermetadata (userid, nickname, isguestuser, guestofuserid)
       VALUES ($1, $2, TRUE, $3)`,
      [createdUser.guid, displayname, req.userId]
    );
    await client.query(
      `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
       VALUES ($1, $2, FALSE, TRUE)`,
      [req.params.id, createdUser.guid]
    );
    await addSeasonParticipant(client, req.params.id, season.seasonid, createdUser.guid, true);
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: season.seasonid,
      actorId: req.userId,
      targetUserId: createdUser.guid,
      action: 'guest_added',
      summary: 'Guest player was added to the season.',
      details: { displayname },
    });
    await client.query('COMMIT');
    res.status(201).json({
      member: {
        userid: createdUser.guid,
        emailaddress: null,
        displayname,
        isadmin: false,
        approved: true,
        participating: true,
        isguestuser: true,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.post('/:id/members/:guestUserId/claim-invite', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const normalizedEmail = normalizeEmail((req.body as { email?: string }).email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const league = await queryOne<{ leagueid: string; name: string }>(
    `SELECT leagueid, name FROM leagues WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE`,
    [req.params.id]
  );
  if (!league) {
    res.status(404).json({ error: 'League not found.' });
    return;
  }
  const guest = await queryOne<{ userid: string; emailaddress: string | null; displayname: string | null; isguestuser: boolean }>(
    `SELECT lm.userid,
            u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            COALESCE(m.isguestuser, FALSE) AS isguestuser
     FROM leaguemembers lm
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE lm.leagueid = $1 AND lm.userid = $2`,
    [req.params.id, req.params.guestUserId]
  );
  if (!guest) {
    res.status(404).json({ error: 'League player not found.' });
    return;
  }
  if (!guest.isguestuser && !isGuestEmail(guest.emailaddress)) {
    res.status(400).json({ error: 'Only guest players can be claimed.' });
    return;
  }

  const token = createClaimToken();
  const tokenHash = hashClaimToken(token);
  const emailHash = hashEmail(normalizedEmail);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE leagueguestclaims
       SET expiresat = now()
       WHERE leagueid = $1
         AND guestuserid = $2
         AND claimedat IS NULL
         AND expiresat > now()`,
      [req.params.id, req.params.guestUserId]
    );
    await client.query(
      `INSERT INTO leagueguestclaims (leagueid, guestuserid, emailhash, emailencrypted, tokenhash, invitedby, expiresat)
       VALUES ($1, $2, $3, $4, $5, $6, now() + INTERVAL '14 days')`,
      [req.params.id, req.params.guestUserId, emailHash, encryptEmail(normalizedEmail), tokenHash, req.userId]
    );
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      actorId: req.userId,
      targetUserId: req.params.guestUserId,
      action: 'guest_claim_invite_sent',
      summary: 'Guest claim invite was sent.',
      details: {
        email: normalizedEmail,
        guestName: guest.displayname,
      },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await sendLeagueGuestClaimEmail(normalizedEmail, league.name, guest.displayname ?? 'Guest player', token);
  res.status(201).json({ success: true, email: normalizedEmail });
});

leaguesRouter.post('/guest-claims/:token/claim', async (req: Request, res: Response) => {
  const tokenHash = hashClaimToken(String(req.params.token ?? ''));
  const claim = await queryOne<{
    claimid: string;
    leagueid: string;
    guestuserid: string;
    emailhash: string;
    league_name: string;
    guestname: string | null;
  }>(
    `SELECT c.claimid,
            c.leagueid,
            c.guestuserid,
            c.emailhash,
            l.name AS league_name,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS guestname
     FROM leagueguestclaims c
     JOIN leagues l ON l.leagueid = c.leagueid
     JOIN users u ON u.guid = c.guestuserid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE c.tokenhash = $1
       AND c.claimedat IS NULL
       AND c.expiresat > now()
       AND COALESCE(l.active, TRUE) = TRUE
     LIMIT 1`,
    [tokenHash]
  );
  if (!claim) {
    res.status(404).json({ error: 'This claim link is invalid or expired.' });
    return;
  }
  const currentUser = await queryOne<{ guid: string; emailhash: string | null }>(
    `SELECT guid, emailhash FROM users WHERE guid = $1`,
    [req.userId]
  );
  if (!currentUser || currentUser.emailhash !== claim.emailhash) {
    res.status(403).json({ error: 'Sign in with the email address this invite was sent to.' });
    return;
  }
  if (claim.guestuserid === req.userId) {
    res.status(400).json({ error: 'This guest profile is already tied to your account.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const guestMember = await client.query<{
      approved: boolean;
      participating: boolean;
      emailalertsenabled: boolean;
      pushalertsenabled: boolean;
    }>(
      `SELECT approved, participating, emailalertsenabled, pushalertsenabled
       FROM leaguemembers
       WHERE leagueid = $1 AND userid = $2
       LIMIT 1`,
      [claim.leagueid, claim.guestuserid]
    );
    if (!guestMember.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Guest league profile no longer exists.' });
      return;
    }
    await client.query(
      `INSERT INTO leaguemembers (leagueid, userid, admin, approved, participating, emailalertsenabled, pushalertsenabled)
       VALUES ($1, $2, FALSE, $3, $4, $5, $6)
       ON CONFLICT (leagueid, userid) DO UPDATE
       SET approved = leaguemembers.approved OR EXCLUDED.approved,
           participating = leaguemembers.participating OR EXCLUDED.participating,
           emailalertsenabled = leaguemembers.emailalertsenabled OR EXCLUDED.emailalertsenabled,
           pushalertsenabled = leaguemembers.pushalertsenabled OR EXCLUDED.pushalertsenabled`,
      [
        claim.leagueid,
        req.userId,
        guestMember.rows[0].approved,
        guestMember.rows[0].participating,
        guestMember.rows[0].emailalertsenabled,
        guestMember.rows[0].pushalertsenabled,
      ]
    );
    await client.query(
      `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
       SELECT seasonid, leagueid, $3, participating
       FROM leagueseasonparticipants
       WHERE leagueid = $1 AND userid = $2
       ON CONFLICT (seasonid, userid) DO UPDATE
       SET participating = leagueseasonparticipants.participating OR EXCLUDED.participating`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `DELETE FROM leagueresults guest_result
       WHERE guest_result.leagueid = $1
         AND guest_result.userid = $2
         AND EXISTS (
           SELECT 1
           FROM leagueresults real_result
           WHERE real_result.eventid = guest_result.eventid
             AND real_result.userid = $3
         )`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `UPDATE leagueresults SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `UPDATE leaguepayments SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `UPDATE leagueauditlogs SET targetuserid = $3 WHERE leagueid = $1 AND targetuserid = $2`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `UPDATE leagueauditlogs SET actorid = $3 WHERE leagueid = $1 AND actorid = $2`,
      [claim.leagueid, claim.guestuserid, req.userId]
    );
    await client.query(
      `DELETE FROM leagueseasonparticipants WHERE leagueid = $1 AND userid = $2`,
      [claim.leagueid, claim.guestuserid]
    );
    await client.query(
      `DELETE FROM leaguemembers WHERE leagueid = $1 AND userid = $2`,
      [claim.leagueid, claim.guestuserid]
    );
    await client.query(
      `UPDATE leagueguestclaims
       SET claimedby = $2,
           claimedat = now()
       WHERE claimid = $1`,
      [claim.claimid, req.userId]
    );
    await recordLeagueAudit(client, {
      leagueId: claim.leagueid,
      actorId: req.userId,
      targetUserId: req.userId,
      action: 'guest_profile_claimed',
      summary: 'Guest player profile was claimed by a registered user.',
      details: {
        guestUserId: claim.guestuserid,
        guestName: claim.guestname,
      },
    });
    await client.query('COMMIT');
    res.json({ success: true, leagueid: claim.leagueid, leaguename: claim.league_name });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const member = await queryOne<{ userid: string; isadmin: boolean; isowner: boolean }>(
    `SELECT lm.userid, lm.admin AS isadmin, l.userid = lm.userid AS isowner
     FROM leaguemembers lm
     JOIN leagues l ON l.leagueid = lm.leagueid
     WHERE lm.leagueid = $1 AND lm.userid = $2`,
    [req.params.id, req.params.userId]
  );
  if (!member) {
    res.status(404).json({ error: 'League player not found.' });
    return;
  }
  const season = await getSelectedSeason(req.params.id, String(req.query.seasonId ?? '') || null);
  if (!season) {
    res.status(400).json({ error: 'Season not found.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deletedPayments = await client.query(
      `DELETE FROM leaguepayments
       WHERE leagueid = $1 AND userid = $2
         AND (seasonid = $3 OR eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $3))`,
      [req.params.id, req.params.userId, season.seasonid]
    );
    const deletedResults = await client.query(
      `DELETE FROM leagueresults
       WHERE leagueid = $1 AND userid = $2
         AND eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $3)`,
      [req.params.id, req.params.userId, season.seasonid]
    );
    await addSeasonParticipant(client, req.params.id, season.seasonid, req.params.userId, false);
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: season.seasonid,
      actorId: req.userId,
      targetUserId: req.params.userId,
      action: 'member_removed_from_season',
      summary: 'Member was removed from the season.',
      details: {
        wasAdmin: Boolean(member.isadmin),
        wasOwner: Boolean(member.isowner),
        deletedPayments: deletedPayments.rowCount ?? 0,
        deletedResults: deletedResults.rowCount ?? 0,
      },
    });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.get('/:id', async (req: Request, res: Response) => {
  const leagueRow = await getLeagueForUser(req.params.id, req.userId!);
  if (!leagueRow) {
    res.status(404).json({ error: 'League not found or not joined.' });
    return;
  }
  const league = serializeLeague(leagueRow);
  const seasons = await getLeagueSeasons(league.leagueid);
  const selectedSeason = await getSelectedSeason(league.leagueid, String(req.query.seasonId ?? '') || null);
  if (!selectedSeason) {
    res.status(404).json({ error: 'League season not found.' });
    return;
  }
  await query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     SELECT $2, lm.leagueid, lm.userid, TRUE
     FROM leaguemembers lm
     WHERE lm.leagueid = $1 AND lm.approved = TRUE
     ON CONFLICT (seasonid, userid) DO NOTHING`,
    [league.leagueid, selectedSeason.seasonid]
  );
  const memberRows = await query<LeagueMemberRow>(
    `SELECT u.guid AS userid, u.emailaddress, u.emailencrypted,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            lm.admin AS isadmin, lm.approved, COALESCE(lsp.participating, FALSE) AS participating,
            COALESCE(m.isguestuser, FALSE) AS isguestuser,
            (
              SELECT c.emailencrypted
              FROM leagueguestclaims c
              WHERE c.leagueid = lm.leagueid
                AND c.guestuserid = lm.userid
                AND c.claimedat IS NULL
                AND c.expiresat > now()
              ORDER BY c.createdat DESC
              LIMIT 1
            ) AS pendinginviteencrypted
     FROM leaguemembers lm
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     LEFT JOIN leagueseasonparticipants lsp ON lsp.seasonid = $2 AND lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid
     WHERE lm.leagueid = $1 AND (lm.admin = TRUE OR COALESCE(lsp.participating, FALSE) = TRUE)
     ORDER BY lm.admin DESC, lm.approved DESC, lower(COALESCE(m.nickname, u.emailaddress)) ASC`,
    [league.leagueid, selectedSeason.seasonid]
  );
  const members = memberRows.map((member) => {
    const {
      emailencrypted,
      pendinginviteencrypted,
      ...safeMember
    } = member;
    const isGuest = Boolean(member.isguestuser) || isGuestEmail(member.emailaddress);
    const visibleEmail = isGuest ? '' : publicEmail(emailencrypted, member.emailaddress);
    const displayname = safeMember.displayname === member.emailaddress && visibleEmail
      ? visibleEmail
      : safeMember.displayname;
    return {
      ...safeMember,
      displayname,
      isguestuser: isGuest,
      emailaddress: isGuest ? null : visibleEmail,
      pendinginviteemail: publicEmail(pendinginviteencrypted, null),
    };
  });
  const events = await query<LeagueEventRow>(
    `SELECT e.eventid, e.leagueid, e.seasonid, e.name, e.eventdate, e.eventtime, e.eventnumber, CAST(e.eventfee AS DECIMAL) AS eventfee, e.active, e.createdat,
            (SELECT count(*) FROM leagueresults WHERE eventid = e.eventid) AS resultcount
     FROM leagueevents e
     WHERE e.leagueid = $1 AND e.seasonid = $2 AND e.active = TRUE
     ORDER BY e.eventnumber ASC NULLS LAST, e.eventdate ASC NULLS LAST, e.eventtime ASC NULLS LAST, e.createdat ASC`,
    [league.leagueid, selectedSeason.seasonid]
  );
  const results = await query<LeagueResultRow>(
    `SELECT r.resultid, r.eventid, r.leagueid, r.userid,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            r.placed, r.dnf, r.points, r.showupbonuspoints, r.loggedby, r.createdat, r.updatedat
     FROM leagueresults r
     JOIN leagueevents e ON e.eventid = r.eventid
     JOIN users u ON u.guid = r.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE r.leagueid = $1 AND e.seasonid = $2`,
    [league.leagueid, selectedSeason.seasonid]
  );
  const payments = await query<LeaguePaymentRow>(
    `SELECT p.paymentid, p.leagueid, p.seasonid, p.userid,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            p.eventid, e.name AS eventname, p.paymenttype, CAST(p.amount AS DECIMAL) AS amount,
            p.paidat, p.note, p.recordedby, p.createdat
     FROM leaguepayments p
     JOIN users u ON u.guid = p.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     LEFT JOIN leagueevents e ON e.eventid = p.eventid
     WHERE p.leagueid = $1 AND (p.seasonid = $2 OR e.seasonid = $2)
     ORDER BY p.paidat DESC, p.createdat DESC`,
    [league.leagueid, selectedSeason.seasonid]
  );
  const auditlog = await query<LeagueAuditRow>(
    `SELECT a.auditid,
            a.leagueid,
            a.seasonid,
            s.name AS seasonname,
            a.eventid,
            e.name AS eventname,
            a.actorid,
            COALESCE(NULLIF(trim(coalesce(am.nickname, '')), ''),
                     NULLIF(trim(concat(coalesce(am.firstname, ''), ' ', coalesce(am.lastname, ''))), ''),
                     au.emailaddress) AS actorname,
            a.targetuserid,
            COALESCE(NULLIF(trim(coalesce(tm.nickname, '')), ''),
                     NULLIF(trim(concat(coalesce(tm.firstname, ''), ' ', coalesce(tm.lastname, ''))), ''),
                     tu.emailaddress) AS targetname,
            a.action,
            a.summary,
            a.details,
            a.createdat
     FROM leagueauditlogs a
     LEFT JOIN leagueseasons s ON s.seasonid = a.seasonid
     LEFT JOIN leagueevents e ON e.eventid = a.eventid
     LEFT JOIN users au ON au.guid = a.actorid
     LEFT JOIN usermetadata am ON am.userid = au.guid
     LEFT JOIN users tu ON tu.guid = a.targetuserid
     LEFT JOIN usermetadata tm ON tm.userid = tu.guid
     WHERE a.leagueid = $1
     ORDER BY a.createdat DESC
     LIMIT 200`,
    [league.leagueid]
  );
  const currentPointsLookup = normalizePointsLookup(league.pointslookup);
  const currentShowupBonus = Math.max(0, Number(league.showupbonuspoints || 0));
  const normalizedResults = results.map((result) => {
    const placed = result.placed == null ? null : Number(result.placed);
    const dnf = Boolean(result.dnf);
    return {
      ...result,
      placed,
      dnf,
      points: pointsForPlace(currentPointsLookup, placed, dnf),
      showupbonuspoints: dnf ? 0 : currentShowupBonus,
    };
  });
  const standings = buildStandings(members, normalizedResults, Number(league.bestfinishcount || 7));

  res.json({
    league,
    seasons: seasons.map(serializeSeason),
    selectedseasonid: selectedSeason.seasonid,
    members,
    events: events.map((event) => ({ ...event, eventfee: event.eventfee == null ? null : Number(event.eventfee) })),
    results: normalizedResults,
    payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount || 0) })),
    auditlog: auditlog.map(serializeLeagueAudit),
    standings,
    finalstacks: buildFinalStacks(standings, league),
  });
});

leaguesRouter.post('/:id/payments', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { userid?: string; eventid?: string | null; seasonid?: string | null; paymenttype?: string; amount?: number; paidat?: string; note?: string };
  const userId = String(body.userid ?? '');
  const paymentType = ['league', 'event', 'other'].includes(String(body.paymenttype)) ? String(body.paymenttype) : 'league';
  const amount = Math.max(0, Math.round(Number(body.amount ?? 0) * 100) / 100);
  if (!amount) {
    res.status(400).json({ error: 'Payment amount required.' });
    return;
  }
  const eventId = body.eventid ? String(body.eventid) : null;
  let season = body.seasonid ? await getSelectedSeason(req.params.id, String(body.seasonid)) : await getSelectedSeason(req.params.id);
  if (eventId) {
    const event = await queryOne<LeagueEventRow>(`SELECT eventid, leagueid, seasonid, CAST(eventfee AS DECIMAL) AS eventfee FROM leagueevents WHERE leagueid = $1 AND eventid = $2`, [req.params.id, eventId]);
    if (!event) {
      res.status(400).json({ error: 'Event is not part of this league.' });
      return;
    }
    season = event.seasonid ? await getSelectedSeason(req.params.id, event.seasonid) : season;
  }
  if (!season) {
    res.status(400).json({ error: 'Season not found.' });
    return;
  }
  if (!await requireLeagueSeasonParticipant(req.params.id, season.seasonid, userId)) {
    res.status(400).json({ error: 'Player is not active in this season.' });
    return;
  }
  const paidAt = body.paidat ? String(body.paidat).slice(0, 10) : null;
  const note = String(body.note ?? '').trim().slice(0, 240) || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows: LeaguePaymentRow[] = [];
    if (paymentType === 'event' && !eventId) {
      const fee = seasonEventFee(season);
      if (!fee) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Set the season event fee before applying event payments.' });
        return;
      }
      let remaining = amount;
      const events = await client.query<LeagueEventRow>(
        `SELECT eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat
         FROM leagueevents
         WHERE leagueid = $1 AND seasonid = $2 AND active = TRUE
         ORDER BY eventnumber ASC NULLS LAST, eventdate ASC NULLS LAST, eventtime ASC NULLS LAST, createdat ASC`,
        [req.params.id, season.seasonid]
      );
      const paidByEvent = await client.query<{ eventid: string; paid: string | number }>(
        `SELECT eventid, COALESCE(SUM(amount), 0) AS paid
         FROM leaguepayments
         WHERE leagueid = $1
           AND seasonid = $2
           AND userid = $3
           AND paymenttype = 'event'
           AND eventid IS NOT NULL
         GROUP BY eventid`,
        [req.params.id, season.seasonid, userId]
      );
      const paidMap = new Map(paidByEvent.rows.map((row) => [row.eventid, Number(row.paid || 0)]));
      for (const eventRow of events.rows) {
        if (remaining <= 0) break;
        const alreadyPaid = paidMap.get(eventRow.eventid) ?? 0;
        const openAmount = Math.max(0, fee - alreadyPaid);
        if (!openAmount) continue;
        const applied = Math.min(remaining, openAmount);
        const inserted = await client.query<LeaguePaymentRow>(
          `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
           VALUES ($1, $2, $3, $4, 'event', $5, COALESCE($6::DATE, current_date()), $7, $8)
           RETURNING paymentid, leagueid, seasonid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat`,
          [req.params.id, season.seasonid, userId, eventRow.eventid, applied, paidAt, note ?? 'Applied toward event fees', req.userId]
        );
        if (inserted.rows[0]) rows.push(inserted.rows[0]);
        remaining = Math.round((remaining - applied) * 100) / 100;
      }
      if (remaining > 0) {
        const inserted = await client.query<LeaguePaymentRow>(
          `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
           VALUES ($1, $2, $3, NULL, 'event', $4, COALESCE($5::DATE, current_date()), $6, $7)
           RETURNING paymentid, leagueid, seasonid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat`,
          [req.params.id, season.seasonid, userId, remaining, paidAt, note ?? 'Unallocated event fee credit', req.userId]
        );
        if (inserted.rows[0]) rows.push(inserted.rows[0]);
      }
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        seasonId: season.seasonid,
        actorId: req.userId,
        targetUserId: userId,
        action: 'event_payments_applied',
        summary: 'Event fee payment was applied across the season.',
        details: {
          paymenttype: paymentType,
          amount,
          seasonEventFee: fee,
          paymentsCreated: rows.length,
          paidat: rows[0]?.paidat ?? paidAt,
          note,
        },
      });
    } else {
      const inserted = await client.query<LeaguePaymentRow>(
        `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::DATE, current_date()), $8, $9)
         RETURNING paymentid, leagueid, seasonid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat`,
        [req.params.id, season.seasonid, userId, eventId, paymentType, amount, paidAt, note, req.userId]
      );
      const row = inserted.rows[0] ?? null;
      if (row) rows.push(row);
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        seasonId: season.seasonid,
        eventId,
        actorId: req.userId,
        targetUserId: userId,
        action: 'payment_added',
        summary: 'Payment was recorded.',
        details: {
          paymentid: row?.paymentid,
          paymenttype: paymentType,
          amount,
          paidat: row?.paidat ?? paidAt,
          note,
        },
      });
    }
    await client.query('COMMIT');
    res.status(201).json({
      payment: rows[0] ? { ...rows[0], amount: Number(rows[0].amount || 0) } : null,
      payments: rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.delete('/:id/payments/:paymentId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<LeaguePaymentRow>(
      `SELECT paymentid, leagueid, seasonid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat
       FROM leaguepayments
       WHERE leagueid = $1 AND paymentid = $2
       LIMIT 1`,
      [req.params.id, req.params.paymentId]
    );
    const payment = existing.rows[0] ?? null;
    if (!payment) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    await client.query(`DELETE FROM leaguepayments WHERE leagueid = $1 AND paymentid = $2`, [req.params.id, req.params.paymentId]);
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: payment.seasonid,
      eventId: payment.eventid,
      actorId: req.userId,
      targetUserId: payment.userid,
      action: 'payment_deleted',
      summary: 'Payment was deleted.',
      details: {
        paymentid: payment.paymentid,
        paymenttype: payment.paymenttype,
        amount: Number(payment.amount || 0),
        paidat: payment.paidat,
        note: payment.note,
      },
    });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.post('/:id/events/:eventId/payments/mark-paid', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { userId?: string; all?: boolean; paidat?: string };
  const event = await queryOne<LeagueEventRow>(
    `SELECT eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat
     FROM leagueevents
     WHERE leagueid = $1 AND eventid = $2 AND active = TRUE`,
    [req.params.id, req.params.eventId]
  );
  if (!event || !event.seasonid) {
    res.status(404).json({ error: 'League event not found.' });
    return;
  }
  const season = await getSelectedSeason(req.params.id, event.seasonid);
  const fee = seasonEventFee(season);
  if (!season || !fee) {
    res.status(400).json({ error: 'Set the season event fee before marking players paid.' });
    return;
  }
  const targets = body.all
    ? await query<{ userid: string; displayname: string | null }>(
      `SELECT lm.userid,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
       FROM leaguemembers lm
       JOIN leagueseasonparticipants lsp ON lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid
       JOIN users u ON u.guid = lm.userid
       LEFT JOIN usermetadata m ON m.userid = u.guid
       WHERE lm.leagueid = $1 AND lsp.seasonid = $2 AND lm.approved = TRUE AND lsp.participating = TRUE
       ORDER BY lower(COALESCE(m.nickname, u.emailaddress)) ASC`,
      [req.params.id, season.seasonid]
    )
    : await query<{ userid: string; displayname: string | null }>(
      `SELECT lm.userid,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
       FROM leaguemembers lm
       JOIN leagueseasonparticipants lsp ON lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid
       JOIN users u ON u.guid = lm.userid
       LEFT JOIN usermetadata m ON m.userid = u.guid
       WHERE lm.leagueid = $1 AND lsp.seasonid = $2 AND lm.userid = $3 AND lm.approved = TRUE AND lsp.participating = TRUE`,
      [req.params.id, season.seasonid, String(body.userId ?? '')]
    );
  if (!targets.length) {
    res.status(400).json({ error: 'No active season players found.' });
    return;
  }
  const paidAt = body.paidat ? String(body.paidat).slice(0, 10) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows: LeaguePaymentRow[] = [];
    for (const target of targets) {
      const paid = await client.query<{ amount: string | number }>(
        `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM leaguepayments
         WHERE leagueid = $1
           AND seasonid = $2
           AND eventid = $3
           AND userid = $4
           AND paymenttype = 'event'`,
        [req.params.id, season.seasonid, event.eventid, target.userid]
      );
      const openAmount = Math.max(0, fee - Number(paid.rows[0]?.amount || 0));
      if (!openAmount) continue;
      const inserted = await client.query<LeaguePaymentRow>(
        `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
         VALUES ($1, $2, $3, $4, 'event', $5, COALESCE($6::DATE, current_date()), $7, $8)
         RETURNING paymentid, leagueid, seasonid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat`,
        [req.params.id, season.seasonid, target.userid, event.eventid, openAmount, paidAt, 'Marked event fee paid', req.userId]
      );
      if (inserted.rows[0]) rows.push(inserted.rows[0]);
    }
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: season.seasonid,
      eventId: event.eventid,
      actorId: req.userId,
      targetUserId: body.all ? null : targets[0]?.userid ?? null,
      action: body.all ? 'event_payments_marked_paid' : 'event_payment_marked_paid',
      summary: body.all ? 'Event fees were marked paid for all active players.' : 'Event fee was marked paid for a player.',
      details: {
        eventName: event.name,
        seasonEventFee: fee,
        playersUpdated: rows.length,
        paidat: rows[0]?.paidat ?? paidAt,
      },
    });
    await client.query('COMMIT');
    res.status(201).json({
      payments: rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })),
      updatedCount: rows.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.post('/:id/events', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { name?: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number; eventcount?: number; seasonid?: string; eventfee?: number };
  const season = await getSelectedSeason(req.params.id, body.seasonid);
  if (!season) {
    res.status(400).json({ error: 'Season not found.' });
    return;
  }
  const name = String(body.name ?? '').trim().slice(0, 160);
  const eventCount = Math.max(1, Math.min(100, Math.round(Number(body.eventcount ?? 1))));
  if (!name && eventCount === 1) {
    res.status(400).json({ error: 'Event name required.' });
    return;
  }
  const eventNumber = Math.max(1, Math.round(Number(body.eventnumber ?? 1)));
  const date = body.eventdate ? String(body.eventdate).slice(0, 10) : null;
  const time = normalizeEventTime(body.eventtime);
  const eventFee = body.eventfee == null ? null : Math.max(0, Math.round(Number(body.eventfee) * 100) / 100);
  if (eventCount === 1) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<LeagueEventRow>(
        `INSERT INTO leagueevents (leagueid, seasonid, name, eventdate, eventtime, eventnumber, eventfee)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat`,
        [req.params.id, season.seasonid, name, date, time, eventNumber, eventFee]
      );
      const row = inserted.rows[0] ?? null;
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        seasonId: season.seasonid,
        eventId: row?.eventid ?? null,
        actorId: req.userId,
        action: 'event_created',
        summary: 'League event was created.',
        details: { name, eventdate: date, eventtime: time, eventnumber: eventNumber, eventfee: eventFee },
      });
      await client.query('COMMIT');
      res.status(201).json({ event: row, events: row ? [row] : [] });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await createLeagueEventStubs(client, req.params.id, season.seasonid, eventNumber, eventCount);
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: season.seasonid,
      actorId: req.userId,
      action: 'events_created',
      summary: 'League events were created.',
      details: { startNumber: eventNumber, eventCount: rows.length },
    });
    await client.query('COMMIT');
    res.status(201).json({ event: rows[0] ?? null, events: rows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.patch('/:id/events/:eventId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { name?: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number | null; eventfee?: number | null };
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasDate = Object.prototype.hasOwnProperty.call(body, 'eventdate');
  const hasTime = Object.prototype.hasOwnProperty.call(body, 'eventtime');
  const hasNumber = Object.prototype.hasOwnProperty.call(body, 'eventnumber');
  const hasFee = Object.prototype.hasOwnProperty.call(body, 'eventfee');
  const name = hasName ? String(body.name ?? '').trim().slice(0, 160) : null;
  if (hasName && !name) {
    res.status(400).json({ error: 'Event name required.' });
    return;
  }
  const eventDate = hasDate && body.eventdate ? String(body.eventdate).slice(0, 10) : null;
  const eventTime = hasTime ? normalizeEventTime(body.eventtime) : null;
  const eventNumber = hasNumber && body.eventnumber != null ? Math.max(1, Math.round(Number(body.eventnumber) || 1)) : null;
  const eventFee = hasFee && body.eventfee != null ? Math.max(0, Math.round(Number(body.eventfee) * 100) / 100) : null;
  const existingEvent = await queryOne<LeagueEventRow>(
    `SELECT eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat
     FROM leagueevents
     WHERE leagueid = $1 AND eventid = $2 AND active = TRUE`,
    [req.params.id, req.params.eventId]
  );
  if (!existingEvent) {
    res.status(404).json({ error: 'League event not found.' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<LeagueEventRow>(
      `UPDATE leagueevents
       SET name = CASE WHEN $3 THEN $4 ELSE name END,
           eventdate = CASE WHEN $5 THEN $6::DATE ELSE eventdate END,
           eventtime = CASE WHEN $7 THEN $8 ELSE eventtime END,
           eventnumber = CASE WHEN $9 THEN $10::INT ELSE eventnumber END,
           eventfee = CASE WHEN $11 THEN $12::DECIMAL ELSE eventfee END
       WHERE leagueid = $1 AND eventid = $2 AND active = TRUE
       RETURNING eventid, leagueid, seasonid, name, eventdate, eventtime, eventnumber, CAST(eventfee AS DECIMAL) AS eventfee, active, createdat`,
      [
        req.params.id,
        req.params.eventId,
        hasName,
        name,
        hasDate,
        eventDate,
        hasTime,
        eventTime,
        hasNumber,
        eventNumber,
        hasFee,
        eventFee,
      ]
    );
    const row = updated.rows[0] ?? null;
    if (!row) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'League event not found.' });
      return;
    }
    await recordLeagueAudit(client, {
      leagueId: req.params.id,
      seasonId: row.seasonid,
      eventId: row.eventid,
      actorId: req.userId,
      action: 'event_updated',
      summary: 'League event was updated.',
      details: {
        previous: {
          name: existingEvent.name,
          eventdate: existingEvent.eventdate,
          eventtime: existingEvent.eventtime,
          eventnumber: existingEvent.eventnumber,
          eventfee: existingEvent.eventfee == null ? null : Number(existingEvent.eventfee),
        },
        current: {
          name: row.name,
          eventdate: row.eventdate,
          eventtime: row.eventtime,
          eventnumber: row.eventnumber,
          eventfee: row.eventfee == null ? null : Number(row.eventfee),
        },
      },
    });
    await client.query('COMMIT');
    res.json({ event: { ...row, eventfee: row.eventfee == null ? null : Number(row.eventfee) } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

async function upsertResult(req: Request, res: Response, targetUserId: string, allowSelfLog = false) {
  const leagueRow = await getLeagueForUser(req.params.id, req.userId!);
  if (!leagueRow) {
    res.status(404).json({ error: 'League not found.' });
    return;
  }
  const event = await queryOne<LeagueEventRow>(
    `SELECT eventid, leagueid, seasonid, CAST(eventfee AS DECIMAL) AS eventfee FROM leagueevents WHERE eventid = $1 AND leagueid = $2 AND active = TRUE`,
    [req.params.eventId, req.params.id]
  );
  if (!event) {
    res.status(404).json({ error: 'League event not found.' });
    return;
  }
  const isSelf = targetUserId === req.userId;
  if ((!allowSelfLog || !isSelf) && !await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  if (!event.seasonid || !await requireLeagueSeasonParticipant(req.params.id, event.seasonid, targetUserId)) {
    res.status(400).json({ error: 'Player is not active in this season.' });
    return;
  }

  const body = req.body as { placed?: number | null; dnf?: boolean };
  const dnf = Boolean(body.dnf);
  const placed = dnf ? null : Math.max(1, Math.round(Number(body.placed ?? 0)));
  if (!dnf && !placed) {
    res.status(400).json({ error: 'Place required.' });
    return;
  }
  if (!dnf) {
    const finishPlace = placed ?? 0;
    const participantCount = await getLeagueSeasonParticipantCount(req.params.id, event.seasonid);
    if (finishPlace > participantCount) {
      res.status(400).json({ error: `Place must be between 1 and ${participantCount}.` });
      return;
    }
    const existingPlacement = await queryOne<{ userid: string }>(
      `SELECT userid
       FROM leagueresults
       WHERE eventid = $1
         AND leagueid = $2
         AND placed = $3
         AND COALESCE(dnf, FALSE) = FALSE
         AND userid <> $4
       LIMIT 1`,
      [event.eventid, req.params.id, finishPlace, targetUserId]
    );
    if (existingPlacement) {
      res.status(409).json({ error: `Place ${placed} is already assigned.` });
      return;
    }
  }
  const pointsLookup = normalizePointsLookup(leagueRow.pointslookup);
  const points = pointsForPlace(pointsLookup, placed, dnf);
  const showupBonus = dnf ? 0 : Math.max(0, Number(leagueRow.showupbonuspoints || 0));
  const previousResult = await queryOne<LeagueResultRow>(
    `SELECT resultid, eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby, createdat, updatedat
     FROM leagueresults
     WHERE eventid = $1 AND leagueid = $2 AND userid = $3
     LIMIT 1`,
    [event.eventid, req.params.id, targetUserId]
  );

  const client = await pool.connect();
  let row: LeagueResultRow | null = null;
  try {
    await client.query('BEGIN');
    const inserted = await client.query<LeagueResultRow>(
      `INSERT INTO leagueresults (eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (eventid, userid) DO UPDATE
       SET placed = $4,
           dnf = $5,
           points = $6,
           showupbonuspoints = $7,
           loggedby = $8,
           updatedat = now()
       RETURNING resultid, eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby, createdat, updatedat`,
      [event.eventid, req.params.id, targetUserId, placed, dnf, points, showupBonus, req.userId]
    );
    row = inserted.rows[0] ?? null;
    const previous = previousResult
      ? {
          placed: previousResult.placed == null ? null : Number(previousResult.placed),
          dnf: Boolean(previousResult.dnf),
          points: Number(previousResult.points || 0),
          showupbonuspoints: Number(previousResult.showupbonuspoints || 0),
        }
      : null;
    const current = {
      placed: row?.placed == null ? null : Number(row.placed),
      dnf: Boolean(row?.dnf),
      points: Number(row?.points || 0),
      showupbonuspoints: Number(row?.showupbonuspoints || 0),
    };
    const changed = !previous
      || previous.placed !== current.placed
      || previous.dnf !== current.dnf
      || previous.points !== current.points
      || previous.showupbonuspoints !== current.showupbonuspoints;
    if (changed) {
      await recordLeagueAudit(client, {
        leagueId: req.params.id,
        seasonId: event.seasonid,
        eventId: event.eventid,
        actorId: req.userId,
        targetUserId,
        action: dnf ? (previous ? 'dnf_updated' : 'dnf_logged') : (previous ? 'placement_updated' : 'placement_logged'),
        summary: dnf ? 'Player was marked DNF.' : 'Player placement was logged.',
        details: {
          previous,
          current,
          resultid: row?.resultid,
        },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  void sendLeagueNotification(req.params.id, 'league_standings_updated', {
    entityId: event.eventid,
    tag: `league-${req.params.id}-standings-${event.eventid}`,
  }, {
    entityId: event.eventid,
    dedupe: false,
  }).catch((err) => {
    console.error('League standings push failed', err instanceof Error ? err.message : err);
  });
  res.json({ result: row });
}

leaguesRouter.put('/:id/events/:eventId/results/:userId', async (req: Request, res: Response) => {
  await upsertResult(req, res, req.params.userId);
});

leaguesRouter.put('/:id/events/:eventId/self-result', async (req: Request, res: Response) => {
  await upsertResult(req, res, req.userId!, true);
});
