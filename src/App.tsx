import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { MapView, type MapEvent, type MapSite, type MapArtisan } from './components/MapView'
import { ListPanel } from './components/ListPanel'
import { EventDetails } from './components/EventDetails'
import { HeritageDetails, HeritageList } from './components/HeritagePanels'
import { ArtisanDetails, ArtisanList } from './components/ArtisanPanels'
import { ArtisanForm } from './components/ArtisanForm'
import { loadArtisans } from './lib/artisans'
import { CATEGORIES, ALL_CATEGORIES } from './data/categories'
import { HERITAGE_KINDS } from './data/heritage'
import { CITIES } from './data/cities'
import { haversineKm, nearestCity } from './lib/geo'
import { eventOverlapsRange, getDateRange, isEventCurrent, parseDate } from './lib/dates'
import { fetchPublishedEvents, isSupabaseConfigured } from './lib/api'
import { linkedEventId, setLinkedEventId } from './lib/eventLink'
import type { Artisan, CategoryId, ChronikEvent, DateFilterId, HeritageSite, HeritageKind, MapMode, Place } from './types'

const ALL_HERITAGE_KINDS = Object.values(HERITAGE_KINDS).map(({ id }) => id)
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
  const [selectedId, setSelectedId] = useState<string | null>(linkedEventId)
  const [listOpen, setListOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>(readFavorites)
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const [focus, setFocus] = useState<{ id: string; token: number } | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [mode, setMode] = useState<MapMode>('events')
  const showHeritage = mode === 'heritage'
  const showArtisans = mode === 'artisans'
  const [artisans, setArtisans] = useState<Artisan[]>([])
  const [artisanStatus, setArtisanStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [heritage, setHeritage] = useState<HeritageSite[] | null>(null)
  const [heritageKinds, setHeritageKinds] = useState<HeritageKind[]>(ALL_HERITAGE_KINDS)
  const [heritageFailed, setHeritageFailed] = useState(false)
  const [catalog, setCatalog] = useState<ChronikEvent[]>([])
  const [dataSource, setDataSource] = useState<'static' | 'supabase'>(isSupabaseConfigured ? 'supabase' : 'static')

  useEffect(() => {
    let cancelled = false
    fetchPublishedEvents()
      .then((liveEvents) => {
        if (cancelled) return
        setCatalog(liveEvents)
        const requestedId = linkedEventId()
        if (requestedId && !liveEvents.some((event) => event.id === requestedId && isEventCurrent(event))) {
          setLinkedEventId(null)
          setSelectedId(null)
          setToast({ message: 'Diese Veranstaltung ist nicht mehr im Kalender.', id: Date.now() })
        }
        setDataSource(isSupabaseConfigured ? 'supabase' : 'static')
      })
      .catch((error: unknown) => {
        if (!cancelled) setToast({ message: 'Veranstaltungen konnten nicht geladen werden. Bitte erneut laden.', id: Date.now() })
        console.warn('Chronik: live data unavailable.', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showHeritage || heritage) return
    const controller = new AbortController()
    setHeritageFailed(false)
    fetch(new URL('heritage.json', document.baseURI), { signal: controller.signal, cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Heritage catalogue unavailable')
        return response.json()
      })
      .then(({ places }: { places: HeritageSite[] }) => {
        if (!Array.isArray(places)) throw new Error('Invalid heritage catalogue')
        if (!controller.signal.aborted) setHeritage(places)
      })
      .catch(() => {
        if (!controller.signal.aborted) setHeritageFailed(true)
      })
    return () => controller.abort()
  }, [showHeritage, heritage])

  useEffect(() => {
    if (!showArtisans) return
    const controller = new AbortController()
    setArtisanStatus('loading')
    loadArtisans(controller.signal).then((profiles) => {
      if (controller.signal.aborted) return
      setArtisans(current => [...new Map([...profiles, ...current].map(profile => [profile.id, profile])).values()])
      setArtisanStatus('ready')
    }).catch(() => {
      if (!controller.signal.aborted) setArtisanStatus('error')
    })
    return () => controller.abort()
  }, [showArtisans])

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

  const sites = useMemo<MapSite[]>(() => {
    if (!showHeritage || !heritage) return []
    const nearby = heritage
      .filter((site) => heritageKinds.includes(site.kind))
      .map((site) => ({
        ...site,
        distance: place ? haversineKm(place.lat, place.lng, site.lat, site.lng) : null,
      }))
      .filter((site) => site.distance === null || site.distance <= radius)
    if (place) nearby.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    return nearby
  }, [showHeritage, heritage, heritageKinds, place, radius])

  const artisanPoints = useMemo<MapArtisan[]>(() => {
    if (!showArtisans) return []
    return artisans.map(profile => ({
      ...profile,
      distance: place ? haversineKm(place.lat, place.lng, profile.lat, profile.lng) : null,
    })).filter(profile => profile.distance === null || profile.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.title.localeCompare(b.title, 'de'))
  }, [artisans, place, radius, showArtisans])
  const selectedArtisan = showArtisans ? artisans.find(profile => profile.id === selectedId) : undefined

  const selectedSite = showHeritage ? sites.find((site) => site.id === selectedId) : undefined

  const selectedEvent = mode === 'events' && selectedId
    ? allWithDistance.find((event) => event.id === selectedId) ?? null
    : null

  const activeFilterCount =
    (place ? 1 : 0) +
    (mode === 'events' && dateFilter !== 'all' ? 1 : 0) +
    (mode === 'events' && selectedCategories.length !== CATEGORIES.length ? 1 : 0) +
    (showHeritage && heritageKinds.length !== ALL_HERITAGE_KINDS.length ? 1 : 0) +
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
      if (selectedId) closeDetails()
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

  function changeMapMode(next: MapMode) {
    if (next === mode) return
    setMode(next)
    closeDetails()
    setFocus(null)
    setListOpen(false)
  }

  function selectEventCategories(categories: CategoryId[]) {
    setSelectedCategories(categories)
    changeMapMode('events')
  }

  function toggleCategory(id: CategoryId) {
    if (mode !== 'events') {
      selectEventCategories([id])
      return
    }
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
    if (showHeritage) setHeritageKinds(ALL_HERITAGE_KINDS)
    else if (mode === 'events') {
      setSelectedCategories(ALL_CATEGORIES)
      setDateFilter('all')
    }
    setRadius(150)
    closeDetails()
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

  function closeDetails() {
    setSelectedId(null)
    setLinkedEventId(null)
  }

  function openEvent(id: string, focusMap = false) {
    setSelectedId(id)
    setLinkedEventId(mode === 'events' ? id : null)
    setListOpen(false)
    if (focusMap) setFocus({ id, token: Date.now() })
  }

  function addArtisan(profile: Artisan) {
    setArtisans(current => [...current.filter(existing => existing.id !== profile.id), profile])
    setArtisanStatus('ready')
    // Centre the map on the new listing even if a radius filter was active.
    setPlace(null)
    openEvent(profile.id, true)
    notify('Eintrag veröffentlicht.')
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
        totalCount={showArtisans ? artisanPoints.length : showHeritage ? sites.length : events.length}
        showHeritage={showHeritage}
        showArtisans={showArtisans}
        heritageKinds={heritageKinds}
        onToggleHeritageKind={(kind) => setHeritageKinds((current) =>
          current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind],
        )}
        locating={locating}
        mobileOpen={filtersOpen}
        canInstall={Boolean(installEvent)}
        dataSource={dataSource}
        resetToken={resetToken}
        onToggleCategory={toggleCategory}
        onToggleAllCategories={() => selectEventCategories(
          mode === 'events' && selectedCategories.length === ALL_CATEGORIES.length ? [] : ALL_CATEGORIES,
        )}
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
          events={showArtisans ? artisanPoints : showHeritage ? sites : events}
          mode={mode}
          artisanStatus={artisanStatus}
          artisanAction={showArtisans ? <ArtisanForm onSaved={addArtisan} /> : undefined}
          heritageStatus={heritageFailed ? 'error' : heritage ? 'ready' : 'loading'}
          onChangeMapMode={changeMapMode}
          place={place}
          radius={radius}
          selectedId={selectedId}
          focus={focus}
          hasLocation={Boolean(place)}
          activeFilterCount={activeFilterCount}
          onOpenDetails={(id) => openEvent(id)}
          onOpenList={() => {
            closeDetails()
            setListOpen(true)
          }}
          onOpenFilters={() => {
            setListOpen(false)
            closeDetails()
            setFiltersOpen(true)
          }}
          onLocate={locate}
          onReset={resetFilters}
          onWidenRadius={() => setRadius(300)}
        />
      </main>

      {listOpen && showHeritage && (
        <HeritageList
          sites={sites}
          loading={!heritage && !heritageFailed}
          failed={heritageFailed}
          onClose={() => setListOpen(false)}
          onOpen={(id) => openEvent(id, true)}
        />
      )}

      {selectedSite && (
        <HeritageDetails site={selectedSite} onClose={closeDetails} />
      )}

      {listOpen && showArtisans && (
        <ArtisanList artisans={artisanPoints} status={artisanStatus} onClose={() => setListOpen(false)}
          onOpen={(id) => openEvent(id, true)} />
      )}

      {selectedArtisan && (
        <ArtisanDetails profile={{
          ...selectedArtisan,
          distance: place ? haversineKm(place.lat, place.lng, selectedArtisan.lat, selectedArtisan.lng) : null,
        }} onClose={closeDetails} />
      )}

      {listOpen && mode === 'events' && (
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
          onClose={closeDetails}
          onToggleSave={() => toggleSave(selectedEvent.id)}
          onLinkCopied={() => notify('Link kopiert.')}
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
