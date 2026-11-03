"""Source catalogue loading and HTML text extraction."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import html as lxml_html

from .config import BACKEND_ROOT, DEFAULT_SOURCES, Settings
from .http import Fetcher
from .models import Category, PageContent

SKIP_PHRASES = (
    "cookie",
    "datenschutz",
    "newsletter",
    "alle rechte vorbehalten",
    "impressum",
    "folge uns",
    "zustimmung",
    "akzeptieren",
)


@dataclass(slots=True)
class Source:
    slug: str
    name: str
    url: str
    category: Category
    max_pages: int = 1
    enabled: bool = True
    fixture: str = ""
    notes: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "Source":
        return cls(
            slug=str(data["slug"]),
            name=str(data["name"]),
            url=str(data["url"]),
            category=Category.coerce(data.get("category")),
            max_pages=int(data.get("max_pages", 1)),
            enabled=bool(data.get("enabled", True)),
            fixture=str(data.get("fixture", "")),
            notes=str(data.get("notes", "")),
        )


def load_sources(path: Path | None = None) -> list[Source]:
    source_path = path or DEFAULT_SOURCES
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    entries = payload["sources"] if isinstance(payload, dict) else payload
    return [Source.from_dict(entry) for entry in entries]


def load_fixture(source: Source, fixture_dir: Path) -> str:
    name = source.fixture or f"{source.slug}.html"
    path = fixture_dir / name
    if not path.exists():
        raise FileNotFoundError(f"Fixture not found for {source.slug}: {path}")
    return path.read_text(encoding="utf-8", errors="replace")


def fetch_page(source: Source, fetcher: Fetcher, fixture_dir: Path | None = None) -> PageContent:
    if fixture_dir is not None:
        raw = load_fixture(source, fixture_dir)
    else:
        raw = fetcher.fetch(source.url).text
    return parse_page(raw, source.url)


def parse_page(raw_html: str, url: str) -> PageContent:
    document = lxml_html.fromstring(raw_html)
    document.make_links_absolute(url, resolve_base_href=True)

    for node in document.xpath("//script|//style|//noscript|//svg|//form|//nav|//footer|//header"):
        node.drop_tree()

    title = _clean_text(document.xpath("string(//h1[1])")) or _clean_text(
        document.xpath("string(//title[1])")
    )
    title = re.split(r"\s+[|–—]\s+", title)[0].strip()

    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in document.xpath("//p|//li|//h2|//h3|//h4|//address|//td"):
        text = _clean_text(" ".join(node.itertext()))
        if len(text) < 8 or len(text) > 1200:
            continue
        lowered = text.lower()
        if any(phrase in lowered for phrase in SKIP_PHRASES):
            continue
        fingerprint = lowered[:160]
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        paragraphs.append(text)

    if len(paragraphs) < 3:
        body_text = _clean_text(" ".join(document.xpath("//body//text()")))
        paragraphs = [part for part in re.split(r"\s{2,}|\n", body_text) if len(part) > 12][:120]

    links: list[tuple[str, str]] = []
    for anchor in document.xpath("//a[@href]"):
        label = _clean_text(" ".join(anchor.itertext()))
        href = anchor.get("href") or ""
        if not href.startswith(("http://", "https://")):
            continue
        if not label:
            continue
        links.append((label, href))
        if len(links) >= 80:
            break

    return PageContent(
        url=url,
        title=title,
        text="\n".join(paragraphs),
        paragraphs=paragraphs,
        links=links,
    )


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def source_config_path() -> Path:
    return DEFAULT_SOURCES


def fixtures_path() -> Path:
    return BACKEND_ROOT / "fixtures"


__all__ = [
    "Source",
    "fetch_page",
    "fixtures_path",
    "load_fixture",
    "load_sources",
    "parse_page",
    "source_config_path",
    "Settings",
]
