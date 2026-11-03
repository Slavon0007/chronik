"""Nominatim geocoding with rate limiting, caching and a city fallback."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import CACHE_DIR, Settings
from .models import EventDraft
from .places import city_by_name, find_city

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class GeocodeResult:
    lat: float
    lng: float
    label: str
    source: str  # "nominatim" | "city"


class Geocoder:
    def __init__(self, settings: Settings, cache_path: Path | None = None, offline: bool = False):
        self.settings = settings
        self.offline = offline
        self.cache_path = cache_path or CACHE_DIR / "geocode.json"
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._cache = self._load_cache()
        self._last_request = 0.0

    def geocode(self, query: str, city: str = "") -> GeocodeResult | None:
        query = " ".join(query.split()).strip(" ,")
        city_key = city.strip().lower()
        cache_key = query.lower() if query else city_key
        if not cache_key:
            return None

        cached = self._cache.get(cache_key)
        if cached and (self.offline or cached.get("source") != "city"):
            return GeocodeResult(
                lat=float(cached["lat"]),
                lng=float(cached["lng"]),
                label=cached.get("label", query),
                source=cached.get("source", "cache"),
            )

        if not self.offline and self.settings.use_geocoder and query:
            result = self._nominatim(query)
            if result:
                self._store(cache_key, result)
                return result

        fallback = city_by_name(city) if city else None
        if fallback is None and city:
            fallback = find_city(city)
        if fallback:
            result = GeocodeResult(
                lat=fallback.lat,
                lng=fallback.lng,
                label=f"{fallback.name} (Stadtzentrum)",
                source="city",
            )
            self._store(cache_key, result)
            return result
        return None

    def _nominatim(self, query: str) -> GeocodeResult | None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.settings.geocode_delay_seconds:
            time.sleep(self.settings.geocode_delay_seconds - elapsed)

        params = {
            "q": f"{query}, Deutschland" if "deutschland" not in query.lower() else query,
            "format": "jsonv2",
            "limit": "1",
            "countrycodes": "de",
            "addressdetails": "1",
            "email": self.settings.contact_email,
        }
        url = f"{self.settings.nominatim_url}/search?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.settings.user_agent,
                "Accept": "application/json",
                "Accept-Language": "de-DE,de;q=0.9",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.settings.request_timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
            self._last_request = time.monotonic()
            if not payload:
                return None
            top = payload[0]
            lat = float(top["lat"])
            lng = float(top["lon"])
            if not (47.0 <= lat <= 55.5 and 5.5 <= lng <= 15.5):
                return None
            return GeocodeResult(lat=lat, lng=lng, label=top.get("display_name", query), source="nominatim")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError) as error:
            LOGGER.warning("Nominatim failed for %r: %s", query, error)
            self._last_request = time.monotonic()
            return None

    def _load_cache(self) -> dict:
        if not self.cache_path.exists():
            return {}
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}

    def _store(self, key: str, result: GeocodeResult) -> None:
        self._cache[key] = {
            "lat": result.lat,
            "lng": result.lng,
            "label": result.label,
            "source": result.source,
        }
        tmp = self.cache_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._cache, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.cache_path)


def geocode_events(
    events: list[EventDraft],
    settings: Settings,
    offline: bool = False,
) -> tuple[list[EventDraft], int]:
    """Fill missing coordinates in place. Returns (events, geocoded count)."""
    geocoder = Geocoder(settings, offline=offline)
    geocoded = 0
    for event in events:
        if event.has_location:
            continue
        query = ", ".join(dict.fromkeys(part for part in (event.address, event.venue, event.zip, event.city) if part))
        if not query and event.city:
            query = event.city
        result = geocoder.geocode(query, city=event.city)
        if result is None:
            LOGGER.warning("No coordinates for %s (%s)", event.title, event.city or "unknown city")
            continue
        event.lat = round(result.lat, 6)
        event.lng = round(result.lng, 6)
        event.location_precision = "city" if result.source == "city" else "venue"
        if not event.city:
            event.city = result.label.split(",")[0]
        geocoded += 1
    return events, geocoded
