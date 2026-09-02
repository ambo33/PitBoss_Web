import { Router, Request, Response } from 'express';
import { pool, query, queryOne } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../account';
import { getAppUrl } from '../config';
import { broadcastTournamentUpdate } from '../socket';
import { isDatabaseTrue } from '../utils/booleans';
import {
  addSpotifyUriToQueue,
  attachMusicRequesterToCurrentTrack,
  completeSpotifyLogin,
  createSpotifyLoginUrl,
  disconnectSpotify,
  getCurrentlyPlayingTrackForHost,
  getSpotifyConnectionSummary,
  getSpotifyHostForTournament,
  getTournamentMusicQueue,
  searchSpotifyTracksForHost,
  syncTournamentMusicQueue,
} from '../services/spotify';

export const spotifyRouter = Router();

type MusicRequestPayload = {
  spotifyuri?: string;
  trackname?: string;
  artistname?: string;
  albumimageurl?: string | null;
  guestUserId?: string;
  spendVipPoints?: boolean;
};

type SpotifyQueueResult =
  | { queued: true }
  | { queued: false; message: string; status?: number };

async function canManageTournament(tournamentId: string, userId: string): Promise<boolean> {
  if (await requireSuperAdmin(userId)) return true;

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
        WHEN EXISTS (
          SELECT 1
          FROM leagueevents le
          JOIN leaguemembers lm ON lm.leagueid = le.leagueid AND lm.userid = $2
          WHERE le.tournamentid = t.tournamentid
            AND lm.approved = TRUE
            AND lm.admin = TRUE
        ) THEN TRUE
        ELSE FALSE
      END AS canmanage
     FROM tournaments t
     WHERE t.tournamentid = $1`,
    [tournamentId, userId]
  );
  return isDatabaseTrue(row?.canmanage);
}

async function getTournamentMusicAvailability(tournamentId: string, preferredUserId?: string | null) {
  const tournament = await queryOne<{
    ownerid: string;
    musicrequestsenabled: boolean | null;
    musicrequestlimit: number | string | null;
    musicrequestwindowminutes: number | string | null;
    timerrunning: boolean | null;
  }>(
    `SELECT t.userid AS ownerid,
            COALESCE(t.musicrequestsenabled, FALSE) AS musicrequestsenabled,
            t.musicrequestlimit,
            COALESCE(t.musicrequestwindowminutes, 5) AS musicrequestwindowminutes,
            COALESCE(tt.running, FALSE) AS timerrunning
     FROM tournaments t
     LEFT JOIN tournamenttimer tt ON tt.tournamentid = t.tournamentid
     WHERE t.tournamentid = $1`,
    [tournamentId]
  );
  if (!tournament) return null;
  const spotifyHost = await getSpotifyHostForTournament(tournamentId, preferredUserId);
  const spotify = spotifyHost?.summary ?? { connected: false };
  const isRunning = Boolean(tournament.timerrunning);
  const enabled = Boolean(tournament.musicrequestsenabled) && isRunning && spotify.connected;
  const currentTrack = spotifyHost && isRunning
    ? await getCurrentlyPlayingTrackForHost(spotifyHost.userid).catch(() => null)
    : null;
  const currentTrackWithRequester = await attachMusicRequesterToCurrentTrack(tournamentId, currentTrack).catch(() => currentTrack);
  return {
    ownerid: tournament.ownerid,
    spotifyhostuserid: spotifyHost?.userid ?? null,
    musicrequestsenabled: Boolean(tournament.musicrequestsenabled),
    musicrequestlimit: tournament.musicrequestlimit == null ? null : Math.max(1, Number(tournament.musicrequestlimit)),
    musicrequestwindowminutes: Math.min(1440, Math.max(1, Number(tournament.musicrequestwindowminutes ?? 5))),
    isRunning,
    enabled,
    spotify,
    currentTrack: currentTrackWithRequester,
  };
}

async function getTournamentMusicRequesters(tournamentId: string) {
  const rows = await query<{ userid: string; displayname: string; blocked: boolean }>(
    `SELECT tp.userid,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            b.userid IS NOT NULL AS blocked
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN tournamentmusicrequestblocks b
       ON b.tournamentid = tp.tournamentid
      AND b.userid = tp.userid
     WHERE tp.tournamentid = $1
     ORDER BY lower(COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress)) ASC`,
    [tournamentId]
  );
  return rows.map((row) => ({ ...row, blocked: Boolean(row.blocked) }));
}

function cleanTrackText(value: unknown, max: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanSpotifyUri(value: unknown) {
  const uri = cleanTrackText(value, 180);
  return /^spotify:track:[A-Za-z0-9]+$/.test(uri) ? uri : '';
}

function getSpotifyQueueError(error: unknown): { message: string; status?: number } {
  const spotifyError = error as Error & { status?: number };
  return {
    message: spotifyError instanceof Error ? spotifyError.message.slice(0, 240) : 'Spotify queue failed.',
    status: spotifyError.status,
  };
}

async function queueMusicRequestOnSpotify(
  hostUserId: string,
  request: { requestid: string; spotifyuri: string }
): Promise<SpotifyQueueResult> {
  try {
    await addSpotifyUriToQueue(hostUserId, request.spotifyuri);
    await query(
      `UPDATE tournamentmusicrequests
       SET status = 'queued', spotifyqueuedat = now(), failuremessage = NULL, updatedat = now()
       WHERE requestid = $1`,
      [request.requestid]
    );
    return { queued: true };
  } catch (error) {
    const failure = getSpotifyQueueError(error);
    await query(
      `UPDATE tournamentmusicrequests
       SET status = 'failed', failuremessage = $2, updatedat = now()
       WHERE requestid = $1`,
      [request.requestid, failure.message]
    );
    return { queued: false, ...failure };
  }
}

function redirectWithStatus(returnPath: string, status: 'connected' | 'error', message?: string) {
  const target = new URL(returnPath || '/', getAppUrl());
  target.searchParams.set('spotify', status);
  if (message) target.searchParams.set('spotifyMessage', message.slice(0, 160));
  return target.toString();
}

spotifyRouter.get('/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    res.redirect(redirectWithStatus('/', 'error', 'Spotify did not return a valid sign-in.'));
    return;
  }
  try {
    const returnPath = await completeSpotifyLogin(code, state);
    res.redirect(redirectWithStatus(returnPath, 'connected'));
  } catch (error) {
    res.redirect(redirectWithStatus('/', 'error', error instanceof Error ? error.message : 'Spotify connection failed.'));
  }
});

spotifyRouter.get('/status', requireAuth, async (req: Request, res: Response) => {
  res.json(await getSpotifyConnectionSummary(req.userId!));
});

spotifyRouter.post('/login-url', requireAuth, async (req: Request, res: Response) => {
  const { returnPath } = req.body as { returnPath?: string };
  res.json({ url: await createSpotifyLoginUrl(req.userId!, returnPath) });
});

spotifyRouter.delete('/connection', requireAuth, async (req: Request, res: Response) => {
  await disconnectSpotify(req.userId!);
  res.json({ success: true });
});

spotifyRouter.get('/tournaments/:id/music', requireAuth, async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can manage music requests.' });
    return;
  }

  const availability = await getTournamentMusicAvailability(req.params.id, req.userId);
  if (!availability) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }

  let spotifyQueue: Awaited<ReturnType<typeof syncTournamentMusicQueue>> | null = null;
  if (availability.isRunning && availability.spotify.connected) {
    try {
      spotifyQueue = await syncTournamentMusicQueue(req.params.id, availability.spotifyhostuserid ?? availability.ownerid);
    } catch {
      spotifyQueue = null;
    }
  }

  res.json({
    enabled: availability.enabled,
    isRunning: availability.isRunning,
    musicrequestsenabled: availability.musicrequestsenabled,
    musicrequestlimit: availability.musicrequestlimit,
    musicrequestwindowminutes: availability.musicrequestwindowminutes,
    spotify: availability.spotify,
    currentTrack: availability.currentTrack,
    spotifyqueue: spotifyQueue?.queue ?? null,
    requesters: await getTournamentMusicRequesters(req.params.id),
    requests: await getTournamentMusicQueue(req.params.id),
  });
});

spotifyRouter.put('/tournaments/:id/music/settings', requireAuth, async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can manage music requests.' });
    return;
  }

  const existing = await queryOne<{ musicrequestlimit: number | string | null; musicrequestwindowminutes: number | string | null }>(
    `SELECT musicrequestlimit, musicrequestwindowminutes
     FROM tournaments
     WHERE tournamentid = $1`,
    [req.params.id]
  );
  if (!existing) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }

  const body = req.body as { requestLimit?: unknown; requestWindowMinutes?: unknown };
  const hasLimit = Object.prototype.hasOwnProperty.call(body, 'requestLimit');
  const hasWindow = Object.prototype.hasOwnProperty.call(body, 'requestWindowMinutes');
  const rawLimit = hasLimit ? body.requestLimit : existing.musicrequestlimit;
  const parsedLimit = rawLimit == null || rawLimit === '' || Number(rawLimit) === 0 ? null : Number(rawLimit);
  const parsedWindow = hasWindow ? Number(body.requestWindowMinutes) : Number(existing.musicrequestwindowminutes ?? 5);
  if ((parsedLimit != null && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100))
    || (!Number.isInteger(parsedWindow) || parsedWindow < 1 || parsedWindow > 1440)) {
    res.status(400).json({ error: 'Set a request limit from 1 to 100, or unlimited, and a window from 1 to 1440 minutes.' });
    return;
  }

  await query(
    `UPDATE tournaments
     SET musicrequestlimit = $2,
         musicrequestwindowminutes = $3
     WHERE tournamentid = $1`,
    [req.params.id, parsedLimit, parsedWindow]
  );
  broadcastTournamentUpdate(req.params.id, { music: true, source: 'music-request-settings' });
  res.json({ success: true, musicrequestlimit: parsedLimit, musicrequestwindowminutes: parsedWindow });
});

spotifyRouter.put('/tournaments/:id/music/blocks/:userId', requireAuth, async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can manage music requests.' });
    return;
  }

  const player = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, req.params.userId]
  );
  if (!player) {
    res.status(404).json({ error: 'That user is not registered for this tournament.' });
    return;
  }

  if (Boolean((req.body as { blocked?: unknown }).blocked)) {
    await query(
      `INSERT INTO tournamentmusicrequestblocks (tournamentid, userid, blockedbyuserid)
       VALUES ($1, $2, $3)
       ON CONFLICT (tournamentid, userid) DO UPDATE SET blockedbyuserid = EXCLUDED.blockedbyuserid`,
      [req.params.id, req.params.userId, req.userId]
    );
  } else {
    await query(
      `DELETE FROM tournamentmusicrequestblocks
       WHERE tournamentid = $1 AND userid = $2`,
      [req.params.id, req.params.userId]
    );
  }
  broadcastTournamentUpdate(req.params.id, { music: true, source: 'music-request-blocks' });
  res.json({ success: true, blocked: Boolean((req.body as { blocked?: unknown }).blocked) });
});

spotifyRouter.post('/tournaments/:id/music/play-next', requireAuth, async (req: Request, res: Response) => {
  if (!await canManageTournament(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'Only tournament admins can manage music requests.' });
    return;
  }

  const availability = await getTournamentMusicAvailability(req.params.id, req.userId);
  if (!availability) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }
  if (!availability.enabled) {
    res.status(409).json({ error: availability.musicrequestsenabled ? 'Start the tournament timer before playing song requests.' : 'Song requests are turned off for this tournament.' });
    return;
  }

  const next = await queryOne<{ requestid: string; spotifyuri: string }>(
    `SELECT requestid, spotifyuri
     FROM tournamentmusicrequests
     WHERE tournamentid = $1 AND status IN ('requested', 'failed')
     ORDER BY prioritypoints DESC, createdat ASC
     LIMIT 1`,
    [req.params.id]
  );
  if (!next) {
    res.status(404).json({ error: 'No pending music requests.' });
    return;
  }

  const queueResult = await queueMusicRequestOnSpotify(availability.spotifyhostuserid ?? availability.ownerid, next);
  if (!queueResult.queued) {
    broadcastTournamentUpdate(req.params.id, { music: true, source: 'spotify-queue-failed' });
    res.status(queueResult.status && queueResult.status < 500 ? 409 : 502).json({
      error: queueResult.message,
      requestid: next.requestid,
      requests: await getTournamentMusicQueue(req.params.id),
    });
    return;
  }

  broadcastTournamentUpdate(req.params.id, { music: true, source: 'spotify-queue' });
  res.json({ success: true, requestid: next.requestid, requests: await getTournamentMusicQueue(req.params.id) });
});

spotifyRouter.get('/tournaments/:id/music/search', optionalAuth, async (req: Request, res: Response) => {
  const term = typeof req.query.q === 'string' ? req.query.q : '';
  const requesterUserId = req.userId ?? (typeof req.query.guestUserId === 'string' ? req.query.guestUserId : '');
  const availability = await getTournamentMusicAvailability(req.params.id, req.userId);
  if (!availability) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }
  if (!availability.spotify.connected) {
    res.status(409).json({ error: 'The host has not connected Spotify for this tournament.' });
    return;
  }
  if (!availability.musicrequestsenabled) {
    res.status(409).json({ error: 'Song requests are turned off for this tournament.' });
    return;
  }
  if (!availability.isRunning) {
    res.status(409).json({ error: 'Song requests open when the tournament timer is running.' });
    return;
  }
  if (!requesterUserId) {
    res.status(401).json({ error: 'Register or check in before searching songs.' });
    return;
  }
  const entry = await queryOne(
    `SELECT 1 FROM tournamentplayers WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, requesterUserId]
  );
  if (!entry) {
    res.status(403).json({ error: 'Register for this tournament before searching songs.' });
    return;
  }
  res.json({ tracks: await searchSpotifyTracksForHost(availability.spotifyhostuserid ?? availability.ownerid, term) });
});

