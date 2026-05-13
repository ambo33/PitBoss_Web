import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { isFeatureEnabled } from '../features';
import { Tournament } from '../types';

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

async function canManageTournament(tournamentId: string, userId: string): Promise<boolean> {
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

async function getGrossPot(tournamentId: string, overrides: Partial<Tournament> = {}): Promise<number> {
  const tournament = await queryOne<{
    buyin: number;
    rebuyprice: number;
    addonprice: number;
  }>(
    `SELECT buyin, rebuycost AS rebuyprice, addoncost AS addonprice
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
        CAST(COALESCE(sum(CASE WHEN COALESCE(addedon, 0) != 0 THEN 1 ELSE 0 END), 0) AS INT) AS totaladdons
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

  return (buyin * checkedIn) + (rebuyprice * totalRebuys) + (addonprice * totalAddons);
}

tournamentsRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname, t.tvdisplaycode,
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
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, t.tvdisplaycode,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount
     FROM tournaments t
     JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid AND tp.userid = $1
     ORDER BY t.createdate DESC`,
    [req.userId]
  );
  res.json(rows);
});

tournamentsRouter.post('/', async (req: Request, res: Response) => {
  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips,
          addonprice, addonchips, maxplayers, playerselftracking, groupid, registerself, rake, payoutstructure } = req.body as {
    name: string; tourneydate?: string; tourneytime?: string;
    buyin?: number; rake?: number; rebuyprice?: number; rebuychips?: number;
    addonprice?: number; addonchips?: number; maxplayers?: number;
    playerselftracking?: boolean; groupid?: string; registerself?: boolean; payoutstructure?: string | null;
  };
  if (!name) { res.status(400).json({ error: 'Name required' }); return; }

  let tvDisplayCode: string | null = null;
  if (isFeatureEnabled('tvBoard')) {
    tvDisplayCode = await createUniqueTvCode();
  }

  const row = await queryOne<{ tournamentid: string }>(
    `INSERT INTO tournaments
       (userid, name, date, time, buyin, adjustment, rebuycost,
        rebuychips, addoncost, addonchips, maxplayers, playerselftracking, groupid, payoutstructure, tvdisplaycode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING tournamentid`,
    [req.userId, name, tourneydate ?? null, tourneytime ?? null,
     buyin ?? 0, rake ?? 0, rebuyprice ?? 0,
     rebuychips ?? 0, addonprice ?? 0, addonchips ?? 0, maxplayers ?? 0,
     playerselftracking ?? false, groupid ?? null, payoutstructure ?? null, tvDisplayCode]
  );
  if (!row) { res.status(500).json({ error: 'Failed to create tournament' }); return; }

  if (registerself) {
    await query(
      `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [row.tournamentid, req.userId]
    );
  }

  res.status(201).json(row);
});

tournamentsRouter.get('/:id', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can open this page.' });
    return;
  }

  const row = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname, t.tvdisplaycode,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $2) AS isregistered,
            COALESCE(gm.admin = TRUE, FALSE) AS isgroupadmin,
            CASE
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
    [req.params.id, req.userId]
  );
  if (!row) { res.status(404).json({ error: 'Tournament not found' }); return; }
  res.json(row);
});

tournamentsRouter.put('/:id', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips,
          addonprice, addonchips, maxplayers, playerselftracking, groupid, rake, payoutstructure } = req.body as Partial<Tournament>;
  if (rake != null) {
    const grossPot = await getGrossPot(req.params.id, { buyin, rebuyprice, addonprice });
    if (Number(rake) > grossPot) {
      res.status(400).json({ error: 'Rake cannot exceed the gross pot.' });
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
       addoncost = COALESCE($8, addoncost),
       addonchips = COALESCE($9, addonchips),
       maxplayers = COALESCE($10, maxplayers),
       playerselftracking = COALESCE($11, playerselftracking),
       groupid = COALESCE($13, groupid),
       payoutstructure = COALESCE($14, payoutstructure)
     WHERE tournamentid = $12`,
    [name ?? null, tourneydate ?? null, tourneytime ?? null,
     buyin ?? null, rake ?? null, rebuyprice ?? null,
     rebuychips ?? null, addonprice ?? null, addonchips ?? null, maxplayers ?? null,
     playerselftracking ?? null, req.params.id, groupid ?? null, payoutstructure ?? null]
  );
  res.json({ success: true });
});
