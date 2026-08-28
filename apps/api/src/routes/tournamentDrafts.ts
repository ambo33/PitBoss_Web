import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, queryOne } from '../db';
import { getAccountProfile, getUpcomingHostedTournamentCount } from '../account';
import { requireAuth } from '../middleware/auth';
import { isFeatureEnabled } from '../features';

export const tournamentDraftsRouter = Router();

const DRAFT_COOKIE = 'pp_anon_tournament';
const DEFAULT_TTL_DAYS = Number(process.env.ANONYMOUS_TOURNAMENT_DRAFT_TTL_DAYS ?? 7);
const MAX_LEVELS = 40;

type DraftStatus = 'anonymous' | 'claim_pending' | 'claimed' | 'expired';

type DraftPayload = {
  wizardInput: Record<string, unknown>;
  generatedStructure: DraftBlindLevel[];
  tournamentConfig: Record<string, unknown>;
};

type DraftBlindLevel = {
  level: number;
  label?: string;
  smallblind: number;
  bigblind: number;
  ante?: number;
  minutes: number;
  islastlevel?: boolean;
};

type DraftRow = {
  draftid: string;
  anonymoussessionid: string;
  status: DraftStatus;
  wizardinput: DraftPayload['wizardInput'];
  generatedstructure: DraftBlindLevel[];
  tournamentconfig: DraftPayload['tournamentConfig'];
  version: number;
  expiresat: string | Date;
  claimedbyuserid: string | null;
  claimedtournamentid: string | null;
};

function enabled(res: Response): boolean {
  if (isFeatureEnabled('deferredAuthQuickStart')) return true;
  res.status(404).json({ error: 'Quick start is not available.' });
  return false;
}

function parseCookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    String(header ?? '')
      .split(';')
      .map((piece) => piece.trim())
      .filter(Boolean)
      .map((piece) => {
        const separator = piece.indexOf('=');
        if (separator < 0) return [piece, ''];
        return [piece.slice(0, separator), decodeURIComponent(piece.slice(separator + 1))];
      })
  );
}

function getAnonymousSession(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[DRAFT_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{32,96}$/.test(existing)) return existing;

  const session = crypto.randomBytes(32).toString('base64url');
  const secure = req.secure || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `${DRAFT_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlDays() * 24 * 60 * 60}${secure ? '; Secure' : ''}`,
  ]);
  return session;
}

function ttlDays() {
  return Number.isFinite(DEFAULT_TTL_DAYS) && DEFAULT_TTL_DAYS > 0 ? DEFAULT_TTL_DAYS : 7;
}

function expiresAt(): Date {
  return new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000);
}

function sanitizePayload(body: unknown): DraftPayload | null {
  if (!body || typeof body !== 'object') return null;
  const source = body as Partial<DraftPayload>;
  if (!source.wizardInput || typeof source.wizardInput !== 'object') return null;
  if (!source.tournamentConfig || typeof source.tournamentConfig !== 'object') return null;
  if (!Array.isArray(source.generatedStructure)) return null;
  const generatedStructure = source.generatedStructure.map(normalizeLevel).filter(Boolean) as DraftBlindLevel[];
  if (generatedStructure.length < 4 || generatedStructure.length > MAX_LEVELS) return null;
  if (!generatedStructure.some((level) => level.smallblind > 0 && level.bigblind > 0)) return null;

  const players = Math.round(Number((source.wizardInput as Record<string, unknown>).players));
  if (!Number.isFinite(players) || players < 2 || players > 500) return null;
  const maxplayers = Math.round(Number((source.tournamentConfig as Record<string, unknown>).maxplayers ?? players));
  if (!Number.isFinite(maxplayers) || maxplayers < 2 || maxplayers > 500) return null;

  return {
    wizardInput: source.wizardInput as Record<string, unknown>,
    tournamentConfig: source.tournamentConfig as Record<string, unknown>,
    generatedStructure,
  };
}

