import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, pool } from '../db';
import { getAccountProfile } from '../account';
import { requireAuth } from '../middleware/auth';
import { TournamentPlayer } from '../types';
import { broadcastTournamentUpdate, pauseTournamentTimer } from '../socket';
import { assignSeatIfSeatingStarted, clearSeatForPlayer } from '../services/seating';
import { assignMysteryBountyForKnockout, validateCurrentBountyBudget, redistributeMysteryBountiesForTournament } from '../services/bounties';
import { attachPlayerCoinBadges } from '../services/groupCoins';
import { attachPlayerAchievementCounts } from '../services/playerAchievements';
import { encryptEmail, hashEmail, normalizeEmail, privateEmailPlaceholder } from '../privacy';
import { sendTournamentNotification } from '../lib/server/notifications/notificationService';

export const playersRouter = Router();
playersRouter.use(requireAuth);

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.thepokerplanner.com`;
}

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
}

async function isOwner(tournamentId: string, userId: string): Promise<boolean> {
  const row = await queryOne(`SELECT 1 FROM tournaments WHERE tournamentid = $1 AND userid = $2`, [tournamentId, userId]);
  return !!row;
}

async function isGroupAdmin(tournamentId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1
     FROM tournaments t
     JOIN groupmembers gm ON gm.groupid = t.groupid
     WHERE t.tournamentid = $1
       AND gm.userid = $2
       AND gm.approved = TRUE
       AND gm.admin = TRUE`,
    [tournamentId, userId]
  );
  return !!row;
}

async function canManagePlayers(tournamentId: string, userId: string): Promise<boolean> {
  return await isOwner(tournamentId, userId) || await isGroupAdmin(tournamentId, userId);
}

async function canUsePlayerAccounting(userId: string): Promise<boolean> {
  const profile = await getAccountProfile(userId);
  return Boolean(profile?.canuseclubfeatures);
}

function parsePlaced(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.round(parsed));
}

