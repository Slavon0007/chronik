"""Deterministic adapters for local markets and regional event calendars."""

import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from .dates import find_date_range
from .models import Category, EventDraft
from .parsers import category_for, clean, unconfirmed
from .places import fold

POSTCODES = Path(__file__).resolve().parent / 'data' / 'de-postcodes.tsv'
STATES = {
    'Baden-Württemberg': 'Baden-Württemberg', 'Bayern': 'Bavaria', 'Berlin': 'Land Berlin',
    'Brandenburg': 'Brandenburg', 'Bremen': 'Bremen', 'Hamburg': 'Hamburg', 'Hessen': 'Hesse',
    'Mecklenburg-Vorpommern': 'Mecklenburg-Western Pomerania', 'Niedersachsen': 'Lower Saxony',
    'Nordrhein-Westfalen': 'North Rhine-Westphalia', 'Rheinland-Pfalz': 'Rhineland-Palatinate',
    'Saarland': 'Saarland', 'Sachsen': 'Saxony', 'Sachsen-Anhalt': 'Saxony-Anhalt',
    'Schleswig-Holstein': 'Schleswig-Holstein', 'Thüringen': 'Thuringia',
}
TOPIC = re.compile(
    r'mittelalter|historisch|ritter|wikinger|heerlager|reenactment|living.history|'
    r'burgfest|burgspektakel|schlossfest|larp|fantasy|rauhnacht|raunacht|wyhnacht|'
    r'\banno\b|\bmetfest\b|keltisch|piraten|sehusafest|drach[en]+(?:fest|tage)',
    re.I,
)
PROVISIONAL = re.compile(r'vorläufig|voraussichtlich|\bvsl\.|termin noch offen|entfällt|abgesagt|verschoben', re.I)
DAY_LIST = re.compile(r'(?<![\d.])(?P<days>\d{1,2}\.(?:\s*/\s*\d{1,2}\.)+)\s*(?P<month>[A-Za-zÄÖÜäöü]+\.?)\s*(?P<year>20\d{2})')
NUMERIC_DATE = re.compile(r'\d{1,2}\.\d{1,2}\.20\d{2}')


@lru_cache(maxsize=1)
def postal_index():
    by_place, by_postcode = defaultdict(list), defaultdict(list)
    for line in POSTCODES.read_text(encoding='utf-8').splitlines():
        postcode, place, state, lat, lng = line.split('\t')
        row = (fold(place), fold(state), float(lat), float(lng))
        by_place[row[0]].append(row)
        by_postcode[postcode].append(row)
    return by_place, by_postcode


def locate(event, state=''):
    """Use only unambiguous local postcode/locality points for list entries."""
    by_place, by_postcode = postal_index()
    city = fold(event.city)
    if event.zip and event.zip in by_postcode:
        candidates = by_postcode[event.zip]
        exact = [row for row in candidates if row[0] == city]
        prefix = [row for row in candidates if row[0].startswith(city + ' ') or city.startswith(row[0] + ' ')]
        rows = exact or prefix or candidates
    else:
        state_names = {fold(state), fold(STATES.get(state, state))}
        names = dict.fromkeys((city, fold(event.city.split(' (')[0]), fold(event.city.split(',')[0])))
        rows = []
        for name in names:
            rows = [row for row in by_place.get(name, []) if not state or row[1] in state_names]
            if rows:
                break
    if not rows:
        return False
    lats, lngs = zip(*((row[2], row[3]) for row in rows))
    if max(lats) - min(lats) > 0.45 or max(lngs) - min(lngs) > 0.65:
        return False
    event.lat = round(sum(lats) / len(lats), 6)
    event.lng = round(sum(lngs) / len(lngs), 6)
    event.location_precision = 'city'
    return True


def public_link(value, url):
    if not value or value.startswith(('#', '?')):
        return ''
    link = urljoin(url, value)
    parts = urlsplit(link)
    if parts.scheme in ('https', 'http') and parts.hostname and not (parts.username or parts.password):
        return link
    return ''


def marktkalendarium(document, url, source):
    events = []
    for row in document.xpath('//tr[td]'):
        cells = row.xpath('./td')
        if len(cells) < 6:
            continue
        values = [clean(' '.join(cell.itertext())).lstrip('\ufeff') for cell in cells]
        first, last, title, place, venue = values[:5]
        locality = re.fullmatch(r'(?:D|DE)\s*[-–]\s*(\d{5})\s+(.+)', place, re.I)
        if (not locality or not NUMERIC_DATE.fullmatch(first) or not NUMERIC_DATE.fullmatch(last or first)
                or not TOPIC.search(title) or unconfirmed(title) or PROVISIONAL.search(' '.join(values))):
            continue
        dates = find_date_range(f'{first} - {last or first}')
        if not dates or dates.start.strftime('%Y') != first.rsplit('.', 1)[-1]:
            continue
        website = next((link for href in cells[5].xpath('.//a/@href') if (link := public_link(href, url))), url)
        organizer = clean(cells[6].xpath('string(.//a[starts-with(@href,"http")][1])')) if len(cells) > 6 else ''
        event = EventDraft(
            title=title, category=category_for(title, Category.MARKT),
            start_date=dates.start, end_date=dates.end, city=locality[2], zip=locality[1],
            venue=venue, organizer=organizer if '@' not in organizer else '',
            source_name=source.name, source_url=url, website=website, confidence=0.74,
        )
        if locate(event):
            events.append(event)
    return events


