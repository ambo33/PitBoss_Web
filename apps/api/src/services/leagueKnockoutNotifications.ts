import { query, queryOne } from '../db';
import { sendNotificationToUsers } from '../lib/server/notifications/notificationService';

type LeagueKnockout = {
  leagueId: string;
  seasonId: string;
  eventId: string;
  eventName: string;
  playerId: string;
  placed: number | null;
  dnf: boolean;
};

export async function notifyLeagueKnockout(result: LeagueKnockout): Promise<void> {
  // DNF can be recorded for a no-show; only an actual finish below first is a knockout.
  if (result.dnf || result.placed == null || result.placed <= 1) return;

  const [player, recipients] = await Promise.all([
    queryOne<{ name: string }>(
      `SELECT COALESCE(NULLIF(trim(um.nickname), ''), NULLIF(trim(um.fullname), ''), 'A player') AS name
       FROM users u
       LEFT JOIN usermetadata um ON um.userid = u.guid
       WHERE u.guid = $1`,
      [result.playerId]
    ),
    query<{ userid: string }>(
      `SELECT DISTINCT lm.userid
       FROM leaguemembers lm
       JOIN leagueseasonparticipants lsp
         ON lsp.leagueid = lm.leagueid AND lsp.userid = lm.userid AND lsp.seasonid = $2
       LEFT JOIN usermetadata um ON um.userid = lm.userid
       WHERE lm.leagueid = $1
         AND lm.userid <> $3
         AND lm.approved = TRUE
         AND COALESCE(lm.pushalertsenabled, TRUE) = TRUE
         AND COALESCE(lsp.participating, TRUE) = TRUE
         AND COALESCE(um.isguestuser, FALSE) = FALSE`,
      [result.leagueId, result.seasonId, result.playerId]
    ),
  ]);

  const name = player?.name ?? 'A player';
  await sendNotificationToUsers(recipients.map((recipient) => recipient.userid), 'league_knockout', {
    eventName: result.eventName,
    playerName: name,
    body: `${name} was knocked out of ${result.eventName}.`,
    leagueId: result.leagueId,
    seasonId: result.seasonId,
    eventId: result.eventId,
    url: `/league/${encodeURIComponent(result.leagueId)}/event/${encodeURIComponent(result.eventId)}`,
    tag: `league-${result.leagueId}-event-${result.eventId}-knockout-${result.playerId}`,
  }, { entityType: 'league_event', entityId: result.eventId });
}

// Tournament runner and self-knockout routes both use this lookup. A linked
// league event owns the broad knockout announcement so members can opt out of it.
export async function notifyLinkedLeagueKnockout(
  tournamentId: string,
  playerId: string,
  placed: number
): Promise<boolean> {
  const event = await queryOne<{
    leagueid: string;
    seasonid: string;
    eventid: string;
    name: string;
  }>(
    `SELECT leagueid, seasonid, eventid, name
     FROM leagueevents
     WHERE tournamentid = $1 AND COALESCE(active, TRUE) = TRUE
     LIMIT 1`,
    [tournamentId]
  );
  if (!event) return false;
  void notifyLeagueKnockout({
    leagueId: event.leagueid,
    seasonId: event.seasonid,
    eventId: event.eventid,
    eventName: event.name,
    playerId,
    placed,
    dnf: false,
  }).catch((error) => {
    console.error('Linked league knockout notification failed', error);
  });
  return true;
}
