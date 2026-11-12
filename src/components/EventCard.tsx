import { ArrowUpRight, Heart } from 'lucide-react'
import { eventStatusLabel } from '../lib/eventStatus'
import { CATEGORY_MAP } from '../data/categories'
import { formatDistance } from '../lib/geo'
import { formatShortRange } from '../lib/dates'
import type { ChronikEvent } from '../types'
import { CategoryIcon } from './CategoryIcon'
import { EventArt } from './EventArt'

type Props = {
  event: ChronikEvent
  distance: number | null
  saved: boolean
  onOpen: () => void
  onToggleSave: () => void
}

export function EventCard({ event, distance, saved, onOpen, onToggleSave }: Props) {
  const category = CATEGORY_MAP[event.category]
  const status = eventStatusLabel(event.eventStatus)
  return (
    <article
      className="event-card"
      style={{ '--cat': category.color, '--cat-tint': category.tint } as React.CSSProperties}
    >
      <div
        className="event-card__main"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
      >
        <EventArt category={event.category} seed={event.id} className="event-card__art" />
        <span className="event-card__body">
          <span className="event-card__meta">
            <span className="cat-label">
              <CategoryIcon category={event.category} size={12} />
              {category.shortLabel}
            </span>
            {event.highlight && <span className="highlight-label">Highlight</span>}
          </span>
          <span className="event-card__title">{event.title}</span>
          <span className="event-card__info">
            <span>{formatShortRange(event.start, event.end)}</span>
            {status && <strong>{status}</strong>}
            <span className="dot-sep" aria-hidden="true" />
            <span>{event.city}</span>
            {distance !== null && (
              <>
                <span className="dot-sep" aria-hidden="true" />
                <span className="event-card__distance">{formatDistance(distance)}</span>
              </>
            )}
          </span>
        </span>
        <span className="event-card__go" aria-hidden="true">
          <ArrowUpRight size={16} />
        </span>
      </div>
      <button
        type="button"
        className={`save-btn ${saved ? 'is-saved' : ''}`}
        onClick={onToggleSave}
        aria-label={saved ? `${event.title} aus der Merkliste entfernen` : `${event.title} merken`}
        aria-pressed={saved}
      >
        <Heart size={15} fill={saved ? 'currentColor' : 'none'} />
      </button>
    </article>
  )
}
