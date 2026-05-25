import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { requireAuth } from '../middleware/auth';
import { PushSubscriptionRow } from '../lib/server/sendPushNotification';
import { isNotificationCategory } from '../lib/server/notifications/types';
import {
  getNotificationPreferencesForUser,
  sendNotificationToUser,
  setNotificationPreference,
} from '../lib/server/notifications/notificationService';

export const pushRouter = Router();
pushRouter.use(requireAuth);

type IncomingPushSubscription = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function normalizeSubscription(value: IncomingPushSubscription | null | undefined): PushSubscriptionRow | null {
  const endpoint = typeof value?.endpoint === 'string' ? value.endpoint.trim() : '';
  const p256dh = typeof value?.keys?.p256dh === 'string' ? value.keys.p256dh.trim() : '';
  const auth = typeof value?.keys?.auth === 'string' ? value.keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth || endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
    return null;
  }
  if (!/^https:\/\//i.test(endpoint)) {
    return null;
  }
  return { endpoint, p256dh, auth };
}

pushRouter.post('/subscribe', async (req: Request, res: Response) => {
  const subscription = normalizeSubscription(req.body?.subscription ?? req.body);
  if (!subscription) {
    res.status(400).json({ error: 'Invalid push subscription.' });
    return;
  }

  const userAgent = String(req.header('user-agent') ?? '').slice(0, 500) || null;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO pushsubscriptions (userid, endpoint, p256dh, auth, useragent, disabledat, updatedat)
     VALUES ($1, $2, $3, $4, $5, NULL, now())
     ON CONFLICT (endpoint)
     DO UPDATE SET
       userid = EXCLUDED.userid,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       useragent = EXCLUDED.useragent,
       disabledat = NULL,
       updatedat = now()
     RETURNING id`,
    [req.userId, subscription.endpoint, subscription.p256dh, subscription.auth, userAgent]
  );

  res.json({ success: true, id: row?.id ?? null });
});

pushRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  const endpoint = typeof req.body?.endpoint === 'string'
    ? req.body.endpoint.trim()
    : typeof req.body?.subscription?.endpoint === 'string'
      ? req.body.subscription.endpoint.trim()
      : '';
  if (!endpoint) {
    res.status(400).json({ error: 'Endpoint required.' });
    return;
  }

  await query(
    `UPDATE pushsubscriptions
     SET disabledat = now(), updatedat = now()
     WHERE endpoint = $1 AND userid = $2`,
    [endpoint, req.userId]
  );
  res.json({ success: true });
});

pushRouter.get('/preferences', async (req: Request, res: Response) => {
  const preferences = await getNotificationPreferencesForUser(req.userId!);
  res.json({ preferences });
});

pushRouter.put('/preferences/:category', async (req: Request, res: Response) => {
  if (!isNotificationCategory(req.params.category)) {
    res.status(400).json({ error: 'Unknown notification category.' });
    return;
  }
  const enabled = Boolean((req.body as { enabled?: boolean }).enabled);
  const digestOnly = Boolean((req.body as { digestOnly?: boolean }).digestOnly);
  await setNotificationPreference(req.userId!, req.params.category, enabled, digestOnly);
  const preferences = await getNotificationPreferencesForUser(req.userId!);
  res.json({ success: true, preferences });
});

pushRouter.post('/test', async (req: Request, res: Response) => {
  const subscriptions = await query<PushSubscriptionRow>(
    `SELECT id, userid, endpoint, p256dh, auth
     FROM pushsubscriptions
     WHERE userid = $1 AND disabledat IS NULL
     ORDER BY updatedat DESC
     LIMIT 5`,
    [req.userId]
  );
  if (subscriptions.length === 0) {
    res.status(404).json({ error: 'No active push subscription found.' });
    return;
  }

  const result = await sendNotificationToUser(req.userId!, 'test_notification', {
    tag: `push-test-${Date.now()}`,
  }, { skipPreferences: true, dedupe: false, entityType: 'user', entityId: req.userId! });

  res.json({ success: true, attempted: result.attempted, sent: result.sent });
});