function normalizeLevel(level: unknown): DraftBlindLevel | null {
  if (!level || typeof level !== 'object') return null;
  const source = level as Partial<DraftBlindLevel>;
  const normalized = {
    level: Math.round(Number(source.level)),
    label: String(source.label ?? `Level ${source.level ?? ''}`).trim().slice(0, 100),
    smallblind: Math.max(0, Math.round(Number(source.smallblind ?? 0))),
    bigblind: Math.max(0, Math.round(Number(source.bigblind ?? 0))),
    ante: Math.max(0, Math.round(Number(source.ante ?? 0))),
    minutes: Math.max(0, Math.round(Number(source.minutes ?? 0))),
    islastlevel: Boolean(source.islastlevel),
  };
  if (!Number.isFinite(normalized.level) || normalized.level < 1) return null;
  if (!Number.isFinite(normalized.minutes) || normalized.minutes > 240) return null;
  if (normalized.smallblind > 0 && normalized.bigblind <= normalized.smallblind) return null;
  return normalized;
}

function serializeDraft(row: DraftRow) {
  const expired = new Date(row.expiresat).getTime() < Date.now() && row.status !== 'claimed';
  return {
    id: row.draftid,
    status: expired ? 'expired' : row.status,
    wizardInput: row.wizardinput,
    generatedStructure: row.generatedstructure,
    tournamentConfig: row.tournamentconfig,
    version: Number(row.version),
    expiresAt: new Date(row.expiresat).toISOString(),
    claimedTournamentId: row.claimedtournamentid,
  };
}

tournamentDraftsRouter.post('/', async (req: Request, res: Response) => {
  if (!enabled(res)) return;
  const payload = sanitizePayload(req.body);
  if (!payload) {
    res.status(400).json({ error: 'Invalid tournament draft.' });
    return;
  }
  const session = getAnonymousSession(req, res);
  const row = await queryOne<DraftRow>(
    `INSERT INTO anonymoustournamentdrafts
       (anonymoussessionid, wizardinput, generatedstructure, tournamentconfig, expiresat)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING draftid, anonymoussessionid, status, wizardinput, generatedstructure, tournamentconfig, version, expiresat, claimedbyuserid, claimedtournamentid`,
    [session, JSON.stringify(payload.wizardInput), JSON.stringify(payload.generatedStructure), JSON.stringify(payload.tournamentConfig), expiresAt()]
  );
  if (!row) {
    res.status(500).json({ error: 'Could not save draft.' });
    return;
  }
  res.status(201).json(serializeDraft(row));
});

tournamentDraftsRouter.get('/:draftId', async (req: Request, res: Response) => {
  if (!enabled(res)) return;
  const session = getAnonymousSession(req, res);
  const row = await queryOne<DraftRow>(
    `SELECT draftid, anonymoussessionid, status, wizardinput, generatedstructure, tournamentconfig, version, expiresat, claimedbyuserid, claimedtournamentid
     FROM anonymoustournamentdrafts
     WHERE draftid = $1 AND anonymoussessionid = $2`,
    [req.params.draftId, session]
  );
  if (!row) {
    res.status(404).json({ error: 'Draft not found.' });
    return;
  }
  res.json(serializeDraft(row));
});

tournamentDraftsRouter.put('/:draftId', async (req: Request, res: Response) => {
  if (!enabled(res)) return;
  const payload = sanitizePayload(req.body);
  if (!payload) {
    res.status(400).json({ error: 'Invalid tournament draft.' });
    return;
  }
  const session = getAnonymousSession(req, res);
  const row = await queryOne<DraftRow>(
    `UPDATE anonymoustournamentdrafts
     SET wizardinput = $3,
         generatedstructure = $4,
         tournamentconfig = $5,
         version = version + 1,
         updatedat = now(),
         expiresat = $6
     WHERE draftid = $1
       AND anonymoussessionid = $2
       AND status IN ('anonymous', 'claim_pending')
     RETURNING draftid, anonymoussessionid, status, wizardinput, generatedstructure, tournamentconfig, version, expiresat, claimedbyuserid, claimedtournamentid`,
    [req.params.draftId, session, JSON.stringify(payload.wizardInput), JSON.stringify(payload.generatedStructure), JSON.stringify(payload.tournamentConfig), expiresAt()]
  );
  if (!row) {
    res.status(404).json({ error: 'Draft not found or already claimed.' });
    return;
  }
  res.json(serializeDraft(row));
});

