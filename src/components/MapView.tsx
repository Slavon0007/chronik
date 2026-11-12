import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Castle, Compass, List, LocateFixed, SlidersHorizontal } from 'lucide-react'
import { CATEGORIES, CATEGORY_MAP } from '../data/categories'
import { eventStatusLabel } from '../lib/eventStatus'
import { formatDistance } from '../lib/geo'
import { formatShortRange } from '../lib/dates'
import type { CategoryId, ChronikEvent, Place } from '../types'

export type MapEvent = ChronikEvent & { distance: number | null }

type Props = {
  events: MapEvent[]
  place: Place | null
  radius: number
  selectedId: string | null
  focus: { id: string; token: number } | null
  hasLocation: boolean
  activeFilterCount: number
  onOpenDetails: (id: string) => void
  onOpenList: () => void
  onOpenFilters: () => void
  onLocate: () => void
  onReset: () => void
  onWidenRadius: () => void
}

const GERMANY_BOUNDS: L.LatLngBoundsExpression = [
  [47.1, 5.6],
  [55.2, 15.3],
]

/** Lucide path data, inlined so markers can be built as plain Leaflet HTML. */
const GLYPHS: Record<CategoryId, string> = {
  markt:
    '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  reenactment:
    '<path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"/><path d="M18 11V4H6v7"/><path d="M15 22v-4a3 3 0 0 0-3-3a3 3 0 0 0-3 3v4"/><path d="M22 11V9"/><path d="M2 11V9"/><path d="M6 4V2"/><path d="M18 4V2"/><path d="M10 4V2"/><path d="M14 4V2"/>',
  larp: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  turnier:
    '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  cosplay:
    '<path d="M18 11c-1.5 0-2.5.5-3 2"/><path d="M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z"/><path d="M6 11c1.5 0 2.5.5 3 2"/>',
}

