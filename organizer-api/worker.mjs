const CATEGORIES = new Set(['markt', 'reenactment', 'larp', 'turnier', 'cosplay'])
const FIELD_LIMITS = {
  title: 150, category: 20, start_date: 10, end_date: 10, city: 100, zip: 5,
  address: 200, website: 500, organizer: 150, opening_hours: 200,
  price: 150, attendance_conditions: 500, description: 500,
}
const REQUIRED = ['title', 'category', 'start_date', 'end_date', 'city', 'zip', 'address', 'website']
const FEED_PAGE_SIZE = 200
const BODY_LIMIT = 12_000

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateEvent(input, today) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ungültige Veranstaltungsdaten.')
  const event = {}
  for (const [name, limit] of Object.entries(FIELD_LIMITS)) {
    const raw = input[name] ?? ''
    if (typeof raw !== 'string' || raw.length > limit) throw Error('Mindestens ein Feld ist zu lang oder ungültig.')
    event[name] = raw.trim()
  }
  if (REQUIRED.some(name => !event[name]) || event.title.length < 3 || !CATEGORIES.has(event.category)) {
    throw Error('Bitte fülle alle Pflichtfelder aus und wähle eine Kategorie.')
  }
  if (!validDate(event.start_date) || !validDate(event.end_date) || event.end_date < event.start_date || event.end_date < today) {
    throw Error('Bitte prüfe Start- und Enddatum. Die Veranstaltung darf noch nicht vorbei sein.')
  }
  if (!/^\d{5}$/.test(event.zip)) throw Error('Bitte gib eine fünfstellige deutsche Postleitzahl ein.')

  let website
  try { website = new URL(event.website) } catch { throw Error('Bitte gib einen gültigen Veranstaltungslink ein.') }
  if (!['https:', 'http:'].includes(website.protocol) || !website.hostname.includes('.') ||
      website.username || website.password || /[\s\\]/.test(event.website)) {
    throw Error('Bitte gib einen öffentlichen Veranstaltungslink mit https:// oder http:// ein.')
  }
  return event
}

async function readBody(request) {
  const reader = request.body?.getReader()
  if (!reader) throw Error('Die Anfrage enthält keine Daten.')
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BODY_LIMIT) {
        await reader.cancel()
        throw Error('Die Anfrage ist zu groß.')
      }
      text += decoder.decode(value, { stream: true })
    }
    const body = JSON.parse(text + decoder.decode())
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error()
    return body
  } catch {
    throw Error('Die Anfrage konnte nicht gelesen werden.')
  }
}

function validId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
}

const ARTISAN_TRADES = new Set(['schmiede', 'leder', 'schmuck', 'textil', 'keramik', 'holz', 'sonstiges'])
const ARTISAN_LIMITS = { title: 120, trade: 20, kind: 12, cityId: 16, website: 500, description: 500 }

function artisanText(input, key, limit) {
  const value = input[key] ?? ''
  if (typeof value !== 'string' || value.length > limit) throw Error('Mindestens ein Feld ist zu lang oder ungültig.')
  return value.trim()
}

export function validateArtisan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ungültige Daten.')
  const artisan = Object.fromEntries(Object.entries(ARTISAN_LIMITS).map(([key, limit]) => [key, artisanText(input, key, limit)]))
  if (artisan.title.length < 3 || !ARTISAN_TRADES.has(artisan.trade) || !['workshop', 'online'].includes(artisan.kind) ||
      !/^[a-f0-9]{16}$/.test(artisan.cityId)) {
    throw Error('Bitte gib einen Namen ein und wähle ein Handwerk und einen Ort aus.')
  }
  let website
  try { website = new URL(artisan.website) } catch { throw Error('Bitte gib einen gültigen Link zu deinem Shop oder Profil ein.') }
  if (!['http:', 'https:'].includes(website.protocol) || !website.hostname.includes('.') ||
      website.username || website.password || /[\s\\]/.test(artisan.website)) {
    throw Error('Bitte gib einen öffentlichen Link mit https:// oder http:// ein.')
  }
  if (artisan.kind === 'workshop') {
    artisan.address = artisanText(input, 'address', 200)
    artisan.hours = artisanText(input, 'hours', 200)
    if (!artisan.address || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      throw Error('Bitte gib die öffentliche Adresse ein und markiere sie auf der Karte.')
    }
    artisan.lat = input.lat
    artisan.lng = input.lng
  }
  return artisan
}

