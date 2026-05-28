/* ============================================================
 *  Smart Life Dashboard - Service Worker
 *  - Précaching via Workbox (injectManifest)
 *  - Écoute Web Push (VAPID)
 *  - Notifications iOS standalone (iOS 16.4+)
 * ============================================================ */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/* ----- Web Push (VAPID) -----
 *  Payload type envoyé par l'Edge Function send-reminders :
 *  {
 *    "notification": { "title": "...", "body": "...", "icon": "/icon.svg", "tag": "task-123" },
 *    "data": { "url": "/tasks", "id": "task-123" }
 *  }
 * ----------------------------------------------------------- */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {
      notification: {
        title: 'Smart Life',
        body: event.data ? event.data.text() : 'Nouvelle notification',
      },
    }
  }
  const notif = payload.notification || {}
  const title = notif.title || 'Smart Life'
  const options = {
    body: notif.body || '',
    icon: notif.icon || '/icon.svg',
    badge: '/icon.svg',
    tag: notif.tag || 'smartlife-default',
    data: payload.data || {},
    vibrate: [80, 40, 80],
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if ('focus' in client) {
            client.navigate(targetUrl)
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      }),
  )
})

self.addEventListener('message', (event) => {
  if (!event.data) return
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url } = event.data.payload || {}
    self.registration.showNotification(title || 'Smart Life', {
      body: body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: tag || 'smartlife-local',
      data: { url: url || '/' },
    })
  }
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