function markerMarkup(event: ChronikEvent): string {
  const category = CATEGORY_MAP[event.category]
  return `<span class="marker" style="--cat:${category.color};--cat-tint:${category.tint}">
    <span class="marker__pulse" aria-hidden="true"></span>
    <span class="marker__body">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[event.category]}</svg>
    </span>
  </span>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function MapView({
  events,
  place,
  radius,
  selectedId,
  focus,
  hasLocation,
  activeFilterCount,
  onOpenDetails,
  onOpenList,
  onOpenFilters,
  onLocate,
  onReset,
  onWidenRadius,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerLayerRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const radiusRef = useRef<L.Circle | null>(null)
  const placeMarkerRef = useRef<L.Marker | null>(null)
  const handlersRef = useRef({ onOpenDetails })
  const eventsRef = useRef(events)

  handlersRef.current.onOpenDetails = onOpenDetails
  eventsRef.current = events
  const eventSignature = events.map((event) => event.id).join('|')
  const renderSignature = events
    .map((event) => `${event.id}:${event.distance === null ? '-' : event.distance.toFixed(1)}`)
    .join('|')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = L.map(container, {
      center: [51.05, 10.35],
      zoom: 6,
      minZoom: 5,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 90,
    })
    map.attributionControl.setPrefix(false)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const markerLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 10,
      maxClusterRadius: (zoom) => (zoom < 7 ? 46 : zoom < 9 ? 38 : 30),
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          className: 'cluster-hit',
          html: `<span class="cluster"><span class="cluster__count">${count > 99 ? '99+' : count}</span></span>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
        })
      },
    })
    markerLayer.addTo(map)
    markerLayerRef.current = markerLayer
    mapRef.current = map

    map.setView([51.05, 10.35], 6)
    map.on('click', () => map.closePopup())

    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    observer.observe(container)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      markerLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Markers
  useEffect(() => {
    const map = mapRef.current
    const layer = markerLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()

    for (const event of eventsRef.current) {
      const icon = L.divIcon({
        className: 'marker-hit',
        html: markerMarkup(event),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -19],
      })

      const marker = L.marker([event.lat, event.lng], {
        icon,
        title: event.title,
        alt: `${event.title}, ${event.city}`,
        keyboard: true,
        riseOnHover: true,
      })

      marker.bindPopup(
        () => {
          const category = CATEGORY_MAP[event.category]
          const popup = document.createElement('div')
          popup.className = 'map-popup'
          popup.style.setProperty('--cat', category.color)
          const status = eventStatusLabel(event.eventStatus)
          popup.innerHTML = `
            <div class="map-popup__head">
              <span class="map-popup__cat"><span class="map-popup__dot"></span>${escapeHtml(category.shortLabel)}</span>
              ${event.distance !== null ? `<span class="map-popup__distance">${formatDistance(event.distance)}</span>` : ''}
            </div>
            <h3>${escapeHtml(event.title)}</h3>
            <p class="map-popup__meta">${escapeHtml(formatShortRange(event.start, event.end))} · ${escapeHtml(event.city)}</p>
            ${status ? `<p class="map-popup__meta"><strong>${escapeHtml(status)}</strong></p>` : ''}
            <button type="button" class="map-popup__button">Details ansehen <span aria-hidden="true">→</span></button>
          `
          popup.querySelector('button')?.addEventListener('click', () => {
            map.closePopup()
            handlersRef.current.onOpenDetails(event.id)
          })
          return popup
        },
        {
          className: 'chronik-popup',
          closeButton: false,
          offset: [0, -12],
          maxWidth: 300,
          minWidth: 258,
          autoPanPadding: [28, 96],
        },
      )

      marker.addTo(layer)
      marker.getElement()?.setAttribute('aria-label', `${event.title}, ${event.city}`)
      markersRef.current.set(event.id, marker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderSignature])

  // Highlight the selected marker without rebuilding the layer.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const selected = id === selectedId
      marker.getElement()?.querySelector('.marker')?.classList.toggle('is-selected', selected)
      marker.setZIndexOffset(selected ? 1000 : 0)
    }
  }, [selectedId, renderSignature])

  // Radius + origin marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (radiusRef.current) {
      radiusRef.current.remove()
      radiusRef.current = null
    }
    if (placeMarkerRef.current) {
      placeMarkerRef.current.remove()
      placeMarkerRef.current = null
    }
    if (!place) return

    radiusRef.current = L.circle([place.lat, place.lng], {
      radius: radius * 1000,
      color: '#3d5a43',
      weight: 1.4,
      opacity: 0.75,
      dashArray: '5 7',
      fillColor: '#3d5a43',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map)

    const originIcon = L.divIcon({
      className: 'origin-hit',
      html: '<span class="origin-dot"><span class="origin-dot__pulse"></span><span class="origin-dot__core"></span></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    })
    placeMarkerRef.current = L.marker([place.lat, place.lng], {
      icon: originIcon,
      interactive: false,
      keyboard: false,
    })
      .addTo(map)
      .bindTooltip(place.label, {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
        className: 'origin-tooltip',
        opacity: 1,
      })
  }, [place, radius])

  // Frame the current result set.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const timer = window.setTimeout(() => {
      if (events.length > 0 && (place || events.length <= 24)) {
        const bounds = L.latLngBounds(events.map((event) => [event.lat, event.lng] as [number, number]))
        if (place) {
          bounds.extend([place.lat, place.lng])
          bounds.extend(L.latLng(place.lat, place.lng).toBounds(radius * 2000))
        }
        map.fitBounds(bounds, {
          paddingTopLeft: [44, 120],
          paddingBottomRight: [44, 64],
          maxZoom: 11,
          animate: true,
          duration: 0.6,
        })
        if (!place && map.getZoom() < 6) map.setZoom(6)
      } else if (events.length > 0) {
        map.setView([51.05, 10.35], 6, { animate: true })
      } else if (place) {
        map.flyTo([place.lat, place.lng], 8, { duration: 0.6 })
      } else {
        map.flyToBounds(GERMANY_BOUNDS, { padding: [30, 30], duration: 0.6 })
      }
    }, 240)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSignature, place?.lat, place?.lng, radius])

  // Open a specific event when the user picks it from the list.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const event = eventsRef.current.find((entry) => entry.id === focus.id)
    if (!event) return

    map.flyTo([event.lat, event.lng], Math.max(map.getZoom(), 9), { duration: 0.7 })
    const marker = markersRef.current.get(event.id)
    if (marker) {
      const layer = markerLayerRef.current
      window.setTimeout(() => layer?.zoomToShowLayer(marker), 550)
    }
    map.closePopup()
  }, [focus])

  const noResults = events.length === 0
  const statusLabel = hasLocation
    ? `${events.length} ${events.length === 1 ? 'Fest' : 'Feste'} im Umkreis von ${radius} km`
    : `${events.length} ${events.length === 1 ? 'Fest' : 'Feste'} in Deutschland`

  return (
    <section className="map-shell" aria-label="Karte der Feste">
      <div ref={containerRef} className="map" />

      <div className="mobile-map-bar">
        <span className="mobile-brand">
          <Compass size={17} aria-hidden="true" />
          Chronik
        </span>
        <div className="mobile-map-bar__actions">
          <button type="button" className="icon-btn icon-btn--solid" onClick={onLocate} aria-label="Meinen Standort verwenden">
            <LocateFixed size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn--solid" onClick={onOpenList} aria-label="Liste öffnen">
            <List size={17} />
          </button>
          <button type="button" className="filter-fab" onClick={onOpenFilters}>
            <SlidersHorizontal size={15} />
            Filter
            {activeFilterCount > 0 && <span className="filter-fab__count">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <div className="map-status" role="status" aria-live="polite">
        <span className="map-status__pulse" aria-hidden="true" />
        <div>
          <strong>{statusLabel}</strong>
          <small>
            {hasLocation ? `Luftlinie ab ${place?.label ?? 'deinem Standort'}` : 'Alle aktiven Termine auf einen Blick'}
          </small>
        </div>
      </div>

      <div className="map-tools">
        <button type="button" className="map-tool" onClick={onOpenList}>
          <List size={16} />
          <span>Liste</span>
          <span className="map-tool__count">{events.length}</span>
        </button>
        <span className="map-tools__divider" aria-hidden="true" />
        <button
          type="button"
          className="map-tool map-tool--icon"
          onClick={onLocate}
          aria-label="Meinen Standort verwenden"
          title="In meiner Nähe"
        >
          <LocateFixed size={18} />
        </button>
      </div>

      {!noResults && (
        <div className="map-legend" aria-label="Kategorien">
          {CATEGORIES.map((category) => (
            <span className="map-legend__item" key={category.id}>
              <span className="map-legend__dot" style={{ background: category.color }} aria-hidden="true" />
              {category.shortLabel}
            </span>
          ))}
        </div>
      )}

      {noResults && (
        <div className="map-empty" role="status">
          <span className="map-empty__icon">
            <Castle size={26} />
          </span>
          <p className="eyebrow">Nichts in Sicht</p>
          <h3>Keine Feste für diese Auswahl</h3>
          <p>
            {hasLocation
              ? 'Vergrößere den Radius, ändere den Zeitraum oder wähle weitere Kategorien — vielleicht wartet etwas weiter draußen.'
              : 'Ändere den Zeitraum oder wähle weitere Kategorien aus.'}
          </p>
          <div className="map-empty__actions">
            {hasLocation && radius < 300 && (
              <button type="button" className="primary-btn primary-btn--small" onClick={onWidenRadius}>
                Auf 300 km erweitern
              </button>
            )}
            <button type="button" className="secondary-btn secondary-btn--small" onClick={onReset}>
              Filter zurücksetzen
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
