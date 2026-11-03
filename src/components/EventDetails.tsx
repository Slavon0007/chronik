import { useEffect, useRef } from 'react'
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Heart,
  MapPin,
  Navigation,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import { CATEGORY_MAP } from '../data/categories'
import { formatDateRange, relativeDateLabel } from '../lib/dates'
import { formatDistance, routeUrl } from '../lib/geo'
import type { ChronikEvent } from '../types'
import { CategoryIcon } from './CategoryIcon'
import { EventArt } from './EventArt'

type Props = {
  event: ChronikEvent
  distance: number | null
  saved: boolean
  onClose: () => void
  onToggleSave: () => void
}

export function EventDetails({ event, distance, saved, onClose, onToggleSave }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const category = CATEGORY_MAP[event.category]
  const relative = relativeDateLabel(event.start)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  function openRoute() {
    window.open(routeUrl(event.lat, event.lng, event.title), '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Details schließen" onClick={onClose} />
      <aside
        className="side-panel detail-panel"
        style={{ '--cat': category.color, '--cat-tint': category.tint } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
      >
        <div className="detail-hero">
          <EventArt category={event.category} seed={event.id} className="detail-hero__art" />
          <div className="detail-hero__shade" aria-hidden="true" />
          <div className="detail-hero__top">
            <span className="cat-badge">
              <CategoryIcon category={event.category} size={13} />
              {category.label}
            </span>
            <div className="detail-hero__actions">
              <button
                type="button"
                className={`icon-btn icon-btn--glass ${saved ? 'is-saved' : ''}`}
                onClick={onToggleSave}
                aria-label={saved ? 'Aus der Merkliste entfernen' : 'Zur Merkliste hinzufügen'}
                aria-pressed={saved}
              >
                <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
              </button>
              <button
                ref={closeRef}
                type="button"
                className="icon-btn icon-btn--glass"
                onClick={onClose}
                aria-label="Details schließen"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="detail-hero__bottom">
            {event.highlight && <span className="detail-highlight">Highlight</span>}
            {relative && <span className="detail-relative">{relative}</span>}
          </div>
        </div>

        <div className="detail-body">
          <p className="detail-date">{formatDateRange(event.start, event.end)}</p>
          <h2>{event.title}</h2>
          <p className="detail-place">
            <MapPin size={15} aria-hidden="true" />
            {event.venue}, {event.city}
            {distance !== null && <span className="detail-distance">{formatDistance(distance)} entfernt</span>}
          </p>

          <p className="detail-description">{event.description}</p>

          <p><strong>Besuchsbedingungen:</strong> {event.attendanceConditions || 'Bitte beim Veranstalter nachfragen.'}</p>
          {event.locationPrecision !== 'venue' && <p>Ungefähre Position. Bitte die genaue Anfahrt beim Veranstalter prüfen.</p>}
          <dl className="fact-list">
            <div className="fact">
              <dt>
                <CalendarDays size={15} /> Wann
              </dt>
              <dd>
                {formatDateRange(event.start, event.end)}
                <span className="fact__sub">{event.time}</span>
              </dd>
            </div>
            <div className="fact">
              <dt>
                <MapPin size={15} /> Wo
              </dt>
              <dd>
                {event.venue}
                <span className="fact__sub">{event.address}</span>
              </dd>
            </div>
            <div className="fact">
              <dt>
                <Ticket size={15} /> Eintritt
              </dt>
              <dd>{event.price}</dd>
            </div>
            <div className="fact">
              <dt>
                <Users size={15} /> Veranstalter
              </dt>
              <dd>{event.organizer}</dd>
            </div>
          </dl>

          <div className="detail-note">
            <Clock size={14} aria-hidden="true" />
            <p>
              Zeiten und Preise können sich ändern. Verbindliche Angaben findest du auf der
              Seite des Veranstalters.
            </p>
          </div>

          <div className="detail-actions">
            <button type="button" className="primary-btn" onClick={openRoute} disabled={event.locationPrecision === 'city'}>
              <Navigation size={16} />
              Route planen
            </button>
            <a
              className="secondary-btn"
              href={event.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} />
              Zur Veranstaltungsseite
            </a>
          </div>

          <p className="detail-source">
            Automatisch aus öffentlichen Quellen zusammengestellt. Angaben ohne Gewähr.
          </p>
        </div>
      </aside>
    </>
  )
}
