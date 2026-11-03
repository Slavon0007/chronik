import type { CategoryId, EventCategory } from '../types'

export const CATEGORIES: EventCategory[] = [
  {
    id: 'markt',
    label: 'Märkte & Feste',
    shortLabel: 'Märkte',
    color: '#a84a2b',
    tint: '#f3e2d6',
    description: 'Mittelaltermärkte, Burgweihnachten und Jahrmärkte',
  },
  {
    id: 'reenactment',
    label: 'Reenactment',
    shortLabel: 'Reenactment',
    color: '#40624a',
    tint: '#e3ebe2',
    description: 'Gelebte Geschichte, Heerlager und historische Feste',
  },
  {
    id: 'larp',
    label: 'LARP',
    shortLabel: 'LARP',
    color: '#68578f',
    tint: '#e9e4f1',
    description: 'Live-Rollenspiel, Cons und Fantasiewelten',
  },
  {
    id: 'turnier',
    label: 'Turniere & Kampf',
    shortLabel: 'Turniere',
    color: '#99702a',
    tint: '#f1e7d2',
    description: 'Ritterturniere, Buhurt und historischer Schwertkampf',
  },
  {
    id: 'cosplay',
    label: 'Cosplay',
    shortLabel: 'Cosplay',
    color: '#a84a68',
    tint: '#f3e1e7',
    description: 'Conventions, Cosplay-Wettbewerbe und Fantasiefeste',
  },
]

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<CategoryId, EventCategory>

export const ALL_CATEGORIES = CATEGORIES.map((category) => category.id)
