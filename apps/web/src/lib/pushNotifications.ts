export type PushSubscriptionStatus =
  | 'unsupported'
  | 'permission-denied'
  | 'missing-public-key'
  | 'subscribed'
  | 'already-subscribed'
  | 'unsubscribed'
  | 'error';

export type PushSubscriptionResult = {
  status: PushSubscriptionStatus;
  subscription?: PushSubscription | null;
  message?: string;
};

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? env.VITE_VAPID_PUBLIC_KEY ?? '';

function getToken(): string | null {
  return localStorage.getItem('pb_token');
}

async function postJson(path: string, body: unknown) {
  const token = getToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(payload.error ?? 'Request failed');
  }
  return res.json();
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

export function isLikelyIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  return navigator.serviceWorker.register('/sw.js');
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await registerServiceWorker();
  return registration.pushManager.getSubscription();
}

export async function subscribeToPushNotifications(userId?: string): Promise<PushSubscriptionResult> {
  if (!isPushSupported()) return { status: 'unsupported' };
  if (!vapidPublicKey) {
    return { status: 'missing-public-key', message: 'Push alerts need a VAPID public key.' };
  }

  try {
    const registration = await registerServiceWorker();
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await postJson('/api/push/subscribe', { subscription: existing.toJSON(), userId });
      return { status: 'already-subscribed', subscription: existing };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { status: 'permission-denied' };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await postJson('/api/push/subscribe', { subscription: subscription.toJSON(), userId });
    return { status: 'subscribed', subscription };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not enable push alerts.' };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<PushSubscriptionResult> {
  if (!isPushSupported()) return { status: 'unsupported' };
  try {
    const registration = await registerServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { status: 'unsubscribed' };
    }
    await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
    return { status: 'unsubscribed' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not disable push alerts.' };
  }
}

export async function sendTestPushNotification() {
  return postJson('/api/push/test', {});
}
