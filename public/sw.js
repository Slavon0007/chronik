/* Chronik service worker — app-shell offline support, base-path aware. */
const VERSION = 'chronik-v1'
const SCOPE = self.registration.scope
const url = (path) => new URL(path, SCOPE).href

const SHELL = [
  SCOPE,
  url('index.html'),
  url('manifest.webmanifest'),
  url('fonts/fraunces-latin.woff2'),
  url('fonts/fraunces-italic-latin.woff2'),
  url('fonts/manrope-latin.woff2'),
  url('icons/favicon.svg'),
  url('icons/icon-192.png'),
  url('icons/icon-512.png'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)

  // Never cache map tiles, geocoding or third-party API traffic.
  if (requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(url('index.html'), copy))
          return response
        })
        .catch(() =>
          caches.match(url('index.html')).then((cached) => cached || caches.match(SCOPE)),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
