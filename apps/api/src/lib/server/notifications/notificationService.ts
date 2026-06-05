import { query, queryOne } from '../../../db';
import { sendPushNotification, PushSubscriptionRow } from '../sendPushNotification';
import {
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_CATEGORY,
  NotificationCategory,
  NotificationType,
} from './types';
import { buildNotificationPayload, NotificationTemplateData } from './templates';

export type NotificationAudience =
  | 'participants'
  | 'active-participants'
  | 'active-participants-and-admins'
  | 'participants-and-admins'
  | 'admins'
  | 'group-members';

export type NotificationSendOptions = {
  targetUserIds?: string[];
  audience?: NotificationAudience;
  entityType?: string;
  entityId?: string;
  skipPreferences?: boolean;
  dedupe?: boolean;
};

export type NotificationSendSummary = {
  recipients: number;
  attempted: number;
  sent: number;
  skipped: number;
};

export function getNotificationCategory(type: NotificationType): NotificationCategory {
  return NOTIFICATION_TYPE_CATEGORY[type];
}

export async function getNotificationPreferencesForUser(userId: string) {
  const rows = await query<{ category: NotificationCategory; enabled: boolean; digestonly: boolean }>(
    `SELECT category, enabled, COALESCE(digestonly, FALSE) AS digestonly
     FROM notificationpreferences
     WHERE userid = $1`,
    [userId]
  );
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  return NOTIFICATION_CATEGORIES.map((category) => {
    const saved = byCategory.get(category);
    const meta = NOTIFICATION_CATEGORY_META[category];
    return {
      category,
      label: meta.label,
      description: meta.description,
      example: meta.example,
      enabled: saved?.enabled ?? meta.defaultEnabled,
      digestOnly: saved?.digestonly ?? false,
      defaultEnabled: meta.defaultEnabled,
    };
  });
}

export async function setNotificationPreference(
  userId: string,
  category: NotificationCategory,
  enabled: boolean,
  digestOnly = false
) {
  await query(
    `INSERT INTO notificationpreferences (userid, category, enabled, digestonly, updatedat)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (userid, category)
     DO UPDATE SET enabled = $3, digestonly = $4, updatedat = now()`,
    [userId, category, enabled, digestOnly]
  );
}

export async function shouldSendNotification(userId: string, type: NotificationType): Promise<boolean> {
  const category = getNotificationCategory(type);
  const row = await queryOne<{ enabled: boolean; digestonly: boolean }>(
    `SELECT enabled, COALESCE(digestonly, FALSE) AS digestonly
     FROM notificationpreferences
     WHERE userid = $1 AND category = $2`,
    [userId, category]
  );
  if (!row) return NOTIFICATION_CATEGORY_META[category].defaultEnabled;
  if (row.digestonly) return false;
  return Boolean(row.enabled);
}

async function activeSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  return query<PushSubscriptionRow>(
    `SELECT id, userid, endpoint, p256dh, auth
     FROM pushsubscriptions
     WHERE userid = $1 AND disabledat IS NULL`,
    [userId]
  );
}

