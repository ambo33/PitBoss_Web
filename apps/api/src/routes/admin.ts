import { Router, Request, Response } from 'express';
import { getAccountProfile, requireSuperAdmin, sqlCanUseClubFeatures, sqlResolveTierId, sqlResolveTierKey } from '../account';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';
import { hashEmail, normalizeEmail, publicEmail } from '../privacy';

export const adminRouter = Router();
adminRouter.use(requireAuth);

adminRouter.use(async (req: Request, res: Response, next) => {
  if (!await requireSuperAdmin(req.userId!)) {
    res.status(403).json({ error: 'Admins only' });
    return;
  }
  next();
});

adminRouter.get('/users', async (req: Request, res: Response) => {
  const emailSearch = typeof req.query.email === 'string' ? normalizeEmail(req.query.email) : '';
  const emailHash = emailSearch ? hashEmail(emailSearch) : null;
  const rows = await query<{
    userid: string;
    emailaddress: string | null;
    emailencrypted: string | null;
    displayname: string;
    [key: string]: unknown;
  }>(
    `SELECT u.guid AS userid,
            u.emailaddress,
            u.emailencrypted,
            COALESCE(um.nickname, NULLIF(trim(concat(coalesce(um.firstname, ''), ' ', coalesce(um.lastname, ''))), ''), u.emailaddress) AS displayname,
            ${sqlResolveTierId('um')} AS tierid,
            ${sqlResolveTierKey('um')} AS accounttier,
            COALESCE(um.issuperadmin, FALSE) AS issuperadmin,
            COALESCE(CAST(um.hostedtournamentcount AS INT), 0) AS hostedtournamentcount,
            GREATEST(2 - COALESCE(CAST(um.hostedtournamentcount AS INT), 0), 0) AS trialhostedremaining,
            CASE
              WHEN ${sqlResolveTierId('um')} = 1 AND COALESCE(CAST(um.hostedtournamentcount AS INT), 0) < 2 THEN TRUE
              ELSE FALSE
            END AS trialactive,
            ${sqlCanUseClubFeatures('um')} AS canuseclubfeatures,
            (
              SELECT count(*)
              FROM groupmembers gm
              JOIN groups g ON g.groupid = gm.groupid
              WHERE gm.userid = u.guid
                AND gm.approved = TRUE
                AND g.active = TRUE
            ) AS groupcount,
            (
              SELECT count(*)
              FROM groupmembers gm
              JOIN groups g ON g.groupid = gm.groupid
              WHERE gm.userid = u.guid
                AND gm.admin = TRUE
                AND gm.approved = TRUE
                AND g.active = TRUE
            ) AS hostedgroupcount,
            (
              SELECT count(*)
              FROM tournaments t
              WHERE t.userid = u.guid
                AND t.date IS NOT NULL
                AND concat(
                  CAST(t.date AS STRING),
                  'T',
                  CASE
                    WHEN t.time IS NULL THEN '23:59:59'
                    ELSE substring(CAST(t.time AS STRING), 1, 8)
                  END
                ) >= $1
            ) AS upcominghostedcount,
            (
              SELECT count(*)
              FROM tournaments t
              WHERE t.userid = u.guid
            ) AS totalhostedcount
     FROM users u
     LEFT JOIN usermetadata um ON um.userid = u.guid
     LEFT JOIN accounttiers at ON at.tierid = ${sqlResolveTierId('um')}
     WHERE $2::STRING IS NULL OR u.emailhash = $2
     ORDER BY u.emailaddress`,
    [nowInAppTimezone(), emailHash]
  );
  res.json(rows.map((row) => {
    const decryptedEmail = publicEmail(row.emailencrypted, row.emailaddress);
    const emailaddress = decryptedEmail || (emailHash ? emailSearch : '');
    return {
      ...row,
      emailaddress,
      displayname: row.displayname === row.emailaddress ? emailaddress : row.displayname,
    };
  }));
});

adminRouter.get('/users/:id', async (req: Request, res: Response) => {
  const account = await getAccountProfile(req.params.id);
  if (!account) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const groups = await query(
    `SELECT g.groupid, g.name, g.invitecode, g.active, gm.admin AS isadmin, gm.approved,
            (SELECT count(*) FROM groupmembers gm2 WHERE gm2.groupid = g.groupid AND gm2.approved = TRUE) AS membercount
     FROM groupmembers gm
     JOIN groups g ON g.groupid = gm.groupid
     WHERE gm.userid = $1
     ORDER BY g.createdate DESC`,
    [req.params.id]
  );

  const tournaments = await query(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, t.rebuycost AS rebuyprice, t.addoncost AS addonprice, t.maxplayers,
            t.createdate AS createdat, t.userid = $1 AS isowner,
            t.groupid, g.name AS groupname, TRUE AS canmanage,
            EXISTS(SELECT 1 FROM tournamentplayers tp WHERE tp.tournamentid = t.tournamentid AND tp.userid = $1) AS isregistered,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.userid = $1
        OR EXISTS(SELECT 1 FROM tournamentplayers tp WHERE tp.tournamentid = t.tournamentid AND tp.userid = $1)
     ORDER BY t.createdate DESC`,
    [req.params.id]
  );

  res.json({ account, groups, tournaments });
});

adminRouter.put('/users/:id', async (req: Request, res: Response) => {
  const { tierid, issuperadmin } = req.body as { tierid?: number; issuperadmin?: boolean };
  if (tierid != null && ![1, 2, 3].includes(Number(tierid))) {
    res.status(400).json({ error: 'Invalid account tier' });
    return;
  }

  await query(
    `INSERT INTO usermetadata (userid, tierid, issuperadmin)
     VALUES ($1, COALESCE($2, 1), COALESCE($3, FALSE))
     ON CONFLICT (userid)
     DO UPDATE SET
       tierid = COALESCE($2, usermetadata.tierid),
       issuperadmin = COALESCE($3, usermetadata.issuperadmin)`,
    [req.params.id, tierid ?? null, issuperadmin ?? null]
  );

  const account = await getAccountProfile(req.params.id);
  res.json({ success: true, account });
});

function nowInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
