import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../db';
import { sendPublicBlindTimerCodeEmail } from '../services/email';
import { encryptEmail, hashEmail, normalizeEmail } from '../privacy';
import type { BlindLevel } from '../types';

export const blindTimersRouter = Router();

type PublicBlindTimerRow = {
  code: string;
  name: string;
  levels: BlindLevel[];
  state?: unknown;
  soundannouncementsenabled?: boolean;
  promoconsentat?: string | null;
  promounsubscribetoken?: string | null;
  promooptoutat?: string | null;
  createdat: string;
  updatedat: string;
};

function generateTimerCode(existing: Set<string>): string {
  let code = '';
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(code));
  existing.add(code);
  return code;
}

function normalizeLevels(value: unknown): Omit<BlindLevel, 'id'>[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .slice(0, 40)
    .map((raw, index) => {
      const level = raw as Partial<BlindLevel>;
      const smallblind = Math.max(0, Math.round(Number(level.smallblind ?? 0)));
      const bigblind = Math.max(0, Math.round(Number(level.bigblind ?? 0)));
      const ante = Math.max(0, Math.round(Number(level.ante ?? 0)));
      const minutes = Math.max(1, Math.min(240, Math.round(Number(level.minutes ?? 20))));
      const label = String(level.label ?? '').trim().slice(0, 80);
      const isBreak = /^break\b/i.test(label) || (smallblind === 0 && bigblind === 0);
      return {
        level: index + 1,
        label: isBreak ? label || `Break ${index + 1}` : `Level ${index + 1}`,
        smallblind,
        bigblind,
        ante,
        minutes,
        islastlevel: false,
      };
    })
    .filter((level) => level.minutes > 0 && (level.bigblind > 0 || /^break\b/i.test(level.label)));
  return normalized.map((level, index) => ({
    ...level,
    level: index + 1,
    label: /^break\b/i.test(level.label) ? level.label : `Level ${index + 1}`,
    islastlevel: index === normalized.length - 1,
  }));
}

function serializeTimer(row: PublicBlindTimerRow) {
  const parsedLevels = typeof row.levels === 'string'
    ? JSON.parse(row.levels) as BlindLevel[]
    : row.levels;
  const parsedState = typeof row.state === 'string'
    ? JSON.parse(row.state) as unknown
    : row.state ?? null;
  const promoActive = Boolean(row.promoconsentat && !row.promooptoutat);
  return {
    code: row.code,
    name: row.name,
    levels: parsedLevels,
    state: parsedState,
    soundannouncementsenabled: Boolean(row.soundannouncementsenabled && promoActive),
    promoconsentactive: promoActive,
    createdat: row.createdat,
    updatedat: row.updatedat,
  };
}

function generateUnsubscribeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as { currentIndex?: unknown; remainingSecs?: unknown; running?: unknown };
  const currentIndex = Math.max(0, Math.min(39, Math.round(Number(raw.currentIndex ?? 0))));
  const remainingSecs = Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(raw.remainingSecs ?? 0))));
  return {
    currentIndex,
    remainingSecs,
    running: Boolean(raw.running),
    savedAt: new Date().toISOString(),
  };
}

blindTimersRouter.post('/blind-timers', async (req: Request, res: Response) => {
  const body = req.body as { name?: string; levels?: unknown };
  const levels = normalizeLevels(body.levels);
  if (levels.length === 0) {
    res.status(400).json({ error: 'Add at least one blind level.' });
    return;
  }

  const existingRows = await query<{ code: string }>(`SELECT code FROM publicblindtimers`);
  const code = generateTimerCode(new Set(existingRows.map((row) => row.code)));
  const name = String(body.name ?? 'Poker Timer').trim().slice(0, 120) || 'Poker Timer';
  const row = await queryOne<PublicBlindTimerRow>(
    `INSERT INTO publicblindtimers (code, name, levels)
     VALUES ($1, $2, $3)
     RETURNING code, name, levels, state, soundannouncementsenabled, promoconsentat, promooptoutat, createdat, updatedat`,
    [code, name, JSON.stringify(levels)]
  );

  res.status(201).json({ timer: row ? serializeTimer(row) : { code, name, levels } });
});

