import type { City } from '../data/cities'

const EARTH_RADIUS_KM = 6371.0088

/** Great-circle distance between two WGS84 points in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLng = (bLng - aLng) * toRad
  const lat1 = aLat * toRad
  const lat2 = bLat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km: number): string {
  if (km < 1) return 'unter 1 km'
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Instant local city / ZIP search over the bundled place index. */
export function searchCities(query: string, cities: City[], limit = 6): City[] {
  const q = normalizeText(query.trim())
  if (!q) return []
  const isZip = /^\d{2,5}$/.test(q)

  return cities
    .map((city) => {
      const name = normalizeText(city.name)
      const zip = city.zip
      let score = -1
      if (isZip) {
        if (zip.startsWith(q)) score = 100 - Math.abs(zip.length - q.length)
      } else if (name === q) {
        score = 100
      } else if (name.startsWith(q)) {
        score = 80 - name.length * 0.1
      } else if (name.split(' ').some((word) => word.startsWith(q))) {
        score = 65 - name.length * 0.1
      } else if (q.length >= 4 && name.includes(q)) {
        score = 35 - name.length * 0.1
      }
      return { city, score }
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.city)
}

export function nearestCity(
  lat: number,
  lng: number,
  cities: City[],
  maxKm = 80,
): City | null {
  let best: City | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const city of cities) {
    const distance = haversineKm(lat, lng, city.lat, city.lng)
    if (distance < bestDistance) {
      bestDistance = distance
      best = city
    }
  }
  return bestDistance <= maxKm ? best : null
}

export function googleMapsRoute(lat: number, lng: number, _label: string): string {
  const destination = `${lat},${lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate`
}

export function appleMapsRoute(lat: number, lng: number, label: string): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}&dirflg=d`
}

export function routeUrl(lat: number, lng: number, label: string): string {
  const isApple =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  return isApple ? appleMapsRoute(lat, lng, label) : googleMapsRoute(lat, lng, label)
}
