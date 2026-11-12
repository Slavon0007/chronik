import type { CategoryId, ChronikEvent } from '../types'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

type EventRow = {
  id: string
  title: string
  category: string
  start_date: string
  end_date: string
  opening_hours?: string | null
  venue?: string | null
  address?: string | null
  zip?: string | null
  city?: string | null
  lat?: number | string | null
  lng?: number | string | null
  description?: string | null
  organizer?: string | null
  website?: string | null
  price?: string | null
  source_url?: string | null
  source_name?: string | null
  event_status?: string | null
  attendance_conditions?: string | null
  location_precision?: string | null
  confidence?: number | string | null
}

const CATEGORY_IDS: CategoryId[] = ['markt', 'reenactment', 'larp', 'turnier', 'cosplay']

function categoryOf(value: string): CategoryId {
  return CATEGORY_IDS.includes(value as CategoryId) ? (value as CategoryId) : 'markt'
}

/**
 * Reads the public read model created by supabase/schema.sql.
 * Without Supabase, reads the daily collected static catalogue.
 */
export async function fetchPublishedEvents(): Promise<ChronikEvent[]> {
  const useDatabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

  const response = await fetch(
    useDatabase ? `${SUPABASE_URL}/rest/v1/active_events?select=id,title,category,start_date,end_date,opening_hours,venue,address,zip,city,lat,lng,description,organizer,website,price,source_url,source_name,confidence,attendance_conditions,location_precision,event_status&order=start_date.asc&limit=1000` : new URL('events.json', document.baseURI).href,
    {
      headers: useDatabase ? {
        apikey: SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      } : {},
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    throw new Error(`Event catalogue returned ${response.status}`)
  }

  const payload = await response.json()
  const rows = (useDatabase ? payload : payload.events.map((row: EventRow & { dedupe_key: string }) => ({ ...row, id: row.dedupe_key }))) as EventRow[]
  return rows
    .filter((row) => row.lat !== null && row.lng !== null && row.lat !== undefined && row.lng !== undefined)
    .map((row) => {
      const lat = Number(row.lat)
      const lng = Number(row.lng)
      const venue = (row.venue || '').trim()
      const city = (row.city || '').trim()
      return {
        id: String(row.id),
        title: row.title,
        category: categoryOf(row.category),
        city,
        venue,
        address: (row.address || '').trim() || [venue, [row.zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        zip: row.zip || '',
        lat,
        lng,
        start: row.start_date,
        end: row.end_date,
        time: row.opening_hours && !/^\d{4}-\d{2}-\d{2}/.test(row.opening_hours) ? row.opening_hours : '',
        description: row.description || '',
        organizer: row.organizer || 'Siehe Veranstaltungsseite',
        website: row.website || row.source_url || '',
        price: row.price || '',
        eventStatus: row.event_status || '',
        attendanceConditions: row.attendance_conditions || '',
        locationPrecision: row.location_precision || 'unknown',
        highlight: Number(row.confidence || 0) >= 0.85,
      } satisfies ChronikEvent
    })
    .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng))
}
