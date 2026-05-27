import { Router, Request, Response } from 'express';
import { pool, query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { notifyGameCreated } from '../services/gameNotifications';

type GameType = 'tournament' | 'cash';
type GameVisibility = 'group_public' | 'invite_only';
type GameStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
type CashPlayerStatus = 'interested' | 'seated' | 'cashed_out' | 'removed';

const GAME_TYPES = new Set<GameType>(['tournament', 'cash']);
const VISIBILITIES = new Set<GameVisibility>(['group_public', 'invite_only']);
const GAME_STATUSES = new Set<GameStatus>(['scheduled', 'active', 'completed', 'cancelled']);
const PLAYER_STATUSES = new Set<CashPlayerStatus>(['interested', 'seated', 'cashed_out', 'removed']);

export const gamesRouter = Router();
gamesRouter.use(requireAuth);

function cleanText(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullableTimestamp(value: unknown): string | null {
  const text = cleanText(value, 80);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function nullableMoney(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} cannot be negative.`);
  }
  return Math.round(parsed * 100) / 100;
}

function requiredMoney(value: unknown, field: string): number {
  return nullableMoney(value, field) ?? 0;
}

function nullablePositiveInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive whole number.`);
  }
  return parsed;
}

function compactUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))];
}

async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE AND admin = TRUE`,
    [groupId, userId]
  ));
}

async function isApprovedMember(groupId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
    [groupId, userId]
  ));
}

async function validateGroupMembers(groupId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await query<{ userid: string }>(
    `SELECT userid
     FROM groupmembers
     WHERE groupid = $1
       AND approved = TRUE
       AND userid IN (${placeholders})`,
    [groupId, ...userIds]
  );
  return rows.map((row) => row.userid);
}

async function visibleGameForUser(gameId: string, userId: string) {
  return queryOne<{
    id: string;
    groupid: string;
    createdbyuserid: string;
    gametype: GameType;
    title: string;
    status: GameStatus;
    visibility: GameVisibility;
    startsat: string | null;
    tournamentid: string | null;
    createdat: string;
    updatedat: string;
    groupname: string;
    isgroupadmin: boolean;
  }>(
    `SELECT g.id, g.groupid, g.createdbyuserid, g.gametype, g.title, g.status, g.visibility,
            g.startsat, g.tournamentid, g.createdat, g.updatedat, gr.name AS groupname,
            COALESCE(gm.admin, FALSE) AS isgroupadmin
     FROM games g
     JOIN groups gr ON gr.groupid = g.groupid
     JOIN groupmembers gm ON gm.groupid = g.groupid AND gm.userid = $2 AND gm.approved = TRUE
     WHERE g.id = $1
       AND (
         gm.admin = TRUE
         OR g.visibility = 'group_public'
         OR EXISTS (SELECT 1 FROM gameinvitations gi WHERE gi.gameid = g.id AND gi.userid = $2)
       )`,
    [gameId, userId]
  );
}

async function loadGameDetail(gameId: string, userId: string) {
  const game = await visibleGameForUser(gameId, userId);
  if (!game) return null;

  const cashdetails = game.gametype === 'cash'
    ? await queryOne(
        `SELECT gameid, stakeslabel, minbuyin, maxbuyin, seatsavailable, notes, updatedat
         FROM cashgamedetails
         WHERE gameid = $1`,
        [gameId]
      )
    : null;

  const players = game.gametype === 'cash'
    ? await query(
        `SELECT cgp.id, cgp.gameid, cgp.userid,
                COALESCE(NULLIF(u.displayname, ''), cgp.displaynamesnapshot, u.emailaddress, 'Player') AS displayname,
                cgp.displaynamesnapshot, cgp.status, cgp.buyintotal, cgp.addontotal, cgp.cashouttotal,
                cgp.createdat, cgp.updatedat
         FROM cashgameplayers cgp
         JOIN users u ON u.guid = cgp.userid
         WHERE cgp.gameid = $1
           AND cgp.status <> 'removed'
         ORDER BY lower(COALESCE(NULLIF(u.displayname, ''), cgp.displaynamesnapshot, u.emailaddress, 'Player')) ASC`,
        [gameId]
      )
    : [];

  const members = game.isgroupadmin
    ? await query(
        `SELECT gm.userid, COALESCE(NULLIF(u.displayname, ''), u.emailaddress, 'Player') AS displayname, gm.admin AS isadmin, gm.approved
         FROM groupmembers gm
         JOIN users u ON u.guid = gm.userid
         WHERE gm.groupid = $1
           AND gm.approved = TRUE
         ORDER BY lower(COALESCE(NULLIF(u.displayname, ''), u.emailaddress, 'Player')) ASC`,
        [game.groupid]
      )
    : [];

  const ledger = game.isgroupadmin && game.gametype === 'cash'
    ? await query(
        `SELECT cgle.id, cgle.gameid, cgle.userid,
                COALESCE(NULLIF(u.displayname, ''), u.emailaddress, 'Player') AS displayname,
                cgle.eventtype, cgle.amount, cgle.createdbyuserid, cgle.createdat
         FROM cashgameledgerevents cgle
         LEFT JOIN users u ON u.guid = cgle.userid
         WHERE cgle.gameid = $1
         ORDER BY cgle.createdat DESC
         LIMIT 50`,
        [gameId]
      )
    : [];

  return {
    game: { ...game, canmanage: game.isgroupadmin },
    cashdetails,
    players,
    members,
    ledger,
  };
}

gamesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const groupid = cleanText(body.groupid ?? body.groupId, 80);
    const gametype = cleanText(body.gametype ?? body.gameType, 20) as GameType;
    const title = cleanText(body.title, 160);
    const visibility = (cleanText(body.visibility, 24) || 'group_public') as GameVisibility;
    const startsat = nullableTimestamp(body.startsat ?? body.startsAt);
    const inviteUserIds = compactUserIds(body.inviteUserIds);
    const alertUsers = Boolean(body.alertUsers);

    if (!groupid) { res.status(400).json({ error: 'Group required' }); return; }
    if (!GAME_TYPES.has(gametype)) { res.status(400).json({ error: 'Game type required' }); return; }
    if (!title) { res.status(400).json({ error: 'Title required' }); return; }
    if (!VISIBILITIES.has(visibility)) { res.status(400).json({ error: 'Visibility required' }); return; }
    if (!(await isGroupAdmin(groupid, req.userId!))) { res.status(403).json({ error: 'Only group admins can host games for this group.' }); return; }

    const cash = (typeof body.cash === 'object' && body.cash ? body.cash : body) as Record<string, unknown>;
    const stakeslabel = cleanText(cash.stakeslabel ?? cash.stakesLabel, 80);
    const seatsavailable = nullablePositiveInt(cash.seatsavailable ?? cash.seatsAvailable, 'Seats available');
    const minbuyin = nullableMoney(cash.minbuyin ?? cash.minBuyIn, 'Min buy-in');
    const maxbuyin = nullableMoney(cash.maxbuyin ?? cash.maxBuyIn, 'Max buy-in');
    const notes = cleanText(cash.notes, 1000) || null;
    if (gametype === 'cash' && !stakeslabel) { res.status(400).json({ error: 'Stakes label required for cash games.' }); return; }
    if (minbuyin !== null && maxbuyin !== null && maxbuyin < minbuyin) {
      res.status(400).json({ error: 'Max buy-in cannot be lower than min buy-in.' });
      return;
    }

    const validInviteUserIds = await validateGroupMembers(groupid, inviteUserIds);
    if (visibility === 'invite_only' && validInviteUserIds.length !== inviteUserIds.length) {
      res.status(400).json({ error: 'Selected invitees must belong to the group.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gameResult = await client.query<{ id: string }>(
        `INSERT INTO games (groupid, createdbyuserid, gametype, title, status, visibility, startsat)
         VALUES ($1, $2, $3, $4, 'scheduled', $5, $6)
         RETURNING id`,
        [groupid, req.userId, gametype, title, visibility, startsat]
      );
      const gameId = gameResult.rows[0]?.id;
      if (!gameId) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Could not create game.' });
        return;
      }

      if (gametype === 'cash') {
        await client.query(
          `INSERT INTO cashgamedetails (gameid, stakeslabel, minbuyin, maxbuyin, seatsavailable, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [gameId, stakeslabel, minbuyin, maxbuyin, seatsavailable, notes]
        );
      }

      if (visibility === 'invite_only') {
        for (const userId of validInviteUserIds) {
          await client.query(
            `INSERT INTO gameinvitations (gameid, userid, invitedbyuserid)
             VALUES ($1, $2, $3)
             ON CONFLICT (gameid, userid) DO NOTHING`,
            [gameId, userId, req.userId]
          );
        }
      }

      await client.query('COMMIT');

      if (alertUsers) {
        const recipients = visibility === 'invite_only'
          ? validInviteUserIds.filter((userId) => userId !== req.userId)
          : (await query<{ userid: string }>(
              `SELECT userid
               FROM groupmembers
               WHERE groupid = $1
                 AND approved = TRUE
                 AND userid <> $2`,
              [groupid, req.userId]
            )).map((row) => row.userid);
        void notifyGameCreated({
          gameId,
          groupId: groupid,
          gameTitle: title,
          gameType: gametype,
          recipientUserIds: recipients,
          channels: ['email', 'push'],
        });
      }

      res.status(201).json({ gameid: gameId, id: gameId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create game.';
    res.status(400).json({ error: message });
  }
});

