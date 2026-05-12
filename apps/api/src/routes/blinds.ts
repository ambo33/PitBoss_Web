import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { invalidateTimerCache } from '../socket';
import { BlindLevel, TournamentChip } from '../types';

export const blindsRouter = Router();
blindsRouter.use(requireAuth);

async function ensureChipTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS tournamentchips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
      denomination INT NOT NULL,
      color STRING(30) NOT NULL,
      quantity INT DEFAULT 0,
      sortorder INT DEFAULT 0
    )
  `);
}

async function canManageTournament(tid: string, uid: string): Promise<boolean> {
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
    [tid, uid]
  );
  return Boolean(row?.canmanage);
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
  if (!await canManageTournament(req.params.tid, req.userId!)) {
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
  if (!await canManageTournament(req.params.tid, req.userId!)) {
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

blindsRouter.get('/:tid/chips', async (req: Request, res: Response) => {
  await ensureChipTable();
  const rows = await query<TournamentChip>(
    `SELECT id,
            CAST(denomination AS INT) AS denomination,
            color,
            CAST(quantity AS INT) AS quantity,
            CAST(sortorder AS INT) AS sortorder
     FROM tournamentchips
     WHERE tournamentid = $1
     ORDER BY sortorder, denomination`,
    [req.params.tid]
  );
  res.json(rows);
});

blindsRouter.put('/:tid/chips', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await ensureChipTable();

  const chips = req.body as Omit<TournamentChip, 'id'>[];
  if (!Array.isArray(chips)) {
    res.status(400).json({ error: 'Chip array required' }); return;
  }

  const clean = chips
    .map((chip, index) => ({
      denomination: Number(chip.denomination),
      color: String(chip.color ?? '').trim(),
      quantity: Number(chip.quantity),
      sortorder: Number.isFinite(Number(chip.sortorder)) ? Number(chip.sortorder) : index,
    }))
    .filter((chip) => Number.isFinite(chip.denomination) && chip.denomination > 0);

  if (clean.some((chip) => !Number.isFinite(chip.quantity) || chip.quantity < 0 || !chip.color)) {
    res.status(400).json({ error: 'Each chip needs a color and non-negative quantity.' }); return;
  }

  await query(`DELETE FROM tournamentchips WHERE tournamentid = $1`, [req.params.tid]);
  for (const chip of clean) {
    await query(
      `INSERT INTO tournamentchips (tournamentid, denomination, color, quantity, sortorder)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.tid, chip.denomination, chip.color, chip.quantity, chip.sortorder]
    );
  }

  res.json({ success: true });
});
