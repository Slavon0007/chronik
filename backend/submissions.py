"""Convert public GitHub event submissions into collector drafts."""

import json
import logging
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from .models import Category, EventDraft

LOGGER = logging.getLogger(__name__)
TITLE_PREFIX = "[Veranstaltung] "
CATEGORIES = {
    "Mittelaltermarkt": Category.MARKT,
    "Reenactment": Category.REENACTMENT,
    "LARP": Category.LARP,
    "Ritterturnier": Category.TURNIER,
    "Cosplay": Category.COSPLAY,
}


def parse_submission(issue: dict) -> EventDraft:
    title = issue["title"].removeprefix(TITLE_PREFIX).strip()
    if not 3 <= len(title) <= 150:
        raise ValueError("invalid event title")

    parts = re.split(r"^### ([^\r\n]+)\r?$", issue.get("body") or "", flags=re.MULTILINE)
    fields = {}
    for label, raw_value in zip(parts[1::2], parts[2::2]):
        if label in fields:
            raise ValueError("duplicate field")
        value = " ".join(raw_value.split())
        fields[label] = "" if value == "_No response_" else value

    start_text, end_text = fields["Erster Veranstaltungstag"], fields["Letzter Veranstaltungstag"]
    start, end = date.fromisoformat(start_text), date.fromisoformat(end_text)
    if start.isoformat() != start_text or end.isoformat() != end_text or end < start:
        raise ValueError("invalid event dates")

    city, address, zip_code = fields["Ort"], fields["Veranstaltungsadresse"], fields["Postleitzahl"]
    if not (city and address and re.fullmatch(r"\d{5}", zip_code)):
        raise ValueError("a German event address is required")
    if len(city) > 100 or len(address) > 200:
        raise ValueError("event address is too long")

    website = fields["Veranstaltungsseite"]
    link = urlsplit(website)
    if (len(website) > 500 or any(char.isspace() for char in website) or "\\" in website
            or link.scheme not in {"https", "http"} or not link.hostname
            or "." not in link.hostname or link.username is not None or link.password is not None):
        raise ValueError("invalid public event website")

    return EventDraft(
        title=title, category=CATEGORIES[fields["Kategorie"]],
        start_date=start, end_date=end,
        city=city, address=address, zip=zip_code, website=website,
        organizer=fields.get("Veranstalter", "")[:150],
        opening_hours=fields.get("Öffnungszeiten", "")[:200],
        price=fields.get("Eintrittspreis", "")[:150],
        attendance_conditions=fields.get("Besuchsbedingungen", "")[:500],
        description=fields.get("Kurzbeschreibung", "")[:500],
        source_name="Veranstaltermeldung", source_url=issue["html_url"],
    )


def read_submissions(path: Path) -> list[EventDraft]:
    """Read paginated GitHub API output, keeping only open event submissions."""
    events = []
    for page in json.loads(path.read_text(encoding="utf-8")):
        for issue in page:
            if ("pull_request" in issue or issue.get("state") != "open"
                    or not issue.get("title", "").startswith(TITLE_PREFIX)):
                continue
            try:
                events.append(parse_submission(issue))
            except (KeyError, ValueError):
                LOGGER.warning("Skipping invalid event submission #%s", issue.get("number"))
    return events