def mittelalter_netzwerk(document, url, source):
    events = []
    for row in document.xpath('//a[@data-event-origin="researched"]'):
        title = clean(row.xpath('string(.//h3)'))
        region = clean(row.xpath('string(.//p[contains(@class,"eyebrow")])'))
        period = clean(row.xpath('string(.//p[contains(@class,"event-period-label")])'))
        city = clean(row.xpath('string(.//h3/following-sibling::p[not(@class)][1])'))
        link = public_link(row.get('href'), url)
        if (region not in STATES or not city or not TOPIC.search(title) or not link
                or row.xpath('.//*[contains(@class,"event-tentative-tag")]')
                or unconfirmed(title) or PROVISIONAL.search(f'{title} {city} {period}')):
            continue
        default = Category.MARKT if re.search('markt|weihnacht', title, re.I) else Category.REENACTMENT
        organizer = clean(row.xpath('string(.//p[contains(@class,"event-organizer-label")])'))
        # The calendar uses separate periods for event weekends and closure days.
        for entry in period.split(' · '):
            if not re.match(r'^\d{1,2}\.\s*\d{1,2}\.\s*20\d{2}', entry):
                continue
            dates = find_date_range(entry)
            if not dates:
                continue
            event = EventDraft(
                title=title, category=category_for(title, default),
                start_date=dates.start, end_date=dates.end, city=city, organizer=organizer,
                source_name=source.name, source_url=link, website=link, confidence=0.72,
            )
            if locate(event, region):
                events.append(event)
    return events


FESTA_VENUES = {
    'Schloss Rheda': (51.8508, 8.29694),
    'Burg Vondern': (51.498889, 6.906667),
    'Schloss Hohenlimburg': (51.345153, 7.570619),
}


def locate_festa(events):
    located = []
    for event in events:
        if not event.has_location:
            coordinates = FESTA_VENUES.get(event.venue)
            if coordinates:
                event.lat, event.lng = coordinates
                event.location_precision = 'venue'
            else:
                locate(event, 'Nordrhein-Westfalen')
        if event.has_location:
            located.append(event)
    return located


SCHERNECK = {
    'schlossfest-sandersdorf.de': ('Historisches Schlossfest Sandersdorf', 'Schloss Sandersdorf', 'Altmannstein', '93336', (48.901667, 11.608889)),
    'gruenauer-rittertage.de': ('Grünauer Rittertage', 'Jagdschloss Grünau', 'Neuburg an der Donau', '86633', (48.737161, 11.263368)),
    'mittelalterspektakel-sandizell.de': ('Mittelalterspektakel Sandizell', 'Wasserschloss Sandizell', 'Schrobenhausen', '86529', (48.5837, 11.1762)),
    'historischer-markt-scherneck.de': ('Historische Tage Schloss Scherneck', 'Schloss Scherneck', 'Rehling', '86508', (48.47912, 10.928844)),
}
SCHERNECK_MAIN = 'historischer-markt-scherneck.de'


def scherneck(document, url, source):
    events = []
    original = (urlsplit(url).hostname or '').removeprefix('www.') == SCHERNECK_MAIN
    for paragraph in document.xpath('//p[a]'):
        link = public_link(paragraph.xpath('string(a[1]/@href)'), url)
        host = (urlsplit(link).hostname or '').removeprefix('www.')
        if host == 'historische-tage-scherneck.de':
            host = SCHERNECK_MAIN
            link = f'https://{SCHERNECK_MAIN}/'
        if host not in SCHERNECK or (original == (host == SCHERNECK_MAIN)):
            continue
        text = clean(paragraph.text_content())
        date_list = DAY_LIST.search(text)
        if not date_list or unconfirmed(text) or PROVISIONAL.search(text):
            continue
        days = re.findall(r'\d{1,2}', date_list['days'])
        if list(map(int, days)) != list(range(int(days[0]), int(days[-1]) + 1)):
            continue
        dates = find_date_range(f'{days[0]}. bis {days[-1]}. {date_list["month"]} {date_list["year"]}')
        if not dates:
            continue
        title, venue, city, postcode, coordinates = SCHERNECK[host]
        event = EventDraft(
            title=title, category=Category.TURNIER if host.startswith('gruenauer-') else Category.MARKT,
            start_date=dates.start, end_date=dates.end, venue=venue, city=city, zip=postcode,
            source_name=source.name, source_url=url, website=link.replace('http://', 'https://', 1),
            organizer='Im Team Event und Media GmbH', confidence=0.92,
        )
        if coordinates:
            event.lat, event.lng = coordinates
            event.location_precision = 'venue'
        if event.has_location or locate(event, 'Bayern'):
            events.append(event)
    return events