async function notificationAlreadySent(userId: string, tag: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1
     FROM notificationlog
     WHERE userid = $1 AND tag = $2 AND status = 'sent'
     LIMIT 1`,
    [userId, tag]
  );
  return Boolean(row);
}

async function logNotification(
  userId: string,
  type: NotificationType,
  tag: string,
  status: 'sent' | 'failed' | 'skipped',
  options: NotificationSendOptions,
  error?: string
) {
  await query(
    `INSERT INTO notificationlog (userid, type, category, entitytype, entityid, tag, status, error, sentat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7 = 'sent' THEN now() ELSE NULL END)`,
    [
      userId,
      type,
      getNotificationCategory(type),
      options.entityType ?? null,
      options.entityId ?? null,
      tag,
      status,
      error?.slice(0, 500) ?? null,
    ]
  );
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function sendNotificationToUser(
  userId: string,
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  const payload = buildNotificationPayload(type, { ...data, userId });
  const tag = payload.tag;
  const dedupe = options.dedupe !== false;

  if (!options.skipPreferences && !await shouldSendNotification(userId, type)) {
    await logNotification(userId, type, tag, 'skipped', options, 'Preference disabled');
    return { recipients: 1, attempted: 0, sent: 0, skipped: 1 };
  }

  if (dedupe && await notificationAlreadySent(userId, tag)) {
    return { recipients: 1, attempted: 0, sent: 0, skipped: 1 };
  }

  const subscriptions = await activeSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    await logNotification(userId, type, tag, 'skipped', options, 'No active push subscription');
    return { recipients: 1, attempted: 0, sent: 0, skipped: 1 };
  }

  const results = await Promise.all(
    subscriptions.map((subscription) => sendPushNotification(subscription, payload))
  );
  const sent = results.filter(Boolean).length;
  await logNotification(
    userId,
    type,
    tag,
    sent > 0 ? 'sent' : 'failed',
    options,
    sent > 0 ? undefined : 'No device accepted the notification'
  );
  return { recipients: 1, attempted: subscriptions.length, sent, skipped: 0 };
}

export async function sendNotificationToUsers(
  userIds: string[],
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  const recipients = uniqueIds(userIds);
  const results = await Promise.all(
    recipients.map((userId) => sendNotificationToUser(userId, type, data, options))
  );
  return results.reduce<NotificationSendSummary>((sum, result) => ({
    recipients: sum.recipients + result.recipients,
    attempted: sum.attempted + result.attempted,
    sent: sum.sent + result.sent,
    skipped: sum.skipped + result.skipped,
  }), { recipients: 0, attempted: 0, sent: 0, skipped: 0 });
}

async function getTournamentBaseData(tournamentId: string) {
  return queryOne<{
    tournamentid: string;
    name: string;
    ownerid: string;
    groupid: string | null;
    tourneydate: string | null;
    tourneytime: string | null;
  }>(
    `SELECT tournamentid, name, userid AS ownerid, groupid, date AS tourneydate, time AS tourneytime
     FROM tournaments
     WHERE tournamentid = $1`,
    [tournamentId]
  );
}

async function getTournamentRecipientUserIds(
  tournamentId: string,
  audience: NotificationAudience,
  targetUserIds?: string[]
): Promise<string[]> {
  if (targetUserIds?.length) {
    return uniqueIds(targetUserIds);
  }

  const activeOnly = audience === 'active-participants';
  const activeWithAdmins = audience === 'active-participants-and-admins';
  const includeParticipants = audience === 'participants'
    || audience === 'active-participants'
    || audience === 'active-participants-and-admins'
    || audience === 'participants-and-admins';
  const includeAdmins = audience === 'participants-and-admins'
    || audience === 'active-participants-and-admins'
    || audience === 'admins';
  const includeGroupMembers = audience === 'group-members';

  const rows = await query<{ userid: string }>(
    `SELECT DISTINCT userid
     FROM (
       ${includeParticipants ? `
       SELECT tp.userid
       FROM tournamentplayers tp
       JOIN tournaments t ON t.tournamentid = tp.tournamentid
       LEFT JOIN groupmembers gm ON gm.groupid = t.groupid AND gm.userid = tp.userid
       LEFT JOIN tournamentdeclines td ON td.tournamentid = tp.tournamentid AND td.userid = tp.userid
       WHERE tp.tournamentid = $1
         AND td.userid IS NULL
         AND COALESCE(gm.pushalertsenabled, TRUE) = TRUE
         ${activeOnly || activeWithAdmins ? 'AND COALESCE(tp.checkedin, FALSE) = TRUE AND tp.placed IS NULL' : ''}
       ` : 'SELECT NULL::UUID AS userid WHERE FALSE'}

       UNION

       ${includeAdmins ? `
       SELECT t.userid
       FROM tournaments t
       WHERE t.tournamentid = $1
       UNION
       SELECT gm.userid
       FROM tournaments t
       JOIN groupmembers gm ON gm.groupid = t.groupid
       WHERE t.tournamentid = $1
         AND gm.approved = TRUE
         AND gm.admin = TRUE
         AND COALESCE(gm.pushalertsenabled, TRUE) = TRUE
       ` : 'SELECT NULL::UUID AS userid WHERE FALSE'}

       UNION

       ${includeGroupMembers ? `
       SELECT gm.userid
       FROM tournaments t
       JOIN groupmembers gm ON gm.groupid = t.groupid
       LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = gm.userid
       WHERE t.tournamentid = $1
         AND gm.approved = TRUE
         AND td.userid IS NULL
         AND COALESCE(gm.pushalertsenabled, TRUE) = TRUE
       ` : 'SELECT NULL::UUID AS userid WHERE FALSE'}
     ) recipients
     WHERE userid IS NOT NULL`,
    [tournamentId]
  );
  return uniqueIds(rows.map((row) => row.userid));
}

export async function sendTournamentNotification(
  tournamentId: string,
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  const tournament = await getTournamentBaseData(tournamentId);
  if (!tournament) return { recipients: 0, attempted: 0, sent: 0, skipped: 0 };
  const audience = options.audience
    ?? (type === 'new_tournament_created' ? 'group-members' : 'participants-and-admins');
  const recipients = await getTournamentRecipientUserIds(tournamentId, audience, options.targetUserIds);
  return sendNotificationToUsers(recipients, type, {
    tournamentId,
    groupId: tournament.groupid,
    tournamentName: tournament.name,
    ...data,
  }, {
    entityType: options.entityType ?? 'tournament',
    entityId: options.entityId ?? tournamentId,
    dedupe: options.dedupe,
    skipPreferences: options.skipPreferences,
  });
}

export async function sendLeagueNotification(
  leagueId: string,
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  const league = await queryOne<{ name: string }>(
    `SELECT name FROM leagues WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE`,
    [leagueId]
  );
  if (!league) return { recipients: 0, attempted: 0, sent: 0, skipped: 0 };
  const recipientIds = options.targetUserIds?.length
    ? [...new Set(options.targetUserIds)]
    : (await query<{ userid: string }>(
      `SELECT DISTINCT userid
       FROM leaguemembers
       WHERE leagueid = $1
         AND approved = TRUE
         AND COALESCE(pushalertsenabled, TRUE) = TRUE`,
      [leagueId]
    )).map((row) => row.userid);
  return sendNotificationToUsers(recipientIds, type, {
    leagueId,
    leagueName: league.name,
    ...data,
  }, {
    entityType: options.entityType ?? 'league',
    entityId: options.entityId ?? leagueId,
    dedupe: options.dedupe,
    skipPreferences: options.skipPreferences,
  });
}

export async function sendGroupNotification(
  groupId: string,
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  const group = await queryOne<{ name: string }>(
    `SELECT name FROM groups WHERE groupid = $1 AND COALESCE(active, TRUE) = TRUE`,
    [groupId]
  );
  if (!group) return { recipients: 0, attempted: 0, sent: 0, skipped: 0 };
  const rows = await query<{ userid: string }>(
    `SELECT DISTINCT userid
     FROM groupmembers
     WHERE groupid = $1
       AND approved = TRUE
       AND COALESCE(pushalertsenabled, TRUE) = TRUE`,
    [groupId]
  );
  return sendNotificationToUsers(rows.map((row) => row.userid), type, {
    groupId,
    clubId: groupId,
    groupName: group.name,
    ...data,
  }, {
    entityType: options.entityType ?? 'group',
    entityId: options.entityId ?? groupId,
    dedupe: options.dedupe,
    skipPreferences: options.skipPreferences,
  });
}

export async function sendHostNotification(
  hostUserId: string,
  type: NotificationType,
  data: NotificationTemplateData = {},
  options: NotificationSendOptions = {}
): Promise<NotificationSendSummary> {
  return sendNotificationToUser(hostUserId, type, data, {
    entityType: options.entityType ?? 'host',
    entityId: options.entityId ?? hostUserId,
    dedupe: options.dedupe,
    skipPreferences: options.skipPreferences,
  });
}
