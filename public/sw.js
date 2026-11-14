let scheduledTimerId = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CANCEL_INACTIVITY_SMS') {
    if (scheduledTimerId !== null) {
      clearTimeout(scheduledTimerId);
      scheduledTimerId = null;
    }
    return;
  }

  if (data.type === 'SCHEDULE_INACTIVITY_SMS') {
    if (scheduledTimerId !== null) {
      clearTimeout(scheduledTimerId);
      scheduledTimerId = null;
    }
    const delayMs = typeof data.delayMs === 'number' && data.delayMs > 0 ? data.delayMs : 86400000;
    const title = typeof data.title === 'string' && data.title ? data.title : 'Тёмная Чаща';
    const body =
      typeof data.body === 'string' && data.body
        ? data.body
        : 'Зомби уже подбираются к костру! Возвращайся в бой и забери ежедневную награду.';
    const tag = typeof data.tag === 'string' ? data.tag : 'dark-thicket-comeback';

    // Keep within safe 32-bit timer range when SW remains alive
    const safeDelay = Math.min(delayMs, 2147483000);
    scheduledTimerId = setTimeout(() => {
      scheduledTimerId = null;
      if (self.registration && self.registration.showNotification) {
        self.registration
          .showNotification(title, {
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag,
            renotify: true,
          })
          .catch(() => {});
      }
    }, safeDelay);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    })
  );
});
