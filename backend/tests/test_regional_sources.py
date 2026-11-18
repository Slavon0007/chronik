import json
import unittest
from datetime import date

from lxml import html

from backend.parsers import parse_events
from backend.scraper import load_sources


class RegionalSourceTests(unittest.TestCase):
    def setUp(self):
        self.sources = {source.slug: source for source in load_sources()}

    def parse(self, slug, markup, url=None):
        source = self.sources[slug]
        return parse_events(html.fromstring(markup), url or source.url, source)

    def test_market_calendar_preserves_link_and_district(self):
        docs = '''<table>
            <tr><td>26.8.2027</td><td>29.8.2027</td><td>Mittelalter am Meer</td>
                <td>D-26316 Varel Dangast</td><td>Strand</td>
                <td><a href="https://www.facebook.com/events/42">Ankündigung</a></td></tr>
            <tr><td>12.9.2027</td><td>12.9.2027</td><td>Mittelaltermarkt abgesagt</td>
                <td>D-26316 Varel Dangast</td><td></td><td></td></tr>
            <tr><td>1.10.2027</td><td>3.10.2027</td><td>Mittelaltermarkt</td>
                <td>AT-5020 Salzburg</td><td></td><td></td></tr>
        </table>'''
        event, = self.parse('marktkalendarium', docs)
        self.assertEqual((event.start_date, event.end_date), (date(2027, 8, 26), date(2027, 8, 29)))
        self.assertEqual(event.website, 'https://www.facebook.com/events/42')
        self.assertEqual(event.location_precision, 'city')
        self.assertAlmostEqual(event.lat, 53.446, places=3)

    def test_network_keeps_separate_weekends_and_skips_club_entries(self):
        def row(origin, title, period, region='Sachsen-Anhalt'):
            return f'''<a data-event-origin="{origin}" href="/veranstaltungen/egeln">
                <p class="eyebrow">{region}</p><h3>{title}</h3><p>Egeln</p>
                <p class="event-period-label">{period}</p></a>'''
        docs = (
            row('researched', 'Mittelalterspektakel Egeln', '18.09.2027 – 19.09.2027 · 24.09.2027 – 25.09.2027')
            + row('network', 'Mittelalterliches Sippentreffen', '21.09.2027')
            + row('researched', 'Historischer Markt', '22.09.2027 (vorläufig)')
        )
        events = self.parse('mittelalter-netzwerk', '<main>' + docs + '</main>')
        self.assertEqual([(event.start_date.day, event.end_date.day) for event in events], [(18, 19), (24, 25)])
        self.assertTrue(all(event.has_location for event in events))

    def test_scherneck_uses_organizer_alias_and_contiguous_day_list(self):
        docs = '''<p><a href="http://www.historische-tage-scherneck.de">Historische Tage Schloss Scherneck</a><br>
                15./16./17. Mai 2027</p>'''
        event, = self.parse('historische-tage-scherneck', docs, 'https://www.kunst-kultur-garten.de/')
        self.assertEqual((event.start_date.day, event.end_date.day), (15, 17))
        self.assertEqual(event.city, 'Rehling')
        self.assertEqual(event.website, 'https://historischer-markt-scherneck.de/')
        self.assertTrue(event.has_location)

    def test_festa_uses_event_status_and_maps_castle(self):
        event = {
            '@type': 'Event', 'name': 'MittelalterSpektakel Schloss Rheda',
            'startDate': '2027-06-18', 'endDate': '2027-06-20',
            'location': {'name': 'Schloss Rheda', 'address': {'addressLocality': 'Rheda-Wiedenbrück'}},
        }
        def markup(status):
            return '<script type="application/ld+json">' + json.dumps(
                {**event, 'eventStatus': f'https://schema.org/{status}'}
            ) + '</script>'
        result, = self.parse('festa-medievale', markup('EventScheduled'))
        self.assertEqual(result.location_precision, 'venue')
        self.assertEqual(result.end_date, date(2027, 6, 20))
        self.assertEqual(self.parse('festa-medievale', markup('EventCancelled')), [])
