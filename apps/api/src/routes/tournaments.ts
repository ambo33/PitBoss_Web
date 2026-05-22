import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { getAccountProfile, getUpcomingHostedTournamentCount, incrementHostedTournamentCount, requireSuperAdmin } from '../account';
import { requireAuth } from '../middleware/auth';
import { isFeatureEnabled } from '../features';
import { hasTournamentStarted } from '../schedule';
import { sendTournamentCancelledEmail, sendTournamentPostedEmail } from '../services/email';
import {
  assignMysteryBounties,
  getGrossPot,
  normalizeBountyDenomination,
  normalizeBountyMode,
  normalizeBountyPoolType,
  normalizeBountyMinPayout,
  normalizeBountyStartPlace,
  normalizeMoney,
  normalizePercent,
  resolveBountyPrizepool,
} from '../services/bounties';
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

function validateBountyMinimumPool(poolAmount: number, minPayout: number, eligibleCount: number): string | null {
  if (minPayout <= 0 || eligibleCount <= 0) return null;
  const required = Math.round(minPayout * eligibleCount * 100) / 100;
  if (required > poolAmount) {
    return `Minimum bounty payout is too high. ${eligibleCount} eligible bounties at $${minPayout.toFixed(2)} requires $${required.toFixed(2)}, but the bounty pool is $${poolAmount.toFixed(2)}.`;
  }
  return null;
}

function estimateConfiguredBountyPool(
  poolType: 'amount' | 'percent',
  configuredValue: number,
  estimatedGrossPot: number
): number {
  return poolType === 'percent'
    ? normalizeMoney((Math.max(0, estimatedGrossPot) * normalizePercent(configuredValue)) / 100)
    : normalizeMoney(configuredValue);
}