tournamentDraftsRouter.post('/:draftId/claim', requireAuth, async (req: Request, res: Response) => {
  if (!enabled(res)) return;
  const session = getAnonymousSession(req, res);
  const profile = await getAccountProfile(req.userId!);
  if (!profile) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }
  if (profile.isdemo) {
    res.status(403).json({ error: 'Create an account or log in to save this tournament.' });
    return;
  }
  const upcomingHostedCount = await getUpcomingHostedTournamentCount(req.userId!);
  if (upcomingHostedCount >= profile.maxupcominghostedtournaments) {
    res.status(403).json({ error: 'Your current tier allows only 1 upcoming hosted tournament at a time.' });
    return;
  }

  try {
    const tournamentId = await retrySerializable(() => claimDraft(req.params.draftId, session, req.userId!));
    res.json(tournamentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save tournament.';
    const status = message === 'Draft not found.' ? 404 : message.includes('expired') ? 410 : 400;
    res.status(status).json({ error: message });
  }
});

async function retrySerializable<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      if (!err || typeof err !== 'object' || String((err as { code?: unknown }).code) !== '40001' || attempt === 2) throw err;
    }
  }
  throw new Error('Transaction retry failed.');
}

async function claimDraft(draftId: string, session: string, userId: string): Promise<{ tournamentid: string; alreadyclaimed?: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftResult = await client.query<DraftRow>(
      `SELECT draftid, anonymoussessionid, status, wizardinput, generatedstructure, tournamentconfig, version, expiresat, claimedbyuserid, claimedtournamentid
       FROM anonymoustournamentdrafts
       WHERE draftid = $1 AND anonymoussessionid = $2
       FOR UPDATE`,
      [draftId, session]
    );
    const draft = draftResult.rows[0];
    if (!draft) throw new Error('Draft not found.');
    if (draft.status === 'claimed' && draft.claimedtournamentid) {
      await client.query('COMMIT');
      return { tournamentid: draft.claimedtournamentid, alreadyclaimed: true };
    }
    if (new Date(draft.expiresat).getTime() < Date.now()) {
      await client.query(
        `UPDATE anonymoustournamentdrafts SET status = 'expired', updatedat = now() WHERE draftid = $1`,
        [draftId]
      );
      throw new Error('This draft has expired.');
    }

    const payload = sanitizePayload({
      wizardInput: draft.wizardinput,
      generatedStructure: draft.generatedstructure,
      tournamentConfig: draft.tournamentconfig,
    });
    if (!payload) throw new Error('Draft data is no longer valid.');

    await client.query(
      `UPDATE anonymoustournamentdrafts SET status = 'claim_pending', updatedat = now() WHERE draftid = $1`,
      [draftId]
    );

    const groupId = await ensureClaimGroup(client, userId);
    const tournamentId = await createTournamentFromDraft(client, userId, groupId, payload);
    await insertBlindStructure(client, tournamentId, payload.generatedStructure);
    await client.query(
      `INSERT INTO tournamenttimer (tournamentid, currentlevel, remainingsecs, running, lastupdated)
       VALUES ($1, 1, $2, FALSE, now())
       ON CONFLICT (tournamentid) DO NOTHING`,
      [tournamentId, Math.max(0, Number(payload.generatedStructure[0]?.minutes ?? 0)) * 60]
    );
    await client.query(
      `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tournamentId, userId]
    );
    await client.query(
      `INSERT INTO usermetadata (userid, hostedtournamentcount)
       VALUES ($1, 1)
       ON CONFLICT (userid)
       DO UPDATE SET hostedtournamentcount = COALESCE(usermetadata.hostedtournamentcount, 0) + 1`,
      [userId]
    );
    await client.query(
      `UPDATE anonymoustournamentdrafts
       SET status = 'claimed',
           claimedbyuserid = $2,
           claimedtournamentid = $3,
           updatedat = now()
       WHERE draftid = $1`,
      [draftId, userId, tournamentId]
    );

    await client.query('COMMIT');
    return { tournamentid: tournamentId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function ensureClaimGroup(client: PoolClient, userId: string): Promise<string> {
  const existing = await client.query<{ groupid: string }>(
    `SELECT g.groupid
     FROM groups g
     JOIN groupmembers gm ON gm.groupid = g.groupid
     WHERE gm.userid = $1 AND gm.admin = TRUE AND gm.approved = TRUE AND g.active = TRUE
     ORDER BY lower(g.name) ASC, g.groupid ASC
     LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]?.groupid) return existing.rows[0].groupid;

  const inviteCode = await createInviteCode(client);
  const created = await client.query<{ groupid: string }>(
    `INSERT INTO groups (userid, name, invitecode, approvalneeded, defaulttrackingmode)
     VALUES ($1, 'My Poker Nights', $2, FALSE, 'standard')
     RETURNING groupid`,
    [userId, inviteCode]
  );
  const groupId = created.rows[0]?.groupid;
  if (!groupId) throw new Error('Could not create host group.');
  await client.query(
    `INSERT INTO groupmembers (groupid, userid, admin, approved) VALUES ($1, $2, TRUE, TRUE)`,
    [groupId, userId]
  );
  return groupId;
}

