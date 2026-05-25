self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {});

function safeJson(payload) {
  if (!payload) return {};
  try {
    return payload.json();
  } catch {
    try {
      return JSON.parse(payload.text());
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const data = safeJson(event.data);
  const title = data.title || 'ThePokerPlanner';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: {
      url: data.url || '/',
      ...(data.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === targetUrl || client.url.startsWith(targetUrl)) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
