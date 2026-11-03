import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Download,
  LocateFixed,
  MapPin,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { CITIES } from '../data/cities'
import { CATEGORIES, CATEGORY_MAP } from '../data/categories'
import { searchCities } from '../lib/geo'
import { dateFilterLabel } from '../lib/dates'
import type { CategoryId, DateFilterId, Place } from '../types'
import { CategoryIcon } from './CategoryIcon'

type Props = {
  selectedCategories: CategoryId[]
  categoryCounts: Record<CategoryId, number>
  dateFilter: DateFilterId
  place: Place | null
  radius: number
  totalCount: number
  locating: boolean
  mobileOpen: boolean
  canInstall: boolean
  dataSource: 'demo' | 'supabase'
  resetToken: number
  onToggleCategory: (id: CategoryId) => void
  onDateFilter: (filter: DateFilterId) => void
  onPlace: (place: Place) => void
  onClearPlace: () => void
  onRadius: (radius: number) => void
  onLocate: () => void
  onReset: () => void
  onInstall: () => void
  onCloseMobile: () => void
}

const DATE_OPTIONS: { id: DateFilterId; label: string; hint: string }[] = [
  { id: 'all', label: 'Alle Termine', hint: 'Alles, was kommt' },
  { id: 'weekend', label: 'Wochenende', hint: 'Sa & So' },
  { id: 'month', label: 'Dieser Monat', hint: 'Bis Monatsende' },
  { id: 'quarter', label: '3 Monate', hint: 'Die nächsten 90 Tage' },
]

const QUICK_CITIES = ['Berlin', 'Hamburg', 'München', 'Köln']