function ordinalSuffix(value: number): string {
  const normalized = Math.abs(Math.trunc(value));
  const mod100 = normalized % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (normalized % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

playersRouter.get('/:tid/players', async (req: Request, res: Response) => {
  const tournament = await queryOne<{ groupid: string | null }>(
    `SELECT groupid FROM tournaments WHERE tournamentid = $1`,
    [req.params.tid]
  );
  const rows = await query<TournamentPlayer>(
    `WITH current_tournament AS (
       SELECT groupid FROM tournaments WHERE tournamentid = $1
     ),
     medal_counts AS (
       SELECT hp.userid,
              CAST(COALESCE(sum(CASE WHEN hp.placed = 1 THEN 1 ELSE 0 END), 0) AS INT) AS firstplacecount,
              CAST(COALESCE(sum(CASE WHEN hp.placed = 2 THEN 1 ELSE 0 END), 0) AS INT) AS secondplacecount,
              CAST(COALESCE(sum(CASE WHEN hp.placed = 3 THEN 1 ELSE 0 END), 0) AS INT) AS thirdplacecount
       FROM tournamentplayers hp
       JOIN tournaments ht ON ht.tournamentid = hp.tournamentid
       LEFT JOIN usermetadata hm ON hm.userid = hp.userid
       CROSS JOIN current_tournament ct
       WHERE hp.placed IN (1, 2, 3)
         AND COALESCE(hm.isguestuser, FALSE) = FALSE
         AND (ct.groupid IS NULL OR ht.groupid = ct.groupid)
       GROUP BY hp.userid
     )
     SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            COALESCE(mc.firstplacecount, 0) AS firstplacecount,
            COALESCE(mc.secondplacecount, 0) AS secondplacecount,
            COALESCE(mc.thirdplacecount, 0) AS thirdplacecount,
            m.checkinaudiodata,
            m.avatarimagedata,
            COALESCE(tp.checkedin, FALSE) AS checkedin,
            COALESCE(CAST(tp.rebuys AS INT), 0) AS rebuys,
            CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(tp.placed AS INT) AS placed,
            tp.knockedoutbyuserid,
            COALESCE(km.nickname, NULLIF(trim(concat(coalesce(km.firstname, ''), ' ', coalesce(km.lastname, ''))), ''), ku.emailaddress) AS knockedoutbyname,
            COALESCE(CAST(tp.bountyamount AS DECIMAL), 0) AS bountyamount,
            tp.bountyclaimedbyuserid,
            COALESCE(bm.nickname, NULLIF(trim(concat(coalesce(bm.firstname, ''), ' ', coalesce(bm.lastname, ''))), ''), bu.emailaddress) AS bountyclaimedbyname,
            tp.bountyclaimedat,
            COALESCE(tp.paid, FALSE) AS paid,
            tp.createdate AS registeredat,
            CAST(ts."Table" AS INT) AS tablenumber, ts.seat
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN users ku ON ku.guid = tp.knockedoutbyuserid
     LEFT JOIN usermetadata km ON km.userid = tp.knockedoutbyuserid
     LEFT JOIN users bu ON bu.guid = tp.bountyclaimedbyuserid
     LEFT JOIN usermetadata bm ON bm.userid = tp.bountyclaimedbyuserid
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     LEFT JOIN medal_counts mc ON mc.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY tp.createdate`,
    [req.params.tid]
  );
  const rowsWithAchievements = await attachPlayerAchievementCounts(rows, tournament?.groupid);
  const rowsWithCoins = await attachPlayerCoinBadges(rowsWithAchievements, tournament?.groupid);
  res.json(rowsWithCoins);
});

// Admin registers an existing user or creates a guest player by name
playersRouter.post('/:tid/players', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { email, userid, displayname } = req.body as {
    email?: string;
    userid?: string;
    displayname?: string;
  };
  const trimmedName = displayname?.trim();

  let targetUserId: string | null = null;

  if (userid) {
    targetUserId = userid;
  } else if (email?.trim()) {
    const user = await queryOne<{ guid: string }>(
      `SELECT guid FROM users WHERE emailhash = $1`, [hashEmail(normalizeEmail(email))]
    );
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    targetUserId = user.guid;
  } else if (trimmedName) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const guestId = crypto.randomUUID();
      const guestEmail = createGuestEmail();
      const createdUserResult = await client.query<{ guid: string }>(
        `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING guid`,
        [guestId, privateEmailPlaceholder(guestId), hashEmail(guestEmail), encryptEmail(guestEmail), `guest:${crypto.randomUUID()}`]
      );
      const createdUser = createdUserResult.rows[0];
      if (!createdUser) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create guest player' });
        return;
      }

      await client.query(
        `INSERT INTO usermetadata (userid, nickname, isguestuser, guestofuserid)
         VALUES ($1, $2, TRUE, $3)`,
        [createdUser.guid, trimmedName, req.userId]
      );
      await client.query(
        `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
        [req.params.tid, createdUser.guid]
      );
      await client.query('COMMIT');
      await redistributeMysteryBountiesForTournament(req.params.tid);
      broadcastTournamentUpdate(req.params.tid, { players: true, source: 'admin-add-player' });
      res.status(201).json({ success: true });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    res.status(400).json({ error: 'Choose a group user or enter a player name' });
    return;
  }

  if (!targetUserId) {
    res.status(400).json({ error: 'Choose a group user or enter a player name' });
    return;
  }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, targetUserId]
  );
  if (exists) { res.status(409).json({ error: 'Player already registered' }); return; }

  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, targetUserId]
  );
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'admin-add-player' });
  res.status(201).json({ success: true });
});

// Register as a group member (bypasses playerselftracking; requires group membership)
playersRouter.post('/:tid/players/group-register', async (req: Request, res: Response) => {
  const t = await queryOne<{ groupid: string | null }>(
    `SELECT groupid FROM tournaments WHERE tournamentid = $1`, [req.params.tid]
  );
  if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
  if (!t.groupid) { res.status(403).json({ error: 'Tournament is not associated with a group' }); return; }

  const member = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
    [t.groupid, req.userId]
  );
  if (!member) { res.status(403).json({ error: 'Not an approved group member' }); return; }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (exists) { res.status(409).json({ error: 'Already registered' }); return; }

  await query(
    `DELETE FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, req.userId]
  );
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'group-register' });
  res.status(201).json({ success: true });
});

