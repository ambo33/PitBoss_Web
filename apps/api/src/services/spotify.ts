import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getAppUrl } from '../config';
import { pool, query, queryOne } from '../db';
import { decryptSecret, encryptSecret } from '../privacy';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
].join(' ');

export interface SpotifyConnectionSummary {
  connected: boolean;
  displayname?: string | null;
  spotifyuserid?: string | null;
  product?: string | null;
  scope?: string | null;
  expiresat?: string | null;
}

export interface SpotifyTrackSearchResult {
  uri: string;
  name: string;
  artistname: string;
  albumname?: string | null;
  albumimageurl?: string | null;
  durationms?: number | null;
}

export interface SpotifyCurrentTrack extends SpotifyTrackSearchResult {
  isplaying: boolean;
  progressms?: number | null;
  externalurl?: string | null;
  requestedbyname?: string | null;
  requestedbyavatarurl?: string | null;
}

export interface TournamentMusicRequest {
  requestid: string;
  tournamentid: string;
  requestedbyuserid?: string | null;
  requestedbyname?: string | null;
  spotifyuri: string;
  trackname: string;
  artistname: string;
  albumimageurl?: string | null;
  status: 'requested' | 'queued' | 'played' | 'skipped' | 'failed' | string;
  prioritypoints: number;
  vipapplied: boolean;
  spotifyqueuedat?: string | null;
  failuremessage?: string | null;
  createdat: string;
  updatedat: string;
}

interface SpotifyConnectionRow {
  userid: string;
  spotifyuserid: string | null;
  displayname: string | null;
  accesstokenencrypted: string;
  refreshtokenencrypted: string;
  scope: string | null;
  expiresat: string | Date;
  product: string | null;
}

interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface SpotifyProfileResponse {
  id?: string;
  display_name?: string;
  product?: string;
}

interface SpotifySearchResponse {
  tracks?: {
    items?: Array<{
      uri?: string;
      name?: string;
      duration_ms?: number;
      artists?: Array<{ name?: string }>;
      album?: {
        name?: string;
        images?: Array<{ url?: string; height?: number; width?: number }>;
      };
    }>;
  };
}

interface SpotifyCurrentlyPlayingResponse {
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  item?: {
    type?: string;
    uri?: string;
    name?: string;
    duration_ms?: number;
    external_urls?: { spotify?: string };
    artists?: Array<{ name?: string }>;
    album?: {
      name?: string;
      images?: Array<{ url?: string; height?: number; width?: number }>;
    };
  } | null;
}

interface SpotifyQueueTrack {
  type?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: {
    name?: string;
    images?: Array<{ url?: string; height?: number; width?: number }>;
  };
}

interface SpotifyQueueResponse {
  currently_playing?: SpotifyQueueTrack | null;
  queue?: SpotifyQueueTrack[];
}

interface SpotifyDevice {
  id?: string | null;
  name?: string;
  is_active?: boolean;
  is_restricted?: boolean;
}

interface SpotifyDevicesResponse {
  devices?: SpotifyDevice[];
}

const SPOTIFY_QUEUE_PREVIEW_LIMIT = 20;

function requireSpotifyConfig() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('Spotify is not configured yet. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return { clientId, clientSecret };
}

function getRedirectUri() {
  return process.env.SPOTIFY_REDIRECT_URI || `${getAppUrl()}/api/spotify/callback`;
}

function basicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

function addSeconds(seconds: number | undefined) {
  return new Date(Date.now() + Math.max(60, Number(seconds ?? 3600) - 60) * 1000);
}

async function exchangeSpotifyToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret } = requireSpotifyConfig();
  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await response.json().catch(() => ({})) as SpotifyTokenResponse;
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || 'Spotify authorization failed.');
    (error as Error & { status?: number; spotifyError?: string }).status = response.status;
    (error as Error & { status?: number; spotifyError?: string }).spotifyError = payload.error;
    throw error;
  }
  return payload;
}

async function spotifyFetch<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.message || 'Spotify request failed.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

async function readConnection(userId: string, client?: PoolClient): Promise<SpotifyConnectionRow | null> {
  const sql = `
    SELECT userid, spotifyuserid, displayname, accesstokenencrypted, refreshtokenencrypted, scope, expiresat, product
    FROM spotifyconnections
    WHERE userid = $1
  `;
  if (client) {
    const result = await client.query<SpotifyConnectionRow>(sql, [userId]);
    return result.rows[0] ?? null;
  }
  return queryOne<SpotifyConnectionRow>(sql, [userId]);
}

