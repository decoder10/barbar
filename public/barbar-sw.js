/* Push only: never cache API responses, user data, or application files. */
self.addEventListener('push', (event) => {
  let message;
  try { message = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(message.title || 'Barbar · Склад', {
    body: message.body || '', tag: message.tag || 'barbar-stock',
    data: { url: '/inventory' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((window) => new URL(window.url).origin === self.location.origin);
    if (client) { await client.navigate('/inventory'); await client.focus(); }
    else await self.clients.openWindow('/inventory');
  })());
});