async function resolveArtisan(artisan, env, id) {
  const base = env.SITE_BASE_URL || new URL('/chronik/', env.SITE_ORIGIN).href
  const response = await fetch(new URL('artisan-cities/' + artisan.cityId.slice(0, 2) + '.json', base))
  if (!response.ok) throw Error('Ortsverzeichnis nicht erreichbar.')
  const city = (await response.json())[artisan.cityId]
  if (!city) return null
  const [name, country, latitude, longitude] = city
  const { cityId, ...profile } = artisan
  if (profile.kind === 'online') {
    profile.lat = latitude
    profile.lng = longitude
  } else if (Math.abs(profile.lat - latitude) > 0.2 || Math.abs(profile.lng - longitude) > 0.31) {
    return null
  }
  return { ...profile, id, city: name, country }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' }
    const allowedOrigin = request.headers.get('Origin') === env.SITE_ORIGIN
    if (allowedOrigin) headers['Access-Control-Allow-Origin'] = env.SITE_ORIGIN
    const respond = (data, status = 200) => Response.json(data, { status, headers })
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    try {
      if (request.method === 'GET' && url.pathname === '/artisans') {
        const after = url.searchParams.get('after') || ''
        if (after && !validId(after)) return respond({ error: 'Ungültiger Cursor.' }, 400)
        const { results } = await env.DB.prepare(
          'SELECT id, profile_json FROM artisans WHERE id > ? ORDER BY id LIMIT ?',
        ).bind(after, FEED_PAGE_SIZE + 1).all()
        const artisans = results.slice(0, FEED_PAGE_SIZE).map(row => JSON.parse(row.profile_json))
        return respond({ artisans, next: results.length > FEED_PAGE_SIZE ? results[FEED_PAGE_SIZE - 1].id : null })
      }
      if (request.method === 'GET' && url.pathname === '/events') {
        const after = url.searchParams.get('after') || ''
        if (after && !validId(after)) return respond({ error: 'Ungültiger Cursor.' }, 400)
        const { results } = await env.DB.prepare(
          'SELECT id, event_json FROM submissions WHERE end_date >= ? AND id > ? ORDER BY id LIMIT ?',
        ).bind(today, after, FEED_PAGE_SIZE + 1).all()
        const events = results.slice(0, FEED_PAGE_SIZE).map(row => ({ ...JSON.parse(row.event_json), id: row.id }))
        return respond({ events, next: results.length > FEED_PAGE_SIZE ? events.at(-1).id : null })
      }
      if (!['/submissions', '/artisans'].includes(url.pathname)) return respond({ error: 'Nicht gefunden.' }, 404)
      if (!allowedOrigin) return respond({ error: 'Anfrage nicht erlaubt.' }, 403)
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: {
          ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
        } })
      }
      if (request.method !== 'POST') return respond({ error: 'Methode nicht erlaubt.' }, 405)

      const { success } = await env.SUBMISSION_LIMIT.limit({
        key: request.headers.get('CF-Connecting-IP') || 'unknown',
      })
      if (!success) return respond({ error: 'Zu viele Anfragen. Bitte warte eine Minute.' }, 429)

      if (url.pathname === '/artisans') {
        let body
        let artisan
        try {
          body = await readBody(request)
          if (!validId(body.id)) throw Error('Ungültige Eintrags-ID.')
          artisan = validateArtisan(body.artisan)
        } catch (error) {
          return respond({ error: error.message }, 400)
        }

        const profile = await resolveArtisan(artisan, env, body.id)
        if (!profile) return respond({ error: 'Bitte prüfe den Ort und den Kartenpunkt.' }, 400)

        await env.DB.prepare(
          'INSERT INTO artisans (id, profile_json) VALUES (?, ?) ON CONFLICT(id) DO NOTHING',
        ).bind(body.id, JSON.stringify(profile)).run()
        const row = await env.DB.prepare('SELECT profile_json FROM artisans WHERE id = ?').bind(body.id).first()
        return respond({ artisan: JSON.parse(row.profile_json) }, 201)
      }

      let body
      let event
      try {
        body = await readBody(request)
        if (!validId(body.id)) return respond({ error: 'Ungültige Eintrags-ID.' }, 400)
        event = validateEvent(body.event, today)
      } catch (error) {
        return respond({ error: error.message }, 400)
      }

      await env.DB.prepare(
        'INSERT INTO submissions (id, event_json, end_date) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING',
      ).bind(body.id, JSON.stringify(event), event.end_date).run()
      return respond({ saved: true }, 201)
    } catch (error) {
      console.error('Chronik submission service:', error)
      return respond({ error: 'Der Dienst ist gerade nicht erreichbar. Bitte versuche es erneut.' }, 503)
    }
  },
}
