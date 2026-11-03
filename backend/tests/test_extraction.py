from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path

from backend.config import Settings
from backend.extractor import heuristic_extract
from backend.geocoder import geocode_events
from backend.scraper import load_sources, parse_page

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


class ExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = {source.slug: source for source in load_sources()}
        raw = (FIXTURES / "ronneburg.html").read_text(encoding="utf-8")
        cls.page = parse_page(raw, cls.sources["burg-ronneburg"].url)

    def test_page_parse(self) -> None:
        self.assertEqual(self.page.title, "Ronneburger Burgweihnacht")
        self.assertTrue(any("Glühwein" in paragraph for paragraph in self.page.paragraphs))

    def test_heuristic_event(self) -> None:
        event = heuristic_extract(self.page, self.sources["burg-ronneburg"])
        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.title, "Ronneburger Burgweihnacht")
        self.assertEqual(event.start_date, date(2026, 12, 5))
        self.assertEqual(event.end_date, date(2026, 12, 6))
        self.assertEqual(event.city, "Ronneburg")
        self.assertEqual(event.zip, "63549")
        self.assertEqual(event.venue, "Burg Ronneburg")
        self.assertIn("Burgstraße 1", event.address)
        self.assertIn("9 €", event.price)
        self.assertEqual(event.website, "https://www.burg-ronneburg.de")

    def test_city_fallback_geocoding(self) -> None:
        event = heuristic_extract(self.page, self.sources["burg-ronneburg"])
        assert event is not None
        events, count = geocode_events([event], Settings(), offline=True)
        self.assertEqual(count, 1)
        self.assertIsNotNone(events[0].lat)
        self.assertIsNotNone(events[0].lng)
        self.assertAlmostEqual(events[0].lat, 50.2177, places=2)

    def test_multiple_sources_catalogue(self) -> None:
        self.assertGreaterEqual(len(self.sources), 10)
        self.assertIn("drachenfest", self.sources)
        self.assertEqual(self.sources["drachenfest"].category.value, "larp")


if __name__ == "__main__":
    unittest.main()
