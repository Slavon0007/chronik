import { useEffect, useRef, useState } from 'react'
import { Clock, ExternalLink, Hammer, MapPin, Navigation, X } from 'lucide-react'
import { ARTISAN_MODES, ARTISAN_TRADES } from '../lib/artisans'
import { formatDistance, normalizeText, routeUrl } from '../lib/geo'
import type { MapArtisan } from './MapView'

export function ArtisanList({ artisans, status, onClose, onOpen }: {
  artisans: MapArtisan[]
  status: 'loading' | 'ready' | 'error'
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const term = normalizeText(query.trim())
  const filtered = artisans.filter(item => normalizeText(`${item.title} ${item.city} ${ARTISAN_TRADES[item.trade]}`).includes(term))
  useEffect(() => { close.current?.focus() }, [])

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Liste schließen" onClick={onClose} />
      <aside className="side-panel list-panel" role="dialog" aria-modal="true" aria-label="Handwerk">
        <header className="side-panel__head">
          <h2>Handwerk</h2>
          <button ref={close} type="button" className="icon-btn" aria-label="Liste schließen" onClick={onClose}><X size={18} /></button>
        </header>
        <label className="search-field heritage-search">
          <input type="search" placeholder="Name, Stadt oder Handwerk" aria-label="Handwerk durchsuchen" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <div className="list-panel__scroll">
          {filtered.map(item => (
            <button type="button" className="heritage-row" key={item.id} onClick={() => onOpen(item.id)}>
              <Hammer size={18} aria-hidden="true" color={ARTISAN_MODES[item.kind].color} />
              <span><strong>{item.title}</strong><small>{item.city} · {ARTISAN_MODES[item.kind].shortLabel}</small></span>
              {item.distance !== null && <small>{formatDistance(item.distance)}</small>}
            </button>
          ))}
          {!filtered.length && <p role="status" className="list-empty">{
            status === 'error' ? 'Handwerk konnte nicht geladen werden.' :
            status === 'loading' ? 'Handwerk wird geladen …' : 'Keine passenden Einträge.'
          }</p>}
        </div>
      </aside>
    </>
  )
}

export function ArtisanDetails({ profile, onClose }: { profile: MapArtisan; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  const online = profile.kind === 'online'
  useEffect(() => { close.current?.focus() }, [profile.id])

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Details schließen" onClick={onClose} />
      <aside className="side-panel detail-panel" role="dialog" aria-modal="true" aria-label={profile.title}>
        <header className="side-panel__head heritage-detail-head">
          <span className="eyebrow"><Hammer size={17} aria-hidden="true" /> {ARTISAN_TRADES[profile.trade]}</span>
          <button ref={close} type="button" className="icon-btn" aria-label="Details schließen" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="detail-body">
          <h2>{profile.title}</h2>
          {online && <p className="artisan-online-label">Nur Online-Shop</p>}
          <p className="detail-place"><MapPin size={15} aria-hidden="true" />
            {online ? `${profile.city} · Stadtmitte` : `${profile.address}, ${profile.city}`}
          </p>
          {online && <p className="detail-description">Kein Laden vor Ort. Der Kartenpunkt zeigt die gewählte Stadt.</p>}
          {profile.description && <p className="detail-description">{profile.description}</p>}
          {!online && <dl className="fact-list">
            <div className="fact"><dt><Clock size={15} aria-hidden="true" /> Öffnungszeiten</dt>
              <dd>{profile.hours || 'Bitte bei der Werkstatt erfragen.'}</dd></div>
          </dl>}
          <div className="detail-actions">
            <a className="primary-btn" href={profile.website}><ExternalLink size={15} /> {online ? 'Zum Online-Shop' : 'Zur Website'}</a>
            {!online && <a className="secondary-btn" href={routeUrl(profile.lat, profile.lng, profile.title)}
              target="_blank" rel="noopener"><Navigation size={15} /> Route planen</a>}
          </div>
        </div>
      </aside>
    </>
  )
}