export async function getSpotifyConnectionSummary(userId: string): Promise<SpotifyConnectionSummary> {
  const row = await readConnection(userId);
  if (!row) return { connected: false };
  return {
    connected: true,
    displayname: row.displayname,
    spotifyuserid: row.spotifyuserid,
    product: row.product,
    scope: row.scope,
    expiresat: new Date(row.expiresat).toISOString(),
  };
}

export async function createSpotifyLoginUrl(userId: string, returnPath?: string): Promise<string> {
  const { clientId } = requireSpotifyConfig();
  const state = crypto.randomBytes(24).toString('base64url');
  const safeReturnPath = typeof returnPath === 'string' && returnPath.startsWith('/') && !returnPath.startsWith('//')
    ? returnPath.slice(0, 400)
    : '/';
  await query(
    `INSERT INTO spotifyoauthstates (state, userid, returnpath, expiresat)
     VALUES ($1, $2, $3, now() + INTERVAL '10 minutes')`,
    [state, userId, safeReturnPath]
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
}

export async function completeSpotifyLogin(code: string, state: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stateRow = await client.query<{ userid: string; returnpath: string | null }>(
      `DELETE FROM spotifyoauthstates
       WHERE state = $1 AND expiresat > now()
       RETURNING userid, returnpath`,
      [state]
    );
    const oauthState = stateRow.rows[0];
    if (!oauthState) {
      throw new Error('Spotify sign-in expired. Try connecting again.');
    }

    const token = await exchangeSpotifyToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }));
    if (!token.access_token || !token.refresh_token) {
      throw new Error('Spotify did not return a reusable connection.');
    }

    const profile = await spotifyFetch<SpotifyProfileResponse>('/me', token.access_token);
    await client.query(
      `INSERT INTO spotifyconnections
        (userid, spotifyuserid, displayname, accesstokenencrypted, refreshtokenencrypted, scope, expiresat, product, updatedat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (userid) DO UPDATE SET
        spotifyuserid = EXCLUDED.spotifyuserid,
        displayname = EXCLUDED.displayname,
        accesstokenencrypted = EXCLUDED.accesstokenencrypted,
        refreshtokenencrypted = EXCLUDED.refreshtokenencrypted,
        scope = EXCLUDED.scope,
        expiresat = EXCLUDED.expiresat,
        product = EXCLUDED.product,
        updatedat = now()`,
      [
        oauthState.userid,
        profile.id ?? null,
        profile.display_name ?? null,
        encryptSecret(token.access_token),
        encryptSecret(token.refresh_token),
        token.scope ?? SPOTIFY_SCOPES,
        addSeconds(token.expires_in),
        profile.product ?? null,
      ]
    );
    await client.query('COMMIT');
    return oauthState.returnpath || '/';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function disconnectSpotify(userId: string): Promise<void> {
  await query(`DELETE FROM spotifyconnections WHERE userid = $1`, [userId]);
}

export async function getSpotifyAccessToken(userId: string): Promise<string> {
  const row = await readConnection(userId);
  if (!row) {
    const error = new Error('The host has not connected Spotify.');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const currentToken = decryptSecret(row.accesstokenencrypted);
  const refreshToken = decryptSecret(row.refreshtokenencrypted);
  if (!currentToken || !refreshToken) {
    const error = new Error('Spotify connection needs to be reconnected.');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  if (new Date(row.expiresat).getTime() > Date.now() + 60_000) {
    return currentToken;
  }

  let token: SpotifyTokenResponse;
  try {
    token = await exchangeSpotifyToken(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }));
  } catch (error) {
    if ((error as Error & { spotifyError?: string }).spotifyError === 'invalid_grant') {
      await disconnectSpotify(userId);
      const reconnectError = new Error('Spotify connection expired. Ask the host to reconnect Spotify.');
      (reconnectError as Error & { status?: number }).status = 409;
      throw reconnectError;
    }
    throw error;
  }
  if (!token.access_token) {
    throw new Error('Spotify token refresh failed.');
  }
  await query(
    `UPDATE spotifyconnections
     SET accesstokenencrypted = $2,
         refreshtokenencrypted = COALESCE($3, refreshtokenencrypted),
         scope = COALESCE($4, scope),
         expiresat = $5,
         updatedat = now()
     WHERE userid = $1`,
    [
      userId,
      encryptSecret(token.access_token),
      token.refresh_token ? encryptSecret(token.refresh_token) : null,
      token.scope ?? null,
      addSeconds(token.expires_in),
    ]
  );
  return token.access_token;
}

