import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import L from 'leaflet'
import { ARTISAN_TRADES, artisanApiAvailable, loadArtisanCities, submitArtisan } from '../lib/artisans'
import { normalizeText } from '../lib/geo'
import type { Artisan, ArtisanCity } from '../types'

type Point = { lat: number; lng: number }

function WorkshopMap({ city, onPick }: { city: ArtisanCity; onPick: (point: Point) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [, , , , , lat, lng] = city

  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { center: [lat, lng], zoom: 13, scrollWheelZoom: false })
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const marker = L.circleMarker([lat, lng], { radius: 8, color: '#923d2e', interactive: false })
    function select(point: L.LatLng) {
      marker.setLatLng(point).addTo(map)
      onPick({ lat: point.lat, lng: point.lng })
    }
    map.on('click', ({ latlng }) => select(latlng))
    const timer = requestAnimationFrame(() => map.invalidateSize())
    return () => {
      cancelAnimationFrame(timer)
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, onPick])

  return (
    <div className="workshop-map-field">
      <div ref={container} className="workshop-map" aria-label="Karte für den Werkstattstandort" />
      <button type="button" className="secondary-btn" onClick={() => {
        const map = mapRef.current
        if (map) map.fire('click', { latlng: map.getCenter() })
      }}>
        Kartenmitte übernehmen
      </button>
    </div>
  )
}

export function ArtisanForm({ onSaved }: { onSaved: (artisan: Artisan) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submissionId = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [kind, setKind] = useState<'online' | 'workshop'>('online')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState<ArtisanCity | null>(null)
  const [cities, setCities] = useState<ArtisanCity[] | null>(null)
  const [cityError, setCityError] = useState(false)
  const [point, setPoint] = useState<Point | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || cities) return
    const controller = new AbortController()
    setCityError(false)
    loadArtisanCities(controller.signal).then((data) => {
      if (!controller.signal.aborted) setCities(data)
    }).catch(() => {
      if (!controller.signal.aborted) setCityError(true)
    })
    return () => controller.abort()
  }, [open, cities])

  const suggestions = useMemo(() => {
    const term = normalizeText(query.trim())
    if (city || !cities || term.length < 2) return []
    const byPostcode = /^\d+$/.test(term)
    const matches = cities.filter(([, name, , , postcodes]) => byPostcode
      ? postcodes.some(code => code.startsWith(term))
      : normalizeText(name).startsWith(term))
    return matches.sort((a, b) =>
      Number(normalizeText(b[1]) === term) - Number(normalizeText(a[1]) === term),
    ).slice(0, 8)
  }, [cities, city, query])

  function openForm() {
    submissionId.current = null
    setVersion(current => current + 1)
    setCity(null)
    setQuery('')
    setPoint(null)
    setKind('online')
    setError('')
    setOpen(true)
    dialog.current?.showModal()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!city || (kind === 'workshop' && !point)) {
      setError(!city ? 'Wähle bitte einen Ort aus der Vorschlagsliste.' : 'Markiere bitte den Standort deiner Werkstatt auf der Karte.')
      return
    }

    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    setBusy(true)
    setError('')
    try {
      const id = submissionId.current ??= crypto.randomUUID()
      const artisan = await submitArtisan(id, { ...form, kind, cityId: city[0], ...(kind === 'workshop' ? point : {}) })
      dialog.current?.close()
      onSaved(artisan)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Die Verbindung ist fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (!artisanApiAvailable) return null

  return (
    <>
      <button type="button" className="primary-btn primary-btn--small" onClick={openForm}>Handwerk eintragen</button>
      <dialog ref={dialog} className="organizer-dialog" aria-labelledby="artisan-form-title"
        onClose={() => setOpen(false)} onCancel={event => { if (busy) event.preventDefault() }}>
        <header>
          <h2 id="artisan-form-title">Handwerk eintragen</h2>
          <button type="button" className="secondary-btn" disabled={busy} onClick={() => dialog.current?.close()}>Schließen</button>
        </header>
        <form key={version} onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>Name der Werkstatt oder des Shops<input name="title" minLength={3} maxLength={120} required /></label>
            <label>Handwerk<select name="trade" defaultValue="" required>
              <option value="" disabled>Bitte wählen</option>
              {Object.entries(ARTISAN_TRADES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>Verkauf<select value={kind} onChange={event => {
              setKind(event.target.value === 'workshop' ? 'workshop' : 'online')
              setPoint(null)
            }}>
              <option value="online">Nur Online-Shop</option>
              <option value="workshop">Laden oder Werkstatt mit Publikumsverkehr</option>
            </select></label>
            <label>Stadt oder PLZ
              <input value={query} onChange={event => {
                setQuery(event.target.value)
                setCity(null)
                setPoint(null)
              }} autoComplete="off" maxLength={100} required />
            </label>
            {cityError && <p role="alert">Das Ortsverzeichnis konnte nicht geladen werden. Öffne das Formular erneut.</p>}
            {suggestions.length > 0 && (
              <div className="artisan-city-suggestions" aria-label="Ortsvorschläge">
                {suggestions.map(option => (
                  <button type="button" className="secondary-btn" key={option[0]} onClick={() => {
                    setCity(option)
                    setQuery(option[1])
                    setPoint(null)
                  }}>{option[1]} · {option[2]} ({option[3]})</button>
                ))}
              </div>
            )}
            {city && <p className="artisan-form-hint">{city[1]} · {city[2]} ({city[3]})</p>}
            {kind === 'online' ? (
              <p className="artisan-form-hint">Dein Shop erscheint in der Stadtmitte. Es wird keine Anschrift angezeigt.</p>
            ) : (
              <>
                <label>Öffentliche Adresse<input name="address" maxLength={200} required /></label>
                <label>Öffnungszeiten oder Terminvereinbarung<input name="hours" maxLength={200} /></label>
                {city && open && <>
                  <p className="artisan-form-hint">{point ? 'Werkstattstandort markiert.' : 'Tippe auf den genauen Standort deiner Werkstatt.'}</p>
                  <WorkshopMap city={city} onPick={setPoint} />
                </>}
              </>
            )}
            <label>Link zum Shop oder Profil<input name="website" type="url" maxLength={500} required /></label>
            <label>Kurzbeschreibung<textarea name="description" maxLength={500} rows={2} /></label>
            {error && <p role="alert" className="organizer-error">{error}</p>}
            <button type="submit" className="primary-btn">{busy ? 'Wird veröffentlicht …' : 'Auf der Karte veröffentlichen'}</button>
          </fieldset>
        </form>
      </dialog>
    </>
  )
}
