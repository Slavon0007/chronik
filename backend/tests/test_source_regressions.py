import unittest
from datetime import date
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

from backend.dates import find_date_range
from backend.geocoder import Geocoder, GeocodeResult
from backend.config import Settings
from backend.parsers import parse_events
from backend.scraper import Source, fetch_pages
from backend.models import Category, PageContent
from lxml import html


class SourceRegressionTests(unittest.TestCase):
    def test_mps_weekend_spanning_two_months(self):
        doc = html.fromstring('<div><h3 class="highlight">Bückeburg 2</h3><p>31.07. + 01.08.2027</p><p class="button"><a href="/termine/bueckeburg2/">Mehr</a></p></div>')
        events = parse_events(doc, 'https://spectaculum.de/', Source('mps-spectaculum', 'MPS', 'https://spectaculum.de/', Category.MARKT))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].city, 'Bückeburg')
        self.assertEqual(events[0].end_date, date(2027, 8, 1))

    def test_drachenfest_does_not_use_early_arrival_dates(self):
        doc = html.fromstring('<p>Das DrachenFest 2027 findet vom 27.07. – 01.08.2027 auf dem Larpgelände Waldeck statt. Frühanreise am 25.07.2027.</p>')
        events = parse_events(doc, 'https://example.org', Source('drachenfest', 'DF', 'https://example.org', Category.LARP))
        self.assertEqual(events[0].zip, '34513')
        self.assertEqual(events[0].start_date, date(2027, 7, 27))

    def test_live_adventure_reads_detail_and_does_not_guess_hasenheide_city(self):
        doc = html.fromstring('<div><p>Chroniken von Mythodea ist eine Zelt-Con 29.04 – 02.05.2027.</p><p>Addresse: Jugendgelände Hasenheide, Hasenheide 1, 27308 Kirchlinteln</p></div>')
        source = Source('live-adventure', 'Live Adventure', 'https://example.org', Category.LARP)
        events = parse_events(doc, 'https://example.org/chroniken-von-mythodea/', source)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].city, 'Kirchlinteln')
        self.assertEqual(events[0].end_date, date(2027, 5, 2))
        self.assertEqual(events[0].address, 'Hasenheide 1')

    def test_eventgilde_category_badge_overrides_default(self):
        import json
        event = {'@type': 'Event', 'name': 'Gaslin', 'startDate': '2027-05-01', 'location': {'address': {'addressCountry': 'DE'}}}
        doc = html.fromstring('<div><div><span class="uppercase">LARP &amp; Fantasy</span></div><h1>Gaslin</h1><script type="application/ld+json">' + json.dumps(event) + '</script></div>')
        events = parse_events(doc, 'https://example.org', Source('eventgilde', 'EG', 'https://example.org', Category.MARKT))
        self.assertEqual(events[0].category, Category.LARP)

    def test_foreign_schema_event_is_excluded(self):
        doc = html.fromstring('<script type="application/ld+json">{"@type":"Event","name":"Foreign LARP","startDate":"2027-05-01","location":{"address":{"addressCountry":"FR"}}}</script>')
        self.assertEqual(parse_events(doc, 'https://example.org', Source('larp-radar', 'LR', 'https://example.org', Category.LARP)), [])

    def test_detail_pages_do_not_expand_to_related_or_login_pages(self):
        source = Source('test', 'Test', 'https://example.org/list', Category.LARP, max_pages=10, link_selector='//a/@href')
        listing = PageContent(source.url, '', '', [], [], crawl_urls=['https://example.org/event'])
        detail = PageContent('https://example.org/event', '', '', [], [], crawl_urls=['https://example.org/login', 'https://example.org/related'])
        with patch('backend.scraper.fetch_page', side_effect=[listing, detail]):
            self.assertEqual(len(list(fetch_pages(source, object()))), 2)

    def test_larp_calendar_compact_date_range(self):
        dates = find_date_range('09.01 - 10.01.2027')
        self.assertEqual(dates.start, date(2027, 1, 9))
        self.assertEqual(dates.end, date(2027, 1, 10))

    def test_postcode_fallback_is_approximate(self):
        with TemporaryDirectory() as directory:
            geocoder = Geocoder(Settings(), Path(directory) / 'cache.json')
            with patch.object(geocoder, '_nominatim', side_effect=[None, GeocodeResult(51, 13, 'Nossen', 'nominatim')]) as lookup:
                result = geocoder.geocode('01683 Altzella')
                self.assertEqual(result.source, 'city')
                self.assertEqual(lookup.call_args.args, ('01683',))

    def test_drachenfest_calendar_reads_other_events(self):
        doc = html.fromstring('''<div>
            <p>Das Zeit der Legenden 2027 findet vom 15.09. - 19.09.2027 auf dem Larpgelände Waldeck am Edersee statt.</p>
            <p>Das Zeit der Abenteuer 2027 findet vom 26.05. - 30.05.2027 auf dem Larpgelände Waldeck am Edersee statt.</p>
        </div>''')
        events = parse_events(doc, 'https://example.org', Source('drachenfest', 'DF', 'https://example.org', Category.LARP))
        self.assertEqual([(e.title, e.start_date.month, e.end_date.day) for e in events], [
            ('Zeit der Legenden 2027', 9, 19), ('Zeit der Abenteuer 2027', 5, 30),
        ])

