import { useEffect, useRef, useState } from 'react'
import { Castle, Clock, ExternalLink, Landmark, MapPin, Navigation, Search, X } from 'lucide-react'
import { HERITAGE_KINDS } from '../data/heritage'
import { parseDate, startOfDay } from '../lib/dates'
import { formatDistance, normalizeText, routeUrl } from '../lib/geo'
import type { MapSite } from './MapView'

type ListProps = {
  sites: MapSite[]
  loading: boolean
  failed: boolean
  onClose: () => void
  onOpen: (id: string) => void
}

const PAGE_SIZE = 60

export function HeritageList({ sites, loading, failed, onClose, onOpen }: ListProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const search = normalizeText(query.trim())
  const matching = sites.filter((site) =>
    normalizeText([site.title, site.address, site.country].filter(Boolean).join(' ')).includes(search),
  )

  useEffect(() => { closeRef.current?.focus() }, [])

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Liste schließen" onClick={onClose} />
      <aside className="side-panel list-panel" role="dialog" aria-modal="true" aria-label="Burgen und Museen">
        <header className="side-panel__head">
          <div>
            <p className="eyebrow">{matching.length} historische Orte</p>
            <h2>Burgen &amp; Museen</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-btn icon-btn--solid" onClick={onClose} aria-label="Liste schließen"><X size={18} /></button>
        </header>
        <label className="search-field heritage-search">
          <Search size={17} className="search-field__icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Historischen Ort suchen"
            placeholder="Name oder Ort"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }}
          />
        </label>
        <div className="list-panel__scroll">
          {matching.length === 0 && (
            <p className="list-empty" role="status">
              {failed ? 'Historische Orte konnten nicht geladen werden.' : loading ? 'Historische Orte werden geladen …' : 'Keine passenden Orte gefunden.'}
            </p>
          )}
          {matching.slice(0, limit).map((site) => {
            const Icon = site.kind === 'castle' ? Castle : Landmark
            return (
              <button type="button" className="heritage-row" key={site.id} onClick={() => onOpen(site.id)}>
                <Icon size={19} color={HERITAGE_KINDS[site.kind].color} aria-hidden="true" />
                <span>
                  <strong>{site.title}</strong>
                  <small>{site.address || site.country}</small>
                </span>
                {site.distance !== null && <small>{formatDistance(site.distance)}</small>}
              </button>
            )
          })}
          {matching.length > limit && (
            <button type="button" className="secondary-btn" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Weitere Orte anzeigen
            </button>
          )}
        </div>
        <footer className="list-panel__foot">
          <a href="https://www.wikidata.org/wiki/Wikidata:Licensing">Wikidata (CC0)</a> · Offizielle Besuchsseiten
        </footer>
      </aside>
    </>
  )
}

export function HeritageDetails({ site, onClose }: { site: MapSite; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const kind = HERITAGE_KINDS[site.kind]
  const Icon = site.kind === 'castle' ? Castle : Landmark
  const hoursExpired = site.hoursValidUntil && parseDate(site.hoursValidUntil) < startOfDay(new Date())
  const hours = hoursExpired ? '' : site.hours

  useEffect(() => { closeRef.current?.focus() }, [site.id])

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Details schließen" onClick={onClose} />
      <aside className="side-panel detail-panel" role="dialog" aria-modal="true" aria-label={site.title}>
        <header className="side-panel__head heritage-detail-head">
          <span className="eyebrow"><Icon size={18} aria-hidden="true" />{kind.label}</span>
          <button ref={closeRef} type="button" className="icon-btn icon-btn--solid" onClick={onClose} aria-label="Details schließen"><X size={18} /></button>
        </header>
        <div className="detail-body">
          <h2>{site.title}</h2>
          <p className="detail-place">
            <MapPin size={15} aria-hidden="true" />
            {site.address || site.country}
            {site.distance !== null && <span className="detail-distance">{formatDistance(site.distance)} entfernt</span>}
          </p>
          <p className="detail-description">{site.description}</p>
          <dl className="fact-list">
            <div className="fact">
              <dt><Clock size={15} aria-hidden="true" /> Öffnungszeiten</dt>
              <dd className="heritage-hours">{hours || 'Keine aktuellen Öffnungszeiten im Katalog. Bitte vor dem Besuch auch den Zugang prüfen.'}</dd>
            </div>
          </dl>
          {hours && <p className="detail-note">Aktuelle Ausnahmen und Feiertagszeiten stehen auf der Besuchsseite.</p>}
          <div className="detail-actions">
            <a className="primary-btn" href={routeUrl(site.lat, site.lng, site.title)} target="_blank" rel="noopener noreferrer">
              <Navigation size={16} /> Route planen
            </a>
            {site.website && (
              <a className="secondary-btn" href={site.website}><ExternalLink size={15} /> Zur Website</a>
            )}
          </div>
          <p className="detail-source"><a href={site.source}>Datenquelle ansehen</a></p>
        </div>
      </aside>
    </>
  )
}
