import type { ChronikEvent } from '../types'
import { shareableEventUrl } from './eventLink'

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

export function calendarDates(event: ChronikEvent): { start: string; end: string } | null {
  const start = calendarDate(event.start)
  const end = calendarDate(event.end)
  if (!start || !end || end < start) return null
  // All-day calendar end dates are exclusive. Chronik end dates are inclusive.
  end.setUTCDate(end.getUTCDate() + 1)
  return {
    start: start.toISOString().slice(0, 10).replace(/-/g, ''),
    end: end.toISOString().slice(0, 10).replace(/-/g, ''),
  }
}

function calendarLocation(event: ChronikEvent): string {
  return [...new Set([event.venue, event.address, [event.zip, event.city].filter(Boolean).join(' ')]
    .map(part => part.trim()).filter(Boolean))].join(', ')
}

function calendarDescription(event: ChronikEvent): string {
  return [
    event.description,
    event.time && 'Öffnungszeiten: ' + event.time,
    event.price && 'Eintritt: ' + event.price,
    event.attendanceConditions && 'Besuchsbedingungen: ' + event.attendanceConditions,
    event.organizer && 'Veranstalter: ' + event.organizer,
    event.website,
    shareableEventUrl(event.id),
    'Einmaliger Kalendereintrag. Änderungen bitte beim Veranstalter prüfen.',
  ].filter(Boolean).join('\n\n')
}

export function googleCalendarUrl(event: ChronikEvent): string | null {
  const dates = calendarDates(event)
  if (!dates) return null
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: dates.start + '/' + dates.end,
    location: calendarLocation(event),
    details: calendarDescription(event),
  })
  return 'https://calendar.google.com/calendar/render?' + params
}

function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function foldCalendarLine(line: string): string {
  // RFC 5545 limits physical lines to 75 UTF-8 octets, including continuation spaces.
  const encoder = new TextEncoder()
  let result = ''
  let size = 0
  for (const character of line) {
    const width = encoder.encode(character).length
    if (size + width > 75) {
      result += '\r\n '
      size = 1
    }
    result += character
    size += width
  }
  return result
}

export function calendarFile(event: ChronikEvent, now = new Date()): string | null {
  const dates = calendarDates(event)
  if (!dates) return null
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronik//Events//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + encodeURIComponent(event.id) + '@chronik',
    'DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
    'DTSTART;VALUE=DATE:' + dates.start,
    'DTEND;VALUE=DATE:' + dates.end,
    'SUMMARY:' + escapeCalendarText(event.title),
    'LOCATION:' + escapeCalendarText(calendarLocation(event)),
    'DESCRIPTION:' + escapeCalendarText(calendarDescription(event)),
    'URL:' + shareableEventUrl(event.id),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].map(foldCalendarLine).join('\r\n')
}
