"""Deterministic schema.org Event extraction, without a language model."""
import json
import re
from html import unescape
from urllib.parse import urljoin
from .models import EventDraft, Category
from .dates import parse_iso_date, find_date_range
from .places import city_for_zip


def category_for(title, fallback):
    """Classify explicit event names; a venue alone does not define its events."""
    title = title.casefold()
    if re.search(r'cosplay|anime|manga|dokomi|animagic', title):
        return Category.COSPLAY
    if re.search(r'ritterturnier|turnierspiel|buhurt|schwertkampf', title):
        return Category.TURNIER
    if re.search(r'reenactment|living.history|schlacht|heerlager|wallenstein|wikingertage', title):
        return Category.REENACTMENT
    if re.search(r'\blarp\b|rollenspiel', title):
        return Category.LARP
    return fallback


def unconfirmed(text):
    return bool(re.search(r'abgesagt|cancelled|unbestätigt|unbestaetigt|vorgemerkt|vorbehalt', text, re.I))


def parse_tables(document, url, source):
    events = []
    for row in document.xpath('//table//tr'):
        cells = row.xpath('./td')
        values = [clean(cell.text_content()) for cell in cells]
        if source.slug == 'suendenfrei':
            if len(values) != 3:
                continue
            dates = find_date_range(values[0])
            title, place = values[1:3]
            if '*' in ' '.join(values) or unconfirmed(' '.join(values)):
                continue
            match = re.match(r'(\d{5})\s+(.+)', place)
            if not match:
                continue
            zip_code = match.group(1)
            city = re.split(r'\s*/\s*|,', match.group(2))[0].strip()
            link = url
        elif source.slug == 'mittelalterkalender':
            if len(values) != 6:
                continue
            dates = find_date_range(values[0] + ' ' + values[1])
            title, zip_code, city = values[2:5]
            links = row.xpath('.//*[@formaction]/@formaction')
            link = urljoin(url, links[0]) if links else url
        else:
            continue
        if not dates or not title or not city or not re.fullmatch(r'\d{5}', zip_code):
            continue
        if unconfirmed(' '.join(values)):
            continue
        events.append(EventDraft(
            title=title, category=category_for(title, source.category),
            start_date=dates.start, end_date=dates.end,
            source_name=source.name, source_url=link, website=link,
            city=city, zip=zip_code, address=zip_code,
            location_precision='city', description=title,
            organizer=source.name if source.slug == 'suendenfrei' else '',
            confidence=0.8,
        ))
    return events


def walk(value):
    if isinstance(value, list):
        for child in value:
            yield from walk(child)
    elif isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)


def clean(value):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(str(value or "")))).strip()


