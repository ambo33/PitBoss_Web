import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { getAccountProfile, getUpcomingHostedTournamentCount, incrementHostedTournamentCount, requireSuperAdmin } from '../account';
import { requireAuth } from '../middleware/auth';
import { isFeatureEnabled } from '../features';
import { hasTournamentStarted } from '../schedule';
import { sendTournamentCancelledEmail, sendTournamentPostedEmail } from '../services/email';
import { broadcastTournamentUpdate } from '../socket';
import { BlindLevel, Tournament } from '../types';
import { publicEmail } from '../privacy';

export const tournamentsRouter = Router();
tournamentsRouter.use(requireAuth);

function generateTvCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createUniqueTvCode(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = generateTvCode();
    const existing = await queryOne<{ tournamentid: string }>(
      `SELECT tournamentid FROM tournaments WHERE tvdisplaycode = $1`,
      [code]
    );
    if (!existing) return code;
  }
  throw new Error('Failed to create a unique TV display code.');
}

async function ensureTournamentTvCode(tournamentId: string, currentCode: string | null | undefined) {
  if (currentCode) return currentCode;
  if (!isFeatureEnabled('tvBoard')) return null;
  const code = await createUniqueTvCode();
  await query(
    `UPDATE tournaments
     SET tvdisplaycode = $2
     WHERE tournamentid = $1 AND tvdisplaycode IS NULL`,
    [tournamentId, code]
  );
  return code;
}

async function canManageTournament(tournamentId: string, userId: string): Promise<boolean> {
  if (await requireSuperAdmin(userId)) return true;

  const row = await queryOne<{ canmanage: boolean }>(
    `SELECT CASE
        WHEN t.userid = $2 THEN TRUE
        WHEN t.groupid IS NOT NULL AND EXISTS (
          SELECT 1
          FROM groupmembers gm
          WHERE gm.groupid = t.groupid
            AND gm.userid = $2
            AND gm.approved = TRUE
            AND gm.admin = TRUE
        ) THEN TRUE
        ELSE FALSE
      END AS canmanage
     FROM tournaments t
     WHERE t.tournamentid = $1`,
    [tournamentId, userId]
  );
  return Boolean(row?.canmanage);
}

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
}

function validateHostPayoutStructure(payoutstructure: string | null | undefined): boolean {
  if (!payoutstructure) return true;
  try {
    const parsed = JSON.parse(payoutstructure) as { mode?: string; value?: unknown };
    const mode = parsed.mode;
    const value = Number(parsed.value);
    return mode === 'count' && [1, 2, 3].includes(Math.round(value));
  } catch {
    return false;
  }
}

