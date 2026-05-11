import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { invalidateTimerCache } from '../socket';
import { BlindLevel } from '../types';

export const blindsRouter = Router();
blindsRouter.use(requireAuth);

async function isOwner(tid: string, uid: string): Promise<boolean> {
  return !!(await queryOne(`SELECT 1 FROM tournaments WHERE tournamentid = $1 AND userid = $2`, [tid, uid]));
}

blindsRouter.get('/:tid/blinds', async (req: Request, res: Response) => {
  const rows = await query<BlindLevel>(
    `SELECT id, level, label, smallblind, bigblind, ante, minutes, islastlevel
     FROM blindstructure WHERE tournamentid = $1 ORDER BY level`,
    [req.params.tid]
  );
  res.json(rows);
});

// Replace entire blind structure
blindsRouter.put('/:tid/blinds', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const levels = req.body as Omit<BlindLevel, 'id'>[];
  if (!Array.isArray(levels) || levels.length === 0) {
    res.status(400).json({ error: 'Levels array required' }); return;
  }

  await query(`DELETE FROM blindstructure WHERE tournamentid = $1`, [req.params.tid]);

  for (const lvl of levels) {
    await query(
      `INSERT INTO blindstructure (tournamentid, level, label, smallblind, bigblind, ante, minutes, islastlevel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.params.tid, lvl.level, lvl.label ?? `Level ${lvl.level}`,
       lvl.smallblind, lvl.bigblind, lvl.ante ?? 0, lvl.minutes, lvl.islastlevel ?? false]
    );
  }

  invalidateTimerCache(req.params.tid);
  res.json({ success: true });
});

blindsRouter.delete('/:tid/blinds', async (req: Request, res: Response) => {
  if (!await isOwner(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(`DELETE FROM blindstructure WHERE tournamentid = $1`, [req.params.tid]);
  invalidateTimerCache(req.params.tid);
  res.json({ success: true });
});

blindsRouter.get('/:tid/timer', async (req: Request, res: Response) => {
  const row = await queryOne(
    `SELECT currentlevel, remainingsecs, running, lastupdated
     FROM tournamenttimer WHERE tournamentid = $1`,
    [req.params.tid]
  );
  res.json(row ?? { currentlevel: 1, remainingsecs: 0, running: false });
});
