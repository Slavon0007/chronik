import unittest
from lxml import html
from backend.parsers import parse_events
from backend.scraper import Source
from backend.models import Category
from backend.parsers import category_for

class ParserTests(unittest.TestCase):
    def test_castle_program_does_not_make_everything_a_market(self):
        import json
        items = [{"@type": "Event", "name": title, "startDate": "2027-05-01"}
                 for title in ["Gruseldinner", "Familien-Feuer-Workshop", "Weihnachtslesung", "Burgweihnacht", "Ritterturnier"]]
        doc = html.fromstring('<script type="application/ld+json">' + json.dumps(items) + '</script>')
        events = parse_events(doc, 'https://example.org', Source('burg-satzvey', 'Castle', 'https://example.org', Category.MARKT))
        self.assertEqual([e.title for e in events], ['Burgweihnacht', 'Ritterturnier'])
        self.assertEqual(events[1].category, Category.TURNIER)

    def test_calendar_uses_separate_end_date_and_detail_link(self):
        doc = html.fromstring('''<table><tr><td>04.11.2027 bis</td><td>08.11.2027</td><td>Hansemarkt</td><td>44135</td><td>Dortmund</td><td><button formaction="/details.php">Details</button></td></tr></table>''')
        events = parse_events(doc, 'https://example.org', Source('mittelalterkalender', 'Calendar', 'https://example.org', Category.MARKT))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].end_date.day, 8)
        self.assertEqual(events[0].website, 'https://example.org/details.php')

    def test_organizer_skips_unconfirmed_cancelled_and_invalid_rows(self):
        doc = html.fromstring('''<table>
        <tr><td>20. - 21. März 2027</td><td>Ritterturnier</td><td>01683 Nossen</td></tr>
        <tr><td>20. - 21. März 2027</td><td>Markt*</td><td>01683 Nossen</td></tr>
        <tr><td>20. - 21. März 2027</td><td>Markt abgesagt</td><td>01683 Nossen</td></tr>
        <tr><td>31. Februar 2027</td><td>Markt</td><td>01683 Nossen</td></tr></table>''')
        events = parse_events(doc, 'https://example.org', Source('suendenfrei', 'Organizer', 'https://example.org', Category.MARKT))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].category, Category.TURNIER)

    def test_categories_are_based_on_event_not_venue(self):
        self.assertEqual(category_for('Wallensteintage', Category.MARKT), Category.REENACTMENT)
        self.assertEqual(category_for('Cosplay auf der Burg', Category.MARKT), Category.COSPLAY)

    def test_dokomi_uses_announced_range_not_footer(self):
        doc = html.fromstring('<html><p class="uVisuallyHidden">09.-11. Juli 2027</p><p>Unsere Koordinaten: 51.269011, 6.727094</p><footer>01. Januar 2020</footer></html>')
        events = parse_events(doc, 'https://example.org', Source('dokomi', 'DoKomi', 'https://example.org', Category.COSPLAY))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].start_date.day, 9)
        self.assertEqual(events[0].end_date.day, 11)
        self.assertEqual(events[0].lat, 51.269011)

    def test_multiple_events_and_cancelled(self):
        doc = html.fromstring('''<html><script type="application/ld+json">[{"@type":"Event","name":"Market","startDate":"2027-05-01","location":{"address":{"addressLocality":"Berlin"}}},{"@type":"Event","name":"Cancelled","startDate":"2027-05-02","eventStatus":"https://schema.org/EventCancelled"}]</script></html>''')
        events = parse_events(doc, "https://example.org", Source("test","Test","https://example.org",Category.MARKT))
        self.assertEqual(len(events),1)
        self.assertEqual(events[0].city,"Berlin")
        self.assertEqual(events[0].start_date,events[0].end_date)

    def test_larp_rows_keep_dates_separate(self):
        doc = html.fromstring('''<table><tr class="termindatum1"><td>10.04.2027</td><td><a class="terminueberschrift1" href="?con_id=1">Tavern</a> Berlin (PLZ: 10115)</td></tr><tr class="termindatum2"><td>11.04.2027</td><td><a class="terminueberschrift2" href="?con_id=2">Battle</a> Hamburg (PLZ: 20095)</td></tr></table>''')
        events=parse_events(doc,"https://example.org",Source("larpkalender","LARP","https://example.org",Category.LARP))
        self.assertEqual(len(events),2)
        self.assertNotEqual(events[0].start_date,events[1].start_date)
        self.assertEqual(events[0].title,"Tavern")