async function getGrossPot(tournamentId: string, overrides: Partial<Tournament> = {}): Promise<number> {
  const tournament = await queryOne<{
    buyin: number;
    rebuyprice: number;
    genericrebuys: number;
    addonprice: number;
    genericaddons: number;
  }>(
    `SELECT buyin, rebuycost AS rebuyprice, COALESCE(genericrebuys, 0) AS genericrebuys,
            addoncost AS addonprice, COALESCE(genericaddons, 0) AS genericaddons
     FROM tournaments
     WHERE tournamentid = $1`,
    [tournamentId]
  );
  if (!tournament) return 0;

  const field = await queryOne<{
    checkedincount: number;
    totalrebuys: number;
    totaladdons: number;
  }>(
    `SELECT
        CAST(COALESCE(sum(CASE WHEN checkedin = TRUE THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
        CAST(COALESCE(sum(COALESCE(rebuys, 0)), 0) AS INT) AS totalrebuys,
        CAST(COALESCE(sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END), 0) AS INT) AS totaladdons
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [tournamentId]
  );

  const buyin = Number(overrides.buyin ?? tournament.buyin ?? 0);
  const rebuyprice = Number(overrides.rebuyprice ?? tournament.rebuyprice ?? 0);
  const addonprice = Number(overrides.addonprice ?? tournament.addonprice ?? 0);
  const checkedIn = Number(field?.checkedincount ?? 0);
  const totalRebuys = Number(field?.totalrebuys ?? 0);
  const totalAddons = Number(field?.totaladdons ?? 0);
  const genericRebuys = Number(overrides.genericrebuys ?? tournament.genericrebuys ?? 0);
  const genericAddons = Number(overrides.genericaddons ?? tournament.genericaddons ?? 0);

  return (buyin * checkedIn) + (rebuyprice * (totalRebuys + genericRebuys)) + (addonprice * (totalAddons + genericAddons));
}

tournamentsRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            t.tvdisplaycode,
            COALESCE(t.tvgreetingdisplayenabled, TRUE) AS tvgreetingdisplayenabled,
            COALESCE(t.tvgreetingaudioenabled, TRUE) AS tvgreetingaudioenabled,
            COALESCE(t.tvshowknockoutqrenabled, TRUE) AS tvshowknockoutqrenabled,
            COALESCE(t.tvdisplaymode, 'timer') AS tvdisplaymode,
            COALESCE(t.seatingmaxpertable, 9) AS seatingmaxpertable,
            COALESCE(g.tvseatingwelcomemessage, 'Welcome! Please see host to check-in!') AS tvseatingwelcomemessage,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $1) AS isregistered,
            COALESCE(gm.admin = TRUE, FALSE) AS isgroupadmin,
            CASE
              WHEN t.userid = $1 THEN TRUE
              WHEN t.groupid IS NOT NULL AND gm.admin = TRUE THEN TRUE
              ELSE FALSE
            END AS canmanage,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN groupmembers gm
       ON gm.groupid = t.groupid
      AND gm.userid = $1
      AND gm.approved = TRUE
     WHERE t.userid = $1
        OR (t.groupid IS NOT NULL AND gm.userid IS NOT NULL)
     ORDER BY t.createdate DESC`,
    [req.userId]
  );
  res.json(rows);
});

