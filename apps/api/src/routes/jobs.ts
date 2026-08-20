import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import {
  sendEventRecapEmail,
  sendEventLobbyReminderEmail,
  sendEventTodayReminderEmail,
  sendLeagueEventReminderEmail,
  sendRsvpReminderEmail,
  sendTournamentReminderEmail,
} from '../services/email';
import { publicEmail } from '../privacy';
import { sendLeagueNotification, sendTournamentNotification } from '../lib/server/notifications/notificationService';

export const jobsRouter = Router();

function isAuthorized(req: Request) {
  const secret = process.env.JOB_SECRET;
  if (!secret) return false;
  return req.header('x-job-secret') === secret || req.query.secret === secret;
}

function easternDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

type EasternClock = {
  date: string;
  hour: number;
  minute: number;
};

type ReminderRecipient = {
  entityid: string;
  userid: string;
  emailaddress: string | null;
  emailencrypted: string | null;
  name: string;
  containername: string;
  eventdate: string | null;
  eventtime: string | null;
  url: string;
};

function easternClock(date = new Date()): EasternClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
    minute: Number(part('minute')),
  };
}

function easternDateOffset(days: number, now = new Date()): string {
  const current = easternClock(now).date;
  const target = new Date(`${current}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

function eventWhen(date: string | null, time: string | null): string {
  const cleanDate = date?.slice(0, 10) ?? 'Date TBD';
  const rawTime = time?.slice(0, 5) ?? '';
  if (!rawTime) return cleanDate;
  const [hour, minute] = rawTime.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${cleanDate} at ${hour % 12 || 12}:${String(minute || 0).padStart(2, '0')} ${suffix}`;
}

function easternEventStart(date: string | null, time: string | null): Date | null {
  if (!date || !time) return null;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  }).formatToParts(localAsUtc);
  const offsetName = offsetParts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';
  const offsetMatch = offsetName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = offsetMatch
    ? (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] ?? 0)) * (offsetMatch[1] === '+' ? 1 : -1)
    : -300;
  return new Date(localAsUtc.getTime() - offsetMinutes * 60_000);
}

async function claimEmailDelivery(entityType: string, entityId: string, userId: string, deliveryType: string) {
  const row = await queryOne<{ deliveryid: string }>(
    `INSERT INTO scheduleddeliveries (entitytype, entityid, userid, deliverytype, channel, status, updatedat)
     VALUES ($1, $2, $3, $4, 'email', 'pending', now())
     ON CONFLICT (entitytype, entityid, userid, deliverytype, channel)
     DO UPDATE SET status = 'pending', error = NULL, updatedat = now()
       WHERE scheduleddeliveries.status = 'failed'
     RETURNING deliveryid`,
    [entityType, entityId, userId, deliveryType]
  );
  return row?.deliveryid ?? null;
}

async function completeEmailDelivery(deliveryId: string, error?: unknown) {
  const message = error instanceof Error ? error.message : error ? String(error) : null;
  await query(
    `UPDATE scheduleddeliveries
     SET status = $2,
         error = $3,
         sentat = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END,
         updatedat = now()
     WHERE deliveryid = $1`,
    [deliveryId, message ? 'failed' : 'sent', message?.slice(0, 500) ?? null]
  );
}