gamesRouter.get('/group/:groupId', async (req: Request, res: Response) => {
  const groupId = req.params.groupId;
  if (!(await isApprovedMember(groupId, req.userId!))) {
    res.status(403).json({ error: 'Not a group member' });
    return;
  }
  const rows = await query(
    `SELECT g.id, g.groupid, g.createdbyuserid, g.gametype, g.title, g.status, g.visibility,
            g.startsat, g.tournamentid, g.createdat, g.updatedat, cg.stakeslabel, cg.seatsavailable,
            COALESCE(gm.admin, FALSE) AS canmanage,
            (SELECT count(*) FROM cashgameplayers cgp WHERE cgp.gameid = g.id AND cgp.status <> 'removed') AS playercount
     FROM games g
     JOIN groupmembers gm ON gm.groupid = g.groupid AND gm.userid = $2 AND gm.approved = TRUE
     LEFT JOIN cashgamedetails cg ON cg.gameid = g.id
     WHERE g.groupid = $1
       AND (
         gm.admin = TRUE
         OR g.visibility = 'group_public'
         OR EXISTS (SELECT 1 FROM gameinvitations gi WHERE gi.gameid = g.id AND gi.userid = $2)
       )
     ORDER BY COALESCE(g.startsat, g.createdat) DESC`,
    [groupId, req.userId]
  );
  res.json(rows);
});

