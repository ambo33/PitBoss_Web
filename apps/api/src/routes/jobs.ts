import { Router, Request, Response } from 'express';
import { query } from '../db';
import { sendTournamentReminderEmail } from '../services/email';
import { publicEmail } from '../privacy';

export const jobsRouter = Router();

function isAuthorized(req: Request) {
  const secret = process.env.JOB_SECRET;
  if (!secret) return false;
  return req.header('x-job-secret') === secret || req.query.secret === secret;
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
     WHERE t.date IS NOT NULL
       AND COALESCE(tp.reminderemailsentat, NULL) IS NULL
       AND COALESCE(um.isguestuser, FALSE) = FALSE
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