async function deliverReminderEmails(
  entityType: 'tournament' | 'league_event',
  deliveryType: string,
  recipients: ReminderRecipient[],
  kind: 'tournament' | 'league',
  mode: 'rsvp' | 'attending' | 'one_hour'
) {
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    const email = publicEmail(recipient.emailencrypted, recipient.emailaddress);
    if (!email) return 'skipped';
    const deliveryId = await claimEmailDelivery(entityType, recipient.entityid, recipient.userid, deliveryType);
    if (!deliveryId) return 'duplicate';
    try {
      if (mode === 'rsvp') {
        await sendRsvpReminderEmail(email, {
          kind,
          name: recipient.name,
          groupOrLeagueName: recipient.containername,
          when: eventWhen(recipient.eventdate, recipient.eventtime),
          url: recipient.url,
        });
      } else if (mode === 'attending') {
        await sendEventTodayReminderEmail(email, {
          kind,
          name: recipient.name,
          when: eventWhen(recipient.eventdate, recipient.eventtime),
          url: recipient.url,
        });
      } else {
        await sendEventLobbyReminderEmail(email, {
          kind,
          name: recipient.name,
          when: eventWhen(recipient.eventdate, recipient.eventtime),
          url: recipient.url,
        });
      }
      await completeEmailDelivery(deliveryId);
      return 'sent';
    } catch (error) {
      await completeEmailDelivery(deliveryId, error);
      throw error;
    }
  }));
  return {
    checked: recipients.length,
    sent: results.filter((result) => result.status === 'fulfilled' && result.value === 'sent').length,
  };
}

jobsRouter.post('/tournament-reminders', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rows = await query<{
    tournamentid: string;
    name: string;
    tourneydate: string | null;
    tourneytime: string | null;
    userid: string;
    emailaddress: string | null;
    emailencrypted: string | null;
  }>(
    `SELECT t.tournamentid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            tp.userid, u.emailaddress, u.emailencrypted
     FROM tournaments t
     JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata um ON um.userid = tp.userid
     LEFT JOIN groupmembers gm ON gm.groupid = t.groupid AND gm.userid = tp.userid
     LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = tp.userid
     WHERE t.date IS NOT NULL
       AND COALESCE(tp.reminderemailsentat, NULL) IS NULL
       AND td.userid IS NULL
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
       AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE
       AND u.emailencrypted IS NOT NULL
       AND ((t.date::STRING || ' ' || COALESCE(t.time::STRING, '00:00:00'))::TIMESTAMP)
           BETWEEN now() AND now() + INTERVAL '26 hours'
     ORDER BY t.date, t.time`
  );

  const results = await Promise.allSettled(
    rows.map((row) => {
      const email = publicEmail(row.emailencrypted, row.emailaddress);
      if (!email) return Promise.resolve();
      return sendTournamentReminderEmail(
        email,
        row.tournamentid,
        row.name,
        row.tourneydate,
        row.tourneytime
      ).then(async () => {
        await query(
          `UPDATE tournamentplayers
           SET reminderemailsentat = now()
           WHERE tournamentid = $1 AND userid = $2`,
          [row.tournamentid, row.userid]
        );
      });
    })
  );

  const sent = results.filter((result) => result.status === 'fulfilled').length;
  res.json({ checked: rows.length, sent });
});

