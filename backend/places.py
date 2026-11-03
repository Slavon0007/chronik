"""German place lookup used by extraction and geocoding fallbacks."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CITIES_FILE = Path(__file__).resolve().parent / "data" / "cities.json"


@dataclass(frozen=True, slots=True)
class City:
    name: str
    zip: str
    lat: float
    lng: float


def fold(value: str) -> str:
    value = (
        value.lower()
        .replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


@lru_cache(maxsize=1)
def load_cities() -> tuple[City, ...]:
    payload = json.loads(CITIES_FILE.read_text(encoding="utf-8"))
    return tuple(City(**entry) for entry in payload)


@lru_cache(maxsize=1)
def _city_aliases() -> tuple[tuple[str, City], ...]:
    aliases: list[tuple[str, City]] = []
    seen: set[tuple[str, str]] = set()
    for city in load_cities():
        variants = {city.name}
        for separator in (" am ", " im ", " an der ", " (Saale)", " (Havel)"):
            if separator in city.name:
                variants.add(city.name.split(separator)[0])
        for variant in variants:
            key = (fold(variant), city.name)
            if key not in seen and len(variant) > 3:
                seen.add(key)
                aliases.append((fold(variant), city))
    aliases.sort(key=lambda item: len(item[0]), reverse=True)
    return tuple(aliases)


def find_city(text: str) -> City | None:
    folded = f" {fold(text)} "
    best: tuple[int, int, City] | None = None
    for alias, city in _city_aliases():
        position = folded.find(f" {alias} ")
        if position < 0:
            continue
        candidate = (position, -len(alias), city)
        if best is None or candidate[:2] < best[:2]:
            best = candidate
    return best[2] if best else None


def city_for_zip(zip_code: str) -> City | None:
    for city in load_cities():
        if city.zip == zip_code:
            return city
    return None


def city_by_name(name: str) -> City | None:
    target = fold(name).strip()
    for city in load_cities():
        if fold(city.name) == target:
            return city
    for alias, city in _city_aliases():
        if alias == target:
            return city
    return None


def nearest_city(lat: float, lng: float) -> City | None:
    best: City | None = None
    best_distance = math.inf
    for city in load_cities():
        distance = haversine_km(lat, lng, city.lat, city.lng)
        if distance < best_distance:
            best, best_distance = city, distance
    return best


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def extract_zip(text: str) -> str:
    match = re.search(r"\b(\d{5})\b", text)
    return match.group(1) if match else ""
