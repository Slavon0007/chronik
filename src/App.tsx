import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { MapView, type MapEvent } from './components/MapView'
import { ListPanel } from './components/ListPanel'
import { EventDetails } from './components/EventDetails'
import { CATEGORIES, ALL_CATEGORIES } from './data/categories'
import { EVENTS } from './data/events'
import { CITIES } from './data/cities'
import { haversineKm, nearestCity } from './lib/geo'
import { eventOverlapsRange, getDateRange, isEventCurrent, parseDate } from './lib/dates'
import { fetchPublishedEvents, isSupabaseConfigured } from './lib/api'
import type { CategoryId, ChronikEvent, DateFilterId, Place } from './types'

const FAVORITES_KEY = 'chronik:favorites'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export default function App() {
  const [selectedCategories, setSelectedCategories] = useState<CategoryId[]>(ALL_CATEGORIES)
  const [dateFilter, setDateFilter] = useState<DateFilterId>('all')
  const [place, setPlace] = useState<Place | null>(null)
  const [radius, setRadius] = useState(150)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>(readFavorites)
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const [focus, setFocus] = useState<{ id: string; token: number } | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [catalog, setCatalog] = useState<ChronikEvent[]>(isSupabaseConfigured ? [] : EVENTS)
  const [dataSource, setDataSource] = useState<'demo' | 'supabase'>(isSupabaseConfigured ? 'supabase' : 'demo')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    fetchPublishedEvents()
      .then((liveEvents) => {
        if (cancelled) return
        setCatalog(liveEvents)
        setDataSource('supabase')
      })
      .catch((error: unknown) => {
        if (!cancelled) setToast({ message: 'Veranstaltungen konnten nicht geladen werden. Bitte erneut laden.', id: Date.now() })
        console.warn('Chronik: live data unavailable.', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const now = new Date()
  const range = getDateRange(dateFilter, now)

  const allWithDistance = useMemo<MapEvent[]>(
    () =>
      catalog
        .filter((event) => isEventCurrent(event, now))
        .map((event) => ({
          ...event,
          distance: place ? haversineKm(place.lat, place.lng, event.lat, event.lng) : null,
        })),
    // `now` is intentionally read once per filter change; all sample events are future-dated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, place, dateFilter],
  )

  const contextEvents = useMemo(
    () =>
      allWithDistance.filter(
        (event) =>
          eventOverlapsRange(event, range) &&
          (!place || (event.distance !== null && event.distance <= radius)),
      ),
    [allWithDistance, range, place, radius],
  )

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0])) as Record<
      CategoryId,
      number
    >
    for (const event of contextEvents) counts[event.category] += 1
    return counts
  }, [contextEvents])

  const events = useMemo(() => {
    const filtered = contextEvents.filter((event) => selectedCategories.includes(event.category))
    return filtered.sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance
      return parseDate(a.start).getTime() - parseDate(b.start).getTime()
    })
  }, [contextEvents, selectedCategories])

  const selectedEvent = selectedId
    ? allWithDistance.find((event) => event.id === selectedId) ?? null
    : null

  const activeFilterCount =
    (place ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (selectedCategories.length !== CATEGORIES.length ? 1 : 0) +
    (place && radius !== 150 ? 1 : 0)

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(savedIds))
    } catch {
      // Ignore storage errors (private mode, quota).
    }
  }, [savedIds])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (selectedId) setSelectedId(null)
      else if (listOpen) setListOpen(false)
      else if (filtersOpen) setFiltersOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, listOpen, filtersOpen])

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    function onInstalled() {
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function notify(message: string) {
    setToast({ message, id: Date.now() })
  }

  function toggleCategory(id: CategoryId) {
    setSelectedCategories((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  function choosePlace(next: Place) {
    setPlace(next)
    if (!place) setRadius(150)
    setFiltersOpen(false)
    notify(`Umkreis ab ${next.label} gesetzt.`)
  }

  function clearPlace() {
    setPlace(null)
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      notify('Dein Browser unterstützt keine Standortbestimmung.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const city = nearestCity(latitude, longitude, CITIES, 70)
        setPlace({
          label: city ? city.name : 'Mein Standort',
          lat: latitude,
          lng: longitude,
          kind: 'location',
        })
        setRadius(100)
        setLocating(false)
        notify(
          city
            ? `Standort gesetzt — Umkreis ab ${city.name}.`
            : 'Standort gesetzt — 100 km Umkreis aktiv.',
        )
      },
      (error) => {
        setLocating(false)
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Standortzugriff verweigert. Suche stattdessen nach einer Stadt.'
            : 'Standort konnte nicht bestimmt werden. Suche nach einer Stadt oder PLZ.'
        notify(message)
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 300_000 },
    )
  }

  function resetFilters() {
    setPlace(null)
    setSelectedCategories(ALL_CATEGORIES)
    setDateFilter('all')
    setRadius(150)
    setSelectedId(null)
    setResetToken((token) => token + 1)
    notify('Alle Filter zurückgesetzt.')
  }

  function toggleSave(id: string) {
    const saved = savedIds.includes(id)
    notify(saved ? 'Von der Merkliste entfernt.' : 'Zur Merkliste hinzugefügt.')
    setSavedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  function openEvent(id: string, focusMap = false) {
    setSelectedId(id)
    setListOpen(false)
    if (focusMap) setFocus({ id, token: Date.now() })
  }

  async function installApp() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      notify('Chronik wird installiert.')
      setInstallEvent(null)
    }
  }

  return (
    <div className="app">
      <Sidebar
        selectedCategories={selectedCategories}
        categoryCounts={categoryCounts}
        dateFilter={dateFilter}
        place={place}
        radius={radius}
        totalCount={events.length}
        locating={locating}
        mobileOpen={filtersOpen}
        canInstall={Boolean(installEvent)}
        dataSource={dataSource}
        resetToken={resetToken}
        onToggleCategory={toggleCategory}
        onDateFilter={setDateFilter}
        onPlace={choosePlace}
        onClearPlace={clearPlace}
        onRadius={setRadius}
        onLocate={locate}
        onReset={resetFilters}
        onInstall={installApp}
        onCloseMobile={() => setFiltersOpen(false)}
      />

      {filtersOpen && (
        <button
          type="button"
          className="sheet-backdrop"
          aria-label="Filter schließen"
          onClick={() => setFiltersOpen(false)}
        />
      )}

      <main className="main">
        <MapView
          events={events}
          place={place}
          radius={radius}
          selectedId={selectedId}
          focus={focus}
          hasLocation={Boolean(place)}
          activeFilterCount={activeFilterCount}
          onOpenDetails={(id) => openEvent(id)}
          onOpenList={() => {
            setSelectedId(null)
            setListOpen(true)
          }}
          onOpenFilters={() => {
            setListOpen(false)
            setSelectedId(null)
            setFiltersOpen(true)
          }}
          onLocate={locate}
          onReset={resetFilters}
          onWidenRadius={() => setRadius(300)}
        />
      </main>

      {listOpen && (
        <ListPanel
          events={events}
          savedIds={savedIds}
          hasLocation={Boolean(place)}
          dataSource={dataSource}
          onClose={() => setListOpen(false)}
          onOpenEvent={(id) => openEvent(id, true)}
          onToggleSave={toggleSave}
        />
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          distance={selectedEvent.distance}
          saved={savedIds.includes(selectedEvent.id)}
          onClose={() => setSelectedId(null)}
          onToggleSave={() => toggleSave(selectedEvent.id)}
        />
      )}

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <span className="toast__icon">
              <Check size={13} strokeWidth={3} />
            </span>
            {toast.message}
          </>
        )}
      </div>
    </div>
  )
}
