import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, NotificationCategory } from '../api/client';
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

const notificationCategoryGroups: Array<{
  key: string;
  label: string;
  description: string;
  example: string;
  categories: NotificationCategory[];
}> = [
  {
    key: 'essential',
    label: 'Essential Alerts',
    description: 'Schedule changes, cancellations, host announcements, and seat assignments.',
    example: 'Seat assignment: Table 2, Seat 4.',
    categories: ['essential'],
  },
  {
    key: 'tournament',
    label: 'Tournament Play',
    description: 'Blind changes, breaks, check-ins, knockouts, bounties, rebuys, add-ons, and achievements.',
    example: 'Blinds are going up: Level 4 is 200 / 400.',
    categories: ['tournament_play', 'bounties_achievements'],
  },
  {
    key: 'league',
    label: 'League Updates',
    description: 'Results, standings, rank changes, season updates, new games, and group activity.',
    example: 'Standings updated for your league.',
    categories: ['league', 'social'],
  },
];

export default function PushNotificationSettings({ embedded = false, showHeader = true }: { embedded?: boolean; showHeader?: boolean }) {
  const userId = useAuthStore((state) => state.user?.guid);
  const qc = useQueryClient();
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
  const { data: preferencesData } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.getNotificationPreferences(),
  });
  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ categories, enabled }: { categories: NotificationCategory[]; enabled: boolean }) => {
      let result: Awaited<ReturnType<typeof api.updateNotificationPreference>> | undefined;
      for (const category of categories) {
        result = await api.updateNotificationPreference(category, { enabled });
      }
      if (!result) throw new Error('No notification categories were updated.');
      return result;
    },
    onSuccess: (result) => {
      qc.setQueryData(['notification-preferences'], { preferences: result.preferences });
    },
  });

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    getExistingPushSubscription()
      .then(async (subscription) => {
        if (cancelled) return;
        if (!subscription) {
          setSubscribed(false);
          setPermission(Notification.permission);
          setStatus('idle');
          return;
        }
        const result = await subscribeToPushNotifications(userId);
        if (cancelled) return;
        const active = result.status === 'subscribed' || result.status === 'already-subscribed';
        setSubscribed(active);
        setPermission(Notification.permission);
        setStatus(result.status);
        setMessage(result.message ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [supported, userId]);

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
      const synced = await subscribeToPushNotifications(userId);
      if (synced.status !== 'subscribed' && synced.status !== 'already-subscribed') {
        throw new Error(synced.message ?? 'This device could not restore its push subscription.');
      }
      await sendTestPushNotification();
      setMessage('Test alert sent to this device.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Test alert failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={embedded ? 'space-y-4' : 'card space-y-4'}>
      {showHeader && <div className="flex items-start justify-between gap-3">
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
      </div>}

      <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2 text-sm text-pit-text">
        <p>{statusText(status)}</p>
        <p className="mt-1 text-xs text-pit-muted">Browser permission: {permission}</p>
      </div>

      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-semibold text-white">Notification categories</h4>
          <p className="text-xs leading-5 text-pit-muted">These apply to every device signed into your account.</p>
        </div>
        <div className="grid gap-2">
          {notificationCategoryGroups.map((group) => {
            const enabled = group.categories.every((category) =>
              preferencesData?.preferences.some((preference) => preference.category === category && preference.enabled)
            );
            return (
              <button
                key={group.key}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  enabled
                    ? 'border-pit-teal/40 bg-pit-teal/10'
                    : 'border-pit-border bg-pit-bg/45'
                }`}
                disabled={updatePreferenceMutation.isPending || !preferencesData}
                onClick={() => updatePreferenceMutation.mutate({
                  categories: group.categories,
                  enabled: !enabled,
                })}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{group.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    enabled ? 'bg-pit-teal/20 text-pit-teal' : 'bg-pit-border/50 text-pit-muted'
                  }`}>
                    {enabled ? 'On' : 'Off'}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-pit-text">{group.description}</span>
                <span className="mt-1 block text-[11px] leading-4 text-pit-muted">{group.example}</span>
              </button>
            );
          })}
        </div>
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
