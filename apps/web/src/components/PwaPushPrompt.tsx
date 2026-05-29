import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import {
  getExistingPushSubscription,
  isPushSupported,
  isStandalonePwa,
  subscribeToPushNotifications,
  PushSubscriptionStatus,
} from '../lib/pushNotifications';

const PROMPT_STORAGE_PREFIX = 'tpp:pwa-push-prompt-dismissed';

function getPromptStorageKey(userId?: string) {
  return `${PROMPT_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

function resultMessage(status: PushSubscriptionStatus) {
  switch (status) {
    case 'permission-denied':
      return 'Notifications are blocked for this device. You can turn them back on in your browser or iOS settings.';
    case 'missing-public-key':
      return 'Push alerts are not configured on this environment yet.';
    case 'unsupported':
      return 'This device does not support push alerts.';
    case 'error':
      return 'Alerts could not be enabled. Try again from Profile when you have a minute.';
    default:
      return null;
  }
}

export default function PwaPushPrompt() {
  const userId = useAuthStore((state) => state.user?.guid);
  const supported = useMemo(() => isPushSupported(), []);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supported || !isStandalonePwa()) return;
    if (typeof window === 'undefined') return;
    if (Notification.permission === 'denied') return;

    const dismissed = window.localStorage.getItem(getPromptStorageKey(userId));
    if (dismissed) return;

    let cancelled = false;
    getExistingPushSubscription()
      .then((subscription) => {
        if (cancelled || subscription) return;
        setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });

    return () => {
      cancelled = true;
    };
  }, [supported, userId]);

  async function enableAlerts() {
    setLoading(true);
    setMessage(null);
    const result = await subscribeToPushNotifications(userId);
    setLoading(false);

    if (result.status === 'subscribed' || result.status === 'already-subscribed') {
      setVisible(false);
      return;
    }

    const nextMessage = result.message ?? resultMessage(result.status);
    setMessage(nextMessage);
  }

  function decline() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getPromptStorageKey(userId), new Date().toISOString());
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-pit-teal/35 bg-gradient-to-r from-pit-teal/15 via-pit-surface to-pit-bg shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pit-teal/15 text-pit-teal">
            <BellRing size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Enable alerts on this device?</p>
            <p className="mt-1 text-sm leading-5 text-pit-text">
              Get tournament reminders, seat changes, blind updates, and league notices from your Home Screen app.
            </p>
            {message && (
              <p className="mt-2 rounded-lg border border-pit-border bg-pit-bg/45 px-3 py-2 text-xs leading-5 text-pit-muted">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-primary gap-2" onClick={enableAlerts} disabled={loading}>
            <Bell size={14} />
            {loading ? 'Enabling...' : 'Enable alerts'}
          </button>
          <button type="button" className="btn-ghost gap-2" onClick={decline} disabled={loading}>
            <X size={14} />
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
