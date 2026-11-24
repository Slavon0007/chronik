import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Download, ExternalLink } from 'lucide-react'
import { calendarFile, googleCalendarUrl } from '../lib/calendar'
import type { ChronikEvent } from '../types'

export function EventCalendar({ event }: { event: ChronikEvent }) {
  const [downloadUrl, setDownloadUrl] = useState('')
  const content = useMemo(() => calendarFile(event), [event])
  const googleUrl = googleCalendarUrl(event)

  useEffect(() => {
    if (!content) {
      setDownloadUrl('')
      return
    }
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
    setDownloadUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [content])

  if (!googleUrl || event.eventStatus === 'cancelled' || event.eventStatus === 'postponed') return null

  return (
    <details className="event-calendar" key={event.id}>
      <summary className="secondary-btn"><CalendarPlus size={15} aria-hidden="true" /> Zum Kalender hinzufügen</summary>
      <div className="event-calendar__options">
        <a className="secondary-btn" href={googleUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" /> Google Kalender
        </a>
        {downloadUrl && <a className="secondary-btn" href={downloadUrl} download={'chronik-' + event.start + '.ics'}>
          <Download size={15} aria-hidden="true" /> Apple Kalender / Outlook (.ics)
        </a>}
        <p>Ganztägig für alle Veranstaltungstage. Öffnungszeiten stehen in der Beschreibung. Änderungen werden nicht automatisch übernommen.</p>
      </div>
    </details>
  )
}
