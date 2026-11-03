"""Deterministic schema.org Event extraction, without a language model."""
import json
import re
from html import unescape
from urllib.parse import urljoin
from .models import EventDraft, Category
from .dates import parse_iso_date, find_date_range
from .places import city_for_zip, find_city


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


def parse_events(document, url, source):
    events = []
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
            location = item.get('location') or source.location
            if not isinstance(location, dict):
                continue
            address = location.get('address') or {}
            if not isinstance(address, dict):
                address = {'streetAddress': address}
            geo = location.get('geo') or {}
            try:
                lat, lng = float(geo.get('latitude')), float(geo.get('longitude'))
            except (ValueError, TypeError):
                lat = lng = None
            link = urljoin(url, item.get('url') or url)
            events.append(EventDraft(
                title=clean(item['name']), category=source.category,
                start_date=start, end_date=end, source_name=source.name, source_url=link,
                website=link, venue=clean(location.get('name')),
                city=clean(address.get('addressLocality')), zip=clean(address.get('postalCode')),
                address=clean(address.get('streetAddress')), lat=lat, lng=lng,
                location_precision='venue' if lat is not None else 'unknown',
                description=clean(item.get('description'))[:1000], organizer=source.name,
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
            city = city or find_city(text)
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