gamesRouter.get('/:id', async (req: Request, res: Response) => {
  const detail = await loadGameDetail(req.params.id, req.userId!);
  if (!detail) { res.status(404).json({ error: 'Game not found' }); return; }
  res.json(detail);
});

gamesRouter.patch('/:id', async (req: Request, res: Response) => {
  const detail = await loadGameDetail(req.params.id, req.userId!);
  if (!detail) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!detail.game.canmanage) { res.status(403).json({ error: 'Only group admins can manage this game.' }); return; }

  try {
    const body = req.body as Record<string, unknown>;
    const status = body.status === undefined ? undefined : cleanText(body.status, 20) as GameStatus;
    if (status !== undefined && !GAME_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid game status.' });
      return;
    }
    const title = body.title === undefined ? undefined : cleanText(body.title, 160);
    const startsat = body.startsat === undefined && body.startsAt === undefined
      ? undefined
      : nullableTimestamp(body.startsat ?? body.startsAt);

    await query(
      `UPDATE games
       SET title = COALESCE($2, title),
           status = COALESCE($3, status),
           startsat = CASE WHEN $4::BOOL THEN $5 ELSE startsat END,
           updatedat = now()
       WHERE id = $1`,
      [req.params.id, title || null, status || null, startsat !== undefined, startsat]
    );

    if (detail.game.gametype === 'cash' && body.cash && typeof body.cash === 'object') {
      const cash = body.cash as Record<string, unknown>;
      const stakeslabel = cash.stakeslabel === undefined && cash.stakesLabel === undefined ? undefined : cleanText(cash.stakeslabel ?? cash.stakesLabel, 80);
      const seatsavailable = cash.seatsavailable === undefined && cash.seatsAvailable === undefined ? undefined : nullablePositiveInt(cash.seatsavailable ?? cash.seatsAvailable, 'Seats available');
      const minbuyin = cash.minbuyin === undefined && cash.minBuyIn === undefined ? undefined : nullableMoney(cash.minbuyin ?? cash.minBuyIn, 'Min buy-in');
      const maxbuyin = cash.maxbuyin === undefined && cash.maxBuyIn === undefined ? undefined : nullableMoney(cash.maxbuyin ?? cash.maxBuyIn, 'Max buy-in');
      const notes = cash.notes === undefined ? undefined : cleanText(cash.notes, 1000);
      await query(
        `UPDATE cashgamedetails
         SET stakeslabel = COALESCE($2, stakeslabel),
             seatsavailable = CASE WHEN $3::BOOL THEN $4 ELSE seatsavailable END,
             minbuyin = CASE WHEN $5::BOOL THEN $6 ELSE minbuyin END,
             maxbuyin = CASE WHEN $7::BOOL THEN $8 ELSE maxbuyin END,
             notes = CASE WHEN $9::BOOL THEN $10 ELSE notes END,
             updatedat = now()
         WHERE gameid = $1`,
        [
          req.params.id,
          stakeslabel || null,
          seatsavailable !== undefined,
          seatsavailable ?? null,
          minbuyin !== undefined,
          minbuyin ?? null,
          maxbuyin !== undefined,
          maxbuyin ?? null,
          notes !== undefined,
          notes || null,
        ]
      );
    }

    res.json(await loadGameDetail(req.params.id, req.userId!));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update game.';
    res.status(400).json({ error: message });
  }
});