export function Sidebar({
  selectedCategories,
  categoryCounts,
  dateFilter,
  place,
  radius,
  totalCount,
  locating,
  mobileOpen,
  canInstall,
  dataSource,
  resetToken,
  onToggleCategory,
  onDateFilter,
  onPlace,
  onClearPlace,
  onRadius,
  onLocate,
  onReset,
  onInstall,
  onCloseMobile,
}: Props) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (place) setQuery(place.label)
  }, [place])

  useEffect(() => {
    if (resetToken === 0) return
    setQuery('')
    setShowSuggestions(false)
  }, [resetToken])

  const suggestions = showSuggestions ? searchCities(query, CITIES) : []
  const showEmpty = showSuggestions && query.trim().length > 1 && suggestions.length === 0

  function chooseCity(name: string) {
    const city = CITIES.find((entry) => entry.name === name)
    if (!city) return
    setQuery(city.name)
    setShowSuggestions(false)
    onPlace({ label: city.name, lat: city.lat, lng: city.lng, kind: 'city' })
  }

  function chooseSuggestion(index: number) {
    const city = suggestions[index]
    if (!city) return
    setQuery(city.name)
    setShowSuggestions(false)
    onPlace({ label: city.name, lat: city.lat, lng: city.lng, kind: 'city' })
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setShowSuggestions(true)
    setActiveIndex(0)
    if (place && value !== place.label) onClearPlace()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setShowSuggestions(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (suggestions[activeIndex]) chooseSuggestion(activeIndex)
    } else if (event.key === 'Escape') {
      setShowSuggestions(false)
      inputRef.current?.blur()
    }
  }

  const allCategories = selectedCategories.length === CATEGORIES.length

  function toggleAllCategories() {
    if (allCategories) {
      selectedCategories.forEach((id) => onToggleCategory(id))
      return
    }
    CATEGORIES.filter((category) => !selectedCategories.includes(category.id)).forEach((category) =>
      onToggleCategory(category.id),
    )
  }

  return (
    <aside
      className={`sidebar ${mobileOpen ? 'is-open' : ''}`}
      id="filter-panel"
      aria-label="Suche und Filter"
    >
      <div className="sidebar__handle" aria-hidden="true" />
      <div className="sidebar__mobile-head">
        <span>Suche & Filter</span>
        <button type="button" className="icon-btn" onClick={onCloseMobile} aria-label="Filter schließen">
          <X size={18} />
        </button>
      </div>

      <div className="sidebar__scroll">
        <header className="brand">
          <div className="brand__mark" aria-hidden="true">
            <LogoMark />
          </div>
          <div className="brand__word">
            <span className="brand__name">Chronik</span>
            <span className="brand__tag">Mittelalter &amp; LARP</span>
          </div>
          <span className="brand__region">DACH</span>
        </header>

        <div className="sidebar__intro">
          <p className="eyebrow">Dein Kalender für die andere Zeit</p>
          <h1>
            Mittelalter
            <br />
            <em>vor der Haustür.</em>
          </h1>
          <p className="lede">
            Märkte, Turniere, LARP und gelebte Geschichte — automatisch gesammelt,
            auf der Karte vereint.
          </p>
        </div>

        <section className="filter-block" aria-labelledby="location-label">
          <div className="filter-head">
            <h2 id="location-label">Ausgangspunkt</h2>
            {place && (
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setQuery('')
                  setShowSuggestions(false)
                  onClearPlace()
                }}
              >
                <X size={12} /> Ganz Deutschland
              </button>
            )}
          </div>

          <div className={`search-field ${showSuggestions ? 'is-open' : ''}`}>
            <Search size={17} className="search-field__icon" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Stadt oder PLZ"
              aria-label="Stadt oder Postleitzahl"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="place-suggestions"
              autoComplete="off"
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 140)}
              onKeyDown={handleKeyDown}
            />
            {query ? (
              <button
                type="button"
                className="search-field__clear"
                aria-label="Ort löschen"
                onClick={() => {
                  setQuery('')
                  setShowSuggestions(false)
                  onClearPlace()
                  inputRef.current?.focus()
                }}
              >
                <X size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="search-field__locate"
              onClick={onLocate}
              aria-label="Meinen Standort verwenden"
              title="Meinen Standort verwenden"
              disabled={locating}
            >
              <LocateFixed size={15} className={locating ? 'spin' : undefined} />
              <span>In meiner Nähe</span>
            </button>

            {(suggestions.length > 0 || showEmpty) && (
              <div className="suggestions" id="place-suggestions" role="listbox" aria-label="Ortsvorschläge">
                {suggestions.map((city, index) => (
                  <button
                    key={`${city.name}-${city.zip}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`suggestion ${index === activeIndex ? 'is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSuggestion(index)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <MapPin size={15} aria-hidden="true" />
                    <span className="suggestion__name">{city.name}</span>
                    <span className="suggestion__zip">{city.zip}</span>
                  </button>
                ))}
                {showEmpty && (
                  <div className="suggestions__empty">
                    Kein Ort gefunden. Tippe eine deutsche Stadt oder PLZ ein.
                  </div>
                )}
              </div>
            )}
          </div>

          {!place ? (
            <div className="quick-cities">
              <span className="quick-cities__label">Schnellwahl</span>
              {QUICK_CITIES.map((city) => (
                <button key={city} type="button" className="chip chip--ghost" onClick={() => chooseCity(city)}>
                  {city}
                </button>
              ))}
            </div>
          ) : (
            <div className="location-note">
              <span className="location-note__dot" aria-hidden="true" />
              Umkreissuche aktiv ab <strong>{place.label}</strong>
            </div>
          )}

          <div className={`radius-block ${place ? '' : 'is-disabled'}`}>
            <div className="radius-head">
              <label htmlFor="radius">Umkreis</label>
              <output htmlFor="radius" className="radius-value">
                {place ? (
                  <>
                    {radius} <small>km</small>
                  </>
                ) : (
                  <span className="radius-value__all">Ganz Deutschland</span>
                )}
              </output>
            </div>
            <input
              id="radius"
              type="range"
              min={10}
              max={300}
              step={5}
              value={radius}
              disabled={!place}
              onChange={(event) => onRadius(Number(event.target.value))}
              style={{ '--progress': `${((radius - 10) / 290) * 100}%` } as React.CSSProperties}
            />
            <div className="radius-scale" aria-hidden="true">
              <span>10 km</span>
              <span>300+ km</span>
            </div>
            {!place && <p className="field-hint">Ort wählen, um den Umkreis zu aktivieren.</p>}
          </div>
        </section>

        <section className="filter-block" aria-labelledby="date-label">
          <div className="filter-head">
            <h2 id="date-label">
              <CalendarDays size={14} aria-hidden="true" /> Wann?
            </h2>
            <span className="filter-current">{dateFilterLabel(dateFilter)}</span>
          </div>
          <div className="date-grid" role="group" aria-label="Zeitraum wählen">
            {DATE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`date-option ${dateFilter === option.id ? 'is-active' : ''}`}
                aria-pressed={dateFilter === option.id}
                onClick={() => onDateFilter(option.id)}
              >
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="filter-block" aria-labelledby="category-label">
          <div className="filter-head">
            <h2 id="category-label">Was?</h2>
            <button
              type="button"
              className="text-btn"
              onClick={toggleAllCategories}
            >
              {allCategories ? 'Alle abwählen' : 'Alle wählen'}
            </button>
          </div>
          <div className="category-grid">
            {CATEGORIES.map((category) => {
              const active = selectedCategories.includes(category.id)
              const count = categoryCounts[category.id] ?? 0
              return (
                <button
                  key={category.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  className={`category-tile ${active ? 'is-active' : ''}`}
                  style={
                    {
                      '--cat': category.color,
                      '--cat-tint': category.tint,
                    } as React.CSSProperties
                  }
                  onClick={() => onToggleCategory(category.id)}
                >
                  <span className="category-tile__icon">
                    <CategoryIcon category={category.id} size={16} />
                  </span>
                  <span className="category-tile__label">{CATEGORY_MAP[category.id].shortLabel}</span>
                  <span className="category-tile__count">{count}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <footer className="sidebar__footer">
        <div className="result-summary">
          <span className="result-summary__number">{totalCount}</span>
          <span className="result-summary__label">
            {totalCount === 1 ? 'Fest gefunden' : 'Feste gefunden'}
            {place ? <small>im Umkreis von {radius} km</small> : <small>in ganz Deutschland</small>}
          </span>
          <button
            type="button"
            className="icon-btn icon-btn--subtle"
            onClick={onReset}
            aria-label="Alle Filter zurücksetzen"
            title="Alle Filter zurücksetzen"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <button type="button" className="primary-btn sidebar__apply" onClick={onCloseMobile}>
          Karte ansehen
          <span>{totalCount}</span>
        </button>
        <div className="sidebar__fineprint">
          <span className="data-source">
            <span className="status-dot" aria-hidden="true" />
            {dataSource === 'supabase' ? 'Live aus Supabase' : 'Prototyp · Beispieldaten'}
          </span>
          {canInstall && (
            <>
              <span className="fineprint-sep" aria-hidden="true">·</span>
              <button type="button" className="install-link" onClick={onInstall}>
                <Download size={12} /> Als App installieren
              </button>
            </>
          )}
        </div>
      </footer>
    </aside>
  )
}

function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path
        d="M20 3.5 L23.2 16.8 L36.5 20 L23.2 23.2 L20 36.5 L16.8 23.2 L3.5 20 L16.8 16.8 Z"
        fill="currentColor"
      />
      <circle cx="20" cy="20" r="3.1" fill="var(--paper)" />
      <circle cx="20" cy="20" r="1.3" fill="var(--rust)" />
    </svg>
  )
}
