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
      if (request.method === 'GET' && url.pathname === '/events') {
        const after = url.searchParams.get('after') || ''
        if (after && !validId(after)) return respond({ error: 'Ungültiger Cursor.' }, 400)
        const { results } = await env.DB.prepare(
          'SELECT id, event_json FROM submissions WHERE end_date >= ? AND id > ? ORDER BY id LIMIT ?',
        ).bind(today, after, FEED_PAGE_SIZE + 1).all()
        const events = results.slice(0, FEED_PAGE_SIZE).map(row => ({ ...JSON.parse(row.event_json), id: row.id }))
        return respond({ events, next: results.length > FEED_PAGE_SIZE ? events.at(-1).id : null })
      }
      if (url.pathname !== '/submissions') return respond({ error: 'Nicht gefunden.' }, 404)
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