gamesRouter.post('/:id/players', async (req: Request, res: Response) => {
  const detail = await loadGameDetail(req.params.id, req.userId!);
  if (!detail) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!detail.game.canmanage) { res.status(403).json({ error: 'Only group admins can manage this game.' }); return; }
  if (detail.game.gametype !== 'cash') { res.status(400).json({ error: 'Players can only be added to cash games here.' }); return; }

  const userid = cleanText((req.body as { userid?: unknown }).userid, 80);
  if (!userid) { res.status(400).json({ error: 'Player required' }); return; }
  const valid = await validateGroupMembers(detail.game.groupid, [userid]);
  if (valid.length !== 1) { res.status(400).json({ error: 'Player must belong to the group.' }); return; }

  const member = await queryOne<{ displayname: string | null }>(
    `SELECT COALESCE(NULLIF(displayname, ''), emailaddress, 'Player') AS displayname FROM users WHERE guid = $1`,
    [userid]
  );

  await query(
    `INSERT INTO cashgameplayers (gameid, userid, displaynamesnapshot, status)
     VALUES ($1, $2, $3, 'interested')
     ON CONFLICT (gameid, userid)
     DO UPDATE SET status = 'interested', updatedat = now()`,
    [req.params.id, userid, member?.displayname ?? 'Player']
  );
  await query(
    `INSERT INTO cashgameledgerevents (gameid, userid, eventtype, createdbyuserid)
     VALUES ($1, $2, 'status_change', $3)`,
    [req.params.id, userid, req.userId]
  );

  res.status(201).json(await loadGameDetail(req.params.id, req.userId!));
});