export async function searchSpotifyTracksForHost(hostUserId: string, q: string): Promise<SpotifyTrackSearchResult[]> {
  const term = q.trim().slice(0, 120);
  if (term.length < 2) return [];
  const accessToken = await getSpotifyAccessToken(hostUserId);
  const params = new URLSearchParams({ q: term, type: 'track', limit: '8' });
  const payload = await spotifyFetch<SpotifySearchResponse>(`/search?${params.toString()}`, accessToken);
  return (payload.tracks?.items ?? [])
    .filter((track) => track.uri && track.name)
    .map((track) => ({
      uri: track.uri!,
      name: track.name!,
      artistname: (track.artists ?? []).map((artist) => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
      albumname: track.album?.name ?? null,
      albumimageurl: bestAlbumImage(track.album?.images),
      durationms: track.duration_ms ?? null,
    }));
}

function bestAlbumImage(images: Array<{ url?: string; height?: number; width?: number }> | undefined) {
  return [...(images ?? [])]
    .filter((image) => typeof image.url === 'string' && image.url.startsWith('https://'))
    .sort((a, b) => (b.width ?? b.height ?? 0) - (a.width ?? a.height ?? 0))[0]?.url ?? null;
}

export async function getCurrentlyPlayingTrackForHost(hostUserId: string): Promise<SpotifyCurrentTrack | null> {
  const accessToken = await getSpotifyAccessToken(hostUserId);
  const payload = await spotifyFetch<SpotifyCurrentlyPlayingResponse | undefined>(
    '/me/player/currently-playing?additional_types=track',
    accessToken
  );
  const item = payload?.item;
  if (!item || payload?.currently_playing_type !== 'track' || item.type !== 'track' || !item.uri || !item.name) {
    return null;
  }
  return {
    uri: item.uri,
    name: item.name,
    artistname: (item.artists ?? []).map((artist) => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
    albumname: item.album?.name ?? null,
    albumimageurl: bestAlbumImage(item.album?.images),
    durationms: item.duration_ms ?? null,
    progressms: payload.progress_ms ?? null,
    isplaying: Boolean(payload.is_playing),
    externalurl: item.external_urls?.spotify ?? null,
  };
}

export async function attachMusicRequesterToCurrentTrack(
  tournamentId: string,
  currentTrack: SpotifyCurrentTrack | null
): Promise<SpotifyCurrentTrack | null> {
  if (!currentTrack) return null;
  const request = await queryOne<{ requestedbyname: string | null; requestedbyavatarurl: string | null }>(
    `SELECT r.requestedbyname, m.avatarimagedata AS requestedbyavatarurl
     FROM tournamentmusicrequests r
     LEFT JOIN usermetadata m ON m.userid = r.requestedbyuserid
     WHERE r.tournamentid = $1
       AND r.spotifyuri = $2
       AND r.status IN ('queued', 'played')
       AND r.spotifyqueuedat IS NOT NULL
     ORDER BY CASE WHEN r.status = 'queued' THEN 0 ELSE 1 END,
              COALESCE(r.spotifyqueuedat, r.updatedat) DESC,
              r.createdat DESC
     LIMIT 1`,
    [tournamentId, currentTrack.uri]
  );
  return request?.requestedbyname
    ? {
      ...currentTrack,
      requestedbyname: request.requestedbyname,
      requestedbyavatarurl: request.requestedbyavatarurl,
    }
    : currentTrack;
}

export async function addSpotifyUriToQueue(hostUserId: string, spotifyUri: string): Promise<void> {
  const accessToken = await getSpotifyAccessToken(hostUserId);
  const devices = await spotifyFetch<SpotifyDevicesResponse>('/me/player/devices', accessToken);
  const device = (devices.devices ?? []).find((entry) => entry.id && entry.is_active && !entry.is_restricted);
  if (!device?.id) {
    const error = new Error('Spotify has no available playback device. Open Spotify on the host device and start playback, then try again.');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const params = new URLSearchParams({ uri: spotifyUri, device_id: device.id });
  try {
    await spotifyFetch<void>(`/me/player/queue?${params.toString()}`, accessToken, { method: 'POST' });
  } catch (error) {
    if ((error as Error & { status?: number }).status === 404) {
      const friendlyError = new Error('Spotify could not find an active playback session for the connected host account. Open Spotify on that account, start a track, and try again.');
      (friendlyError as Error & { status?: number }).status = 409;
      throw friendlyError;
    }
    throw error;
  }

  // Spotify acknowledges the command before the queue endpoint necessarily reflects it.
  // Poll briefly so local status does not claim success for a request Spotify dropped.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
    try {
      const queue = await getSpotifyPlaybackQueueForHost(hostUserId);
      if (queue.currentUri === spotifyUri || queue.queue.some((track) => track.uri === spotifyUri)) {
        return;
      }
      // Spotify exposes a limited queue preview. A 204 from the add endpoint is
      // authoritative when that preview is full and the new item may be after it.
      if (queue.queue.length >= SPOTIFY_QUEUE_PREVIEW_LIMIT) {
        return;
      }
    } catch (error) {
      if ((error as Error & { status?: number }).status === 404) {
        const friendlyError = new Error('Spotify could not find an active playback session for the connected host account. Open Spotify on that account, start a track, and try again.');
        (friendlyError as Error & { status?: number }).status = 409;
        throw friendlyError;
      }
      if (attempt === 3) throw error;
    }
  }

  const error = new Error(`Spotify accepted the request, but it is not visible in the ${device.name || 'host'} queue. Make sure Spotify is playing on the host device and try again.`);
  (error as Error & { status?: number }).status = 502;
  throw error;
}

export async function getSpotifyPlaybackQueueForHost(hostUserId: string): Promise<{
  currentUri: string | null;
  queue: SpotifyTrackSearchResult[];
}> {
  const accessToken = await getSpotifyAccessToken(hostUserId);
  const payload = await spotifyFetch<SpotifyQueueResponse>('/me/player/queue', accessToken);
  const currentUri = payload.currently_playing?.type === 'track' ? payload.currently_playing.uri ?? null : null;
  const queue = (payload.queue ?? [])
    .filter((track) => track.type === 'track' && track.uri && track.name)
    .map((track) => ({
      uri: track.uri!,
      name: track.name!,
      artistname: (track.artists ?? []).map((artist) => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
      albumname: track.album?.name ?? null,
      albumimageurl: bestAlbumImage(track.album?.images),
      durationms: track.duration_ms ?? null,
    }));
  return { currentUri, queue };
}

export async function syncTournamentMusicQueue(tournamentId: string, hostUserId: string): Promise<{
  currentUri: string | null;
  queue: SpotifyTrackSearchResult[];
}> {
  const spotifyQueue = await getSpotifyPlaybackQueueForHost(hostUserId);
  const queuedRequests = await query<{ requestid: string; spotifyuri: string; spotifyqueuedat: string | Date | null }>(
    `SELECT requestid, spotifyuri, spotifyqueuedat
     FROM tournamentmusicrequests
     WHERE tournamentid = $1 AND status = 'queued'`,
    [tournamentId]
  );
  const settlingCutoff = Date.now() - 15_000;
  const spotifyQueueUris = new Set(spotifyQueue.queue.map((track) => track.uri));
  const queuePreviewIsFull = spotifyQueue.queue.length >= SPOTIFY_QUEUE_PREVIEW_LIMIT;
  const completedRequestIds = queuedRequests
    .filter((request) => request.spotifyuri === spotifyQueue.currentUri
      || (request.spotifyqueuedat
        && new Date(request.spotifyqueuedat).getTime() < settlingCutoff
        && !queuePreviewIsFull
        && !spotifyQueueUris.has(request.spotifyuri)))
    .map((request) => request.requestid);
  if (completedRequestIds.length > 0) {
    await query(
      `UPDATE tournamentmusicrequests
       SET status = 'played', updatedat = now()
       WHERE requestid = ANY($1::UUID[])`,
      [completedRequestIds]
    );
  }
  return spotifyQueue;
}

export async function getTournamentMusicQueue(tournamentId: string): Promise<TournamentMusicRequest[]> {
  const rows = await query<TournamentMusicRequest>(
    `SELECT requestid, tournamentid, requestedbyuserid, requestedbyname, spotifyuri,
            trackname, artistname, albumimageurl, status, CAST(prioritypoints AS INT) AS prioritypoints,
            COALESCE(vipapplied, FALSE) AS vipapplied, spotifyqueuedat, failuremessage, createdat, updatedat
     FROM tournamentmusicrequests
     WHERE tournamentid = $1 AND status IN ('requested', 'queued', 'failed')
     ORDER BY
       CASE status WHEN 'requested' THEN 0 WHEN 'failed' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,
       prioritypoints DESC,
       createdat ASC
     LIMIT 25`,
    [tournamentId]
  );
  return rows.map((row) => ({
    ...row,
    prioritypoints: Number(row.prioritypoints ?? 0),
    vipapplied: Boolean(row.vipapplied),
  }));
}

export async function getLinkedLeagueIdForTournament(tournamentId: string): Promise<string | null> {
  const row = await queryOne<{ leagueid: string }>(
    `SELECT leagueid FROM leagueevents WHERE tournamentid = $1 LIMIT 1`,
    [tournamentId]
  );
  return row?.leagueid ?? null;
}
