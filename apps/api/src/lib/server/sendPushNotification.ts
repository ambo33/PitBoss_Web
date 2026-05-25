import webpush, { PushSubscription, WebPushError } from 'web-push';
import { query } from '../../db';

export type PushNotificationType =
  | 'tournament_starting_soon'
  | 'blinds_up'
  | 'table_assignment'
  | 'event_changed'
  | 'league_event_reminder'
  | 'league_standings_updated'
  | 'push_test';

export type PushPayload = {
  type?: PushNotificationType;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export type PushSubscriptionRow = {
  id?: string;
  userid?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? '';
}

function configureVapid() {
  if (vapidConfigured) return true;
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@thepokerplanner.com';
  if (!publicKey || !privateKey) {
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function toWebPushSubscription(subscription: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
}

export async function sendPushNotification(subscription: PushSubscriptionRow, payload: PushPayload): Promise<boolean> {
  if (!configureVapid()) {
    console.warn('Push notification skipped: VAPID keys are not configured.');
    return false;
  }

  try {
    await webpush.sendNotification(
      toWebPushSubscription(subscription),
      JSON.stringify({
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        url: '/',
        ...payload,
      })
    );
    await query(
      `UPDATE pushsubscriptions
       SET lastsuccessat = now(), lastfailureat = NULL, disabledat = NULL, updatedat = now()
       WHERE endpoint = $1`,
      [subscription.endpoint]
    );
    return true;
  } catch (err) {
    const statusCode = typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as WebPushError).statusCode)
      : 0;
    if (statusCode === 404 || statusCode === 410) {
      await query(
        `UPDATE pushsubscriptions
         SET disabledat = now(), lastfailureat = now(), updatedat = now()
         WHERE endpoint = $1`,
        [subscription.endpoint]
      );
      return false;
    }
    await query(
      `UPDATE pushsubscriptions
       SET lastfailureat = now(), updatedat = now()
       WHERE endpoint = $1`,
      [subscription.endpoint]
    );
    console.error('Push notification failed', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await query<PushSubscriptionRow>(
    `SELECT id, userid, endpoint, p256dh, auth
     FROM pushsubscriptions
     WHERE userid = $1 AND disabledat IS NULL`,
    [userId]
  );
  const results = await Promise.all(subscriptions.map((subscription) => sendPushNotification(subscription, payload)));
  return results.filter(Boolean).length;
}

export async function sendTournamentNotification(tournamentId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await query<PushSubscriptionRow>(
    `SELECT DISTINCT ps.id, ps.userid, ps.endpoint, ps.p256dh, ps.auth
     FROM pushsubscriptions ps
     JOIN tournamentplayers tp ON tp.userid = ps.userid
     JOIN tournaments t ON t.tournamentid = tp.tournamentid
     LEFT JOIN groupmembers gm ON gm.groupid = t.groupid AND gm.userid = ps.userid
     LEFT JOIN tournamentdeclines td ON td.tournamentid = t.tournamentid AND td.userid = ps.userid
     WHERE tp.tournamentid = $1
       AND ps.disabledat IS NULL
       AND td.userid IS NULL
       AND COALESCE(gm.pushalertsenabled, TRUE) = TRUE`,
    [tournamentId]
  );
  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendPushNotification(subscription, {
        url: `/lobby/${tournamentId}`,
        tag: payload.tag ?? `tournament-${tournamentId}-${payload.type ?? 'update'}`,
        ...payload,
      })
    )
  );
  return results.filter(Boolean).length;
}

export async function sendLeagueNotification(leagueId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await query<PushSubscriptionRow>(
    `SELECT DISTINCT ps.id, ps.userid, ps.endpoint, ps.p256dh, ps.auth
     FROM pushsubscriptions ps
     JOIN leaguemembers lm ON lm.userid = ps.userid
     WHERE lm.leagueid = $1
       AND lm.approved = TRUE
       AND COALESCE(lm.pushalertsenabled, TRUE) = TRUE
       AND ps.disabledat IS NULL`,
    [leagueId]
  );
  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendPushNotification(subscription, {
        url: '/',
        tag: payload.tag ?? `league-${leagueId}-${payload.type ?? 'update'}`,
        ...payload,
      })
    )
  );
  return results.filter(Boolean).length;
}
