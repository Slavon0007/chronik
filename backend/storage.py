"""Publishing to Supabase and local JSON export."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Settings
from .models import EventDraft

LOGGER = logging.getLogger(__name__)


def write_events_json(
    events: list[EventDraft],
    path: Path,
    summary: dict[str, Any] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(events),
        "summary": summary or {},
        "events": [event.to_dict() for event in events],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    LOGGER.info("Wrote %d events to %s", len(events), path)


class SupabaseStore:
    def __init__(self, settings: Settings):
        if not settings.has_supabase:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for publishing."
            )
        self.url = settings.supabase_url
        self.key = settings.supabase_service_key

    def upsert(self, events: list[EventDraft]) -> int:
        if not events:
            return 0
        published = 0
        for start in range(0, len(events), 40):
            chunk = events[start : start + 40]
            payload = [event.to_supabase() for event in chunk]
            self._request(
                "POST",
                "/rest/v1/events?on_conflict=dedupe_key",
                payload,
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
            published += len(chunk)
            LOGGER.info("Upserted %d/%d events", published, len(events))
        return published

    def archive_past(self) -> int:
        try:
            result = self._request("POST", "/rest/v1/rpc/archive_past_events", {})
            return int(result) if isinstance(result, (int, float, str)) else 0
        except RuntimeError as error:
            LOGGER.warning("Could not archive past events: %s", error)
            return 0

    def log_run(self, payload: dict[str, Any]) -> None:
        try:
            self._request("POST", "/rest/v1/crawl_runs", payload, extra_headers={"Prefer": "return=minimal"})
        except RuntimeError as error:
            LOGGER.warning("Could not write crawl run: %s", error)

    def _request(
        self,
        method: str,
        path: str,
        payload: Any,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        headers.update(extra_headers or {})
        request = urllib.request.Request(
            f"{self.url}{path}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body.strip() else None
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")[:800]
            raise RuntimeError(f"Supabase HTTP {error.code}: {body}") from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Supabase request failed: {error}") from error
