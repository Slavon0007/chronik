"""German date and opening-hours parsing used by the heuristic extractor."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

MONTHS = {
    "januar": 1,
    "jan": 1,
    "jänner": 1,
    "februar": 2,
    "feb": 2,
    "märz": 3,
    "maerz": 3,
    "mrz": 3,
    "april": 4,
    "apr": 4,
    "mai": 5,
    "juni": 6,
    "jun": 6,
    "juli": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "oktober": 10,
    "okt": 10,
    "november": 11,
    "nov": 11,
    "dezember": 12,
    "dez": 12,
}

MONTH_PATTERN = r"(?:Januar|Jänner|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Mrz|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez)\.?"

RANGE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # 07.–08. November 2026 / 7. bis 8. November 2026
    (
        re.compile(
            rf"(?P<d1>\d{{1,2}})\.?\s*(?:–|—|-|bis)\s*(?P<d2>\d{{1,2}})\.\s*(?P<month>{MONTH_PATTERN})\s*(?P<year>20\d{{2}})",
            re.IGNORECASE,
        ),
        "same_month",
    ),
    # 28. Mai – 1. Juni 2027
    (
        re.compile(
            rf"(?P<d1>\d{{1,2}})\.\s*(?P<m1>{MONTH_PATTERN})\s*(?:–|—|-|bis)\s*(?P<d2>\d{{1,2}})\.\s*(?P<m2>{MONTH_PATTERN})\s*(?P<year>20\d{{2}})",
            re.IGNORECASE,
        ),
        "two_months",
    ),
    # 24.11.2026 – 22.12.2026
    (
        re.compile(
            r"(?P<d1>\d{1,2})\.(?P<m1>\d{1,2})\.(?P<y1>20\d{2})\s*(?:–|—|-|bis)\s*(?P<d2>\d{1,2})\.(?P<m2>\d{1,2})\.(?P<y2>20\d{2})"
        ),
        "numeric_range",
    ),
    # 5. Dezember 2026 (single day)
    (
        re.compile(
            rf"(?P<d1>\d{{1,2}})\.\s*(?P<m1>{MONTH_PATTERN})\s*(?P<year>20\d{{2}})",
            re.IGNORECASE,
        ),
        "single",
    ),
    # 05.12.2026
    (
        re.compile(r"(?P<d1>\d{1,2})\.(?P<m1>\d{1,2})\.(?P<year>20\d{2})"),
        "numeric_single",
    ),
]


@dataclass(slots=True)
class DateRange:
    start: date
    end: date
    matched: str


def _month_number(value: str) -> int | None:
    return MONTHS.get(value.strip().rstrip(".").lower())


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def find_date_range(text: str) -> DateRange | None:
    """Return the first plausible German event date range in ``text``."""
    cleaned = (
        text.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00a0", " ")
        .replace("–", "-")
    )
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    for pattern, kind in RANGE_PATTERNS:
        for match in pattern.finditer(cleaned):
            groups = match.groupdict()
            if kind == "numeric_range":
                start = _safe_date(int(groups["y1"]), int(groups["m1"]), int(groups["d1"]))
                end = _safe_date(int(groups["y2"]), int(groups["m2"]), int(groups["d2"]))
            else:
                year = int(groups["year"])
                month = _month_number(groups.get("month") or groups.get("m1") or "")
                end_month = _month_number(groups.get("m2") or "") or month
                if kind == "numeric_single":
                    month = int(groups["m1"])
                    end_month = month
                if not month:
                    continue
                start = _safe_date(year, month, int(groups["d1"]))
                end = _safe_date(year, end_month, int(groups.get("d2") or groups["d1"]))
                if start and end and end < start and end_month < month:
                    end = _safe_date(year + 1, end_month, int(groups["d2"]))

            if start and end and end >= start:
                return DateRange(start=start, end=end, matched=match.group(0))
    return None


def parse_opening_hours(text: str) -> str:
    """Pick the most specific line that mentions opening times."""
    candidates: list[str] = []
    for raw_line in re.split(r"[\n•|]", text):
        line = re.sub(r"\s+", " ", raw_line).strip(" .;")
        if "Uhr" not in line:
            continue
        if len(line) > 120:
            continue
        candidates.append(line)

    if candidates:
        # Prefer a line with a weekday and a range.
        candidates.sort(
            key=lambda line: (
                0 if re.search(r"(?:Mo|Di|Mi|Do|Fr|Sa|So)", line) else 1,
                0 if re.search(r"\d\s*(?:-|–|bis)\s*\d", line) else 1,
                len(line),
            )
        )
        return candidates[0]

    compact = re.search(
        r"(?:\d{1,2}(?::\d{2})?\s*(?:-|–|bis)\s*\d{1,2}(?::\d{2})?\s*Uhr)",
        text,
        re.IGNORECASE,
    )
    return compact.group(0) if compact else ""


def parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None