// Self-register
playersRouter.post('/:tid/players/self', async (req: Request, res: Response) => {
  const t = await queryOne<{ playerselftracking: boolean }>(
    `SELECT playerselftracking FROM tournaments WHERE tournamentid = $1`, [req.params.tid]
  );
  if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
  if (!t.playerselftracking) { res.status(403).json({ error: 'Self-registration not enabled' }); return; }

  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (exists) { res.status(409).json({ error: 'Already registered' }); return; }

  await query(
    `DELETE FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid) VALUES ($1, $2)`,
    [req.params.tid, req.userId]
  );
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'self-register' });
  res.status(201).json({ success: true });
});

playersRouter.delete('/:tid/players/self', async (req: Request, res: Response) => {
  const exists = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  if (!exists) { res.status(404).json({ error: 'Not registered' }); return; }

  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'leave-tournament' });
  res.json({ success: true });
});

playersRouter.post('/:tid/players/self/decline', async (req: Request, res: Response) => {
  const t = await queryOne<{ tournamentid: string; groupid: string | null; playerselftracking: boolean }>(
    `SELECT tournamentid, groupid, playerselftracking FROM tournaments WHERE tournamentid = $1`,
    [req.params.tid]
  );
  if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }

  let canDecline = Boolean(t.playerselftracking);
  if (t.groupid) {
    const member = await queryOne(
      `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
      [t.groupid, req.userId]
    );
    canDecline = Boolean(member);
  }
  if (!canDecline) { res.status(403).json({ error: 'You are not allowed to RSVP for this tournament.' }); return; }

  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.userId]
  );
  await query(
    `INSERT INTO tournamentdeclines (tournamentid, userid, declinedat)
     VALUES ($1, $2, now())
     ON CONFLICT (tournamentid, userid)
     DO UPDATE SET declinedat = excluded.declinedat`,
    [req.params.tid, req.userId]
  );
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'decline-tournament' });
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/checkin', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ checkedin: boolean }>(
    `UPDATE tournamentplayers
     SET checkedin = NOT COALESCE(checkedin, FALSE)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(checkedin, FALSE) AS checkedin`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  if (updated.checkedin) {
    await assignSeatIfSeatingStarted(req.params.tid, req.params.uid);
    void sendTournamentNotification(req.params.tid, 'player_check_in_confirmed', {}, {
      targetUserIds: [req.params.uid],
      entityId: `${req.params.tid}:${req.params.uid}:checkin`,
    }).catch((err) => {
      console.error('Check-in push failed', err instanceof Error ? err.message : err);
    });
  } else {
    await clearSeatForPlayer(req.params.tid, req.params.uid);
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'checkin' });
  res.json({ success: true, checkedin: updated.checkedin });
});

playersRouter.post('/:tid/players/:uid/rebuy', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level rebuy tracking.' }); return;
  }
  const updated = await queryOne<{ rebuys: number }>(
    `UPDATE tournamentplayers
     SET rebuys = COALESCE(rebuys, 0) + 1
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(CAST(rebuys AS INT), 0) AS rebuys`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'rebuy' });
  res.json({ success: true, rebuys: updated.rebuys });
});

playersRouter.delete('/:tid/players/:uid/rebuy', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level rebuy tracking.' }); return;
  }
  const updated = await queryOne<{ rebuys: number }>(
    `UPDATE tournamentplayers
     SET rebuys = GREATEST(COALESCE(rebuys, 0) - 1, 0)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(CAST(rebuys AS INT), 0) AS rebuys`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'rebuy-undo' });
  res.json({ success: true, rebuys: updated.rebuys });
});

playersRouter.post('/:tid/players/:uid/addon', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level add-on tracking.' }); return;
  }
  const updated = await queryOne<{ addedon: boolean }>(
    `UPDATE tournamentplayers
     SET addedon = 1
     WHERE tournamentid = $1 AND userid = $2
     RETURNING CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'addon' });
  res.json({ success: true, addedon: updated.addedon });
});

