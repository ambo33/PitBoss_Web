import { Router, Request, Response } from 'express';
import { query } from '../db';
import { sendLeagueEventReminderEmail, sendTournamentReminderEmail } from '../services/email';
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