jobsRouter.post('/daily-reminders', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const targetDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : easternDateString();

  const tournamentEmailRows = await query<{
    tournamentid: string;
    name: string;
    tourneydate: string | null;
    tourneytime: string | null;
    userid: string;
    emailaddress: string | null;
    emailencrypted: string | null;
  }>(
    `SELECT t.tournamentid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            tp.userid, u.emailaddress, u.emailencrypted
     FROM tournaments t
     JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata um ON um.userid = tp.userid
     LEFT JOIN groupmembers gm ON gm.groupid = t.groupid AND gm.userid = tp.userid
     LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = tp.userid
     WHERE t.date = $1
       AND tp.reminderemailsentat IS NULL
       AND td.userid IS NULL
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
       AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE
       AND u.emailencrypted IS NOT NULL
     ORDER BY t.time, t.name`,
    [targetDate]
  );

  const tournamentEmailResults = await Promise.allSettled(
    tournamentEmailRows.map((row) => {
      const email = publicEmail(row.emailencrypted, row.emailaddress);
      if (!email) return Promise.resolve();
      return sendTournamentReminderEmail(email, row.tournamentid, row.name, row.tourneydate, row.tourneytime)
        .then(async () => {
          await query(
            `UPDATE tournamentplayers
             SET reminderemailsentat = now()
             WHERE tournamentid = $1 AND userid = $2`,
            [row.tournamentid, row.userid]
          );
        });
    })
  );

  const tournamentPushRows = await query<{
    tournamentid: string;
    name: string;
    tourneytime: string | null;
  }>(
    `SELECT DISTINCT t.tournamentid, t.name, t.time AS tourneytime
     FROM tournaments t
     JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid
     LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = tp.userid
     WHERE t.date = $1
       AND tp.reminderpushsentat IS NULL
       AND td.userid IS NULL`,
    [targetDate]
  );

  const tournamentPushResults = await Promise.allSettled(
    tournamentPushRows.map(async (row) => {
      const rawTime = row.tourneytime ? row.tourneytime.slice(0, 5) : '';
      const body = rawTime ? `${row.name} starts today at ${rawTime}.` : `${row.name} starts today.`;
      const sent = await sendTournamentNotification(row.tournamentid, 'tournament_starting_soon', {
        tournamentName: row.name,
        title: 'Tournament reminder',
        body,
        tag: `tournament-${row.tournamentid}-daily-reminder`,
        url: `/lobby/${row.tournamentid}`,
      });
      if (sent.sent > 0) {
        await query(
          `UPDATE tournamentplayers
           SET reminderpushsentat = now()
           WHERE tournamentid = $1`,
          [row.tournamentid]
        );
      }
    })
  );

  const leagueEmailRows = await query<{
    leagueid: string;
    leaguename: string;
    eventid: string;
    eventname: string;
    eventdate: string | null;
    userid: string;
    emailaddress: string | null;
    emailencrypted: string | null;
  }>(
    `SELECT l.leagueid, l.name AS leaguename, e.eventid, e.name AS eventname, e.eventdate,
            lm.userid, u.emailaddress, u.emailencrypted
     FROM leagueevents e
     JOIN leagues l ON l.leagueid = e.leagueid
     JOIN leaguemembers lm ON lm.leagueid = e.leagueid
     JOIN leagueseasonparticipants lsp
       ON lsp.leagueid = e.leagueid
      AND lsp.seasonid = e.seasonid
      AND lsp.userid = lm.userid
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata um ON um.userid = u.guid
     LEFT JOIN leagueeventreminders ler ON ler.eventid = e.eventid AND ler.userid = lm.userid
     WHERE e.eventdate = $1
       AND COALESCE(e.active, TRUE) = TRUE
       AND COALESCE(l.active, TRUE) = TRUE
       AND COALESCE(lm.approved, TRUE) = TRUE
       AND COALESCE(lsp.participating, TRUE) = TRUE
       AND COALESCE(lm.emailalertsenabled, TRUE) = TRUE
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
       AND ler.emailsentat IS NULL
       AND u.emailencrypted IS NOT NULL
     ORDER BY e.eventdate, e.eventnumber, e.name`,
    [targetDate]
  );

  const leagueEmailResults = await Promise.allSettled(
    leagueEmailRows.map((row) => {
      const email = publicEmail(row.emailencrypted, row.emailaddress);
      if (!email) return Promise.resolve();
      return sendLeagueEventReminderEmail(email, row.leagueid, row.leaguename, row.eventname, row.eventdate, row.eventid)
        .then(async () => {
          await query(
            `INSERT INTO leagueeventreminders (eventid, userid, emailsentat)
             VALUES ($1, $2, now())
             ON CONFLICT (eventid, userid)
             DO UPDATE SET emailsentat = now()`,
            [row.eventid, row.userid]
          );
        });
    })
  );

  const leaguePushRows = await query<{
    leagueid: string;
    leaguename: string;
    eventid: string;
    eventname: string;
  }>(
    `SELECT DISTINCT l.leagueid, l.name AS leaguename, e.eventid, e.name AS eventname
     FROM leagueevents e
     JOIN leagues l ON l.leagueid = e.leagueid
     JOIN leaguemembers lm ON lm.leagueid = e.leagueid
     JOIN leagueseasonparticipants lsp
       ON lsp.leagueid = e.leagueid
      AND lsp.seasonid = e.seasonid
      AND lsp.userid = lm.userid
     LEFT JOIN leagueeventreminders ler ON ler.eventid = e.eventid AND ler.userid = lm.userid
     WHERE e.eventdate = $1
       AND COALESCE(e.active, TRUE) = TRUE
       AND COALESCE(l.active, TRUE) = TRUE
       AND COALESCE(lm.approved, TRUE) = TRUE
       AND COALESCE(lsp.participating, TRUE) = TRUE
       AND COALESCE(lm.pushalertsenabled, TRUE) = TRUE
       AND ler.pushsentat IS NULL`,
    [targetDate]
  );

  const leaguePushResults = await Promise.allSettled(
    leaguePushRows.map(async (row) => {
      const sent = await sendLeagueNotification(row.leagueid, 'season_milestone', {
        message: `${row.eventname} starts today. Tap when you are knocked out to log your finish.`,
        url: `/league/${row.leagueid}/event/${row.eventid}`,
        tag: `league-${row.leagueid}-event-${row.eventid}-daily-reminder`,
        entityId: row.eventid,
      });
      if (sent.sent > 0) {
        await query(
          `INSERT INTO leagueeventreminders (eventid, userid, pushsentat)
           SELECT $1, lm.userid, now()
           FROM leaguemembers lm
           JOIN leagueevents e ON e.leagueid = lm.leagueid AND e.eventid = $1
           JOIN leagueseasonparticipants lsp
             ON lsp.leagueid = lm.leagueid
            AND lsp.seasonid = e.seasonid
            AND lsp.userid = lm.userid
           WHERE lm.leagueid = $2
             AND COALESCE(lm.approved, TRUE) = TRUE
             AND COALESCE(lsp.participating, TRUE) = TRUE
           ON CONFLICT (eventid, userid)
           DO UPDATE SET pushsentat = now()`,
          [row.eventid, row.leagueid]
        );
      }
    })
  );

  res.json({
    date: targetDate,
    tournaments: {
      emailChecked: tournamentEmailRows.length,
      emailSent: tournamentEmailResults.filter((result) => result.status === 'fulfilled').length,
      pushChecked: tournamentPushRows.length,
      pushSentBatches: tournamentPushResults.filter((result) => result.status === 'fulfilled').length,
    },
    leagues: {
      emailChecked: leagueEmailRows.length,
      emailSent: leagueEmailResults.filter((result) => result.status === 'fulfilled').length,
      pushChecked: leaguePushRows.length,
      pushSentBatches: leaguePushResults.filter((result) => result.status === 'fulfilled').length,
    },
  });
});

