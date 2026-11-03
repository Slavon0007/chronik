import { useEffect, useRef, useState } from 'react'
import { Heart, List, X } from 'lucide-react'
import type { ChronikEvent } from '../types'
import { EventCard } from './EventCard'

type Props = {
  events: (ChronikEvent & { distance: number | null })[]
  savedIds: string[]
  hasLocation: boolean
  dataSource: 'static' | 'supabase'
  onClose: () => void
  onOpenEvent: (id: string) => void
  onToggleSave: (id: string) => void
}

export function ListPanel({
  events,
  savedIds,
  hasLocation,
  dataSource,
  onClose,
  onOpenEvent,
  onToggleSave,
}: Props) {
  const [tab, setTab] = useState<'all' | 'saved'>('all')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const shown = tab === 'saved' ? events.filter((event) => savedIds.includes(event.id)) : events

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Liste schließen" onClick={onClose} />
      <aside className="side-panel list-panel" role="dialog" aria-modal="true" aria-label="Liste der Feste">
        <div className="side-panel__handle" aria-hidden="true" />
        <header className="side-panel__head">
          <div>
            <p className="eyebrow">{hasLocation ? 'In deiner Nähe' : 'Ganz Deutschland'}</p>
            <h2>Feste entdecken</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn icon-btn--solid"
            onClick={onClose}
            aria-label="Liste schließen"
          >
            <X size={18} />
          </button>
        </header>

        <div className="list-tabs" role="tablist" aria-label="Liste filtern">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={tab === 'all' ? 'is-active' : ''}
            onClick={() => setTab('all')}
          >
            <List size={14} />
            Alle <span>{events.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'saved'}
            className={tab === 'saved' ? 'is-active' : ''}
            onClick={() => setTab('saved')}
          >
            <Heart size={14} />
            Merkliste <span>{events.filter((event) => savedIds.includes(event.id)).length}</span>
          </button>
        </div>

        <div className="list-panel__scroll">
          {shown.length === 0 ? (
            <div className="list-empty">
              {tab === 'saved' ? (
                <>
                  <span className="list-empty__icon">
                    <Heart size={22} />
                  </span>
                  <h3>Noch nichts gemerkt</h3>
                  <p>
                    Tippe auf das Herz eines Festes, um es hier zu sammeln — auch offline
                    verfügbar.
                  </p>
                </>
              ) : (
                <>
                  <span className="list-empty__icon">
                    <List size={22} />
                  </span>
                  <h3>Keine Feste gefunden</h3>
                  <p>Vergrößere den Umkreis oder wähle einen anderen Zeitraum.</p>
                </>
              )}
            </div>
          ) : (
            shown.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                distance={event.distance}
                saved={savedIds.includes(event.id)}
                onOpen={() => onOpenEvent(event.id)}
                onToggleSave={() => onToggleSave(event.id)}
              />
            ))
          )}
        </div>

        <footer className="list-panel__foot">
          <span className="status-dot" aria-hidden="true" />
          {dataSource === 'supabase'
            ? 'Live aus Supabase · automatisch aktualisiert'
            : 'Automatisch gesammelt · Offizielle Quelle in jeder Karte'}
        </footer>
      </aside>
    </>
  )
}
