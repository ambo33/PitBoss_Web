import { Router, Request, Response } from 'express';
import { queryOne } from '../db';
import { consumeAiCredit, getAccountProfile } from '../account';
import { requireAuth } from '../middleware/auth';
import { analyzePokerHand, generateAnnouncerMoment, normalizeAnnouncerPreset } from '../services/openai';

export const aiRouter = Router();
aiRouter.use(requireAuth);

function truthySql(column: string) {
  return `LOWER(COALESCE(CAST(${column} AS STRING), '0')) IN ('1', 'true', 't')`;
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

aiRouter.post('/tournaments/:id/announcer', async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can generate announcer audio.' });
    return;
  }

  const body = req.body as {
    eventtype?: 'level_up' | 'five_minute_warning' | 'one_minute_warning' | 'knockout' | 'rebuy' | 'addon' | 'checkin';
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
  };

  const tournament = await queryOne<{
    name: string;
    groupname: string | null;
    ownerid: string;
    aiannouncerpreset: string | null;
    aiannouncerenabled: boolean | null;
    aiannouncercustomprompt: string | null;
    aiannouncerclassicmode: boolean | null;
    checkedincount: number;
    remainingplayers: number;
    totalrebuys: number;
    totaladdons: number;
    knockedoutduringpriorlevel: number;
  }>(
    `SELECT t.name, t.userid AS ownerid, g.name AS groupname,
            COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset,
            COALESCE(g.aiannouncerenabled, FALSE) AS aiannouncerenabled,
            g.aiannouncercustomprompt,
            COALESCE(g.aiannouncerclassicmode, FALSE) AS aiannouncerclassicmode,
            CAST(COALESCE(sum(CASE WHEN COALESCE(tp.checkedin, FALSE) = TRUE OR tp.placed IS NOT NULL THEN 1 ELSE 0 END), 0) AS INT) AS checkedincount,
            CAST(COALESCE(sum(CASE WHEN COALESCE(tp.checkedin, FALSE) = TRUE AND tp.placed IS NULL THEN 1 ELSE 0 END), 0) AS INT) AS remainingplayers,
            CAST(COALESCE(sum(COALESCE(tp.rebuys, 0)), 0) + COALESCE(t.genericrebuys, 0) AS INT) AS totalrebuys,
            CAST(COALESCE(sum(CASE WHEN ${truthySql('tp.addedon')} THEN 1 ELSE 0 END), 0) + COALESCE(t.genericaddons, 0) AS INT) AS totaladdons,
            CAST(COALESCE(sum(CASE WHEN tp.knockedoutat >= COALESCE($2::TIMESTAMPTZ, now()) THEN 1 ELSE 0 END), 0) AS INT) AS knockedoutduringpriorlevel
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid
     WHERE t.tournamentid = $1
     GROUP BY t.name, t.userid, g.name, g.aiannouncerpreset, g.aiannouncerenabled, g.aiannouncercustomprompt, g.aiannouncerclassicmode, t.genericrebuys, t.genericaddons`,
    [req.params.id, body.previouslevelstartedat ?? null]
  );
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  if (!tournament.aiannouncerenabled) {
    res.status(409).json({ error: 'AI announcer is not enabled for this group.' });
    return;
  }
  const ownerProfile = await getAccountProfile(tournament.ownerid);
  if (!ownerProfile?.canuseclubfeatures) {
    res.status(403).json({ error: 'AI voice director is available on Club and Pro tiers.' });
    return;
  }
  const shouldChargeOwner = !ownerProfile.issuperadmin;
  if (shouldChargeOwner && ownerProfile.aicreditsremaining <= 0) {
    res.status(402).json({ error: 'No AI credits remaining for this host.' });
    return;
  }

  const checkedInPlayers = Number(tournament.checkedincount ?? 0);
  const totalAddons = Number(tournament.totaladdons ?? 0);
  const result = await generateAnnouncerMoment({
    preset: normalizeAnnouncerPreset(tournament.aiannouncerpreset),
    customPrompt: tournament.aiannouncercustomprompt,
    classicMode: Boolean(tournament.aiannouncerclassicmode),
    tournamentName: tournament.name,
    groupName: tournament.groupname,
    eventType: body.eventtype ?? 'level_up',
    currentLevel: Number(body.currentlevel ?? 1),
    previousLevel: body.previouslevel ?? null,
    smallBlind: Number(body.smallblind ?? 0),
    bigBlind: Number(body.bigblind ?? 0),
    ante: Number(body.ante ?? 0),
    knockedOutPlayerName: body.knockedoutplayername ? String(body.knockedoutplayername).trim().slice(0, 80) : null,
    knockedOutByName: body.knockedoutbyname ? String(body.knockedoutbyname).trim().slice(0, 80) : null,
    placement: body.placement == null ? null : Number(body.placement),
    prizeAmount: body.prizeamount == null ? null : Number(body.prizeamount),
    bountyAmount: body.bountyamount == null ? null : Number(body.bountyamount),
    bountyClaimedByName: body.bountyclaimedbyname ? String(body.bountyclaimedbyname).trim().slice(0, 80) : null,
    playerName: body.playername ? String(body.playername).trim().slice(0, 80) : null,
    remainingPlayers: Number(tournament.remainingplayers ?? 0),
    checkedInPlayers,
    knockedOutDuringPriorLevel: Number(tournament.knockedoutduringpriorlevel ?? 0),
    totalRebuys: Number(tournament.totalrebuys ?? 0),
    totalAddons,
    addOnPercent: checkedInPlayers > 0 ? Math.round((totalAddons / checkedInPlayers) * 100) : 0,
  });
  if (shouldChargeOwner && result.aiEnabled) {
    await consumeAiCredit(tournament.ownerid);
  }

  res.json(result);
});

