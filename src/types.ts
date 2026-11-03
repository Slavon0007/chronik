export type CategoryId = 'markt' | 'reenactment' | 'larp' | 'turnier' | 'cosplay'

export type EventCategory = {
  id: CategoryId
  label: string
  shortLabel: string
  color: string
  tint: string
  description: string
}

export type ChronikEvent = {
  id: string
  title: string
  category: CategoryId
  city: string
  venue: string
  address: string
  zip: string
  lat: number
  lng: number
  /** ISO date, inclusive */
  start: string
  /** ISO date, inclusive */
  end: string
  /** Human readable opening hours */
  time: string
  description: string
  organizer: string
  website: string
  price: string
  attendanceConditions?: string
  locationPrecision?: string
  highlight?: boolean
}

export type Place = {
  label: string
  lat: number
  lng: number
  kind: 'city' | 'location'
}

export type DateFilterId = 'all' | 'weekend' | 'month' | 'quarter'
