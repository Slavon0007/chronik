"""Deduplication and merge rules for collected events."""

from __future__ import annotations

import math
import re
from dataclasses import replace
from datetime import timedelta
from difflib import SequenceMatcher

from .models import EventDraft

STOPWORDS = {
    "der",
    "die",
    "das",
    "ein",
    "eine",
    "einer",
    "und",
    "auf",
    "im",
    "in",
    "am",
    "an",
    "zu",
    "zum",
    "zur",
    "mit",
    "von",
    "vom",
    "für",
    "fuer",
    "bei",
    "das",
    "event",
    "veranstaltung",
}


def normalize_title(title: str) -> str:
    value = title.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    value = re.sub(r"\b(?:19|20)\d{2}\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    tokens = [token for token in value.split() if token and token not in STOPWORDS]
    return " ".join(tokens)


def title_similarity(a: str, b: str) -> float:
    left = normalize_title(a)
    right = normalize_title(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    sequence = SequenceMatcher(None, left, right).ratio()
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    jaccard = (
        len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        if left_tokens | right_tokens
        else 0.0
    )
    containment = (
        min(len(left_tokens & right_tokens) / len(left_tokens), 1.0)
        if len(left_tokens) <= len(right_tokens)
        else min(len(left_tokens & right_tokens) / len(right_tokens), 1.0)
    )
    return max(sequence, jaccard, containment * 0.92)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def dates_overlap(a: EventDraft, b: EventDraft, tolerance_days: int = 1) -> bool:
    tolerance = timedelta(days=tolerance_days)
    return a.start_date <= (b.end_date + tolerance) and b.start_date <= (a.end_date + tolerance)


def is_duplicate(a: EventDraft, b: EventDraft) -> tuple[bool, str]:
    """Return (duplicate?, reason) using spatial, temporal and title signals."""
    similarity = title_similarity(a.title, b.title)
    same_dates = dates_overlap(a, b)
    if not same_dates:
        return False, "dates do not overlap"

    # The same page can describe several events (e.g. a tour calendar), so the
    # source URL alone is not enough to merge records.
    if (a.source_url and a.source_url == b.source_url and similarity >= 0.8
            and a.city and a.city.casefold() == b.city.casefold()
            and a.has_location and b.has_location
            and haversine_km(a.lat, a.lng, b.lat, b.lng) <= 0.8):
        return True, "same source page and similar title"

    distance: float | None = None
    if a.has_location and b.has_location:
        distance = haversine_km(a.lat, a.lng, b.lat, b.lng)

    same_city = bool(a.city and b.city and a.city.lower().strip() == b.city.lower().strip())
    same_venue = bool(
        a.venue
        and b.venue
        and normalize_title(a.venue) == normalize_title(b.venue)
        and normalize_title(a.venue)
    )

    if distance is not None and distance > 25.0:
        return False, f"different places ({distance:.0f} km apart)"
    if distance is None and a.city and b.city and not same_city:
        return False, "different cities"

    if distance is not None:
        if distance <= 0.8 and similarity >= 0.52:
            return True, f"same place ({distance:.2f} km), title {similarity:.2f}"
        if distance <= 0.25 and same_dates and similarity >= 0.8:
            return True, "same coordinates and dates"
        if distance <= 3.0 and same_venue and similarity >= 0.45:
            return True, "same venue, similar title"
    elif same_city and same_venue and similarity >= 0.55:
        return True, "same city and venue"
    elif same_city and similarity >= 0.82:
        return True, "same city and very similar title"

    if similarity >= 0.95 and a.start_date == b.start_date:
        return True, "near-identical title and start date"
    return False, "distinct"


def merge_events(base: EventDraft, other: EventDraft) -> EventDraft:
    """Merge two duplicates, keeping the richest editorial fields."""
    description = max((base.description, other.description), key=len)
    title = max((base.title, other.title), key=len)
    website = base.website or other.website
    organizer = base.organizer or other.organizer
    price = base.price or other.price
    opening_hours = base.opening_hours or other.opening_hours
    venue = base.venue if len(base.venue) >= len(other.venue) else other.venue
    address = base.address if len(base.address) >= len(other.address) else other.address
    city = base.city or other.city
    zip_code = base.zip or other.zip
    lat = base.lat if base.lat is not None else other.lat
    lng = base.lng if base.lng is not None else other.lng
    source_urls = list(dict.fromkeys([*base.source_urls, *other.source_urls]))
    source_url = base.source_url or other.source_url

    return replace(
        base,
        title=title,
        start_date=min(base.start_date, other.start_date),
        end_date=max(base.end_date, other.end_date),
        description=description,
        website=website,
        organizer=organizer,
        price=price,
        opening_hours=opening_hours,
        venue=venue,
        address=address,
        city=city,
        zip=zip_code,
        lat=lat,
        lng=lng,
        attendance_conditions=base.attendance_conditions or other.attendance_conditions,
        confidence=max(base.confidence, other.confidence),
        source_urls=source_urls,
        source_url=source_url,
    )


def deduplicate(events: list[EventDraft]) -> tuple[list[EventDraft], int]:
    """Greedy fuzzy dedupe. Returns (unique events, merged count)."""
    unique: list[EventDraft] = []
    merged = 0
    for event in events:
        if not event.is_valid:
            continue
        match_index = None
        for index, candidate in enumerate(unique):
            duplicate, _reason = is_duplicate(candidate, event)
            if duplicate:
                match_index = index
                break
        if match_index is None:
            unique.append(event)
        else:
            unique[match_index] = merge_events(unique[match_index], event)
            merged += 1
    return unique, merged