aiRouter.post('/tournaments/:id/analyze-hand', async (req: Request, res: Response) => {
  const handText = String((req.body as { hand?: string }).hand ?? '').trim().slice(0, 2400);
  if (!handText) {
    res.status(400).json({ error: 'Describe the hand first.' });
    return;
  }

  const tournament = await queryOne<{
    name: string;
    aiannouncerpreset: string | null;
  }>(
    `SELECT t.name, COALESCE(g.aiannouncerpreset, 'all_in_alex') AS aiannouncerpreset
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     LEFT JOIN tournamentplayers tp ON tp.tournamentid = t.tournamentid AND tp.userid = $2
     WHERE t.tournamentid = $1
       AND (t.userid = $2 OR tp.userid IS NOT NULL OR EXISTS (
         SELECT 1 FROM groupmembers gm WHERE gm.groupid = t.groupid AND gm.userid = $2 AND gm.approved = TRUE
       ))`,
    [req.params.id, req.userId]
  );
  if (!tournament) {
    res.status(403).json({ error: 'Join or register for this tournament to analyze a hand.' });
    return;
  }
  const requesterProfile = await getAccountProfile(req.userId!);
  const shouldChargeRequester = !requesterProfile?.issuperadmin;
  if (shouldChargeRequester && Number(requesterProfile?.aicreditsremaining ?? 0) <= 0) {
    res.status(402).json({ error: 'No AI credits remaining.' });
    return;
  }

  const timer = req.body as { blindlevel?: number; smallblind?: number; bigblind?: number; ante?: number };
  const result = await analyzePokerHand({
    preset: normalizeAnnouncerPreset(tournament.aiannouncerpreset),
    tournamentName: tournament.name,
    blindLevel: timer.blindlevel ?? null,
    smallBlind: timer.smallblind ?? null,
    bigBlind: timer.bigblind ?? null,
    ante: timer.ante ?? null,
    handText,
  });
  if (shouldChargeRequester && result.aiEnabled) {
    await consumeAiCredit(req.userId!);
  }
  res.json(result);
});
