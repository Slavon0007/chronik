"""Shared configuration and environment handling for the Chronik collector."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = PROJECT_ROOT / "backend"
CACHE_DIR = PROJECT_ROOT / ".cache"
DATA_DIR = BACKEND_ROOT / "data"
DEFAULT_SOURCES = BACKEND_ROOT / "sources.json"
DEFAULT_OUTPUT = DATA_DIR / "events.json"


def load_dotenv(path: Path | None = None) -> None:
    """Minimal .env reader (no python-dotenv dependency)."""
    env_path = path or PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class Settings:
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    supabase_url: str = ""
    supabase_service_key: str = ""
    contact_email: str = "hello@chronik.events"
    user_agent: str = ""
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    geocode_delay_seconds: float = 1.1
    request_timeout_seconds: float = 20.0
    max_bytes: int = 2_500_000
    max_pages_per_source: int = 2
    cache_ttl_hours: float = 12.0
    use_ai: bool = True
    use_geocoder: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        contact = os.environ.get("CONTACT_EMAIL", "hello@chronik.events")
        user_agent = os.environ.get(
            "CRAWLER_USER_AGENT",
            f"ChronikBot/1.0 (+https://chronik.events/bot; mailto:{contact})",
        )
        return cls(
            openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
            openai_model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            openai_base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            supabase_url=os.environ.get("SUPABASE_URL", "").rstrip("/"),
            supabase_service_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
            contact_email=contact,
            user_agent=user_agent,
            nominatim_url=os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/"),
            geocode_delay_seconds=float(os.environ.get("GEOCODE_DELAY_SECONDS", "1.1")),
            request_timeout_seconds=float(os.environ.get("REQUEST_TIMEOUT_SECONDS", "20")),
            max_bytes=int(os.environ.get("MAX_PAGE_BYTES", "2500000")),
            max_pages_per_source=int(os.environ.get("MAX_PAGES_PER_SOURCE", "2")),
            cache_ttl_hours=float(os.environ.get("CACHE_TTL_HOURS", "12")),
            use_ai=env_bool("CHRONIK_USE_AI", True),
            use_geocoder=env_bool("CHRONIK_USE_GEOCODER", True),
        )

    @property
    def has_ai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)