async function tournamentReminderRecipients(targetDate: string, audience: 'unresponsive' | 'going') {
  return query<ReminderRecipient>(
    `SELECT t.tournamentid AS entityid,
            gm.userid,
            u.emailaddress,
            u.emailencrypted,
            t.name,
            g.name AS containername,
            t.date::STRING AS eventdate,
            t.time::STRING AS eventtime,
            '/lobby/' || t.tournamentid::STRING AS url
     FROM tournaments t
     JOIN groups g ON g.groupid = t.groupid
     JOIN groupmembers gm ON gm.groupid = t.groupid
     JOIN users u ON u.guid = gm.userid
     LEFT JOIN usermetadata um ON um.userid = gm.userid
     LEFT JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid AND tp.userid = gm.userid
     LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = gm.userid
     WHERE t.date = $1
       AND COALESCE(t.active, TRUE) = TRUE
       AND COALESCE(gm.approved, TRUE) = TRUE
       AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
       AND u.emailencrypted IS NOT NULL
       AND td.userid IS NULL
       AND ${audience === 'unresponsive' ? 'tp.userid IS NULL' : 'tp.userid IS NOT NULL'}`,
    [targetDate]
  );
}

async function leagueReminderRecipients(targetDate: string, audience: 'unresponsive' | 'going') {
  return query<ReminderRecipient>(
    `SELECT e.eventid AS entityid,
            lm.userid,
            u.emailaddress,
            u.emailencrypted,
            e.name,
            l.name AS containername,
            e.eventdate::STRING AS eventdate,
            e.eventtime::STRING AS eventtime,
            '/league/' || e.leagueid::STRING || '/event/' || e.eventid::STRING AS url
     FROM leagueevents e
     JOIN leagues l ON l.leagueid = e.leagueid
     JOIN leagueseasonparticipants lsp
       ON lsp.leagueid = e.leagueid
      AND lsp.seasonid = e.seasonid
      AND COALESCE(lsp.participating, TRUE) = TRUE
     JOIN leaguemembers lm ON lm.leagueid = lsp.leagueid AND lm.userid = lsp.userid
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata um ON um.userid = lm.userid
     LEFT JOIN leagueeventrsvps rsvp
       ON rsvp.eventid = e.eventid
      AND rsvp.leagueid = e.leagueid
      AND rsvp.userid = lm.userid
     WHERE e.eventdate = $1
       AND COALESCE(e.active, TRUE) = TRUE
       AND COALESCE(l.active, TRUE) = TRUE
       AND COALESCE(lm.approved, TRUE) = TRUE
       AND COALESCE(lm.emailalertsenabled, TRUE) = TRUE
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
       AND u.emailencrypted IS NOT NULL
       AND ${audience === 'unresponsive' ? 'rsvp.rsvpid IS NULL' : "rsvp.status = 'going'"}`,
    [targetDate]
  );
}