function normalizeRebuyLastLevel(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

tournamentsRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
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
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout,
            COALESCE(g.tvseatingwelcomemessage, 'Welcome! Please see host to check-in!') AS tvseatingwelcomemessage,
            COALESCE(g.speechfiveminutemessage, 'There are 5 minutes remaining in the current blind.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in the current blind.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $1) AS isregistered,
            EXISTS(SELECT 1 FROM tournamentdeclines WHERE tournamentid = t.tournamentid AND userid = $1) AS isdeclined,
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
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
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
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout,
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
  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips, rebuylastlevel, genericrebuys,
          addonprice, addonchips, genericaddons, maxplayers, playerselftracking, groupid, registerself, rake, payoutstructure, savedstructureid, notifygroup,
          bountyenabled, bountymode, bountyprizepool, bountypooltype, bountyroundingdenomination, bountystartplace, bountyminpayout } = req.body as {
    name: string; tourneydate?: string; tourneytime?: string;
    buyin?: number; rake?: number; rebuyprice?: number; rebuychips?: number; rebuylastlevel?: number | null;
          genericrebuys?: number; addonprice?: number; addonchips?: number; genericaddons?: number; maxplayers?: number;
          playerselftracking?: boolean; groupid?: string; registerself?: boolean; payoutstructure?: string | null; notifygroup?: boolean;
          savedstructureid?: string | null;
          bountyenabled?: boolean; bountymode?: 'manual' | 'mystery'; bountyprizepool?: number; bountypooltype?: 'amount' | 'percent'; bountyroundingdenomination?: number; bountystartplace?: number | null; bountyminpayout?: number;
          tvgreetingdisplayenabled?: boolean; tvgreetingaudioenabled?: boolean; tvshowknockoutqrenabled?: boolean;
  };
  if (!name) { res.status(400).json({ error: 'Name required' }); return; }
  if (!tourneydate || !tourneytime) { res.status(400).json({ error: 'Tournament date and time required.' }); return; }
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
  const normalizedBountyMode = normalizeBountyMode(bountymode);
  const normalizedRebuyLastLevel = Number(rebuyprice ?? 0) > 0 || Number(rebuychips ?? 0) > 0
    ? normalizeRebuyLastLevel(rebuylastlevel)
    : null;
  const normalizedBountyPoolType = normalizeBountyPoolType(bountypooltype);
  const normalizedBountyPrizepool = normalizedBountyPoolType === 'percent' ? normalizePercent(bountyprizepool) : normalizeMoney(bountyprizepool);
  const normalizedBountyDenomination = normalizeBountyDenomination(bountyroundingdenomination);
  const normalizedBountyStartPlace = normalizeBountyStartPlace(bountystartplace);
  const normalizedBountyMinPayout = normalizeBountyMinPayout(bountyminpayout);
  if (Boolean(bountyenabled) && normalizedBountyMode === 'mystery' && normalizedBountyMinPayout > 0) {
    const estimatedField = Math.max(0, Math.round(Number(maxplayers ?? 0)));
    const eligibleCount = normalizedBountyStartPlace ? Math.min(normalizedBountyStartPlace, estimatedField) : estimatedField;
    const estimatedGrossPot = (Number(buyin ?? 0) * estimatedField)
      + (Number(rebuyprice ?? 0) * Number(genericrebuys ?? 0))
      + (Number(addonprice ?? 0) * Number(genericaddons ?? 0));
    const estimatedPool = estimateConfiguredBountyPool(normalizedBountyPoolType, normalizedBountyPrizepool, estimatedGrossPot);
    const bountyMinimumError = validateBountyMinimumPool(estimatedPool, normalizedBountyMinPayout, eligibleCount);
    if (bountyMinimumError) {
      res.status(400).json({ error: bountyMinimumError });
      return;
    }
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
        rebuychips, rebuylastlevel, genericrebuys, addoncost, addonchips, genericaddons, maxplayers, playerselftracking, groupid, payoutstructure, tvdisplaycode,
        tvgreetingdisplayenabled, tvgreetingaudioenabled, tvshowknockoutqrenabled, bountyenabled, bountymode, bountyprizepool, bountypooltype, bountyroundingdenomination, bountystartplace, bountyminpayout)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING tournamentid`,
    [req.userId, name, tourneydate ?? null, tourneytime ?? null,
     buyin ?? 0, rake ?? 0, rebuyprice ?? 0,
     rebuychips ?? 0, normalizedRebuyLastLevel, genericrebuys ?? 0, addonprice ?? 0, addonchips ?? 0, genericaddons ?? 0, maxplayers ?? 0,
     trackingEnabled, groupid ?? null, payoutstructure ?? null, tvDisplayCode,
     true, true, true, Boolean(bountyenabled), normalizedBountyMode, normalizedBountyPrizepool, normalizedBountyPoolType, normalizedBountyDenomination, normalizedBountyStartPlace, normalizedBountyMinPayout]
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
      `DELETE FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
      [row.tournamentid, req.userId]
    );
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
         AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE
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
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
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
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout,
            COALESCE(g.tvseatingwelcomemessage, 'Welcome! Please see host to check-in!') AS tvseatingwelcomemessage,
            COALESCE(g.speechfiveminutemessage, 'There are 5 minutes remaining in the current blind.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in the current blind.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $2) AS isregistered,
            EXISTS(SELECT 1 FROM tournamentdeclines WHERE tournamentid = t.tournamentid AND userid = $2) AS isdeclined,
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
  const isSuperAdmin = await requireSuperAdmin(req.userId!);

  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips, rebuylastlevel, genericrebuys,
          addonprice, addonchips, genericaddons, maxplayers, playerselftracking, groupid, rake, payoutstructure,
          tvgreetingdisplayenabled, tvgreetingaudioenabled, tvshowknockoutqrenabled, tvdisplaymode, seatingmaxpertable,
          bountyenabled, bountymode, bountyprizepool, bountypooltype, bountyroundingdenomination, bountystartplace, bountyminpayout } = req.body as Partial<Tournament>;
  const normalizedTvDisplayMode = tvdisplaymode === 'seating' ? 'seating' : tvdisplaymode === 'timer' ? 'timer' : null;
  const normalizedBountyMode = bountymode == null ? null : normalizeBountyMode(bountymode);
  const normalizedBountyPoolType = bountypooltype == null ? null : normalizeBountyPoolType(bountypooltype);
  const effectiveBountyPoolType = normalizedBountyPoolType ?? null;
  const normalizedBountyPrizepool = bountyprizepool == null
    ? null
    : (effectiveBountyPoolType === 'percent' ? normalizePercent(bountyprizepool) : normalizeMoney(bountyprizepool));
  const normalizedBountyDenomination = bountyroundingdenomination == null ? null : normalizeBountyDenomination(bountyroundingdenomination);
  const normalizedBountyStartPlace = bountystartplace === undefined ? undefined : normalizeBountyStartPlace(bountystartplace);
  const normalizedBountyMinPayout = bountyminpayout == null ? null : normalizeBountyMinPayout(bountyminpayout);
  const currentTournament = await queryOne<{ tourneydate: string | null; tourneytime: string | null; bountyenabled: boolean; bountymode: string | null; bountypooltype: string | null; bountyprizepool: number; bountyroundingdenomination: number; bountystartplace: number | null; bountyminpayout: number; maxplayers: number; buyin: number; rebuyprice: number; rebuychips: number; addonprice: number; genericrebuys: number; genericaddons: number; registeredcount: number; enteredcount: number; activecount: number }>(
    `SELECT date AS tourneydate, time AS tourneytime,
            COALESCE(bountyenabled, FALSE) AS bountyenabled,
            COALESCE(bountymode, 'manual') AS bountymode,
            COALESCE(bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(CAST(bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(bountyminpayout AS DECIMAL), 0) AS bountyminpayout,
            COALESCE(CAST(maxplayers AS INT), 0) AS maxplayers,
            COALESCE(CAST(buyin AS DECIMAL), 0) AS buyin,
            COALESCE(CAST(rebuycost AS DECIMAL), 0) AS rebuyprice,
            COALESCE(CAST(rebuychips AS INT), 0) AS rebuychips,
            COALESCE(CAST(addoncost AS DECIMAL), 0) AS addonprice,
            COALESCE(CAST(genericrebuys AS INT), 0) AS genericrebuys,
            COALESCE(CAST(genericaddons AS INT), 0) AS genericaddons,
            (SELECT CAST(count(*) AS INT) FROM tournamentplayers WHERE tournamentid = $1) AS registeredcount,
            (SELECT CAST(COALESCE(sum(CASE WHEN checkedin = TRUE OR placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) FROM tournamentplayers WHERE tournamentid = $1) AS enteredcount,
            (SELECT CAST(COALESCE(sum(CASE WHEN checkedin = TRUE AND placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) FROM tournamentplayers WHERE tournamentid = $1) AS activecount
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!currentTournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  const effectiveRebuyPrice = Number(rebuyprice ?? currentTournament.rebuyprice ?? 0);
  const effectiveRebuyChips = Number(rebuychips ?? currentTournament.rebuychips ?? 0);
  const normalizedRebuyLastLevel = rebuylastlevel === undefined
    ? undefined
    : (effectiveRebuyPrice > 0 || effectiveRebuyChips > 0 ? normalizeRebuyLastLevel(rebuylastlevel) : null);
  const scheduleLocked = hasTournamentStarted(currentTournament.tourneydate, currentTournament.tourneytime);
  const requestedDate = tourneydate ?? undefined;
  const requestedTime = tourneytime ?? undefined;
  if (
    !isSuperAdmin
    && scheduleLocked
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
  const effectiveBountyEnabled = bountyenabled ?? Boolean(currentTournament.bountyenabled);
  const effectiveBountyMode = normalizedBountyMode ?? normalizeBountyMode(currentTournament.bountymode);
  const effectivePoolType = normalizedBountyPoolType ?? normalizeBountyPoolType(currentTournament.bountypooltype);
  const effectivePrizepool = normalizedBountyPrizepool ?? Number(currentTournament.bountyprizepool ?? 0);
  const effectiveStartPlace = normalizedBountyStartPlace !== undefined ? normalizedBountyStartPlace : normalizeBountyStartPlace(currentTournament.bountystartplace);
  const effectiveMinPayout = normalizedBountyMinPayout ?? normalizeBountyMinPayout(currentTournament.bountyminpayout);
  if (effectiveBountyEnabled !== false && effectiveBountyMode === 'mystery' && effectiveMinPayout > 0) {
    const effectiveField = Math.max(
      Number(currentTournament.activecount ?? 0),
      Number(currentTournament.enteredcount ?? 0),
      Number(maxplayers ?? currentTournament.maxplayers ?? 0),
      Number(currentTournament.registeredcount ?? 0)
    );
    const eligibleCount = effectiveStartPlace ? Math.min(effectiveStartPlace, effectiveField) : effectiveField;
    const estimatedGrossPot = (Number(buyin ?? currentTournament.buyin ?? 0) * effectiveField)
      + (Number(rebuyprice ?? currentTournament.rebuyprice ?? 0) * Number(genericrebuys ?? currentTournament.genericrebuys ?? 0))
      + (Number(addonprice ?? currentTournament.addonprice ?? 0) * Number(genericaddons ?? currentTournament.genericaddons ?? 0));
    const estimatedPool = estimateConfiguredBountyPool(effectivePoolType, effectivePrizepool, estimatedGrossPot);
    const bountyMinimumError = validateBountyMinimumPool(estimatedPool, effectiveMinPayout, eligibleCount);
    if (bountyMinimumError) {
      res.status(400).json({ error: bountyMinimumError });
      return;
    }
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
       rebuylastlevel = CASE WHEN $8::BOOL THEN $9::INT ELSE rebuylastlevel END,
       genericrebuys = COALESCE($10, genericrebuys),
       addoncost = COALESCE($11, addoncost),
       addonchips = COALESCE($12, addonchips),
       genericaddons = COALESCE($13, genericaddons),
       maxplayers = COALESCE($14, maxplayers),
       playerselftracking = COALESCE($15, playerselftracking),
       groupid = COALESCE($17, groupid),
       payoutstructure = COALESCE($18, payoutstructure),
       tvgreetingdisplayenabled = COALESCE($19, tvgreetingdisplayenabled),
       tvgreetingaudioenabled = COALESCE($20, tvgreetingaudioenabled),
       tvshowknockoutqrenabled = COALESCE($21, tvshowknockoutqrenabled),
       tvdisplaymode = COALESCE($22, tvdisplaymode),
       seatingmaxpertable = COALESCE($23, seatingmaxpertable),
       bountyenabled = COALESCE($24, bountyenabled),
       bountymode = COALESCE($25, bountymode),
       bountyprizepool = COALESCE($26, bountyprizepool),
       bountypooltype = COALESCE($27, bountypooltype),
       bountyroundingdenomination = COALESCE($28, bountyroundingdenomination),
       bountystartplace = CASE WHEN $29::BOOL THEN $30::INT ELSE bountystartplace END,
       bountyminpayout = COALESCE($31, bountyminpayout)
     WHERE tournamentid = $16`,
    [name ?? null, tourneydate ?? null, tourneytime ?? null,
     buyin ?? null, rake ?? null, rebuyprice ?? null,
     rebuychips ?? null, rebuylastlevel !== undefined, normalizedRebuyLastLevel ?? null, genericrebuys ?? null, addonprice ?? null, addonchips ?? null, genericaddons ?? null, maxplayers ?? null,
     playerselftracking ?? null, req.params.id, groupid ?? null, payoutstructure ?? null,
     tvgreetingdisplayenabled ?? null, tvgreetingaudioenabled ?? null, tvshowknockoutqrenabled ?? null, normalizedTvDisplayMode,
     seatingmaxpertable ?? null, bountyenabled ?? null, normalizedBountyMode, normalizedBountyPrizepool, normalizedBountyPoolType, normalizedBountyDenomination,
     bountystartplace !== undefined, normalizedBountyStartPlace ?? null, normalizedBountyMinPayout]
  );
  if (bountyenabled === false) {
    await query(
      `UPDATE tournamentplayers
       SET bountyclaimedbyuserid = NULL,
           bountyclaimedat = NULL
       WHERE tournamentid = $1`,
      [req.params.id]
    );
  } else if (
    (bountyenabled == null || bountyenabled === true)
    && (
      normalizedBountyMode === 'mystery'
      || (
        bountymode == null
        && currentTournament.bountymode === 'mystery'
        && (
          normalizedBountyPrizepool != null
          || normalizedBountyPoolType != null
          || normalizedBountyDenomination != null
          || bountystartplace !== undefined
          || normalizedBountyMinPayout != null
          || buyin != null
          || rebuyprice != null
          || genericrebuys != null
          || addonprice != null
          || genericaddons != null
        )
      )
    )
  ) {
    const configuredValue = normalizedBountyPrizepool ?? Number(currentTournament.bountyprizepool ?? 0);
    const poolType = normalizedBountyPoolType ?? normalizeBountyPoolType(currentTournament.bountypooltype);
    const denomination = normalizedBountyDenomination ?? normalizeBountyDenomination(currentTournament.bountyroundingdenomination);
    const startPlace = normalizedBountyStartPlace !== undefined
      ? normalizedBountyStartPlace
      : normalizeBountyStartPlace(currentTournament.bountystartplace);
    const minPayout = normalizedBountyMinPayout ?? normalizeBountyMinPayout(currentTournament.bountyminpayout);
    await assignMysteryBounties(req.params.id, await resolveBountyPrizepool(req.params.id, configuredValue, poolType), denomination, startPlace, minPayout);
  }
  broadcastTournamentUpdate(req.params.id, { tournament: true, source: 'tournament-update' });
  res.json({ success: true });
});