tournamentsRouter.get('/registered', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid,
            t.tvdisplaycode,
            COALESCE(t.tvgreetingdisplayenabled, TRUE) AS tvgreetingdisplayenabled,
            COALESCE(t.tvgreetingaudioenabled, TRUE) AS tvgreetingaudioenabled,
            COALESCE(t.tvshowknockoutqrenabled, TRUE) AS tvshowknockoutqrenabled,
            COALESCE(t.tvdisplaymode, 'timer') AS tvdisplaymode,
            COALESCE(t.seatingmaxpertable, 9) AS seatingmaxpertable,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount
     FROM tournaments t
     JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid AND tp.userid = $1
     ORDER BY t.createdate DESC`,
    [req.userId]
  );
  res.json(rows);
});

tournamentsRouter.post('/', async (req: Request, res: Response) => {
  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips, genericrebuys,
          addonprice, addonchips, genericaddons, maxplayers, playerselftracking, groupid, registerself, rake, payoutstructure, savedstructureid, notifygroup } = req.body as {
    name: string; tourneydate?: string; tourneytime?: string;
    buyin?: number; rake?: number; rebuyprice?: number; rebuychips?: number;
          genericrebuys?: number; addonprice?: number; addonchips?: number; genericaddons?: number; maxplayers?: number;
          playerselftracking?: boolean; groupid?: string; registerself?: boolean; payoutstructure?: string | null; notifygroup?: boolean;
          savedstructureid?: string | null;
          tvgreetingdisplayenabled?: boolean; tvgreetingaudioenabled?: boolean; tvshowknockoutqrenabled?: boolean;
  };
  if (!name) { res.status(400).json({ error: 'Name required' }); return; }
  if (!groupid) { res.status(400).json({ error: 'Choose a group for this tournament.' }); return; }

  const profile = await getAccountProfile(req.userId!);
  if (!profile) {
    res.status(404).json({ error: 'User account not found' });
    return;
  }
  const upcomingHostedCount = await getUpcomingHostedTournamentCount(req.userId!);
  if (upcomingHostedCount >= profile.maxupcominghostedtournaments) {
    res.status(403).json({ error: 'Your current tier allows only 1 upcoming hosted tournament at a time.' });
    return;
  }
  if (!profile.canuseclubfeatures && Number(maxplayers ?? 0) > profile.maxplayerspertournament) {
    res.status(403).json({ error: `Host tier tournaments are limited to ${profile.maxplayerspertournament} players.` });
    return;
  }
  if (!profile.canuseclubfeatures && !validateHostPayoutStructure(payoutstructure)) {
    res.status(403).json({ error: 'Host tier payouts are limited to paying 1, 2, or 3 places.' });
    return;
  }

  let trackingEnabled = Boolean(playerselftracking);
  if (groupid && playerselftracking == null) {
    const groupDefault = await queryOne<{ defaulttrackingmode: string }>(
      `SELECT COALESCE(defaulttrackingmode, 'standard') AS defaulttrackingmode
       FROM groups g
       JOIN groupmembers gm ON gm.groupid = g.groupid
      WHERE g.groupid = $1
        AND gm.userid = $2
        AND gm.approved = TRUE
        AND gm.admin = TRUE`,
      [groupid, req.userId]
    );
    if (!groupDefault) {
      res.status(403).json({ error: 'Only group admins can create tournaments for this group.' });
      return;
    }
    trackingEnabled = groupDefault.defaulttrackingmode === 'player';
  }
  if (trackingEnabled && !profile.canuseclubfeatures) {
    res.status(403).json({ error: 'Player-tracked stats are available on Club and Pro tiers.' });
    return;
  }

  let tvDisplayCode: string | null = null;
  if (isFeatureEnabled('tvBoard')) {
    tvDisplayCode = await createUniqueTvCode();
  }

  const row = await queryOne<{ tournamentid: string }>(
      `INSERT INTO tournaments
       (userid, name, date, time, buyin, adjustment, rebuycost,
        rebuychips, genericrebuys, addoncost, addonchips, genericaddons, maxplayers, playerselftracking, groupid, payoutstructure, tvdisplaycode,
        tvgreetingdisplayenabled, tvgreetingaudioenabled, tvshowknockoutqrenabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING tournamentid`,
    [req.userId, name, tourneydate ?? null, tourneytime ?? null,
     buyin ?? 0, rake ?? 0, rebuyprice ?? 0,
     rebuychips ?? 0, genericrebuys ?? 0, addonprice ?? 0, addonchips ?? 0, genericaddons ?? 0, maxplayers ?? 0,
     trackingEnabled, groupid ?? null, payoutstructure ?? null, tvDisplayCode,
     true, true, true]
  );
  if (!row) { res.status(500).json({ error: 'Failed to create tournament' }); return; }

  if (savedstructureid && groupid) {
    const savedStructure = await queryOne<{ levels: Omit<BlindLevel, 'id'>[] }>(
      `SELECT levels
       FROM groupblindstructures
       WHERE id = $1 AND groupid = $2`,
      [savedstructureid, groupid]
    );
    if (savedStructure?.levels && Array.isArray(savedStructure.levels)) {
      for (const level of savedStructure.levels) {
        await query(
          `INSERT INTO blindstructure (tournamentid, level, label, smallblind, bigblind, ante, minutes, islastlevel)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.tournamentid, level.level, level.label ?? `Level ${level.level}`,
           level.smallblind, level.bigblind, level.ante ?? 0, level.minutes, level.islastlevel ?? false]
        );
      }
    }
  }

  await incrementHostedTournamentCount(req.userId!);

  if (registerself) {
    await query(
      `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [row.tournamentid, req.userId]
    );
  }

  if (groupid && notifygroup !== false) {
    const recipients = await query<{ emailaddress: string | null; emailencrypted: string | null; groupname: string | null }>(
      `SELECT DISTINCT u.emailaddress, u.emailencrypted, g.name AS groupname
       FROM groupmembers gm
       JOIN users u ON u.guid = gm.userid
       JOIN groups g ON g.groupid = gm.groupid
       LEFT JOIN usermetadata um ON um.userid = u.guid
       WHERE gm.groupid = $1
         AND gm.approved = TRUE
         AND COALESCE(um.isguestuser, FALSE) = FALSE
         AND u.emailencrypted IS NOT NULL`,
      [groupid]
    );
    await Promise.allSettled(
      recipients.map((recipient) => {
        const email = publicEmail(recipient.emailencrypted, recipient.emailaddress);
        if (!email) return Promise.resolve();
        return sendTournamentPostedEmail(
          email,
          row.tournamentid,
          name,
          recipient.groupname,
          tourneydate ?? null,
          tourneytime ?? null
        );
      })
    );
  }

  res.status(201).json(row);
});

tournamentsRouter.get('/:id', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can open this page.' });
    return;
  }

  const isSuperAdmin = await requireSuperAdmin(req.userId!);
  const row = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            t.tvdisplaycode,
            COALESCE(t.tvgreetingdisplayenabled, TRUE) AS tvgreetingdisplayenabled,
            COALESCE(t.tvgreetingaudioenabled, TRUE) AS tvgreetingaudioenabled,
            COALESCE(t.tvshowknockoutqrenabled, TRUE) AS tvshowknockoutqrenabled,
            COALESCE(t.tvdisplaymode, 'timer') AS tvdisplaymode,
            COALESCE(t.seatingmaxpertable, 9) AS seatingmaxpertable,
            COALESCE(g.tvseatingwelcomemessage, 'Welcome! Please see host to check-in!') AS tvseatingwelcomemessage,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $2) AS isregistered,
            COALESCE(gm.admin = TRUE, FALSE) AS isgroupadmin,
            CASE
              WHEN $3 = TRUE THEN TRUE
              WHEN t.userid = $2 THEN TRUE
              WHEN t.groupid IS NOT NULL AND gm.admin = TRUE THEN TRUE
              ELSE FALSE
            END AS canmanage,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN groupmembers gm
       ON gm.groupid = t.groupid
      AND gm.userid = $2
      AND gm.approved = TRUE
     WHERE t.tournamentid = $1`,
    [req.params.id, req.userId, isSuperAdmin]
  );
  if (!row) { res.status(404).json({ error: 'Tournament not found' }); return; }
  if (isFeatureEnabled('tvBoard')) {
    row.tvdisplaycode = await ensureTournamentTvCode(row.tournamentid, row.tvdisplaycode);
  } else {
    row.tvdisplaycode = null;
  }
  res.json(row);
});