playersRouter.delete('/:tid/players/:uid/addon', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  if (!await canUsePlayerAccounting(req.userId!)) {
    res.status(403).json({ error: 'Club tier is required for player-level add-on tracking.' }); return;
  }
  const updated = await queryOne<{ addedon: boolean }>(
    `UPDATE tournamentplayers
     SET addedon = 0
     WHERE tournamentid = $1 AND userid = $2
     RETURNING CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'addon-undo' });
  res.json({ success: true, addedon: updated.addedon });
});

playersRouter.post('/:tid/rebuys', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericrebuys: number }>(
    `UPDATE tournaments
     SET genericrebuys = COALESCE(genericrebuys, 0) + 1
     WHERE tournamentid = $1
     RETURNING COALESCE(genericrebuys, 0) AS genericrebuys`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-rebuy' });
  res.json({ success: true, genericrebuys: updated.genericrebuys });
});

playersRouter.delete('/:tid/rebuys', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericrebuys: number }>(
    `UPDATE tournaments
     SET genericrebuys = GREATEST(COALESCE(genericrebuys, 0) - 1, 0)
     WHERE tournamentid = $1
     RETURNING COALESCE(genericrebuys, 0) AS genericrebuys`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-rebuy-undo' });
  res.json({ success: true, genericrebuys: updated.genericrebuys });
});

playersRouter.post('/:tid/addons', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericaddons: number }>(
    `UPDATE tournaments
     SET genericaddons = COALESCE(genericaddons, 0) + 1
     WHERE tournamentid = $1
     RETURNING COALESCE(genericaddons, 0) AS genericaddons`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-addon' });
  res.json({ success: true, genericaddons: updated.genericaddons });
});

playersRouter.delete('/:tid/addons', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ genericaddons: number }>(
    `UPDATE tournaments
     SET genericaddons = GREATEST(COALESCE(genericaddons, 0) - 1, 0)
     WHERE tournamentid = $1
     RETURNING COALESCE(genericaddons, 0) AS genericaddons`,
    [req.params.tid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { tournament: true, players: true, source: 'generic-addon-undo' });
  res.json({ success: true, genericaddons: updated.genericaddons });
});

playersRouter.delete('/:tid/players/:uid', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await query(
    `DELETE FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.tid, req.params.uid]
  );
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'remove-player' });
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/bounty', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const parsed = Number((req.body as { amount?: number }).amount ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    res.status(400).json({ error: 'Bounty amount must be zero or higher.' });
    return;
  }
  const amount = Math.round(parsed * 100) / 100;
  const bountyTotals = await queryOne<{ otherbounties: number; playercount: number }>(
    `SELECT CAST(COALESCE(sum(CASE WHEN userid <> $2 THEN COALESCE(bountyamount, 0) ELSE 0 END), 0) AS DECIMAL) AS otherbounties,
            CAST(COALESCE(sum(CASE WHEN userid = $2 THEN 1 ELSE 0 END), 0) AS INT) AS playercount
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [req.params.tid, req.params.uid]
  );
  if (!bountyTotals?.playercount) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  const currentBountyBudgetError = await validateCurrentBountyBudget(req.params.tid, {
    bountyTotalOverride: Number(bountyTotals.otherbounties ?? 0) + amount,
  });
  if (currentBountyBudgetError) {
    res.status(400).json({ error: currentBountyBudgetError });
    return;
  }
  const updated = await queryOne<{ bountyamount: number }>(
    `UPDATE tournamentplayers
     SET bountyamount = $3,
         bountyclaimedbyuserid = CASE WHEN $3::DECIMAL > 0 AND placed IS NOT NULL THEN bountyclaimedbyuserid ELSE NULL END,
         bountyclaimedat = CASE WHEN $3::DECIMAL > 0 AND placed IS NOT NULL THEN bountyclaimedat ELSE NULL END
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(CAST(bountyamount AS DECIMAL), 0) AS bountyamount`,
    [req.params.tid, req.params.uid, amount]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'bounty-update' });
  res.json({ success: true, bountyamount: updated.bountyamount });
});

playersRouter.put('/:tid/players/:uid/knock', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { placed, knockedoutbyuserid } = req.body as { placed?: number | null; knockedoutbyuserid?: string | null };
  const creditedKnockoutByUserId = typeof knockedoutbyuserid === 'string' && knockedoutbyuserid.trim()
    ? knockedoutbyuserid.trim()
    : null;
  let nextPlaced = parsePlaced(placed);
  let tournamentCompleted = false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query<{ placed: number | null }>(
      `SELECT CAST(placed AS INT) AS placed
       FROM tournamentplayers
       WHERE tournamentid = $1 AND userid = $2
       FOR UPDATE`,
      [req.params.tid, req.params.uid]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const currentPlaced = current.placed == null ? null : Number(current.placed);
    const bountySettings = await client.query<{ bountyenabled: boolean; bountymode: string | null; bountystartplace: number | null }>(
      `SELECT COALESCE(bountyenabled, FALSE) AS bountyenabled,
              COALESCE(bountymode, 'manual') AS bountymode,
              CAST(bountystartplace AS INT) AS bountystartplace
       FROM tournaments
       WHERE tournamentid = $1`,
      [req.params.tid]
    );
    const bountiesEnabled = Boolean(bountySettings.rows[0]?.bountyenabled);
    const bountyStartPlace = bountySettings.rows[0]?.bountystartplace == null
      ? null
      : Number(bountySettings.rows[0].bountystartplace);
    const bountyMode = bountySettings.rows[0]?.bountymode === 'mystery' ? 'mystery' : 'manual';
    if (nextPlaced != null && currentPlaced == null) {
      const activeResult = await client.query<{ activecount: number }>(
        `SELECT CAST(COALESCE(sum(CASE WHEN COALESCE(checkedin, FALSE) = TRUE AND placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) AS activecount
         FROM tournamentplayers
         WHERE tournamentid = $1`,
        [req.params.tid]
      );
      nextPlaced = Math.max(Number(activeResult.rows[0]?.activecount ?? nextPlaced), 1);
    }

    if (nextPlaced != null && bountiesEnabled && !creditedKnockoutByUserId) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Choose who knocked out this player before recording the placement.' });
      return;
    }
    if (nextPlaced != null && creditedKnockoutByUserId) {
      const validCreditResult = await client.query(
        `SELECT 1
         FROM tournamentplayers
         WHERE tournamentid = $1
           AND userid = $2
           AND userid != $3
           AND COALESCE(checkedin, FALSE) = TRUE
           AND placed IS NULL`,
        [req.params.tid, creditedKnockoutByUserId, req.params.uid]
      );
      if (!validCreditResult.rows[0]) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Choose a valid active player who knocked them out.' });
        return;
      }
    }

    if (nextPlaced == null) {
      if (currentPlaced != null) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed + 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed IS NOT NULL
             AND placed < $3`,
          [req.params.tid, req.params.uid, currentPlaced]
        );
      }
      await client.query(
        `UPDATE tournamentplayers
         SET placed = NULL,
             checkedin = TRUE,
             knockedoutbyuserid = NULL,
             knockedoutat = NULL,
             bountyclaimedbyuserid = NULL,
             bountyclaimedat = NULL,
             paid = FALSE
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.tid, req.params.uid]
      );
    } else {
      if (currentPlaced != null && nextPlaced < currentPlaced) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed + 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed >= $3
             AND placed < $4`,
          [req.params.tid, req.params.uid, nextPlaced, currentPlaced]
        );
      } else if (currentPlaced != null && nextPlaced > currentPlaced) {
        await client.query(
          `UPDATE tournamentplayers
           SET placed = placed - 1
           WHERE tournamentid = $1
             AND userid != $2
             AND placed <= $3
             AND placed > $4`,
          [req.params.tid, req.params.uid, nextPlaced, currentPlaced]
        );
      }

      await client.query(
        `UPDATE tournamentplayers
         SET placed = $3,
             checkedin = TRUE,
             knockedoutbyuserid = $4,
             knockedoutat = now(),
             bountyclaimedbyuserid = CASE WHEN $6::TEXT != 'mystery' AND COALESCE(bountyamount, 0) > 0 AND $3::INT > 1 AND ($5::INT IS NULL OR $3::INT <= $5::INT) THEN $4 ELSE NULL END,
             bountyclaimedat = CASE WHEN $6::TEXT != 'mystery' AND COALESCE(bountyamount, 0) > 0 AND $3::INT > 1 AND $4::UUID IS NOT NULL AND ($5::INT IS NULL OR $3::INT <= $5::INT) THEN now() ELSE NULL END
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.tid, req.params.uid, nextPlaced, creditedKnockoutByUserId, bountyStartPlace, bountyMode]
      );

      if (nextPlaced === 2) {
        const championResult = await client.query(
          `UPDATE tournamentplayers
           SET placed = 1,
               checkedin = TRUE,
               knockedoutbyuserid = NULL,
               knockedoutat = NULL,
               bountyclaimedbyuserid = NULL,
               bountyclaimedat = NULL
           WHERE tournamentid = $1
             AND userid != $2
             AND COALESCE(checkedin, FALSE) = TRUE
             AND placed IS NULL
             AND (
               SELECT count(*)
               FROM tournamentplayers remaining
               WHERE remaining.tournamentid = $1
                 AND remaining.userid != $2
                 AND COALESCE(remaining.checkedin, FALSE) = TRUE
                 AND remaining.placed IS NULL
             ) = 1`,
          [req.params.tid, req.params.uid]
        );
        tournamentCompleted = Number(championResult.rowCount ?? 0) > 0;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  if (tournamentCompleted) {
    await pauseTournamentTimer(req.params.tid, { reason: 'tournament-completed' });
  }
  if (nextPlaced != null && creditedKnockoutByUserId) {
    await assignMysteryBountyForKnockout(req.params.tid, req.params.uid, nextPlaced, creditedKnockoutByUserId);
  }
  await redistributeMysteryBountiesForTournament(req.params.tid);
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'knockout' });
  if (nextPlaced != null) {
    const knockedOutPlayer = await queryOne<{
      playername: string;
      bountyamount: number;
      bountyclaimedbyuserid: string | null;
    }>(
      `SELECT COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS playername,
              COALESCE(CAST(tp.bountyamount AS DECIMAL), 0) AS bountyamount,
              tp.bountyclaimedbyuserid
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
      WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.tid, req.params.uid]
    );
    void sendTournamentNotification(req.params.tid, 'knockout_recorded', {
      playerName: knockedOutPlayer?.playername ?? 'a player',
      body: `${knockedOutPlayer?.playername ?? 'A player'} was eliminated${nextPlaced ? ` in ${nextPlaced}${ordinalSuffix(nextPlaced)} place` : ''}.`,
      entityId: `${req.params.tid}:knockout:${req.params.uid}`,
      tag: `tournament-${req.params.tid}-knockout-${req.params.uid}`,
    }, {
      audience: 'participants-and-admins',
      entityId: `${req.params.tid}:knockout:${req.params.uid}`,
    }).catch((err) => {
      console.error('Knockout push failed', err instanceof Error ? err.message : err);
    });
    if (creditedKnockoutByUserId) {
      void sendTournamentNotification(req.params.tid, 'knockout_recorded', {
        playerName: knockedOutPlayer?.playername ?? 'a player',
        entityId: `${req.params.tid}:knockout-credit:${req.params.uid}`,
        tag: `tournament-${req.params.tid}-knockout-credit-${req.params.uid}`,
      }, {
        targetUserIds: [creditedKnockoutByUserId],
        entityId: `${req.params.tid}:knockout-credit:${req.params.uid}`,
      }).catch((err) => {
        console.error('Knockout credit push failed', err instanceof Error ? err.message : err);
      });
    }
    if (Number(knockedOutPlayer?.bountyamount ?? 0) > 0 && knockedOutPlayer?.bountyclaimedbyuserid) {
      void sendTournamentNotification(req.params.tid, 'bounty_earned', {
        entityId: `${req.params.tid}:bounty:${req.params.uid}`,
        tag: `tournament-${req.params.tid}-bounty-${req.params.uid}`,
      }, {
        targetUserIds: [knockedOutPlayer.bountyclaimedbyuserid],
        entityId: `${req.params.tid}:bounty:${req.params.uid}`,
      }).catch((err) => {
        console.error('Bounty push failed', err instanceof Error ? err.message : err);
      });
    }
  }
  res.json({ success: true });
});

playersRouter.put('/:tid/players/:uid/paid', async (req: Request, res: Response) => {
  if (!await canManagePlayers(req.params.tid, req.userId!)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const updated = await queryOne<{ paid: boolean }>(
    `UPDATE tournamentplayers
     SET paid = NOT COALESCE(paid, FALSE)
     WHERE tournamentid = $1 AND userid = $2
     RETURNING COALESCE(paid, FALSE) AS paid`,
    [req.params.tid, req.params.uid]
  );
  if (!updated) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  broadcastTournamentUpdate(req.params.tid, { players: true, source: 'payment' });
  res.json({ success: true, paid: updated.paid });
});
