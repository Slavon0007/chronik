import type { Artisan, ArtisanCity } from '../types'
import { normalizeText } from './geo'

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
  online: { shortLabel: 'Online-Angebot', color: '#3e6091', tint: '#e3edfa' },
  workshop: { shortLabel: 'Vor Ort', color: '#923d2e', tint: '#f5e3dd' },
} as const

const endpoint = (import.meta.env.VITE_ORGANIZER_API_URL as string | undefined)?.replace(/\/+$/, '')
export const artisanApiAvailable = Boolean(endpoint)

export function artisanModeLabel(profile: Artisan): string {
  return profile.kind === 'online' && !profile.source ? 'Nur online' : ARTISAN_MODES[profile.kind].shortLabel
}

export function mergeArtisans(profiles: Artisan[]): Artisan[] {
  const byId = new Map(profiles.map(profile => [profile.id, profile]))
  const key = (profile: Artisan) => normalizeText(`${profile.title.trim()}|${profile.city.trim()}|${profile.country}`)
  const submitted = new Set([...byId.values()].filter(profile => !profile.source).map(key))
  return [...byId.values()].filter(profile => !profile.source || !submitted.has(key(profile)))
}

export async function loadArtisans(signal: AbortSignal): Promise<Artisan[]> {
  const feeds = [loadImportedArtisans(signal)]
  if (endpoint) feeds.push(loadSubmittedArtisans(endpoint, signal))
  const results = await Promise.allSettled(feeds)
  const available = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  if (!available.length) throw new Error('Artisan feeds unavailable')
  return mergeArtisans(available.flat())
}

async function loadImportedArtisans(signal: AbortSignal): Promise<Artisan[]> {
  const response = await fetch(new URL('artisans-imported.json', document.baseURI), { signal })
  if (!response.ok) throw new Error('Imported artisan feed unavailable')
  return response.json()
}

async function loadSubmittedArtisans(endpoint: string, signal: AbortSignal): Promise<Artisan[]> {
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