def parse_organizers(document, url, source):
    events = []
    if source.slug == 'mps-spectaculum':
        for heading in document.xpath('//h3[contains(@class,"highlight")]'):
            block = heading.getparent()
            paragraphs = block.xpath('./p[not(@class)]')
            dates = find_date_range(clean(paragraphs[0].text_content())) if paragraphs else None
            city = clean(' '.join(heading.itertext()))
            links = block.xpath('.//a[contains(@href,"/termine/")]/@href')
            if not dates or not city or not links:
                continue
            city = re.sub(r'^Retro MPS\s*', '', city)
            # The trailing number distinguishes the two Bückeburg weekends.
            city = re.sub(r'\s+\d+$', '', city)
            link = urljoin(url, links[0])
            events.append(EventDraft(
                title='MPS ' + clean(' '.join(heading.itertext())), category=Category.MARKT,
                start_date=dates.start, end_date=dates.end, city=city,
                source_name=source.name, source_url=link, website=link,
                organizer=source.name, description='Mittelalterlich Phantasie Spectaculum.', confidence=0.9,
            ))
    if source.slug == 'live-adventure':
        # Detail pages take precedence: the overview can contain outdated dates
        # and ambiguous venue names (e.g. Hasenheide is not a city).
        titles = {
            'conquest-von-mythodea': 'ConQuest of Mythodea',
            'chroniken-von-mythodea': 'Chroniken von Mythodea',
            'jenseits-der-siegel': 'Jenseits der Siegel',
            'sturmwacht-de': 'Sturmwacht',
        }
        title = next((name for slug, name in titles.items() if slug in url), None)
        if title:
            paragraphs = [clean(' '.join(node.itertext())) for node in document.xpath('//p')]
            dates = None
            for paragraph in paragraphs:
                if re.search(r'Frühanreise|early.arrival', paragraph, re.I):
                    continue
                normalized = re.sub(r'(\d)\s+\.', r'\1.', paragraph)
                normalized = re.sub(r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(dem|den)?', '', normalized)
                candidate = find_date_range(normalized)
                if candidate and candidate.end > candidate.start:
                    dates = candidate
                    break
            places = [p for p in paragraphs if re.search(r'\b\d{5}\b', p) and len(p) < 250]
            if dates and places:
                place = places[0]
                match = re.search(r'\b(\d{5})\s+([^,.)]+)', place)
                if match:
                    city = re.split(r'\s+(?:statt|bei|Deutschland|Germany)\b', match.group(2))[0].strip()
                    street = re.search(r'(Hasenheide|Rittergut Brokeloh|Kesselhaken|Schloßstraße)\s+\d+', place)
                    events.append(EventDraft(
                        title=f'{title} {dates.start.year}', category=Category.LARP,
                        start_date=dates.start, end_date=dates.end, city=city, zip=match.group(1),
                        address=street.group(0) if street else match.group(1),
                        source_name=source.name, source_url=url, website=url,
                        organizer=source.name, description=title, confidence=0.9,
                    ))
    if source.slug == 'drachenfest':
        for node in document.xpath('//p'):
            text = clean(' '.join(node.itertext()))
            if not re.search(r'Das DrachenFest 20\d{2} findet', text):
                continue
            dates = find_date_range(text)
            if not dates or 'Waldeck' not in text:
                continue
            events.append(EventDraft(
                title=f'DrachenFest {dates.start.year}', category=Category.LARP,
                start_date=dates.start, end_date=dates.end, city='Waldeck',
                venue='LARP-Gelände Waldeck', source_name=source.name, source_url=url, website=url,
                organizer='Wyvern', description=text, confidence=0.9,
            ))
    return events


def parse_events(document, url, source):
    events = parse_tables(document, url, source) + parse_organizers(document, url, source)
    if source.slug in ('dokomi', 'animagic'):
        # Read the explicitly published convention dates, never footer/news dates.
        selector = '//p[contains(@class,"uVisuallyHidden")]' if source.slug == 'dokomi' else '//span[contains(text(),"Rosengarten") and contains(text(),"Mannheim")]'
        dates = next((dates for node in document.xpath(selector)
                      if (dates := find_date_range(clean(node.text_content())))), None)
        if dates:
            place = source.location
            address = place.get('address') or {}
            text = clean(' '.join(document.itertext()))
            coordinates = re.search(r'Unsere Koordinaten:\s*(\d{1,2}\.\d+),\s*(\d{1,2}\.\d+)', text)
            lat = float(coordinates.group(1)) if coordinates else None
            lng = float(coordinates.group(2)) if coordinates else None
            events.append(EventDraft(
                title=f'{source.name} {dates.start.year}', category=Category.COSPLAY,
                start_date=dates.start, end_date=dates.end,
                source_name=source.name, source_url=url, website=url,
                venue=place.get('name', ''), city=address.get('addressLocality', ''),
                address=address.get('streetAddress', ''), zip=address.get('postalCode', ''),
                lat=lat, lng=lng, location_precision='venue' if lat else 'unknown',
                description=f'Anime-, Manga- und Cosplay-Convention: {source.name}.',
                organizer=source.name, confidence=0.9,
            ))
    for script in document.xpath('//script[@type="application/ld+json"]/text()'):
        try:
            data = json.loads(script)
        except ValueError:
            continue
        for item in walk(data):
            types = item.get('@type', [])
            types = [types] if isinstance(types, str) else types
            if 'Event' not in types or 'EventCancelled' in str(item.get('eventStatus', '')):
                continue
            start = parse_iso_date(str(item.get('startDate', '')))
            end = parse_iso_date(str(item.get('endDate', ''))) or start
            if not start or not end or end < start or not item.get('name'):
                continue
            title = clean(item['name'])
            if source.slug == 'burg-satzvey' and re.search(r'dinner|workshop|seminar|lesung', title, re.I):
                continue
            if source.slug == 'burg-satzvey' and not re.search(
                r'markt|weihnacht|ritter|turnier|mittelalter|cosplay|reenactment|heerlager', title, re.I
            ):
                continue
            location = item.get('location') or source.location
            if not isinstance(location, dict):
                continue
            address = location.get('address') or {}
            if not isinstance(address, dict):
                address = {'streetAddress': address}
            country = address.get('addressCountry') or 'DE'
            if isinstance(country, dict):
                country = country.get('name', '')
            if str(country).casefold() not in ('de', 'germany', 'deutschland'):
                continue
            geo = location.get('geo') or {}
            try:
                lat, lng = float(geo.get('latitude')), float(geo.get('longitude'))
            except (ValueError, TypeError):
                lat = lng = None
            link = urljoin(url, item.get('url') or url)
            organizer = item.get('organizer') or {}
            if not isinstance(organizer, dict):
                organizer = {}
            offers = item.get('offers') or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            if not isinstance(offers, dict):
                offers = {}
            website = item.get('sameAs')
            if not isinstance(website, str) or not website.startswith(('https://', 'http://')):
                website = link
            conditions = f'Mindestalter: {item["typicalAgeRange"]}' if item.get('typicalAgeRange') else ''
            category = source.category if source.category == Category.LARP else category_for(title, source.category)
            if source.slug == 'eventgilde':
                badges = document.xpath('//h1/../div/span[contains(@class,"uppercase")]/text()')
                category = category_for(' '.join(badges), category)
            events.append(EventDraft(
                title=title, category=category,
                start_date=start, end_date=end, source_name=source.name, source_url=link,
                website=website, venue=clean(location.get('name')),
                city=clean(address.get('addressLocality')), zip=clean(address.get('postalCode')),
                address=clean(address.get('streetAddress')), lat=lat, lng=lng,
                location_precision=('city' if source.slug == 'larp-radar' else 'venue') if lat is not None else 'unknown',
                description=clean(item.get('description'))[:1000], organizer=clean(organizer.get('name')),
                price=(str(offers['price']) + ' ' + str(offers.get('priceCurrency', ''))) if 'price' in offers else '',
                attendance_conditions=conditions,
                opening_hours=' – '.join(str(item.get(k, '')) for k in ('startDate', 'endDate')),
                confidence=0.9,
            ))
    if source.slug == 'larpkalender':
        for row in document.xpath('//tr[starts-with(@class,"termindatum")]'):
            cells = row.xpath('./td')
            if len(cells) < 2:
                continue
            dates = find_date_range(clean(cells[0].text_content()))
            links = cells[1].xpath('.//a[contains(@class,"terminueberschrift")]')
            if not dates or not links:
                continue
            text = clean(cells[1].text_content())
            match = re.search(r'PLZ:\s*(\d{5})', text)
            zip_code = match.group(1) if match else ''
            city = city_for_zip(zip_code) if zip_code else None
            # Region names in the listing are not reliable city names.
            # Do not geocode a whole calendar entry: use only its named place/ZIP.
            link = urljoin(url, links[0].get('href'))
            events.append(EventDraft(
                title=clean(links[0].text_content()), category=Category.LARP,
                start_date=dates.start, end_date=dates.end,
                source_name=source.name, source_url=link, website=link,
                city=city.name if city else '', zip=zip_code,
                address=zip_code, description=text, confidence=0.75,
            ))
    return events