spotifyRouter.post('/tournaments/:id/music/requests', optionalAuth, async (req: Request, res: Response) => {
  const payload = req.body as MusicRequestPayload;
  const spotifyUri = cleanSpotifyUri(payload.spotifyuri);
  const trackName = cleanTrackText(payload.trackname, 200);
  const artistName = cleanTrackText(payload.artistname, 200);
  const albumImageUrl = cleanTrackText(payload.albumimageurl, 500) || null;
  const requesterUserId = req.userId ?? cleanTrackText(payload.guestUserId, 96);

  if (!spotifyUri || !trackName || !artistName) {
    res.status(400).json({ error: 'Choose a Spotify track before requesting.' });
    return;
  }
  if (!requesterUserId) {
    res.status(401).json({ error: 'Register or check in before requesting songs.' });
    return;
  }

  const availability = await getTournamentMusicAvailability(req.params.id, req.userId);
  const tournament = await queryOne<{ leagueid: string | null }>(
    `SELECT le.leagueid
     FROM tournaments t
     LEFT JOIN leagueevents le ON le.tournamentid = t.tournamentid
     WHERE t.tournamentid = $1`,
    [req.params.id]
  );
  if (!availability || !tournament) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }
  if (!availability.spotify.connected) {
    res.status(409).json({ error: 'The host has not connected Spotify for this tournament.' });
    return;
  }
  if (!availability.musicrequestsenabled) {
    res.status(409).json({ error: 'Song requests are turned off for this tournament.' });
    return;
  }
  if (!availability.isRunning) {
    res.status(409).json({ error: 'Song requests open when the tournament timer is running.' });
    return;
  }

  const entry = await queryOne<{ displayname: string | null; vipbalance: number | string | null; vipactive: boolean | null }>(
    `SELECT COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            lvp.pointsbalance AS vipbalance,
            COALESCE(lvp.vipactive, FALSE) AS vipactive
     FROM tournamentplayers tp
     JOIN users u ON u.guid = tp.userid
     LEFT JOIN usermetadata m ON m.userid = tp.userid
     LEFT JOIN leaguevippoints lvp
       ON lvp.leagueid = $3
      AND lvp.userid = tp.userid
     WHERE tp.tournamentid = $1
       AND tp.userid = $2`,
    [req.params.id, requesterUserId, tournament.leagueid]
  );
  if (!entry) {
    res.status(403).json({ error: 'Register for this tournament before requesting songs.' });
    return;
  }

  const blocked = await queryOne(
    `SELECT 1
     FROM tournamentmusicrequestblocks
     WHERE tournamentid = $1 AND userid = $2`,
    [req.params.id, requesterUserId]
  );
  if (blocked) {
    res.status(403).json({ error: 'An admin has blocked song requests for your account in this tournament.' });
    return;
  }

  if (availability.musicrequestlimit != null) {
    const requestedSince = new Date(Date.now() - availability.musicrequestwindowminutes * 60 * 1000);
    const recentRequests = await queryOne<{ count: number | string }>(
      `SELECT count(*)::INT AS count
       FROM tournamentmusicrequests
       WHERE tournamentid = $1
         AND requestedbyuserid = $2
         AND createdat >= $3`,
      [req.params.id, requesterUserId, requestedSince]
    );
    if (Number(recentRequests?.count ?? 0) >= availability.musicrequestlimit) {
      res.status(429).json({
        error: `You can request ${availability.musicrequestlimit} song${availability.musicrequestlimit === 1 ? '' : 's'} every ${availability.musicrequestwindowminutes} minutes.`,
      });
      return;
    }
  }

  let priorityPoints = 0;
  let vipApplied = false;
  if (payload.spendVipPoints && tournament.leagueid && Number(entry.vipbalance ?? 0) > 0) {
    priorityPoints = 1;
    vipApplied = true;
  }

  let requestid = '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (vipApplied) {
      const spent = await client.query(
        `UPDATE leaguevippoints
         SET pointsbalance = pointsbalance - 1, updatedat = now()
         WHERE leagueid = $1 AND userid = $2 AND pointsbalance > 0`,
        [tournament.leagueid, requesterUserId]
      );
      if (spent.rowCount !== 1) {
        priorityPoints = 0;
        vipApplied = false;
      }
    }

    const inserted = await client.query<{ requestid: string }>(
      `INSERT INTO tournamentmusicrequests
        (tournamentid, requestedbyuserid, requestedbyname, spotifyuri, trackname, artistname, albumimageurl, prioritypoints, vipapplied)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING requestid`,
      [
        req.params.id,
        requesterUserId,
        entry.displayname,
        spotifyUri,
        trackName,
        artistName,
        albumImageUrl,
        priorityPoints,
        vipApplied,
      ]
    );
    await client.query('COMMIT');
    requestid = inserted.rows[0]?.requestid ?? '';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const queueResult = requestid
    ? await queueMusicRequestOnSpotify(availability.spotifyhostuserid ?? availability.ownerid, { requestid, spotifyuri: spotifyUri })
    : null;

  broadcastTournamentUpdate(req.params.id, {
    music: true,
    source: queueResult?.queued ? 'song-request-queued' : 'song-request',
  });
  res.status(201).json({
    success: true,
    requestid,
    vipapplied: vipApplied,
    spotifyqueued: Boolean(queueResult?.queued),
    spotifyqueueerror: queueResult && !queueResult.queued ? queueResult.message : null,
    requests: await getTournamentMusicQueue(req.params.id),
  });
});
