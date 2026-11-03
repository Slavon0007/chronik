import type { ChronikEvent, DateFilterId } from '../types'

const MS_DAY = 86_400_000

/** Parse an ISO calendar date as local noon to avoid UTC offset surprises. */
export function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function isEventCurrent(event: ChronikEvent, now = new Date()): boolean {
  return parseDate(event.end).getTime() >= startOfDay(now).getTime()
}

export type DateRange = { start: Date; end: Date }

export function getDateRange(filter: DateFilterId, now = new Date()): DateRange | null {
  const today = startOfDay(now)
  if (filter === 'all') return null

  if (filter === 'weekend') {
    const day = today.getDay() // 0 Sun … 6 Sat
    const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day
    const saturday = new Date(today.getTime() + daysUntilSaturday * MS_DAY)
    const sunday = new Date(saturday.getTime() + MS_DAY)
    return { start: saturday, end: new Date(sunday.getTime() + MS_DAY - 1) }
  }

  if (filter === 'month') {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start: today, end }
  }

  return { start: today, end: new Date(today.getTime() + 90 * MS_DAY) }
}

export function eventOverlapsRange(event: ChronikEvent, range: DateRange | null): boolean {
  if (!range) return true
  const start = parseDate(event.start).getTime()
  const end = parseDate(event.end).getTime()
  return start <= range.end.getTime() && end >= range.start.getTime()
}

export function formatDateBadge(iso: string): { day: string; month: string } {
  const date = parseDate(iso)
  return {
    day: new Intl.DateTimeFormat('de-DE', { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('de-DE', { month: 'short' })
      .format(date)
      .replace('.', '')
      .toUpperCase(),
  }
}

export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
    .format(parseDate(iso))
    .replace('.', '')
}

/** “5.–6. Dezember 2026” / “28. Mai – 1. Juni 2027” */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parseDate(startIso)
  const end = parseDate(endIso)
  const day = (date: Date) => new Intl.DateTimeFormat('de-DE', { day: 'numeric' }).format(date)
  const month = (date: Date) =>
    new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(date)
  const year = (date: Date) => new Intl.DateTimeFormat('de-DE', { year: 'numeric' }).format(date)

  if (startIso === endIso) return `${day(start)}. ${month(start)} ${year(start)}`
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${day(start)}.–${day(end)}. ${month(start)} ${year(start)}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${day(start)}. ${month(start)} – ${day(end)}. ${month(end)} ${year(start)}`
  }
  return `${day(start)}. ${month(start)} ${year(start)} – ${day(end)}. ${month(end)} ${year(end)}`
}

export function formatShortRange(startIso: string, endIso: string): string {
  const start = parseDate(startIso)
  const end = parseDate(endIso)
  if (startIso === endIso) {
    return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
      .format(start)
      .replace('.', '')
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const startLabel = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  })
    .format(start)
    .replace('.', '')
  const endLabel = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
    .format(end)
    .replace('.', '')
  return `${startLabel}–${endLabel}`
}

export function relativeDateLabel(iso: string, now = new Date()): string {
  const today = startOfDay(now)
  const date = startOfDay(parseDate(iso))
  const diff = Math.round((date.getTime() - today.getTime()) / MS_DAY)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff > 1 && diff < 7) return `In ${diff} Tagen`
  return ''
}

export function dateFilterLabel(filter: DateFilterId): string {
  switch (filter) {
    case 'weekend':
      return 'Dieses Wochenende'
    case 'month':
      return 'Dieser Monat'
    case 'quarter':
      return 'Nächste 3 Monate'
    default:
      return 'Alle Termine'
  }
}