async function sendScheduledRecaps() {
  const tournamentRows = await query<{ entityid: string; name: string; containername: string }>(
    `SELECT t.tournamentid AS entityid, t.name, COALESCE(g.name, 'Your group') AS containername
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.date >= (current_date - 30)::DATE
       AND EXISTS (
         SELECT 1 FROM tournamentplayers winner
         WHERE winner.tournamentid = t.tournamentid AND winner.placed = 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM tournamentplayers incomplete
         WHERE incomplete.tournamentid = t.tournamentid
           AND (COALESCE(incomplete.checkedin, FALSE) = TRUE OR incomplete.placed IS NOT NULL)
           AND incomplete.placed IS NULL
       )`
  );

  const leagueRows = await query<{ entityid: string; leagueid: string; name: string; containername: string; seasonid: string }>(
    `SELECT e.eventid AS entityid, e.leagueid, e.name, l.name AS containername, e.seasonid
     FROM leagueevents e
     JOIN leagues l ON l.leagueid = e.leagueid
     WHERE e.eventdate >= (current_date - 30)::DATE
       AND EXISTS (
         SELECT 1 FROM leagueresults winner
         WHERE winner.eventid = e.eventid AND winner.placed = 1 AND COALESCE(winner.dnf, FALSE) = FALSE
       )
       AND NOT EXISTS (
         SELECT 1
         FROM leagueeventrsvps rsvp
         JOIN leagueseasonparticipants lsp
           ON lsp.leagueid = rsvp.leagueid
          AND lsp.seasonid = e.seasonid
          AND lsp.userid = rsvp.userid
          AND COALESCE(lsp.participating, TRUE) = TRUE
         LEFT JOIN leagueresults result ON result.eventid = rsvp.eventid AND result.userid = rsvp.userid
         WHERE rsvp.eventid = e.eventid
           AND rsvp.status = 'going'
           AND result.resultid IS NULL
       )`
  );

  let tournamentSent = 0;
  for (const tournament of tournamentRows) {
    const [recipients, placements] = await Promise.all([
      query<{ userid: string; emailaddress: string | null; emailencrypted: string | null }>(
        `SELECT tp.userid, u.emailaddress, u.emailencrypted
         FROM tournamentplayers tp
         JOIN users u ON u.guid = tp.userid
         LEFT JOIN groupmembers gm ON gm.groupid = (SELECT groupid FROM tournaments WHERE tournamentid = tp.tournamentid) AND gm.userid = tp.userid
         LEFT JOIN usermetadata um ON um.userid = tp.userid
         LEFT JOIN tournamentdeclines td ON td.tournamentid = tp.tournamentid AND td.userid = tp.userid
         WHERE tp.tournamentid = $1
           AND td.userid IS NULL
           AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE
           AND COALESCE(um.isguestuser, FALSE) = FALSE
           AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
           AND u.emailencrypted IS NOT NULL`,
        [tournament.entityid]
      ),
      query<{ place: number; playername: string }>(
        `SELECT CAST(tp.placed AS INT) AS place,
                COALESCE(NULLIF(trim(um.nickname), ''), NULLIF(trim(um.fullname), ''), 'Player') AS playername
         FROM tournamentplayers tp
         LEFT JOIN usermetadata um ON um.userid = tp.userid
         WHERE tp.tournamentid = $1 AND tp.placed IS NOT NULL
         ORDER BY tp.placed ASC`,
        [tournament.entityid]
      ),
    ]);
    const delivered = await Promise.allSettled(recipients.map(async (recipient) => {
      const email = publicEmail(recipient.emailencrypted, recipient.emailaddress);
      if (!email) return false;
      const deliveryId = await claimEmailDelivery('tournament', tournament.entityid, recipient.userid, 'event_recap');
      if (!deliveryId) return false;
      try {
        await sendEventRecapEmail(email, {
          kind: 'tournament',
          name: tournament.name,
          groupOrLeagueName: tournament.containername,
          placements: placements.map((placement) => ({
            place: placement.place,
            playerName: placement.playername,
          })),
          url: `/?section=upcoming&tournament=${encodeURIComponent(tournament.entityid)}`,
        });
        await completeEmailDelivery(deliveryId);
        return true;
      } catch (error) {
        await completeEmailDelivery(deliveryId, error);
        throw error;
      }
    }));
    tournamentSent += delivered.filter((result) => result.status === 'fulfilled' && result.value).length;
  }

  let leagueSent = 0;
  for (const event of leagueRows) {
    const [recipients, placements] = await Promise.all([
      query<{ userid: string; emailaddress: string | null; emailencrypted: string | null }>(
        `SELECT lm.userid, u.emailaddress, u.emailencrypted
         FROM leagueseasonparticipants lsp
         JOIN leaguemembers lm ON lm.leagueid = lsp.leagueid AND lm.userid = lsp.userid
         JOIN users u ON u.guid = lm.userid
         LEFT JOIN usermetadata um ON um.userid = lm.userid
         WHERE lsp.leagueid = $1
           AND lsp.seasonid = $2
           AND COALESCE(lsp.participating, TRUE) = TRUE
           AND COALESCE(lm.approved, TRUE) = TRUE
           AND COALESCE(lm.emailalertsenabled, TRUE) = TRUE
           AND COALESCE(um.isguestuser, FALSE) = FALSE
           AND COALESCE(um.emailalertsenabled, TRUE) = TRUE
           AND u.emailencrypted IS NOT NULL`,
        [event.leagueid, event.seasonid]
      ),
      query<{ place: number; playername: string; points: number }>(
        `SELECT CAST(result.placed AS INT) AS place,
                COALESCE(NULLIF(trim(um.nickname), ''), NULLIF(trim(um.fullname), ''), 'Player') AS playername,
                CAST(result.points AS DECIMAL) AS points
         FROM leagueresults result
         LEFT JOIN usermetadata um ON um.userid = result.userid
         WHERE result.eventid = $1
           AND result.placed IS NOT NULL
           AND COALESCE(result.dnf, FALSE) = FALSE
         ORDER BY result.placed ASC`,
        [event.entityid]
      ),
    ]);
    const delivered = await Promise.allSettled(recipients.map(async (recipient) => {
      const email = publicEmail(recipient.emailencrypted, recipient.emailaddress);
      if (!email) return false;
      const deliveryId = await claimEmailDelivery('league_event', event.entityid, recipient.userid, 'event_recap');
      if (!deliveryId) return false;
      try {
        await sendEventRecapEmail(email, {
          kind: 'league',
          name: event.name,
          groupOrLeagueName: event.containername,
          placements: placements.map((placement) => ({
            place: placement.place,
            playerName: placement.playername,
            points: placement.points,
          })),
          url: `/league/${encodeURIComponent(event.leagueid)}/event/${encodeURIComponent(event.entityid)}`,
        });
        await completeEmailDelivery(deliveryId);
        return true;
      } catch (error) {
        await completeEmailDelivery(deliveryId, error);
        throw error;
      }
    }));
    leagueSent += delivered.filter((result) => result.status === 'fulfilled' && result.value).length;
  }
  return { tournamentSent, leagueSent };
}