blindTimersRouter.get('/blind-timers/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').trim();
  const row = await queryOne<PublicBlindTimerRow>(
    `UPDATE publicblindtimers
     SET lastaccessedat = now()
     WHERE code = $1
     RETURNING code, name, levels, state, soundannouncementsenabled, promoconsentat, promooptoutat, createdat, updatedat`,
    [code]
  );
  if (!row) {
    res.status(404).json({ error: 'Blind timer code not found.' });
    return;
  }
  res.json({ timer: serializeTimer(row) });
});

blindTimersRouter.put('/blind-timers/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').trim();
  const body = req.body as { name?: string; levels?: unknown };
  const levels = normalizeLevels(body.levels);
  if (levels.length === 0) {
    res.status(400).json({ error: 'Add at least one blind level.' });
    return;
  }

  const name = String(body.name ?? 'Poker Timer').trim().slice(0, 120) || 'Poker Timer';
  const row = await queryOne<PublicBlindTimerRow>(
    `UPDATE publicblindtimers
     SET name = $2,
         levels = $3,
         updatedat = now()
     WHERE code = $1
     RETURNING code, name, levels, state, soundannouncementsenabled, promoconsentat, promooptoutat, createdat, updatedat`,
    [code, name, JSON.stringify(levels)]
  );
  if (!row) {
    res.status(404).json({ error: 'Blind timer code not found.' });
    return;
  }
  res.json({ timer: serializeTimer(row) });
});

blindTimersRouter.post('/blind-timers/:code/email', async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').trim();
  const body = req.body as { email?: string; enableSoundAnnouncements?: boolean; state?: unknown };
  const email = normalizeEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  const state = normalizeState(body.state);
  const unsubscribeToken = generateUnsubscribeToken();
  const timer = await queryOne<PublicBlindTimerRow>(
    `UPDATE publicblindtimers
     SET emailhash = $2,
         emailencrypted = $3,
         promoconsentat = now(),
         promooptoutat = NULL,
         promounsubscribetoken = COALESCE(promounsubscribetoken, $4),
         soundannouncementsenabled = $5,
         state = COALESCE($6, state),
         updatedat = now()
     WHERE code = $1
     RETURNING code, name, levels, state, soundannouncementsenabled, promoconsentat, promounsubscribetoken, promooptoutat, createdat, updatedat`,
    [code, hashEmail(email), encryptEmail(email), unsubscribeToken, Boolean(body.enableSoundAnnouncements), state ? JSON.stringify(state) : null]
  );
  if (!timer) {
    res.status(404).json({ error: 'Blind timer code not found.' });
    return;
  }

  try {
    await sendPublicBlindTimerCodeEmail(email, timer.code, timer.name, timer.promounsubscribetoken ?? unsubscribeToken);
  } catch (err) {
    console.error('Blind timer code email failed', err instanceof Error ? err.message : err);
  }

  res.json({ success: true, timer: serializeTimer(timer) });
});

blindTimersRouter.put('/blind-timers/:code/state', async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').trim();
  const state = normalizeState((req.body as { state?: unknown }).state);
  if (!state) {
    res.status(400).json({ error: 'Timer state is missing.' });
    return;
  }

  const row = await queryOne<PublicBlindTimerRow>(
    `UPDATE publicblindtimers
     SET state = $2,
         updatedat = now()
     WHERE code = $1
       AND promoconsentat IS NOT NULL
       AND promooptoutat IS NULL
     RETURNING code, name, levels, state, soundannouncementsenabled, promoconsentat, promooptoutat, createdat, updatedat`,
    [code, JSON.stringify(state)]
  );
  if (!row) {
    res.status(403).json({ error: 'Enter an email to save timer state.' });
    return;
  }
  res.json({ timer: serializeTimer(row) });
});

blindTimersRouter.post('/blind-timers/unsubscribe/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '').trim();
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    res.status(400).json({ error: 'Invalid unsubscribe link.' });
    return;
  }

  const row = await queryOne<{ code: string }>(
    `UPDATE publicblindtimers
     SET promooptoutat = now(),
         soundannouncementsenabled = FALSE,
         updatedat = now()
     WHERE promounsubscribetoken = $1
     RETURNING code`,
    [token]
  );
  if (!row) {
    res.status(404).json({ error: 'Unsubscribe link not found.' });
    return;
  }
  res.json({ success: true });
});
