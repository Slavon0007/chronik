from datetime import date
import unittest

from backend.corrections import apply_event_corrections, WIKINGERSOMMER_SOURCE
from backend.dedupe import deduplicate
from backend.models import Category, EventDraft


class CorrectionTests(unittest.TestCase):
    def make_event(self, **values):
        fields = dict(
            title="Wikingersommer", category=Category.MARKT,
            start_date=date(2027, 6, 19), end_date=date(2027, 6, 20),
            source_name="Marktkalendarium",
            source_url="https://marktkalendarium.de/maerkte2027.php",
            city="Witzwort", zip="25889", venue="beim roten Haubarg",
            lat=54.4, lng=8.9833, location_precision="city",
        )
        fields.update(values)
        return EventDraft(**fields)

    def test_stale_and_current_sources_merge_at_corrected_location(self):
        old = self.make_event()
        current = self.make_event(
            title="Wikingersommer - Das Fest 2027", city="Uelvesbüll",
            source_name="Mittelalterkalender",
            source_url="https://www.mittelalterkalender.info/mittelaltertermine/uelvesbuell-0jb4mah7.php",
        )
        apply_event_corrections([old, current])
        events, duplicates = deduplicate([old, current])
        self.assertEqual((len(events), duplicates), (1, 1))
        event = events[0]
        self.assertEqual(event.city, "Uelvesbüll")
        self.assertEqual(event.venue, "Festwiese Uelvesbüll")
        self.assertIn("Kirchspielweg", event.address)
        self.assertEqual((event.lat, event.lng), (54.415142, 8.923433))
        self.assertEqual(event.location_precision, "street")
        self.assertEqual(event.website, WIKINGERSOMMER_SOURCE)
        self.assertIn("https://marktkalendarium.de/maerkte2027.php", event.source_urls)
        self.assertIn(current.source_urls[0], event.source_urls)
        snapshot = event.to_dict()
        apply_event_corrections(events)
        self.assertEqual(event.to_dict(), snapshot)

    def test_other_editions_and_adebar_are_preserved(self):
        other_year = self.make_event(start_date=date(2026, 6, 20), end_date=date(2026, 6, 21))
        other_place = self.make_event(city="Berlin", zip="10115")
        adebar = self.make_event(
            title="Mittelaltermarkt Adebar und Axt",
            start_date=date(2027, 7, 17), end_date=date(2027, 7, 18),
            city="Bergenhusen", image_url="https://example.org/adebar.jpg",
        )
        events = [other_year, other_place, adebar]
        before = [event.to_dict() for event in events]
        apply_event_corrections(events)
        self.assertEqual([event.to_dict() for event in events], before)