gamesRouter.put('/:id/players/:userId', async (req: Request, res: Response) => {
  const detail = await loadGameDetail(req.params.id, req.userId!);
  if (!detail) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!detail.game.canmanage) { res.status(403).json({ error: 'Only group admins can manage this game.' }); return; }
  if (detail.game.gametype !== 'cash') { res.status(400).json({ error: 'Only cash-game players can be updated here.' }); return; }

  try {
    const current = await queryOne<{
      buyintotal: string | number;
      addontotal: string | number;
      cashouttotal: string | number;
      status: CashPlayerStatus;
    }>(
      `SELECT buyintotal, addontotal, cashouttotal, status
       FROM cashgameplayers
       WHERE gameid = $1 AND userid = $2`,
      [req.params.id, req.params.userId]
    );
    if (!current) { res.status(404).json({ error: 'Player not found in this cash game.' }); return; }

    const body = req.body as Record<string, unknown>;
    const nextStatus = body.status === undefined ? current.status : cleanText(body.status, 24) as CashPlayerStatus;
    if (!PLAYER_STATUSES.has(nextStatus)) { res.status(400).json({ error: 'Invalid player status.' }); return; }
    const nextBuyIn = body.buyintotal === undefined && body.buyInTotal === undefined ? Number(current.buyintotal) : requiredMoney(body.buyintotal ?? body.buyInTotal, 'Buy-in total');
    const nextAddOn = body.addontotal === undefined && body.addOnTotal === undefined ? Number(current.addontotal) : requiredMoney(body.addontotal ?? body.addOnTotal, 'Add-on/top-up total');
    const nextCashOut = body.cashouttotal === undefined && body.cashOutTotal === undefined ? Number(current.cashouttotal) : requiredMoney(body.cashouttotal ?? body.cashOutTotal, 'Cash-out total');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE cashgameplayers
         SET status = $3, buyintotal = $4, addontotal = $5, cashouttotal = $6, updatedat = now()
         WHERE gameid = $1 AND userid = $2`,
        [req.params.id, req.params.userId, nextStatus, nextBuyIn, nextAddOn, nextCashOut]
      );
      const deltas: Array<{ type: string; amount: number | null }> = [];
      if (Number(current.buyintotal) !== nextBuyIn) deltas.push({ type: 'buy_in', amount: nextBuyIn - Number(current.buyintotal) });
      if (Number(current.addontotal) !== nextAddOn) deltas.push({ type: 'add_on', amount: nextAddOn - Number(current.addontotal) });
      if (Number(current.cashouttotal) !== nextCashOut) deltas.push({ type: 'cash_out', amount: nextCashOut - Number(current.cashouttotal) });
      if (current.status !== nextStatus) deltas.push({ type: nextStatus === 'removed' ? 'removed' : 'status_change', amount: null });
      for (const delta of deltas) {
        await client.query(
          `INSERT INTO cashgameledgerevents (gameid, userid, eventtype, amount, createdbyuserid)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, req.params.userId, delta.type, delta.amount, req.userId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json(await loadGameDetail(req.params.id, req.userId!));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update player.';
    res.status(400).json({ error: message });
  }
});

gamesRouter.delete('/:id/players/:userId', async (req: Request, res: Response) => {
  const detail = await loadGameDetail(req.params.id, req.userId!);
  if (!detail) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!detail.game.canmanage) { res.status(403).json({ error: 'Only group admins can manage this game.' }); return; }

  await query(
    `UPDATE cashgameplayers
     SET status = 'removed', updatedat = now()
     WHERE gameid = $1 AND userid = $2`,
    [req.params.id, req.params.userId]
  );
  await query(
    `INSERT INTO cashgameledgerevents (gameid, userid, eventtype, createdbyuserid)
     VALUES ($1, $2, 'removed', $3)`,
    [req.params.id, req.params.userId, req.userId]
  );
  res.json(await loadGameDetail(req.params.id, req.userId!));
});
