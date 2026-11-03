import unittest
from lxml import html
from backend.parsers import parse_events
from backend.scraper import Source
from backend.models import Category

class ParserTests(unittest.TestCase):
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
