import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import {
  getExistingPushSubscription,
  isLikelyIos,
  isPushSupported,
  isStandalonePwa,
  sendTestPushNotification,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  PushSubscriptionStatus,
} from '../lib/pushNotifications';

function statusText(status: PushSubscriptionStatus | 'idle' | 'checking') {
  switch (status) {
    case 'checking': return 'Checking alert status...';
    case 'unsupported': return 'Push alerts are not supported in this browser.';
    case 'permission-denied': return 'Notification permission is blocked.';
    case 'missing-public-key': return 'Push alerts need VAPID keys configured.';
    case 'subscribed': return 'Tournament alerts are enabled.';
    case 'already-subscribed': return 'Tournament alerts are enabled.';
    case 'unsubscribed': return 'Tournament alerts are disabled.';
    case 'error': return 'Push alerts could not be updated.';
    default: return 'Choose if this device should receive alerts.';
  }
}

export default function PushNotificationSettings() {
  const userId = useAuthStore((state) => state.user?.guid);
  const supported = useMemo(() => isPushSupported(), []);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (!supported) return 'unsupported';
    return Notification.permission;
  });
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<PushSubscriptionStatus | 'idle' | 'checking'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showIosGuidance = supported && isLikelyIos() && !isStandalonePwa();

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    getExistingPushSubscription()
      .then((subscription) => {
        if (cancelled) return;
        setSubscribed(Boolean(subscription));
        setPermission(Notification.permission);
        setStatus(subscription ? 'already-subscribed' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setStatus('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enable() {
    setLoading(true);
    setMessage(null);
    const result = await subscribeToPushNotifications(userId);
    setStatus(result.status);
    setMessage(result.message ?? null);
    setSubscribed(result.status === 'subscribed' || result.status === 'already-subscribed');
    setPermission(supported ? Notification.permission : 'unsupported');
    setLoading(false);
  }

  async function disable() {
    setLoading(true);
    setMessage(null);
    const result = await unsubscribeFromPushNotifications();
    setStatus(result.status);
    setMessage(result.message ?? null);
    setSubscribed(false);
    setPermission(supported ? Notification.permission : 'unsupported');
    setLoading(false);
  }

  async function test() {
    setLoading(true);
    setMessage(null);
    try {
      await sendTestPushNotification();
      setMessage('Test alert sent to this device.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Test alert failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell size={18} className="text-pit-teal" />
          <div>
            <h3 className="font-semibold text-white">ThePokerPlanner Alerts</h3>
            <p className="text-sm text-pit-muted">Push alerts for reminders, table assignments, blind levels, league updates, and event changes.</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
          subscribed ? 'bg-pit-teal/15 text-pit-teal' : 'bg-pit-border/40 text-pit-text'
        }`}>
          {subscribed ? 'Enabled' : 'Off'}
        </span>
      </div>

      <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2 text-sm text-pit-text">
        <p>{statusText(status)}</p>
        <p className="mt-1 text-xs text-pit-muted">Browser permission: {permission}</p>
      </div>

      {showIosGuidance && (
        <p className="rounded-lg border border-pit-gold/20 bg-pit-gold/10 px-3 py-2 text-xs leading-5 text-pit-gold">
          On iPhone, install ThePokerPlanner to your Home Screen first, then reopen it and enable alerts.
        </p>
      )}

      {message && (
        <p className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2 text-xs leading-5 text-pit-text">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!subscribed ? (
          <button type="button" className="btn-primary gap-2" onClick={enable} disabled={!supported || loading}>
            <Bell size={14} />
            {loading ? 'Enabling...' : 'Enable alerts'}
          </button>
        ) : (
          <>
            <button type="button" className="btn-ghost gap-2" onClick={disable} disabled={loading}>
              <BellOff size={14} />
              Disable alerts
            </button>
            <button type="button" className="btn-primary gap-2" onClick={test} disabled={loading}>
              <Send size={14} />
              Send test
            </button>
          </>
        )}
      </div>
    </section>
  );
}
