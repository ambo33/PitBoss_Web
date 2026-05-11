import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { Tournament } from '../types';

export const tournamentsRouter = Router();
tournamentsRouter.use(requireAuth);

tournamentsRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, 0 AS rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t WHERE t.userid = $1 ORDER BY t.createdate DESC`,
    [req.userId]
  );
  res.json(rows);
});

tournamentsRouter.get('/registered', async (req: Request, res: Response) => {
  const rows = await query<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, 0 AS rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid,
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
          addonprice, addonchips, maxplayers, playerselftracking, groupid, registerself, rake } = req.body as {
    name: string; tourneydate?: string; tourneytime?: string;
    buyin?: number; rake?: number; rebuyprice?: number; rebuychips?: number;
    addonprice?: number; addonchips?: number; maxplayers?: number;
    playerselftracking?: boolean; groupid?: string; registerself?: boolean;
  };
  if (!name) { res.status(400).json({ error: 'Name required' }); return; }

  const row = await queryOne<{ tournamentid: string }>(
    `INSERT INTO tournaments
       (userid, name, date, time, buyin, adjustment, rebuycost,
        addoncost, addonchips, maxplayers, playerselftracking, groupid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING tournamentid`,
    [req.userId, name, tourneydate ?? null, tourneytime ?? null,
     buyin ?? 0, rake ?? 0, rebuyprice ?? 0,
     addonprice ?? 0, addonchips ?? 0, maxplayers ?? 0,
     playerselftracking ?? false, groupid ?? null]
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
  const row = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, 0 AS rebuychips, t.addoncost AS addonprice,
            t.addonchips, t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
       (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!row) { res.status(404).json({ error: 'Tournament not found' }); return; }
  res.json(row);
});

tournamentsRouter.put('/:id', async (req: Request, res: Response) => {
  const t = await queryOne<{ ownerid: string }>(
    `SELECT userid AS ownerid FROM tournaments WHERE tournamentid = $1`, [req.params.id]
  );
  if (!t) { res.status(404).json({ error: 'Not found' }); return; }
  if (t.ownerid !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { name, tourneydate, tourneytime, buyin, rebuyprice, rebuychips,
          addonprice, addonchips, maxplayers, playerselftracking, groupid, rake } = req.body as Partial<Tournament>;
  await query(
    `UPDATE tournaments SET
       name = COALESCE($1, name),
       date = COALESCE($2, date),
       time = COALESCE($3, time),
       buyin = COALESCE($4, buyin),
       adjustment = COALESCE($5, adjustment),
       rebuycost = COALESCE($6, rebuycost),
       addoncost = COALESCE($8, addoncost),
       addonchips = COALESCE($9, addonchips),
       maxplayers = COALESCE($10, maxplayers),
       playerselftracking = COALESCE($11, playerselftracking),
       groupid = COALESCE($13, groupid)
     WHERE tournamentid = $12`,
    [name ?? null, tourneydate ?? null, tourneytime ?? null,
     buyin ?? null, rake ?? null, rebuyprice ?? null, rebuychips ?? null,
     addonprice ?? null, addonchips ?? null, maxplayers ?? null,
     playerselftracking ?? null, req.params.id, groupid ?? null]
  );
  res.json({ success: true });
});