jobsRouter.post('/hourly-event-notifications', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const now = new Date();
  const eastern = easternClock(now);
  const today = eastern.date;
  const fortyEightHourDate = easternDateOffset(2, now);
  const summary = {
    rsvp48Hours: { tournaments: 0, leagues: 0 },
    rsvpToday: { tournaments: 0, leagues: 0 },
    attendeeToday: { tournaments: 0, leagues: 0 },
    oneHour: { tournaments: 0, leagues: 0 },
    recaps: { tournaments: 0, leagues: 0 },
  };

  if (eastern.hour === 8 && eastern.minute < 15) {
    const [tournamentFortyEight, leagueFortyEight, tournamentToday, leagueToday, tournamentAttending, leagueAttending] = await Promise.all([
      tournamentReminderRecipients(fortyEightHourDate, 'unresponsive'),
      leagueReminderRecipients(fortyEightHourDate, 'unresponsive'),
      tournamentReminderRecipients(today, 'unresponsive'),
      leagueReminderRecipients(today, 'unresponsive'),
      tournamentReminderRecipients(today, 'going'),
      leagueReminderRecipients(today, 'going'),
    ]);
    const results = await Promise.all([
      deliverReminderEmails('tournament', 'rsvp_48_hours', tournamentFortyEight, 'tournament', 'rsvp'),
      deliverReminderEmails('league_event', 'rsvp_48_hours', leagueFortyEight, 'league', 'rsvp'),
      deliverReminderEmails('tournament', 'rsvp_day_of', tournamentToday, 'tournament', 'rsvp'),
      deliverReminderEmails('league_event', 'rsvp_day_of', leagueToday, 'league', 'rsvp'),
      deliverReminderEmails('tournament', 'attendee_day_of', tournamentAttending, 'tournament', 'attending'),
      deliverReminderEmails('league_event', 'attendee_day_of', leagueAttending, 'league', 'attending'),
    ]);
    summary.rsvp48Hours = { tournaments: results[0].sent, leagues: results[1].sent };
    summary.rsvpToday = { tournaments: results[2].sent, leagues: results[3].sent };
    summary.attendeeToday = { tournaments: results[4].sent, leagues: results[5].sent };
  }

  const [tournamentSoon, leagueSoon] = await Promise.all([
    tournamentReminderRecipients(today, 'going'),
    leagueReminderRecipients(today, 'going'),
  ]);
  const inOneHourWindow = (recipient: ReminderRecipient) => {
    const start = easternEventStart(recipient.eventdate, recipient.eventtime);
    if (!start) return false;
    const minutesUntil = (start.getTime() - now.getTime()) / 60_000;
    return minutesUntil >= 45 && minutesUntil <= 75;
  };
  const oneHourResults = await Promise.all([
    deliverReminderEmails('tournament', 'attendee_one_hour', tournamentSoon.filter(inOneHourWindow), 'tournament', 'one_hour'),
    deliverReminderEmails('league_event', 'attendee_one_hour', leagueSoon.filter(inOneHourWindow), 'league', 'one_hour'),
  ]);
  summary.oneHour = { tournaments: oneHourResults[0].sent, leagues: oneHourResults[1].sent };

  const recaps = await sendScheduledRecaps();
  summary.recaps = { tournaments: recaps.tournamentSent, leagues: recaps.leagueSent };

  res.json({ easternTime: eastern, ...summary });
});