tournamentsRouter.post('/:id/bounties/mystery-assign', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const tournament = await queryOne<{ bountyprizepool: number; bountyenabled: boolean; bountypooltype: string | null; bountyroundingdenomination: number; bountystartplace: number | null; bountyminpayout: number }>(
    `SELECT COALESCE(CAST(bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(bountyenabled, FALSE) AS bountyenabled,
            COALESCE(bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(bountyminpayout AS DECIMAL), 0) AS bountyminpayout
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  if (!tournament.bountyenabled) {
    res.status(400).json({ error: 'Enable bounties before assigning mystery bounties.' });
    return;
  }

  const { prizepool, denomination } = req.body as { prizepool?: number; denomination?: number };
  const poolType = normalizeBountyPoolType(tournament.bountypooltype);
  const configuredValue = poolType === 'percent'
    ? normalizePercent(prizepool ?? tournament.bountyprizepool)
    : normalizeMoney(prizepool ?? tournament.bountyprizepool);
  const configuredDenomination = normalizeBountyDenomination(denomination ?? tournament.bountyroundingdenomination);
  const total = await resolveBountyPrizepool(req.params.id, configuredValue, poolType);
  await query(
    `UPDATE tournaments
     SET bountymode = 'mystery',
         bountyprizepool = $2,
         bountypooltype = $3,
         bountyroundingdenomination = $4
     WHERE tournamentid = $1`,
    [req.params.id, configuredValue, poolType, configuredDenomination]
  );
  const result = await assignMysteryBounties(
    req.params.id,
    total,
    configuredDenomination,
    normalizeBountyStartPlace(tournament.bountystartplace),
    normalizeBountyMinPayout(tournament.bountyminpayout)
  );
  broadcastTournamentUpdate(req.params.id, { tournament: true, players: true, source: 'mystery-bounties' });
  res.json({ success: true, ...result });
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
