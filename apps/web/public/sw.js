// FOSAY service worker: shows approval-request notifications and opens the request.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'FOSAY', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'FOSAY';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Your agent is asking for approval.',
      icon: 'icon.svg',
      badge: 'icon.svg',
      tag: data.data && data.data.intentId ? `intent-${data.data.intentId}` : 'fosay',
      data: data.data || {},
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // URLs are relative to the app's scope, so the app can live under a sub-path (GitHub Pages)
  const path = ((event.notification.data && event.notification.data.url) || 'approvals/').replace(/^\//, '');
  const url = new URL(path, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
