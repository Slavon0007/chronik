"""Event extraction: OpenAI normalisation with a deterministic fallback."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from datetime import date
from urllib.parse import urljoin, urlparse

from .config import Settings
from .dates import find_date_range, parse_iso_date, parse_opening_hours
from .models import Category, EventDraft, PageContent
from .places import city_for_zip, extract_zip, find_city
from .scraper import Source

LOGGER = logging.getLogger(__name__)

SYSTEM_PROMPT = """Du bist ein präziser Redakteur für einen deutschen Veranstaltungskalender.
Extrahiere ausschließlich Veranstaltungen, die im bereitgestellten Seitentext ausdrücklich
genannt sind. Erfinde keine Termine, Orte oder Preise. Antworte ausschließlich mit JSON
im Format {"events": [...]}. Jedes Event hat diese Felder:
title, category, start_date, end_date, opening_hours, venue, address, zip, city,
description, organizer, website, price, attendance_conditions.
attendance_conditions: nur explizite Besuchsbedingungen; sonst leer.

Regeln:
- category ist eine von: markt, reenactment, larp, turnier, cosplay.
- start_date und end_date sind ISO-Daten (YYYY-MM-DD). end_date ist inklusiv.
- Wenn nur ein Tag genannt ist, sind start_date und end_date identisch.
- description: 1–2 Sätze auf Deutsch, maximal 320 Zeichen, keine Werbefloskeln.
- address: Straße und Hausnummer, falls vorhanden; city und zip getrennt.
- website: absolute URL der Veranstaltung oder des Veranstalters, falls im Text.
- Fehlt ein Pflichtfeld (Titel oder Datum), lass die Veranstaltung weg.
- Mehrere Termine auf einer Seite werden als mehrere Events ausgegeben.
"""


def extract_events(
    page: PageContent,
    source: Source,
    settings: Settings,
    allow_ai: bool = True,
) -> list[EventDraft]:
    if page.structured_events:
        return page.structured_events
    if not allow_ai:
        return []
    if allow_ai and settings.has_ai:
        try:
            events = ai_extract(page, source, settings)
            if events:
                return events
            LOGGER.warning("AI returned no events for %s; using heuristic fallback", page.url)
        except Exception as error:  # noqa: BLE001 - fallback is intentional
            LOGGER.warning("AI extraction failed for %s (%s); using heuristic fallback", page.url, error)
    event = heuristic_extract(page, source)
    return [event] if event else []


def heuristic_extract(page: PageContent, source: Source) -> EventDraft | None:
    date_range = find_date_range(page.text)
    if date_range is None:
        return None

    title = _pick_title(page)
    if not title:
        return None

    street = _extract_street(page.text)
    zip_code = extract_zip(page.text)
    city_obj = find_city(page.text)
    if city_obj is None and zip_code:
        city_obj = city_for_zip(zip_code)
    city = city_obj.name if city_obj else ""

    venue = _extract_venue(page.paragraphs, street)
    address = ""
    if street and city:
        address = f"{street}, {zip_code + ' ' if zip_code else ''}{city}"
    elif street:
        address = street
    elif venue:
        if zip_code and zip_code in venue:
            address = venue
        elif city and city in venue:
            address = f"{venue}, {zip_code + ' ' if zip_code else ''}{city}"
        else:
            address = f"{venue}, {zip_code + ' ' if zip_code else ''}{city}".strip(" ,")
    elif city:
        address = f"{zip_code + ' ' if zip_code else ''}{city}"

    description = _pick_description(page.paragraphs, title, date_range.matched)
    website = _pick_website(page, source)
    price = _extract_price(page.text)
    opening_hours = parse_opening_hours(page.text)

    confidence = 0.48
    if address:
        confidence += 0.12
    if website:
        confidence += 0.08
    if description:
        confidence += 0.05
    if opening_hours:
        confidence += 0.03

    return EventDraft(
        title=title,
        category=source.category,
        start_date=date_range.start,
        end_date=date_range.end,
        source_name=source.name,
        source_url=page.url,
        city=city,
        venue=venue,
        address=address,
        zip=zip_code,
        opening_hours=opening_hours,
        description=description,
        organizer=source.name,
        website=website,
        price=price,
        attendance_conditions=" ".join(p for p in page.paragraphs if any(k in p.lower() for k in ("anmeldung", "mindestalter", "gewandung", "voranmeldung")))[:1000],
        confidence=min(confidence, 0.72),
    )


def ai_extract(page: PageContent, source: Source, settings: Settings) -> list[EventDraft]:
    drafts: list[EventDraft] = []
    for chunk in _chunks(page.text, 7000):
        payload = {
            "model": settings.openai_model,
            "temperature": 0.1,
            "max_tokens": 2200,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Quelle: {source.name} ({source.url})\n"
                        f"Kategorie-Hinweis: {source.category.value}\n"
                        f"Seitentitel: {page.title}\n\n"
                        f"Seitentext:\n{chunk}\n\n"
                        'Gib JSON zurück: {"events": [...]}.'
                    ),
                },
            ],
        }
        response = _post_json(
            f"{settings.openai_base_url}/chat/completions",
            payload,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            timeout=60,
        )
        content = response["choices"][0]["message"]["content"]
        data = _loads_json(content)
        for raw in data.get("events", []) if isinstance(data, dict) else []:
            draft = _draft_from_ai(raw, page.url, source)
            if draft is not None:
                drafts.append(draft)

    # Keep one record per title/date within a page.
    unique: dict[tuple[str, date], EventDraft] = {}
    for draft in drafts:
        unique.setdefault((draft.title.lower(), draft.start_date), draft)
    return list(unique.values())


def _draft_from_ai(raw: dict, page_url: str, source: Source) -> EventDraft | None:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title", "")).strip()
    start = parse_iso_date(str(raw.get("start_date", "")))
    if not title or start is None:
        return None

    end = parse_iso_date(str(raw.get("end_date", ""))) or start
    if end < start:
        end = start
    if end < date.today():
        return None

    category = Category.coerce(str(raw.get("category", "")), source.category)
    website = str(raw.get("website", "")).strip()
    if website:
        website = urljoin(page_url, website)
    else:
        website = source.url

    return EventDraft(
        title=title,
        category=category,
        start_date=start,
        end_date=end,
        source_name=source.name,
        source_url=page_url,
        city=str(raw.get("city", "")).strip(),
        venue=str(raw.get("venue", "")).strip(),
        address=str(raw.get("address", "")).strip(),
        zip=str(raw.get("zip", "")).strip(),
        opening_hours=str(raw.get("opening_hours", "")).strip(),
        description=str(raw.get("description", "")).strip()[:360],
        organizer=str(raw.get("organizer", "")).strip() or source.name,
        website=website,
        price=str(raw.get("price", "")).strip(),
        attendance_conditions=str(raw.get("attendance_conditions") or "").strip()[:1000],
        confidence=0.86,
        source_urls=[page_url],
    )


def _post_json(url: str, payload: dict, headers: dict, timeout: int = 60) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:600]
        raise RuntimeError(f"OpenAI HTTP {error.code}: {body}") from error


def _loads_json(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _chunks(text: str, size: int) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for paragraph in text.split("\n"):
        if length + len(paragraph) + 1 > size and current:
            chunks.append("\n".join(current))
            current = []
            length = 0
        current.append(paragraph)
        length += len(paragraph) + 1
        if len(chunks) >= 2:
            break
    if current and len(chunks) < 3:
        chunks.append("\n".join(current))
    return chunks[:3]


def _pick_title(page: PageContent) -> str:
    generic = {
        "veranstaltungen",
        "termine",
        "kalender",
        "startseite",
        "home",
        "events",
        "veranstaltungskalender",
        "mps termine 2027",
    }
    title = page.title.strip()
    if title and title.lower() not in generic and "termine" not in title.lower():
        return re.sub(r"\s+", " ", title)[:140]

    # Listing pages often have a generic H1; use the heading immediately before
    # the first date-bearing paragraph instead.
    for index, paragraph in enumerate(page.paragraphs):
        if find_date_range(paragraph) and index > 0:
            candidate = page.paragraphs[index - 1].strip()
            if 4 <= len(candidate) <= 120:
                return candidate[:140]

    keywords = ("markt", "fest", "turnier", "larp", "con", "spectaculum", "weihnacht", "ritter")
    for paragraph in page.paragraphs[:25]:
        if 8 <= len(paragraph) <= 120 and any(word in paragraph.lower() for word in keywords):
            return paragraph[:140]
    return title[:140] if title else ""


def _extract_street(text: str) -> str:
    pattern = re.compile(
        r"((?:Am|An der|Auf der|Im|In der)?\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]*"
        r"(?:straße|str\.|weg|platz|allee|gasse|ring|ufer|berg|hof|chaussee|damm|steig|wall|tor)"
        r"\s+\d+[a-zA-Z]?)",
        re.UNICODE,
    )
    match = pattern.search(text)
    if not match:
        return ""
    street = re.sub(r"\s+", " ", match.group(1)).strip(" ,.;")
    return street[:120]


def _extract_venue(paragraphs: list[str], street: str) -> str:
    markers = re.compile(
        r"\b(burg|schloss|kloster|dom|rathaus|marktplatz|halle|gelände|museum|park|"
        r"festung|veste|see|hof|scheune|gut)\b",
        re.IGNORECASE,
    )
    for paragraph in paragraphs:
        lowered = paragraph.lower()
        if len(paragraph) > 110 or "uhr" in lowered or "€" in paragraph:
            continue
        if street and street.lower() in lowered:
            continue
        if markers.search(paragraph):
            venue = re.sub(r",?\s*\d{5}\b.*$", "", paragraph).strip(" ,.;")
            return re.sub(r"\s+", " ", venue)[:100]
    return ""


def _pick_description(paragraphs: list[str], title: str, date_text: str) -> str:
    best = ""
    for paragraph in paragraphs:
        if paragraph == title or date_text[:12] in paragraph:
            continue
        lowered = paragraph.lower()
        if any(word in lowered for word in ("eintritt", "ticket", "cookie", "newsletter")):
            continue
        if len(paragraph) < 50:
            continue
        if len(paragraph) <= 360 and len(paragraph) > len(best):
            best = paragraph
    if not best:
        for paragraph in paragraphs:
            if len(paragraph) > 40 and paragraph != title:
                best = paragraph
                break
    return re.sub(r"\s+", " ", best)[:360].strip()


def _pick_website(page: PageContent, source: Source) -> str:
    source_host = urlparse(page.url).netloc
    social = ("facebook.", "instagram.", "twitter.", "youtube.", "tiktok.")
    for label, href in page.links:
        if any(host in href for host in social):
            continue
        if any(word in label.lower() for word in ("ticket", "website", "veranstalter", "mehr", "programm")):
            return urljoin(page.url, href)
    for label, href in page.links:
        host = urlparse(href).netloc
        if host and host != source_host and not any(marker in host for marker in social):
            return href
    return source.url


def _extract_price(text: str) -> str:
    match = re.search(
        r"((?:Eintritt|Eintrittspreis|Ticket|Tageskarte|Karte|Teilnahme)[^.\n]{0,90})",
        text,
        re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", match.group(1)).strip(" ,.;")[:120] if match else ""
