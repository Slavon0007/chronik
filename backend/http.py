"""Polite HTTP fetching with robots.txt, retries and an on-disk cache."""

from __future__ import annotations

import gzip
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import CACHE_DIR, Settings


class FetchError(RuntimeError):
    pass


@dataclass(slots=True)
class FetchResult:
    url: str
    status: int
    text: str
    content_type: str
    from_cache: bool = False


class Fetcher:
    def __init__(self, settings: Settings, cache_dir: Path | None = None, offline: bool = False):
        self.settings = settings
        self.cache_dir = cache_dir or CACHE_DIR / "pages"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.offline = offline
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._last_request: dict[str, float] = {}

    def fetch(self, url: str, use_cache: bool = True) -> FetchResult:
        cached = self._read_cache(url)
        if use_cache and cached:
            return cached
        if self.offline:
            stale = self._read_cache(url, respect_ttl=False)
            if stale:
                return stale
            raise FetchError(f"Offline mode: no cached copy for {url}")

        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise FetchError(f"Unsupported URL scheme: {url}")
        if not self._allowed_by_robots(url):
            raise FetchError(f"robots.txt disallows fetching {url}")

        # One request per second per host is a conservative default.
        host = parsed.netloc
        elapsed = time.monotonic() - self._last_request.get(host, 0.0)
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)

        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.settings.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
                "Accept-Encoding": "gzip",
            },
        )

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self.settings.request_timeout_seconds) as response:
                    raw = response.read(self.settings.max_bytes + 1)
                    if len(raw) > self.settings.max_bytes:
                        raise FetchError(f"Page exceeds {self.settings.max_bytes} bytes: {url}")
                    if response.headers.get("Content-Encoding", "").lower() == "gzip":
                        raw = gzip.decompress(raw)
                    content_type = response.headers.get("Content-Type", "text/html")
                    charset = response.headers.get_content_charset() or "utf-8"
                    try:
                        text = raw.decode(charset, errors="replace")
                    except LookupError:
                        text = raw.decode("utf-8", errors="replace")
                    self._last_request[host] = time.monotonic()
                    self._write_cache(url, response.status, text, content_type)
                    return FetchResult(url=url, status=response.status, text=text, content_type=content_type)
            except urllib.error.HTTPError as error:
                last_error = error
                if error.code in {429, 500, 502, 503, 504} and attempt < 2:
                    retry_after = error.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after and retry_after.isdigit() else 2.0 * (attempt + 1)
                    time.sleep(min(delay, 15.0))
                    continue
                raise FetchError(f"HTTP {error.code} for {url}") from error
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                break

        raise FetchError(f"Could not fetch {url}: {last_error}")

    def _allowed_by_robots(self, url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            robot_url = f"{origin}/robots.txt"
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robot_url)
            try:
                request = urllib.request.Request(
                    robot_url,
                    headers={"User-Agent": self.settings.user_agent},
                )
                with urllib.request.urlopen(request, timeout=10) as response:
                    body = response.read(200_000).decode("utf-8", errors="replace")
                parser.parse(body.splitlines())
            except Exception:
                # If robots.txt cannot be read, proceed conservatively only for
                # the public pages listed in sources.json.
                parser = None
            self._robots[origin] = parser
        parser = self._robots[origin]
        if parser is None:
            return True
        agent = self.settings.user_agent.split("/")[0].split(" ")[0]
        return parser.can_fetch(agent, url)

    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.html", self.cache_dir / f"{digest}.json"

    def _read_cache(self, url: str, respect_ttl: bool = True) -> FetchResult | None:
        html_path, meta_path = self._cache_paths(url)
        if not html_path.exists() or not meta_path.exists():
            return None
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if respect_ttl and meta.get("fetched_at"):
                fetched_at = datetime.fromisoformat(meta["fetched_at"])
                if fetched_at.tzinfo is None:
                    fetched_at = fetched_at.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - fetched_at > timedelta(
                    hours=self.settings.cache_ttl_hours
                ):
                    return None
            return FetchResult(
                url=url,
                status=int(meta.get("status", 200)),
                text=html_path.read_text(encoding="utf-8", errors="replace"),
                content_type=meta.get("content_type", "text/html"),
                from_cache=True,
            )
        except Exception:
            return None

    def _write_cache(self, url: str, status: int, text: str, content_type: str) -> None:
        html_path, meta_path = self._cache_paths(url)
        html_path.write_text(text, encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "url": url,
                    "status": status,
                    "content_type": content_type,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
