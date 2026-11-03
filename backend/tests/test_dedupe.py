from __future__ import annotations

import unittest
from datetime import date

from backend.dedupe import deduplicate, haversine_km, is_duplicate, merge_events, normalize_title
from backend.models import Category, EventDraft


def make_event(**overrides) -> EventDraft:
    values = {
        "title": "Ronneburger Burgweihnacht",
        "category": Category.MARKT,
        "start_date": date(2026, 12, 5),
        "end_date": date(2026, 12, 6),
        "source_name": "Burg Ronneburg",
        "source_url": "https://example.org/ronneburg",
        "city": "Ronneburg",
        "venue": "Burg Ronneburg",
        "lat": 50.2177,
        "lng": 9.0556,
    }
    values.update(overrides)
    return EventDraft(**values)


class DedupeTests(unittest.TestCase):
    def test_distinct_events_at_same_venue(self):
        self.assertFalse(is_duplicate(make_event(title="Weihnachtsmarkt"), make_event(title="Schwertkampf Lehrgang"))[0])

    def test_same_title_on_tour_in_different_cities(self):
        self.assertFalse(is_duplicate(make_event(), make_event(city="Hamburg", lat=53.55, lng=9.99))[0])

    def test_normalize_title(self) -> None:
        self.assertEqual(normalize_title("MPS Köln 2027 – Mittelalter!"), "mps koeln mittelalter")

    def test_haversine(self) -> None:
        self.assertAlmostEqual(haversine_km(50.0, 8.0, 51.0, 8.0), 111.19, delta=0.5)

    def test_duplicate_same_place_and_title(self) -> None:
        a = make_event()
        b = make_event(source_url="https://example.org/other", title="Ronneburger Burgweihnacht 2026")
        duplicate, reason = is_duplicate(a, b)
        self.assertTrue(duplicate, reason)

    def test_not_duplicate_when_far_away(self) -> None:
        a = make_event()
        b = make_event(city="Hamburg", lat=53.55, lng=9.99, source_url="https://example.org/hamburg")
        duplicate, _reason = is_duplicate(a, b)
        self.assertFalse(duplicate)

    def test_not_duplicate_when_dates_differ(self) -> None:
        a = make_event()
        b = make_event(
            start_date=date(2027, 5, 29),
            end_date=date(2027, 5, 30),
            source_url="https://example.org/other-date",
        )
        duplicate, _reason = is_duplicate(a, b)
        self.assertFalse(duplicate)

    def test_merge_keeps_richer_fields(self) -> None:
        a = make_event(description="Kurz.", website="")
        b = make_event(
            description="Deutlich ausführlichere Beschreibung des Marktes.",
            website="https://example.org/tickets",
            source_url="https://example.org/second",
        )
        merged = merge_events(a, b)
        self.assertEqual(merged.description, b.description)
        self.assertEqual(merged.website, b.website)
        self.assertEqual(len(merged.source_urls), 2)

    def test_same_page_can_contain_two_events(self) -> None:
        a = make_event(title="MPS Köln", source_url="https://example.org/termine")
        b = make_event(
            title="MPS Hamburg",
            city="Hamburg",
            lat=53.55,
            lng=9.99,
            source_url="https://example.org/termine",
        )
        duplicate, _reason = is_duplicate(a, b)
        self.assertFalse(duplicate)

    def test_deduplicate_merges_list(self) -> None:
        events = [
            make_event(),
            make_event(source_url="https://example.org/other"),
            make_event(
                title="Ritterspiele Burg Satzvey",
                start_date=date(2027, 5, 29),
                end_date=date(2027, 5, 30),
                lat=50.6147,
                lng=6.6744,
                city="Mechernich",
                venue="Burg Satzvey",
                source_url="https://example.org/satzvey",
            ),
        ]
        unique, merged = deduplicate(events)
        self.assertEqual(len(unique), 2)
        self.assertEqual(merged, 1)


if __name__ == "__main__":
    unittest.main()
