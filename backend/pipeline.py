"""Chronik collection pipeline.

Usage:
    python -m backend.pipeline --offline --fixture-dir backend/fixtures \
        --sources burg-ronneburg,burg-satzvey --out backend/data/events.json

    python -m backend.pipeline --publish
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from .config import BACKEND_ROOT, DEFAULT_OUTPUT, Settings
from .dedupe import deduplicate
from .dates import parse_iso_date
from .extractor import extract_events
from .geocoder import geocode_events
from .http import Fetcher
from .models import EventDraft
from .scraper import Source, fetch_pages, load_sources
from .storage import SupabaseStore, write_events_json

LOGGER = logging.getLogger("chronik.pipeline")


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect and publish Chronik events.")
    parser.add_argument("--sources", help="Comma separated source slugs (default: all enabled).")
    parser.add_argument("--limit", type=int, help="Process at most N sources.")
    parser.add_argument(
        "--fixture-dir",
        type=Path,
        help="Read local HTML fixtures instead of live pages (used for demos/tests).",
    )
    parser.add_argument("--offline", action="store_true", help="Disable all network access.")
    parser.add_argument("--no-ai", action="store_true", help="Skip OpenAI and use the heuristic extractor.")
    parser.add_argument("--no-geocode", action="store_true", help="Do not call Nominatim (city fallback only).")
    parser.add_argument("--publish", action="store_true", help="Upsert results into Supabase.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT, help="Local JSON output path.")
    parser.add_argument("--today", help="Override today's date (YYYY-MM-DD) for tests/demos.")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def select_sources(all_sources: list[Source], args: argparse.Namespace) -> list[Source]:
    sources = [source for source in all_sources if source.enabled]
    if args.sources:
        selected = {slug.strip() for slug in args.sources.split(",") if slug.strip()}
        sources = [source for source in sources if source.slug in selected]
    if args.limit:
        sources = sources[: args.limit]
    return sources


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    setup_logging(args.verbose)

    settings = Settings.from_env()
    if args.no_ai:
        settings.use_ai = False
    if args.no_geocode:
        settings.use_geocoder = False

    today = parse_iso_date(args.today) if args.today else date.today()
    if today is None:
        LOGGER.error("Invalid --today value: %s", args.today)
        return 2

    fixture_dir = args.fixture_dir
    if args.offline and fixture_dir is None and (BACKEND_ROOT / "fixtures").exists():
        fixture_dir = BACKEND_ROOT / "fixtures"

    try:
        sources = load_sources()
    except (OSError, json.JSONDecodeError, KeyError) as error:
        LOGGER.error("Could not load backend/sources.json: %s", error)
        return 2

    selected = select_sources(sources, args)
    if not selected:
        LOGGER.error("No sources selected.")
        return 2

    started_at = datetime.now(timezone.utc)
    fetcher = Fetcher(settings, offline=args.offline)
    drafts: list[EventDraft] = []
    errors: list[str] = []
    pages_fetched = 0

    LOGGER.info(
        "Starting collection: %d sources, mode=%s, ai=%s, geocoder=%s",
        len(selected),
        "fixtures" if fixture_dir else "live",
        settings.use_ai and settings.has_ai,
        settings.use_geocoder,
    )

    for source in selected:
        try:
            for page in fetch_pages(source, fetcher, fixture_dir):
                pages_fetched += 1
                extracted = extract_events(page, source, settings, allow_ai=settings.use_ai)
                drafts.extend(extracted)
                LOGGER.info("%s: %d events from %s", source.slug, len(extracted), page.url)
        except Exception as error:  # noqa: BLE001 - one broken source must not stop the run
            message = f"{source.slug}: {error}"
            errors.append(message)
            LOGGER.warning("Source failed: %s", message)

    drafts = [event for event in drafts if event.is_valid]
    drafts = [event for event in drafts if event.end_date >= today]

    events, geocoded = geocode_events(
        drafts,
        settings,
        offline=args.offline or not settings.use_geocoder,
    )

    without_location = [event for event in events if not event.has_location]
    if without_location:
        LOGGER.warning("%d events dropped without coordinates", len(without_location))
    events = [event for event in events if event.has_location]

    unique, duplicates = deduplicate(events)
    unique.sort(key=lambda event: (event.start_date, event.title))

    finished_at = datetime.now(timezone.utc)
    summary = {
        "sources": len(selected),
        "pages_fetched": pages_fetched,
        "drafts": len(drafts),
        "geocoded": geocoded,
        "duplicates_merged": duplicates,
        "without_location": len(without_location),
        "published": 0,
        "archived": 0,
        "errors": errors,
    }

    LOGGER.info(
        "Collected %d drafts -> %d unique events (%d duplicates merged, %d without location)",
        len(drafts),
        len(unique),
        duplicates,
        len(without_location),
    )

    write_events_json(unique, args.out, summary)

    if args.publish:
        if not settings.has_supabase:
            LOGGER.error("Publishing requested but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.")
            return 2
        try:
            store = SupabaseStore(settings)
            published = store.upsert(unique)
            archived = store.archive_past()
            summary["published"] = published
            summary["archived"] = archived
            store.log_run(
                {
                    "started_at": started_at.isoformat(),
                    "finished_at": finished_at.isoformat(),
                    "sources_total": len(selected),
                    "pages_fetched": pages_fetched,
                    "events_found": len(drafts),
                    "events_published": published,
                    "duplicates_merged": duplicates,
                    "status": "ok" if not errors else "partial",
                    "error": "; ".join(errors)[:900],
                }
            )
            LOGGER.info("Published %d events; archived %d past events.", published, archived)
        except Exception as error:  # noqa: BLE001 - report a clear failure
            LOGGER.error("Publishing failed: %s", error)
            return 1

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if pages_fetched == 0:
        LOGGER.error("No pages could be fetched.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
