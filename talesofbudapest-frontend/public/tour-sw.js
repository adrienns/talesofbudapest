const TOUR_CACHE = 'tales-tour-audio-v1'
const MAP_CACHE = 'tales-tour-map-v1'
const MAP_HOST = 'https://tiles.openfreemap.org/'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) =>
          (key.startsWith('tales-tour-audio-') && key !== TOUR_CACHE)
          || (key.startsWith('tales-tour-map-') && key !== MAP_CACHE),
        ).map((key) => caches.delete(key))),
      ),
    ]),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_TOUR_AUDIO') return

  const { tourId, urls, mapStyleUrl } = event.data
  event.waitUntil((async () => {
    const cache = await caches.open(TOUR_CACHE)
    const uniqueUrls = [...new Set((urls || []).filter((url) => typeof url === 'string'))]
    const results = await Promise.allSettled(uniqueUrls.map(async (url) => {
      const cached = await cache.match(url, { ignoreVary: true })
      if (cached) return
      const response = await fetch(new Request(url, { mode: 'no-cors', credentials: 'omit' }))
      if (!response.ok && response.type !== 'opaque') throw new Error('Audio unavailable')
      await cache.put(url, response)
    }))
    if (typeof mapStyleUrl === 'string') {
      try {
        const mapCache = await caches.open(MAP_CACHE)
        const style = await fetch(mapStyleUrl)
        if (style.ok || style.type === 'opaque') await mapCache.put(mapStyleUrl, style)
      } catch {
        // Existing route and audio downloads remain usable when map prefetch fails.
      }
    }
    const cachedCount = results.filter((result) => result.status === 'fulfilled').length
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    clients.forEach((client) => client.postMessage({
      type: 'TOUR_AUDIO_CACHED',
      tourId,
      cachedCount,
      totalCount: uniqueUrls.length,
    }))
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (event.request.url.startsWith(MAP_HOST)) {
    event.respondWith((async () => {
      const cache = await caches.open(MAP_CACHE)
      const cached = await cache.match(event.request, { ignoreVary: true })
      if (cached) return cached

      const response = await fetch(event.request)
      if (response.ok || response.type === 'opaque') await cache.put(event.request, response.clone())
      return response
    })())
    return
  }

  if (event.request.destination !== 'audio') return

  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreVary: true })
    if (cached) return cached

    const response = await fetch(event.request)
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(TOUR_CACHE)
      await cache.put(event.request, response.clone())
    }
    return response
  })())
})
