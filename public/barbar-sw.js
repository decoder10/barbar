/* Push only: never cache API responses, user data, or application files. */
const safePath = (value) => (typeof value === 'string' && /^\/(?!\/)[\w\-/]*$/.test(value) ? value : '/inventory');
self.addEventListener('push', (event) => {
  let message;
  try { message = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(message.title || 'Barbar · Склад', {
    body: message.body || '', tag: message.tag || 'barbar-stock',
    data: { url: safePath(message.url) },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((window) => new URL(window.url).origin === self.location.origin);
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  })());
});
