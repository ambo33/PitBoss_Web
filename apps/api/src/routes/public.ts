import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool, query, queryOne } from '../db';
import { consumeAiCredit, getAccountProfile } from '../account';
import { isFeatureEnabled } from '../features';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { isTvBoardAvailable } from '../schedule';
import { KnockoutOption, LobbyEntry, LobbyFieldStats, SeatingAssignment, Tournament, TournamentPlayer } from '../types';
import { broadcastTournamentUpdate, pauseTournamentTimer } from '../socket';
import { assignSeatIfSeatingStarted } from '../services/seating';
import { redistributeMysteryBountiesForTournament } from '../services/bounties';
import { attachPlayerCoinBadges } from '../services/groupCoins';
import { attachPlayerAchievementCounts } from '../services/playerAchievements';
import { generateAnnouncerMoment, generateVoicePreview, normalizeAnnouncerPreset } from '../services/openai';
import { encryptEmail, hashEmail, privateEmailPlaceholder } from '../privacy';
import { sendTournamentNotification } from '../lib/server/notifications/notificationService';

export const publicRouter = Router();

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.thepokerplanner.com`;
}

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
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

publicRouter.post('/ai-voice-preview', async (req: Request, res: Response) => {
  const style = (req.body as { style?: string }).style === 'british_dealer' ? 'british_dealer' : 'football';
  try {
    const result = await generateVoicePreview(style);
    if (!result.aiEnabled || !result.audioBase64) {
      res.status(503).json({ error: 'Voice preview is unavailable right now.' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Voice preview failed', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'Voice preview is unavailable right now.' });
  }
});

publicRouter.post('/tv/:code/announcer', async (req: Request, res: Response) => {
  const normalizedCode = String(req.params.code ?? '').trim();
  if (!normalizedCode) {
    res.status(400).json({ error: 'TV code required' });
    return;
  }

  const body = req.body as {
    eventtype?: 'tournament_start' | 'tournament_winner' | 'timer_paused' | 'timer_resumed' | 'level_up' | 'five_minute_warning' | 'one_minute_warning' | 'knockout' | 'rebuy' | 'addon' | 'checkin';
    currentlevel?: number;
    previouslevel?: number | null;
    previouslevelstartedat?: string | null;
    smallblind?: number;
    bigblind?: number;
    ante?: number;
    knockedoutplayername?: string;
    knockedoutbyname?: string | null;
    placement?: number | null;
    prizeamount?: number | null;
    bountyamount?: number | null;
    bountyclaimedbyname?: string | null;
    playername?: string | null;
    isbreak?: boolean;
    breaklabel?: string | null;
    breakminutes?: number | null;
    resumingfrompause?: boolean;
    rebuycutoffwarning?: 'five_minute_warning' | 'one_minute_warning' | null;
    rebuyclosed?: boolean;
    prizepool?: number | null;
    playercount?: number | null;
    rebuyenabled?: boolean | null;
    rebuyamount?: number | null;
    addonenabled?: boolean | null;
    addonamount?: number | null;
  };
  const eventType = body.eventtype ?? 'knockout';
  if (!['tournament_start', 'tournament_winner', 'timer_paused', 'timer_resumed', 'level_up', 'five_minute_warning', 'one_minute_warning', 'knockout', 'rebuy', 'addon', 'checkin'].includes(eventType)) {
    res.status(400).json({ error: 'This TV announcer event is not supported.' });
    return;
  }

  const tournament = await queryOne<{
    tournamentid: string;
    name: string;
    groupname: string | null;
    ownerid: string;
    tourneydate: string | null;
    aiannouncerpreset: string | null;
    aiannouncerenabled: boolean | null;
    aiannouncercustomprompt: string | null;
    aiannouncerclassicmode: boolean | null;
    checkedincount: number;
    remainingplayers: number;
    totalrebuys: number;
    totaladdons: number;
  }>(
    `SELECT t.tournamentid, t.name, t.userid AS ownerid, t.date AS tourneydate, g.name AS groupname,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode,
            CAST(COALESCE(sum(CASE WHEN COALESCE(tp.checkedin, FALSE) = TRUE OR tp.placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
            CAST(COALESCE(sum(CASE WHEN COALESCE(tp.checkedin, FALSE) = TRUE AND tp.placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) AS remainingplayers,
            CAST(COALESCE(sum(COALESCE(tp.rebuys, 0)), 0) + COALESCE(t.genericrebuys, 0) AS INT) AS totalrebuys,
            CAST(COALESCE(sum(CASE WHEN ${truthySql('tp.addedon')} THEN 1 ELSE 0 END), 0) + COALESCE(t.genericaddons, 0) AS INT) AS totaladdons
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid
     WHERE t.tvdisplaycode = $1
     GROUP BY t.tournamentid, t.name, t.userid, t.date, g.name, g.aiannouncerpreset, g.aiannouncerenabled, g.aiannouncercustomprompt, g.aiannouncerclassicmode, t.genericrebuys, t.genericaddons`,
    [normalizedCode]
  );
  if (!tournament) {
    res.status(404).json({ error: 'TV board not found' });
    return;
  }
  if (!isFeatureEnabled('tvBoard') || !isTvBoardAvailable(tournament.tourneydate ?? undefined)) {
    res.status(403).json({ error: 'TV board is not available for this tournament.' });
    return;
  }
  if (!tournament.aiannouncerenabled) {
    res.status(409).json({ error: 'Voice announcer is not enabled for this group.' });
    return;
  }

  const ownerProfile = await getAccountProfile(tournament.ownerid);
  if (!ownerProfile?.canuseclubfeatures) {
    res.status(403).json({ error: 'Voice director is available on Club and Pro tiers.' });
    return;
  }
  const shouldChargeOwner = !ownerProfile.issuperadmin;
  if (shouldChargeOwner && ownerProfile.aicreditsremaining <= 0) {
    res.status(402).json({ error: 'No voice credits remaining for this host.' });
    return;
  }

  const checkedInPlayers = Number(tournament.checkedincount ?? 0);
  const totalAddons = Number(tournament.totaladdons ?? 0);
  const rawBountyAmount = body.bountyamount == null ? null : Number(body.bountyamount);
  const bountyAmount = rawBountyAmount != null && Number.isFinite(rawBountyAmount) && rawBountyAmount > 0
    ? rawBountyAmount
    : null;
  const bountyClaimedByName = bountyAmount != null && body.bountyclaimedbyname
    ? String(body.bountyclaimedbyname).trim().slice(0, 80)
    : null;
  const result = await generateAnnouncerMoment({
    preset: normalizeAnnouncerPreset(tournament.aiannouncerpreset),
    customPrompt: tournament.aiannouncercustomprompt,
    classicMode: Boolean(tournament.aiannouncerclassicmode),
    tournamentName: tournament.name,
    groupName: tournament.groupname,
    eventType,
    currentLevel: Number(body.currentlevel ?? 1),
    previousLevel: body.previouslevel == null ? null : Number(body.previouslevel),
    smallBlind: Number(body.smallblind ?? 0),
    bigBlind: Number(body.bigblind ?? 0),
    ante: Number(body.ante ?? 0),
    knockedOutPlayerName: body.knockedoutplayername ? String(body.knockedoutplayername).trim().slice(0, 80) : null,
    knockedOutByName: body.knockedoutbyname ? String(body.knockedoutbyname).trim().slice(0, 80) : null,
    placement: body.placement == null ? null : Number(body.placement),
    prizeAmount: body.prizeamount == null ? null : Number(body.prizeamount),
    bountyAmount,
    bountyClaimedByName,
    playerName: body.playername ? String(body.playername).trim().slice(0, 80) : null,
    isBreak: Boolean(body.isbreak),
    breakLabel: body.breaklabel ? String(body.breaklabel).trim().slice(0, 80) : null,
    breakMinutes: body.breakminutes == null ? null : Number(body.breakminutes),
    resumingFromPause: Boolean(body.resumingfrompause),
    rebuyCutoffWarning: body.rebuycutoffwarning === 'five_minute_warning' || body.rebuycutoffwarning === 'one_minute_warning' ? body.rebuycutoffwarning : null,
    rebuyClosed: Boolean(body.rebuyclosed),
    remainingPlayers: Number(tournament.remainingplayers ?? 0),
    checkedInPlayers,
    knockedOutDuringPriorLevel: 0,
    totalRebuys: Number(tournament.totalrebuys ?? 0),
    totalAddons,
    addOnPercent: checkedInPlayers > 0 ? Math.round((totalAddons / checkedInPlayers) * 100) : 0,
    prizePool: body.prizepool == null ? null : Number(body.prizepool),
    playerCount: body.playercount == null ? null : Number(body.playercount),
    rebuyEnabled: body.rebuyenabled == null ? null : Boolean(body.rebuyenabled),
    rebuyAmount: body.rebuyamount == null ? null : Number(body.rebuyamount),
    addonEnabled: body.addonenabled == null ? null : Boolean(body.addonenabled),
    addonAmount: body.addonamount == null ? null : Number(body.addonamount),
  });
  if (shouldChargeOwner && result.aiEnabled) {
    await consumeAiCredit(tournament.ownerid);
  }

  res.json(result);
});

publicRouter.get('/tv/:code', async (req: Request, res: Response) => {
  const normalizedCode = String(req.params.code ?? '').trim();
  if (!normalizedCode) {
    res.status(400).json({ error: 'TV code required' });
    return;
  }

  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.payoutstructure, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed,
            t.createdate AS createdat, t.groupid, g.name AS groupname, t.tvdisplaycode,
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
            COALESCE(g.speechfiveminutemessage, 'Five minutes remaining in this level.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in this level.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode,
            TRUE AS tvfeatureenabled,
            TRUE AS pocketadminenabled,
            COALESCE(owner_meta.isdemo, FALSE) AS isdemo,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN usermetadata owner_meta ON owner_meta.userid = t.userid
     WHERE t.tvdisplaycode = $1`,
    [normalizedCode]
  );
  if (!tournament) {
    res.status(404).json({ error: 'TV board not found' });
    return;
  }
  if (!isFeatureEnabled('tvBoard')) {
    res.status(403).json({ error: 'TV board is not enabled for this tournament.' });
    return;
  }
  if (!isTvBoardAvailable(tournament.tourneydate)) {
    res.status(403).json({ error: 'TV board is only available on the tournament date and the day after.' });
    return;
  }

  const players = await query<TournamentPlayer>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            m.checkinaudiodata,
            m.avatarimagedata,
            COALESCE(tp.checkedin, FALSE) AS checkedin,
            CAST(COALESCE(tp.rebuys, 0) AS INT) AS rebuys,
            CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(tp.placed AS INT) AS placed,
            COALESCE(km.nickname, NULLIF(trim(concat(coalesce(km.firstname, ''), ' ', coalesce(km.lastname, ''))), ''), ku.emailaddress) AS knockedoutbyname,
            tp.knockedoutbyuserid,
            COALESCE(CAST(tp.bountyamount AS DECIMAL), 0) AS bountyamount,
            tp.bountyclaimedbyuserid,
            COALESCE(bm.nickname, NULLIF(trim(concat(coalesce(bm.firstname, ''), ' ', coalesce(bm.lastname, ''))), ''), bu.emailaddress) AS bountyclaimedbyname,
            tp.bountyclaimedat,
            COALESCE(tp.paid, FALSE) AS paid,
            tp.createdate AS registeredat,
            CAST(ts."Table" AS INT) AS tablenumber,
            CAST(ts.seat AS INT) AS seat
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN users ku ON ku.guid = tp.knockedoutbyuserid
     LEFT JOIN usermetadata km ON km.userid = ku.guid
     LEFT JOIN users bu ON bu.guid = tp.bountyclaimedbyuserid
     LEFT JOIN usermetadata bm ON bm.userid = bu.guid
     LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY tp.createdate`,
    [tournament.tournamentid]
  );

  const playersWithAchievements = await attachPlayerAchievementCounts(players, tournament.groupid);
  const playersWithCoins = await attachPlayerCoinBadges(playersWithAchievements, tournament.groupid);
  res.json({ tournament, players: playersWithCoins });
});

publicRouter.get('/tournaments/:id/lobby', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout,
            COALESCE(g.speechfiveminutemessage, 'Five minutes remaining in this level.') AS speechfiveminutemessage,
            COALESCE(g.speechoneminutemessage, 'One minute remaining in this level.') AS speechoneminutemessage,
            COALESCE(g.speechlevelupmessage, 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.') AS speechlevelupmessage,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const field = await queryOne<LobbyFieldStats>(
    `SELECT
        CAST(count(*) AS INT) AS registeredcount,
        CAST(COALESCE(sum(CASE WHEN checkedin = TRUE THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
        CAST(COALESCE(sum(CASE WHEN placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) AS knockedoutcount,
        CAST(COALESCE(sum(CASE WHEN checkedin = TRUE AND placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) AS activecount,
        CAST(COALESCE(sum(COALESCE(rebuys, 0)), 0) + COALESCE($5::INT, 0) AS INT) AS totalrebuys,
        CAST(COALESCE(sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END), 0) + COALESCE($6::INT, 0) AS INT) AS totaladdons,
        CAST(
          COALESCE(sum(CASE WHEN checkedin = TRUE OR placed IS NOT NULL THEN COALESCE($2::DECIMAL, 0::DECIMAL) ELSE 0::DECIMAL END), 0::DECIMAL) +
          COALESCE((sum(COALESCE(rebuys, 0)) + COALESCE($5::INT, 0)) * COALESCE($3::DECIMAL, 0::DECIMAL), 0::DECIMAL) +
          COALESCE((sum(CASE WHEN ${truthySql('addedon')} THEN 1 ELSE 0 END) + COALESCE($6::INT, 0)) * COALESCE($4::DECIMAL, 0::DECIMAL), 0::DECIMAL)
          AS DECIMAL
        ) AS grosspot,
        CAST(COALESCE(sum(COALESCE(bountyamount, 0)), 0) AS DECIMAL) AS bountytotal,
        CAST(COALESCE(sum(CASE WHEN placed IS NULL THEN COALESCE(bountyamount, 0) ELSE 0 END), 0) AS DECIMAL) AS bountyremaining,
        CAST(COALESCE(sum(CASE WHEN bountyclaimedat IS NOT NULL THEN COALESCE(bountyamount, 0) ELSE 0 END), 0) AS DECIMAL) AS bountyclaimed
     FROM tournamentplayers
     WHERE tournamentid = $1`,
    [
      req.params.id,
      Number(tournament.buyin ?? 0),
      Number(tournament.rebuyprice ?? 0),
      Number(tournament.addonprice ?? 0),
      Number(tournament.genericrebuys ?? 0),
      Number(tournament.genericaddons ?? 0),
    ]
  );

  const seating = await query<SeatingAssignment>(
    `SELECT CAST(ts."Table" AS INT) AS tablenumber, ts.seat, u.guid AS userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentseating ts
     JOIN users u ON u.guid = ts.userid
     LEFT JOIN usermetadata m ON m.userid = ts.userid
     WHERE ts.tournamentid = $1
     ORDER BY CAST(ts."Table" AS INT), ts.seat`,
    [req.params.id]
  );

  const guestUserId = typeof req.query.guestUserId === 'string' ? req.query.guestUserId : null;
  const entryUserId = req.userId ?? guestUserId;
  let entry: LobbyEntry | null = null;
  let isdeclined = false;

  if (entryUserId) {
    entry = await queryOne<LobbyEntry>(
      `SELECT tp.userid, u.emailaddress,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
              COALESCE(tp.checkedin, FALSE) AS checkedin,
              CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
              CAST(tp.placed AS INT) AS placed,
              COALESCE(CAST(tp.bountyamount AS DECIMAL), 0) AS bountyamount,
              tp.bountyclaimedbyuserid,
              COALESCE(bm.nickname, NULLIF(trim(concat(coalesce(bm.firstname, ''), ' ', coalesce(bm.lastname, ''))), ''), bu.emailaddress) AS bountyclaimedbyname,
              tp.bountyclaimedat,
              CAST(ts."Table" AS INT) AS tablenumber,
              ts.seat
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       LEFT JOIN users bu ON bu.guid = tp.bountyclaimedbyuserid
       LEFT JOIN usermetadata bm ON bm.userid = tp.bountyclaimedbyuserid
       LEFT JOIN tournamentseating ts ON ts.tournamentid = tp.tournamentid AND ts.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
    if (entry) {
      [entry] = await attachPlayerCoinBadges([entry], tournament.groupid);
    }
    if (req.userId) {
      const declined = await queryOne(
        `SELECT 1 FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
        [req.params.id, req.userId]
      );
      isdeclined = Boolean(declined);
    }
  }

  const activePlayers = await query<KnockoutOption>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     WHERE tp.tournamentid = $1
       AND COALESCE(tp.checkedin, FALSE) = TRUE
       AND tp.placed IS NULL
       AND ($2::UUID IS NULL OR tp.userid <> $2::UUID)
     ORDER BY COALESCE(m.nickname, u.emailaddress)`,
    [req.params.id, entryUserId]
  );
  const activePlayersWithCoins = await attachPlayerCoinBadges(activePlayers, tournament.groupid);

  res.json({
    tournament,
    field: field ?? {
      registeredcount: 0,
      checkedincount: 0,
      knockedoutcount: 0,
      activecount: 0,
      totalrebuys: 0,
      totaladdons: 0,
      grosspot: 0,
      bountytotal: 0,
      bountyremaining: 0,
      bountyclaimed: 0,
    },
    seating,
    entry,
    isdeclined,
    activePlayers: activePlayersWithCoins,
  });
});

publicRouter.post('/tournaments/:id/checkin/self', requireAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<{
    tournamentid: string;
    ownerid: string;
    groupid: string | null;
    playerselftracking: boolean;
  }>(
    `SELECT tournamentid, userid AS ownerid, groupid, playerselftracking
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  let canRegister = tournament.ownerid === req.userId;
  if (!canRegister) {
    const existing = await queryOne(
      `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
      [req.params.id, req.userId]
    );
    canRegister = Boolean(existing);
  }
  if (!canRegister && tournament.groupid) {
    const member = await queryOne(
      `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
      [tournament.groupid, req.userId]
    );
    canRegister = Boolean(member);
  }
  if (!canRegister && !tournament.groupid) {
    canRegister = Boolean(tournament.playerselftracking);
  }

  if (!canRegister) {
    res.status(403).json({ error: 'You are not allowed to register for this tournament.' });
    return;
  }

  await query(
    `DELETE FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, req.userId]
  );

  const existing = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, req.userId]
  );

  if (!existing) {
    await query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
       VALUES ($1, $2, TRUE)`,
      [req.params.id, req.userId]
    );
  } else {
    await query(
      `UPDATE tournamentplayers
       SET checkedin = TRUE
       WHERE tournamentid = $1 AND userid = $2`,
      [req.params.id, req.userId]
    );
  }

  await assignSeatIfSeatingStarted(req.params.id, req.userId!);
  void sendTournamentNotification(req.params.id, 'player_check_in_confirmed', {}, {
    targetUserIds: [req.userId!],
    entityId: `${req.params.id}:${req.userId}:checkin`,
  }).catch((err) => {
    console.error('Public check-in push failed', err instanceof Error ? err.message : err);
  });
  await redistributeMysteryBountiesForTournament(req.params.id);
  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-checkin' });
  res.json({ success: true });
});

publicRouter.post('/tournaments/:id/checkin/guest', async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const displayname = String((req.body as { displayname?: string }).displayname ?? '').trim();

  if (guestUserId) {
    const existing = await queryOne(
      `SELECT 1
       FROM tournamentplayers tp
       JOIN usermetadata um ON um.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2 AND COALESCE(um.isguestuser, FALSE) = TRUE`,
      [req.params.id, guestUserId]
    );
    if (existing) {
      await query(
        `UPDATE tournamentplayers
         SET checkedin = TRUE
         WHERE tournamentid = $1 AND userid = $2`,
        [req.params.id, guestUserId]
      );
      await assignSeatIfSeatingStarted(req.params.id, guestUserId);
      await redistributeMysteryBountiesForTournament(req.params.id);
      broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-recheckin' });
      res.json({ success: true, guestUserId });
      return;
    }
  }

  if (!displayname) {
    res.status(400).json({ error: 'Guest name required' });
    return;
  }

  const tournament = await queryOne<{ ownerid: string }>(
    `SELECT userid AS ownerid FROM tournaments WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

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
      [createdUser.guid, displayname, tournament.ownerid]
    );

    await client.query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
       VALUES ($1, $2, TRUE)`,
      [req.params.id, createdUser.guid]
    );

    await client.query('COMMIT');
    await assignSeatIfSeatingStarted(req.params.id, createdUser.guid);
    await redistributeMysteryBountiesForTournament(req.params.id);
    broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-checkin' });
    res.status(201).json({ success: true, guestUserId: createdUser.guid });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

publicRouter.post('/tournaments/:id/register/self', requireAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<{
    tournamentid: string;
    ownerid: string;
    groupid: string | null;
    playerselftracking: boolean;
  }>(
    `SELECT tournamentid, userid AS ownerid, groupid, playerselftracking
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  let canRegister = tournament.ownerid === req.userId;
  if (!canRegister && tournament.groupid) {
    const member = await queryOne(
      `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
      [tournament.groupid, req.userId]
    );
    canRegister = Boolean(member);
  }
  if (!canRegister && !tournament.groupid) {
    canRegister = Boolean(tournament.playerselftracking);
  }

  if (!canRegister) {
    res.status(403).json({ error: 'You are not allowed to register for this tournament.' });
    return;
  }

  await query(
    `DELETE FROM tournamentdeclines WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, req.userId]
  );
  await query(
    `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
     VALUES ($1, $2, FALSE)
     ON CONFLICT DO NOTHING`,
    [req.params.id, req.userId]
  );

  await redistributeMysteryBountiesForTournament(req.params.id);
  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-register-lobby' });
  res.json({ success: true });
});

publicRouter.post('/tournaments/:id/register/guest', async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const displayname = String((req.body as { displayname?: string }).displayname ?? '').trim();

  if (guestUserId) {
    const existing = await queryOne(
      `SELECT 1
       FROM tournamentplayers tp
       JOIN usermetadata um ON um.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2 AND COALESCE(um.isguestuser, FALSE) = TRUE`,
      [req.params.id, guestUserId]
    );
    if (existing) {
      res.json({ success: true, guestUserId });
      return;
    }
  }

  if (!displayname) {
    res.status(400).json({ error: 'Guest name required' });
    return;
  }

  const tournament = await queryOne<{ ownerid: string }>(
    `SELECT userid AS ownerid FROM tournaments WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

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
      [createdUser.guid, displayname, tournament.ownerid]
    );

    await client.query(
      `INSERT INTO tournamentplayers (tournamentid, userid, checkedin)
       VALUES ($1, $2, FALSE)`,
      [req.params.id, createdUser.guid]
    );

    await client.query('COMMIT');
    await redistributeMysteryBountiesForTournament(req.params.id);
    broadcastTournamentUpdate(req.params.id, { players: true, source: 'guest-register-lobby' });
    res.status(201).json({ success: true, guestUserId: createdUser.guid });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

publicRouter.get('/tournaments/:id/knockout', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const guestUserId = typeof req.query.guestUserId === 'string' ? req.query.guestUserId : null;
  const entryUserId = req.userId ?? guestUserId;

  let entry: LobbyEntry | null = null;
  if (entryUserId) {
    entry = await queryOne<LobbyEntry>(
      `SELECT tp.userid, u.emailaddress,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
              COALESCE(tp.checkedin, FALSE) AS checkedin,
              CAST(tp.placed AS INT) AS placed,
              COALESCE(CAST(tp.bountyamount AS DECIMAL), 0) AS bountyamount,
              tp.bountyclaimedbyuserid,
              COALESCE(bm.nickname, NULLIF(trim(concat(coalesce(bm.firstname, ''), ' ', coalesce(bm.lastname, ''))), ''), bu.emailaddress) AS bountyclaimedbyname,
              tp.bountyclaimedat
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       LEFT JOIN users bu ON bu.guid = tp.bountyclaimedbyuserid
       LEFT JOIN usermetadata bm ON bm.userid = tp.bountyclaimedbyuserid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
    if (entry) {
      [entry] = await attachPlayerCoinBadges([entry], tournament.groupid);
    }
  }

  const activePlayers = await query<KnockoutOption>(
    `SELECT tp.userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     WHERE tp.tournamentid = $1
       AND COALESCE(tp.checkedin, FALSE) = TRUE
       AND tp.placed IS NULL
       AND ($2::UUID IS NULL OR tp.userid <> $2::UUID)
     ORDER BY COALESCE(m.nickname, u.emailaddress)`,
    [req.params.id, entryUserId]
  );
  const activePlayersWithCoins = await attachPlayerCoinBadges(activePlayers, tournament.groupid);

  res.json({ tournament, entry, activePlayers: activePlayersWithCoins });
});

publicRouter.get('/tournaments/:id/addon', optionalAuth, async (req: Request, res: Response) => {
  const tournament = await queryOne<Tournament>(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, COALESCE(CAST(t.adjustment AS DECIMAL), 0) AS rake, t.rebuycost AS rebuyprice, t.rebuychips, CAST(t.rebuylastlevel AS INT) AS rebuylastlevel,
            COALESCE(t.genericrebuys, 0) AS genericrebuys, t.addoncost AS addonprice, t.addonchips, COALESCE(t.genericaddons, 0) AS genericaddons,
            t.maxplayers, t.playerselftracking, TRUE AS active,
            t.createdate AS createdat, t.groupid, g.name AS groupname,
            COALESCE(t.bountyenabled, FALSE) AS bountyenabled,
            COALESCE(t.bountymode, 'manual') AS bountymode,
            COALESCE(CAST(t.bountyprizepool AS DECIMAL), 0) AS bountyprizepool,
            COALESCE(t.bountypooltype, 'amount') AS bountypooltype,
            COALESCE(CAST(t.bountyroundingdenomination AS DECIMAL), 5) AS bountyroundingdenomination,
            CAST(t.bountystartplace AS INT) AS bountystartplace,
            COALESCE(CAST(t.bountyminpayout AS DECIMAL), 0) AS bountyminpayout
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }

  const guestUserId = typeof req.query.guestUserId === 'string' ? req.query.guestUserId : null;
  const entryUserId = req.userId ?? guestUserId;

  let entry: LobbyEntry | null = null;
  if (entryUserId) {
    entry = await queryOne<LobbyEntry>(
      `SELECT tp.userid, u.emailaddress,
              COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
              COALESCE(tp.checkedin, FALSE) AS checkedin,
              CASE WHEN ${truthySql('tp.addedon')} THEN TRUE ELSE FALSE END AS addedon,
              CAST(tp.placed AS INT) AS placed
       FROM tournamentplayers tp
       JOIN users u ON u.guid = tp.userid
       LEFT JOIN usermetadata m ON m.userid = tp.userid
       WHERE tp.tournamentid = $1 AND tp.userid = $2`,
      [req.params.id, entryUserId]
    );
    if (entry) {
      [entry] = await attachPlayerCoinBadges([entry], tournament.groupid);
    }
  }

  res.json({ tournament, entry });
});

publicRouter.post('/tournaments/:id/addon/self', optionalAuth, async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const playerUserId = req.userId ?? guestUserId;

  if (!playerUserId) {
    res.status(401).json({ error: 'Sign in or return on the same device you used to check in.' });
    return;
  }

  const tournament = await queryOne<{ ownerid: string; addonprice: number; addonchips: number }>(
    `SELECT userid AS ownerid, addoncost AS addonprice, addonchips
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  if (Number(tournament.addonprice ?? 0) <= 0 || Number(tournament.addonchips ?? 0) <= 0) {
    res.status(400).json({ error: 'Add-ons are not enabled for this tournament.' });
    return;
  }
  const ownerProfile = await getAccountProfile(tournament.ownerid);
  if (!ownerProfile?.canuseclubfeatures) {
    res.status(403).json({ error: 'Player-level add-on tracking is available on Club and Pro tiers.' });
    return;
  }

  const entry = await queryOne<{ checkedin: boolean; addedon: boolean; placed: number | null }>(
    `SELECT COALESCE(checkedin, FALSE) AS checkedin,
            CASE WHEN ${truthySql('addedon')} THEN TRUE ELSE FALSE END AS addedon,
            CAST(placed AS INT) AS placed
     FROM tournamentplayers
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );
  if (!entry) {
    res.status(404).json({ error: 'You are not registered for this tournament on this device.' });
    return;
  }
  if (!entry.checkedin) {
    res.status(409).json({ error: 'You must be checked in before using the add-on QR.' });
    return;
  }
  if (entry.placed != null) {
    res.status(409).json({ error: 'You cannot add on after being knocked out.' });
    return;
  }
  if (entry.addedon) {
    res.json({ success: true, addedon: true });
    return;
  }

  await query(
    `UPDATE tournamentplayers
     SET addedon = 1
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );

  await redistributeMysteryBountiesForTournament(req.params.id);
  broadcastTournamentUpdate(req.params.id, { players: true, source: 'public-addon' });
  res.json({ success: true, addedon: true });
});

publicRouter.post('/tournaments/:id/knockout/self', optionalAuth, async (req: Request, res: Response) => {
  const guestUserId = typeof (req.body as { guestUserId?: string }).guestUserId === 'string'
    ? String((req.body as { guestUserId?: string }).guestUserId)
    : '';
  const body = req.body as { knockedoutByUserId?: string; knockedOutByUserId?: string };
  const knockedoutByUserId = typeof (body.knockedoutByUserId ?? body.knockedOutByUserId) === 'string'
    ? String(body.knockedoutByUserId ?? body.knockedOutByUserId).trim() || null
    : null;
  const playerUserId = req.userId ?? guestUserId;

  if (!playerUserId) {
    res.status(401).json({ error: 'Sign in or return on the same device you used to check in.' });
    return;
  }

  const entry = await queryOne<{ checkedin: boolean; placed: number | null }>(
    `SELECT COALESCE(checkedin, FALSE) AS checkedin, CAST(placed AS INT) AS placed
     FROM tournamentplayers
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId]
  );
  if (!entry) {
    res.status(404).json({ error: 'You are not registered for this tournament on this device.' });
    return;
  }
  if (entry.placed != null) {
    res.status(409).json({ error: 'You have already been marked out.' });
    return;
  }
  if (!entry.checkedin) {
    res.status(409).json({ error: 'You must be checked in before reporting a knockout.' });
    return;
  }

  if (knockedoutByUserId) {
    const validKnockoutBy = await queryOne(
      `SELECT 1
       FROM tournamentplayers
       WHERE tournamentid = $1
         AND userid = $2
         AND COALESCE(checkedin, FALSE) = TRUE
         AND placed IS NULL`,
      [req.params.id, knockedoutByUserId]
    );
    if (!validKnockoutBy || knockedoutByUserId === playerUserId) {
      res.status(400).json({ error: 'Choose a valid player who knocked you out.' });
      return;
    }
  }

  const activeField = await queryOne<{ activecount: number; bountyenabled: boolean; bountystartplace: number | null }>(
    `SELECT CAST(COALESCE(sum(CASE WHEN COALESCE(tp.checkedin, FALSE) = TRUE AND tp.placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) AS activecount
            , COALESCE(MAX(CASE WHEN COALESCE(t.bountyenabled, FALSE) = TRUE THEN 1 ELSE 0 END), 0) = 1 AS bountyenabled
            , CAST(MAX(t.bountystartplace) AS INT) AS bountystartplace
     FROM tournamentplayers tp
     JOIN tournaments t ON t.tournamentid = tp.tournamentid
     WHERE tp.tournamentid = $1`,
    [req.params.id]
  );
  const placed = Math.max(Number(activeField?.activecount ?? 0), 1);
  const bountyStartPlace = activeField?.bountystartplace == null ? null : Number(activeField.bountystartplace);
  if (activeField?.bountyenabled && !knockedoutByUserId) {
    res.status(400).json({ error: 'Choose who knocked you out before submitting.' });
    return;
  }

  await query(
    `UPDATE tournamentplayers
     SET placed = $3,
         checkedin = TRUE,
         knockedoutbyuserid = $4,
         knockedoutat = now(),
         bountyclaimedbyuserid = CASE WHEN COALESCE(bountyamount, 0) > 0 AND ($5::INT IS NULL OR $3::INT <= $5::INT) THEN $4 ELSE NULL END,
         bountyclaimedat = CASE WHEN COALESCE(bountyamount, 0) > 0 AND $4::UUID IS NOT NULL AND ($5::INT IS NULL OR $3::INT <= $5::INT) THEN now() ELSE NULL END
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, playerUserId, placed, knockedoutByUserId, bountyStartPlace]
  );

  let tournamentCompleted = false;
  if (placed === 2) {
    const championRows = await query<{ userid: string }>(
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
         ) = 1
       RETURNING userid`,
      [req.params.id, playerUserId]
    );
    tournamentCompleted = championRows.length > 0;
  }

  if (tournamentCompleted) {
    await pauseTournamentTimer(req.params.id, { reason: 'tournament-completed' });
  }
  await redistributeMysteryBountiesForTournament(req.params.id);
  broadcastTournamentUpdate(req.params.id, { players: true, source: 'self-knockout' });

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
    [req.params.id, playerUserId]
  );
  void sendTournamentNotification(req.params.id, 'knockout_recorded', {
    playerName: knockedOutPlayer?.playername ?? 'a player',
    body: `${knockedOutPlayer?.playername ?? 'A player'} was eliminated in ${placed}${ordinalSuffix(placed)} place.`,
    entityId: `${req.params.id}:knockout:${playerUserId}`,
    tag: `tournament-${req.params.id}-knockout-${playerUserId}`,
  }, {
    audience: 'participants-and-admins',
    entityId: `${req.params.id}:knockout:${playerUserId}`,
  }).catch((err) => {
    console.error('Self knockout push failed', err instanceof Error ? err.message : err);
  });
  if (knockedoutByUserId) {
    void sendTournamentNotification(req.params.id, 'knockout_recorded', {
      playerName: knockedOutPlayer?.playername ?? 'a player',
      entityId: `${req.params.id}:knockout-credit:${playerUserId}`,
      tag: `tournament-${req.params.id}-knockout-credit-${playerUserId}`,
    }, {
      targetUserIds: [knockedoutByUserId],
      entityId: `${req.params.id}:knockout-credit:${playerUserId}`,
    }).catch((err) => {
      console.error('Self knockout credit push failed', err instanceof Error ? err.message : err);
    });
  }
  if (Number(knockedOutPlayer?.bountyamount ?? 0) > 0 && knockedOutPlayer?.bountyclaimedbyuserid) {
    void sendTournamentNotification(req.params.id, 'bounty_earned', {
      entityId: `${req.params.id}:bounty:${playerUserId}`,
      tag: `tournament-${req.params.id}-bounty-${playerUserId}`,
    }, {
      targetUserIds: [knockedOutPlayer.bountyclaimedbyuserid],
      entityId: `${req.params.id}:bounty:${playerUserId}`,
    }).catch((err) => {
      console.error('Self bounty push failed', err instanceof Error ? err.message : err);
    });
  }
  res.json({ success: true, placed });
});