tournamentsRouter.put('/:id', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const currentProfile = await getAccountProfile(req.userId!);
  if (!currentProfile) {
    res.status(404).json({ error: 'User account not found' });
    return;
  }

  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips, genericrebuys,
          addonprice, addonchips, genericaddons, maxplayers, playerselftracking, groupid, rake, payoutstructure,
          tvgreetingdisplayenabled, tvgreetingaudioenabled, tvshowknockoutqrenabled, tvdisplaymode, seatingmaxpertable } = req.body as Partial<Tournament>;
  const normalizedTvDisplayMode = tvdisplaymode === 'seating' ? 'seating' : tvdisplaymode === 'timer' ? 'timer' : null;
  const currentTournament = await queryOne<{ tourneydate: string | null; tourneytime: string | null }>(
    `SELECT date AS tourneydate, time AS tourneytime
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!currentTournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  const scheduleLocked = hasTournamentStarted(currentTournament.tourneydate, currentTournament.tourneytime);
  const requestedDate = tourneydate ?? undefined;
  const requestedTime = tourneytime ?? undefined;
  if (
    scheduleLocked
    && (
      (requestedDate !== undefined && requestedDate !== currentTournament.tourneydate)
      || (requestedTime !== undefined && requestedTime !== currentTournament.tourneytime)
    )
  ) {
    res.status(400).json({ error: 'Tournament date and time can no longer be changed after the event has started.' });
    return;
  }
  if (rake != null) {
    const grossPot = await getGrossPot(req.params.id, { buyin, rebuyprice, genericrebuys, addonprice, genericaddons });
    if (Number(rake) > grossPot) {
      res.status(400).json({ error: 'Rake cannot exceed the gross pot.' });
      return;
    }
  }
  if (!currentProfile.canuseclubfeatures && maxplayers != null && Number(maxplayers) > currentProfile.maxplayerspertournament) {
    res.status(403).json({ error: `Host tier tournaments are limited to ${currentProfile.maxplayerspertournament} players.` });
    return;
  }
  if (!currentProfile.canuseclubfeatures && payoutstructure != null && !validateHostPayoutStructure(payoutstructure)) {
    res.status(403).json({ error: 'Host tier payouts are limited to paying 1, 2, or 3 places.' });
    return;
  }
  await query(
    `UPDATE tournaments SET
       name = COALESCE($1, name),
       date = COALESCE($2, date),
       time = COALESCE($3, time),
       buyin = COALESCE($4, buyin),
       adjustment = COALESCE($5, adjustment),
       rebuycost = COALESCE($6, rebuycost),
       rebuychips = COALESCE($7, rebuychips),
       genericrebuys = COALESCE($8, genericrebuys),
       addoncost = COALESCE($9, addoncost),
       addonchips = COALESCE($10, addonchips),
       genericaddons = COALESCE($11, genericaddons),
       maxplayers = COALESCE($12, maxplayers),
       playerselftracking = COALESCE($13, playerselftracking),
       groupid = COALESCE($15, groupid),
       payoutstructure = COALESCE($16, payoutstructure),
       tvgreetingdisplayenabled = COALESCE($17, tvgreetingdisplayenabled),
       tvgreetingaudioenabled = COALESCE($18, tvgreetingaudioenabled),
       tvshowknockoutqrenabled = COALESCE($19, tvshowknockoutqrenabled),
       tvdisplaymode = COALESCE($20, tvdisplaymode),
       seatingmaxpertable = COALESCE($21, seatingmaxpertable)
     WHERE tournamentid = $14`,
    [name ?? null, tourneydate ?? null, tourneytime ?? null,
     buyin ?? null, rake ?? null, rebuyprice ?? null,
     rebuychips ?? null, genericrebuys ?? null, addonprice ?? null, addonchips ?? null, genericaddons ?? null, maxplayers ?? null,
     playerselftracking ?? null, req.params.id, groupid ?? null, payoutstructure ?? null,
     tvgreetingdisplayenabled ?? null, tvgreetingaudioenabled ?? null, tvshowknockoutqrenabled ?? null, normalizedTvDisplayMode,
     seatingmaxpertable ?? null]
  );
  broadcastTournamentUpdate(req.params.id, { tournament: true, source: 'tournament-update' });
  res.json({ success: true });
});

tournamentsRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const tournament = await queryOne<{ name: string; tourneydate: string | Date | null; tourneytime: string | Date | null }>(
    `SELECT name, date AS tourneydate, time AS tourneytime
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const recipients = await query<{ emailaddress: string | null; emailencrypted: string | null }>(
    `SELECT DISTINCT u.emailaddress, u.emailencrypted
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata um ON um.userid = tp.userid
     WHERE tp.tournamentid = $1
       AND COALESCE(um.isguestuser, FALSE) = FALSE
       AND u.emailencrypted IS NOT NULL`,
    [req.params.id]
  );

  await query(`DELETE FROM tournaments WHERE tournamentid = $1`, [req.params.id]);

  await Promise.allSettled(
    recipients.map((recipient) => {
      const email = publicEmail(recipient.emailencrypted, recipient.emailaddress);
      if (!email) return Promise.resolve();
      return sendTournamentCancelledEmail(
        email,
        tournament.name,
        tournament.tourneydate instanceof Date ? tournament.tourneydate.toISOString().slice(0, 10) : tournament.tourneydate,
        tournament.tourneytime instanceof Date ? tournament.tourneytime.toISOString().slice(11, 19) : tournament.tourneytime
      );
    })
  );

  res.json({ success: true, notified: recipients.length });
});
