import type { Artisan, ArtisanCity } from '../types'

export const ARTISAN_TRADES = {
  schmiede: 'Schmiedekunst',
  leder: 'Lederarbeiten',
  schmuck: 'Schmuck',
  textil: 'Textil & Kleidung',
  keramik: 'Keramik',
  holz: 'Holzarbeiten',
  sonstiges: 'Anderes Handwerk',
} as const

export const ARTISAN_MODES = {
  online: { shortLabel: 'Nur online', color: '#3e6091', tint: '#e3edfa' },
  workshop: { shortLabel: 'Vor Ort', color: '#923d2e', tint: '#f5e3dd' },
} as const

const endpoint = (import.meta.env.VITE_ORGANIZER_API_URL as string | undefined)?.replace(/\/+$/, '')
export const artisanApiAvailable = Boolean(endpoint)

export async function loadArtisans(signal: AbortSignal): Promise<Artisan[]> {
  if (!endpoint) throw new Error('Missing artisan service')
  const profiles: Artisan[] = []
  let after: string | null = null
  do {
    const query = after ? `?after=${encodeURIComponent(after)}` : ''
    const response = await fetch(`${endpoint}/artisans${query}`, { signal })
    if (!response.ok) throw new Error('Artisan feed unavailable')
    const page: { artisans: Artisan[]; next: string | null } = await response.json()
    profiles.push(...page.artisans)
    after = page.next
  } while (after)
  return profiles
}

export async function loadArtisanCities(signal: AbortSignal): Promise<ArtisanCity[]> {
  const response = await fetch(new URL('artisan-cities.json', document.baseURI), { signal })
  if (!response.ok) throw new Error('City index unavailable')
  return response.json()
}

export async function submitArtisan(id: string, input: Record<string, string | number>): Promise<Artisan> {
  const response = await fetch(endpoint + '/artisans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, artisan: input }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Der Eintrag konnte nicht gespeichert werden.')
  return result.artisan
}