async function createInviteCode(client: PoolClient): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const existing = await client.query<{ groupid: string }>(`SELECT groupid FROM groups WHERE invitecode = $1`, [code]);
    if (existing.rowCount === 0) return code;
  }
  throw new Error('Could not create group invite code.');
}

async function createTvCode(client: PoolClient): Promise<string | null> {
  if (!isFeatureEnabled('tvBoard')) return null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await client.query<{ tournamentid: string }>(
      `SELECT tournamentid FROM tournaments WHERE tvdisplaycode = $1`,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  throw new Error('Could not create TV code.');
}

async function createTournamentFromDraft(client: PoolClient, userId: string, groupId: string, payload: DraftPayload): Promise<string> {
  const config = payload.tournamentConfig;
  const name = String(config.name ?? 'Quick Start Tournament').trim().slice(0, 255) || 'Quick Start Tournament';
  const date = String(config.tourneydate ?? '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(config.tourneydate)
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const time = String(config.tourneytime ?? '').match(/^\d{2}:\d{2}/) ? String(config.tourneytime).slice(0, 5) : '19:00';
  const tvCode = await createTvCode(client);
  const result = await client.query<{ tournamentid: string }>(
    `INSERT INTO tournaments
       (userid, name, date, time, buyin, adjustment, rebuycost, rebuychips, rebuylastlevel,
        addoncost, addonchips, maxplayers, playerselftracking, groupid, tvdisplaycode,
        tvgreetingdisplayenabled, tvgreetingaudioenabled, tvshowknockoutqrenabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,$13,$14,TRUE,TRUE,TRUE)
     RETURNING tournamentid`,
    [
      userId,
      name,
      date,
      time,
      money(config.buyin),
      money(config.rake),
      money(config.rebuyprice),
      intValue(config.rebuychips),
      nullableInt(config.rebuylastlevel),
      money(config.addonprice),
      intValue(config.addonchips),
      intValue(config.maxplayers),
      groupId,
      tvCode,
    ]
  );
  const tournamentId = result.rows[0]?.tournamentid;
  if (!tournamentId) throw new Error('Could not create tournament.');
  return tournamentId;
}

async function insertBlindStructure(client: PoolClient, tournamentId: string, levels: DraftBlindLevel[]) {
  for (const level of levels) {
    await client.query(
      `INSERT INTO blindstructure (tournamentid, level, label, smallblind, bigblind, ante, minutes, islastlevel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        tournamentId,
        level.level,
        level.label ?? `Level ${level.level}`,
        level.smallblind,
        level.bigblind,
        level.ante ?? 0,
        level.minutes,
        Boolean(level.islastlevel),
      ]
    );
  }
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function intValue(value: unknown): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nullableInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = intValue(value);
  return parsed > 0 ? parsed : null;
}
