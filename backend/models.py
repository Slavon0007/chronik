"""Domain models shared by the crawler, extractor and storage layers."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any


class Category(StrEnum):
    MARKT = "markt"
    REENACTMENT = "reenactment"
    LARP = "larp"
    TURNIER = "turnier"
    COSPLAY = "cosplay"

    @classmethod
    def coerce(cls, value: str | None, fallback: "Category | None" = None) -> "Category":
        """Map model free text / source hints onto the fixed category set."""
        fallback = fallback or cls.MARKT
        if not value:
            return fallback
        normalized = value.strip().lower()
        aliases = {
            "markt": cls.MARKT,
            "märkte": cls.MARKT,
            "maerkte": cls.MARKT,
            "fest": cls.MARKT,
            "festival": cls.MARKT,
            "weihnachtsmarkt": cls.MARKT,
            "reenactment": cls.REENACTMENT,
            "re-enactment": cls.REENACTMENT,
            "geschichte": cls.REENACTMENT,
            "historisch": cls.REENACTMENT,
            "larp": cls.LARP,
            "live-rollenspiel": cls.LARP,
            "rollenspiel": cls.LARP,
            "con": cls.LARP,
            "turnier": cls.TURNIER,
            "ritterturnier": cls.TURNIER,
            "kampf": cls.TURNIER,
            "buhurt": cls.TURNIER,
            "schwertkampf": cls.TURNIER,
            "cosplay": cls.COSPLAY,
            "convention": cls.COSPLAY,
            "anime": cls.COSPLAY,
            "manga": cls.COSPLAY,
        }
        if normalized in aliases:
            return aliases[normalized]
        for key, category in aliases.items():
            if key in normalized:
                return category
        return fallback


@dataclass(slots=True)
class EventDraft:
    """Raw event before deduplication and publication."""

    title: str
    category: Category
    start_date: date
    end_date: date
    source_name: str
    source_url: str
    city: str = ""
    venue: str = ""
    address: str = ""
    zip: str = ""
    opening_hours: str = ""
    description: str = ""
    organizer: str = ""
    website: str = ""
    price: str = ""
    lat: float | None = None
    lng: float | None = None
    confidence: float = 0.5
    image_url: str = ""
    location_precision: str = "unknown"
    attendance_conditions: str = ""
    source_urls: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.source_urls and self.source_url:
            self.source_urls = [self.source_url]
        self.title = re.sub(r"\s+", " ", self.title or "").strip()
        self.city = self.city.strip()
        self.address = self.address.strip()
        self.description = re.sub(r"\s+", " ", self.description or "").strip()

    @property
    def is_valid(self) -> bool:
        return bool(
            self.title
            and len(self.title) >= 3
            and self.category
            and self.start_date
            and self.end_date
            and self.end_date >= self.start_date
        )

    @property
    def has_location(self) -> bool:
        return self.lat is not None and self.lng is not None

    def dedupe_key(self) -> str:
        """Stable key for Postgres upserts (title + start + coarse coordinates)."""
        from .dedupe import normalize_title

        location = (
            f"{self.lat:.3f},{self.lng:.3f}"
            if self.has_location
            else f"{self.city.lower().strip()}"
        )
        seed = f"{normalize_title(self.title)}|{self.start_date.isoformat()}|{location}"
        return hashlib.sha1(seed.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["category"] = self.category.value
        data["start_date"] = self.start_date.isoformat()
        data["end_date"] = self.end_date.isoformat()
        data["dedupe_key"] = self.dedupe_key()
        data["source_urls"] = list(dict.fromkeys(self.source_urls))
        return data

    def to_supabase(self, now: datetime | None = None) -> dict[str, Any]:
        timestamp = (now or datetime.now(timezone.utc)).isoformat()
        return {
            "dedupe_key": self.dedupe_key(),
            "title": self.title,
            "category": self.category.value,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "opening_hours": self.opening_hours,
            "venue": self.venue,
            "address": self.address,
            "zip": self.zip,
            "city": self.city,
            "country": "DE",
            "lat": self.lat,
            "lng": self.lng,
            "description": self.description,
            "organizer": self.organizer,
            "website": self.website,
            "price": self.price,
            "image_url": self.image_url,
            "location_precision": self.location_precision,
            "attendance_conditions": self.attendance_conditions,
            "source_url": self.source_url,
            "source_name": self.source_name,
            "source_urls": list(dict.fromkeys(self.source_urls)),
            "confidence": round(max(0.0, min(1.0, self.confidence)), 2),
            "status": "active",
            "last_seen_at": timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EventDraft":
        return cls(
            title=str(data.get("title", "")),
            category=Category.coerce(data.get("category")),
            start_date=_parse_date(data.get("start_date")),
            end_date=_parse_date(data.get("end_date")),
            source_name=str(data.get("source_name", "")),
            source_url=str(data.get("source_url", "")),
            city=str(data.get("city", "")),
            venue=str(data.get("venue", "")),
            address=str(data.get("address", "")),
            zip=str(data.get("zip", "")),
            opening_hours=str(data.get("opening_hours", "")),
            description=str(data.get("description", "")),
            organizer=str(data.get("organizer", "")),
            website=str(data.get("website", "")),
            price=str(data.get("price", "")),
            lat=float(data["lat"]) if data.get("lat") is not None else None,
            lng=float(data["lng"]) if data.get("lng") is not None else None,
            confidence=float(data.get("confidence", 0.5)),
            image_url=str(data.get("image_url", "")),
            location_precision=str(data.get("location_precision", "unknown")),
            attendance_conditions=str(data.get("attendance_conditions", "")),
            source_urls=list(data.get("source_urls") or []),
        )


def _parse_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValueError(f"Invalid date: {value!r}")


@dataclass(slots=True)
class PageContent:
    url: str
    title: str
    text: str
    paragraphs: list[str]
    links: list[tuple[str, str]]
