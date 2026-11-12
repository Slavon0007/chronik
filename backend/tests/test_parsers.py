import json
import unittest
from lxml import html
from backend.parsers import mps_details, parse_events
from backend.scraper import Source
from backend.models import Category
from backend.parsers import category_for

class ParserTests(unittest.TestCase):
    def test_castle_program_does_not_make_everything_a_market(self):
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
        doc = html.fromstring('''<html><script type="application/ld+json">[{"@type":"Event","name":"Market","startDate":"2027-05-01","location":{"address":{"addressLocality":"Berlin"}}},{"@type":"Event","name":"Cancelled","startDate":"2027-05-02","location":{"address":{"addressLocality":"Berlin"}},"eventStatus":"https://schema.org/EventCancelled"}]</script></html>''')
        events = parse_events(doc, "https://example.org", Source("test","Test","https://example.org",Category.MARKT))
        self.assertEqual(len(events), 2)
        self.assertEqual(events[1].event_status, "cancelled")
        self.assertEqual(events[0].city,"Berlin")
        self.assertEqual(events[0].start_date,events[0].end_date)

    def test_larp_rows_keep_dates_separate(self):
        doc = html.fromstring('''<table><tr class="termindatum1"><td>10.04.2027</td><td><a class="terminueberschrift1" href="?con_id=1">Tavern</a> Berlin (PLZ: 10115)</td></tr><tr class="termindatum2"><td>11.04.2027</td><td><a class="terminueberschrift2" href="?con_id=2">Battle</a> Hamburg (PLZ: 20095)</td></tr></table>''')
        events=parse_events(doc,"https://example.org",Source("larpkalender","LARP","https://example.org",Category.LARP))
        self.assertEqual(len(events),2)
        self.assertNotEqual(events[0].start_date,events[1].start_date)
        self.assertEqual(events[0].title,"Tavern")

    def test_structured_details_are_scoped_to_each_event(self):
        items = [
            {"@type": "Event", "name": "Market", "startDate": "2027-05-01", "endDate": "2027-05-02",
             "description": "<p>Samstag 10–20 Uhr</p><p>Sonntag 10–18 Uhr</p><p>Anmeldung erforderlich.</p>",
             "offers": [{"price": "12.50", "priceCurrency": "EUR", "availability": "https://schema.org/SoldOut"},
                        {"price": "18", "priceCurrency": "EUR", "availability": "https://schema.org/InStock"}]},
            {"@type": "Event", "name": "Free Market", "startDate": "2027-06-01", "isAccessibleForFree": True,
             "eventStatus": "https://schema.org/EventRescheduled"},
            {"@type": "Event", "name": "LARP", "startDate": "2027-07-01T10:00:00+02:00",
             "endDate": "2027-07-01T18:00:00+02:00",
             "offers": {"availability": "https://schema.org/SoldOut"}},
        ]
        doc = html.fromstring('<script type="application/ld+json">' + json.dumps(items) + '</script>')
        source = Source('test', 'Test', 'https://example.org', Category.MARKT)
        market, free_market, larp = parse_events(doc, source.url, source)
        self.assertEqual(market.price, '12,50–18 €')
        self.assertEqual(market.opening_hours, 'Samstag 10–20 Uhr · Sonntag 10–18 Uhr')
        self.assertEqual(market.attendance_conditions, 'Anmeldung erforderlich.')
        self.assertEqual(market.event_status, '')
        self.assertEqual(free_market.price, 'Eintritt frei')
        self.assertEqual(free_market.event_status, 'rescheduled')
        self.assertEqual(free_market.opening_hours, '')
        self.assertEqual(free_market.attendance_conditions, '')
        self.assertEqual(larp.opening_hours, '10:00–18:00 Uhr')
        self.assertEqual(larp.event_status, 'sold_out')
        self.assertEqual(larp.price, '')

    def test_mps_price_is_for_an_adult_day_ticket(self):
        doc = html.fromstring("""<main>
          <h3>Das Mitbringen von Alkohol ist verboten!</h3>
          <h4>Öffnungszeiten</h4><table><tr><td>Samstag</td><td>11:00 - 24:00 Uhr</td></tr></table>
          <h4>Preise</h4><table>
            <tr><th>2-Tageskarte</th><th>Preis Vorverkauf</th></tr>
            <tr><td>Gäste ab 15 Jahre</td><td>45,00 €</td></tr>
            <tr><th>Tageskarte Sonntag</th><th>Preis Vorverkauf</th></tr>
            <tr><td>Kinder unter 7 Jahre</td><td>kostenlos</td></tr>
            <tr><td>Gäste ab 15 Jahre</td><td>26,00 €</td></tr>
          </table>
        </main>""")
        details = mps_details(doc)
        self.assertEqual(details['price'], 'Tageskarte ab 26 € (ab 15 Jahren)')
        self.assertEqual(details['opening_hours'], 'Samstag 11:00 - 24:00 Uhr')
        self.assertIn('verboten', details['attendance_conditions'])

    def test_drachenfest_early_arrival_does_not_change_event_dates(self):
        doc = html.fromstring("""<p>Das DrachenFest 2027 findet vom 27.07. – 01.08.2027
            auf dem Larpgelände Waldeck statt.<br>
            Die optionalen Frühanreisen für das DrachenFest 2027 sind am 25.07. und 26.07.2027.</p>""")
        source = Source('drachenfest', 'DrachenFest', 'https://example.org', Category.LARP)
        event, = parse_events(doc, source.url, source)
        self.assertEqual(event.start_date.isoformat(), '2027-07-27')
        self.assertIn('25.07.', event.attendance_conditions)
        self.assertNotIn('Frühanreisen', event.description)
