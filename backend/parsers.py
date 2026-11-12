"""Deterministic schema.org Event extraction, without a language model."""
import json
import re
from html import unescape
from decimal import Decimal, InvalidOperation
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



EVENT_STATUSES = {
    'EventCancelled': 'cancelled',
    'EventPostponed': 'postponed',
    'EventRescheduled': 'rescheduled',
}
TIME_RANGE = r'\d{1,2}(?::\d{2})?\s*(?:Uhr\s*)?(?:[-–—]|bis)\s*\d{1,2}(?::\d{2})?\s*Uhr'
WEEKDAY = r'(?:Mo(?:ntag)?|Di(?:enstag)?|Mi(?:ttwoch)?|Do(?:nnerstag)?|Fr(?:eitag)?|Sa(?:mstag)?|So(?:nntag)?)\.?'
CONDITION = re.compile(
    r'\b(?:Mindestalter|Teilnahme\s+ab\s+\d+|ab\s+\d+\s+Jahren|'
    r'(?:Vor)?Anmeldung\s+(?:ist\s+)?(?:erforderlich|notwendig|Pflicht)|'
    r'(?:nur\s+)?mit\s+(?:vorheriger\s+)?(?:Vor)?Anmeldung|'
    r'(?:Gewandung|Kostüm)\s+(?:ist\s+)?(?:Pflicht|erforderlich)|'
    r'Zuschauer\s+(?:sind\s+)?(?:willkommen|zugelassen|nicht\s+zugelassen)|'
    r'Frühanreise|Mitbringen\b.{0,120}\bverboten)\b', re.I,
)


def schema_term(value):
    return str(value or '').rstrip('/').rsplit('/', 1)[-1]


def structured_price(item, offers):
    if item.get('isAccessibleForFree') is True:
        return 'Eintritt frei'
    amounts = {}
    for offer in offers:
        currency = str(offer.get('priceCurrency') or '').upper()
        if not re.fullmatch(r'[A-Z]{3}', currency):
            continue
        for field in ('price', 'lowPrice', 'highPrice'):
            try:
                amount = Decimal(str(offer.get(field)).replace(',', '.'))
            except InvalidOperation:
                continue
            if amount.is_finite() and amount >= 0:
                amounts.setdefault(currency, set()).add(amount)
    if len(amounts) != 1:
        return ''
    currency, values = next(iter(amounts.items()))
    low, high = min(values), max(values)
    label = '€' if currency == 'EUR' else currency
    first = format(low, '.0f' if low == low.to_integral() else '.2f').replace('.', ',')
    last = format(high, '.0f' if high == high.to_integral() else '.2f').replace('.', ',')
    return f'{first}–{last} {label}' if low != high else f'{first} {label}'


def announcement_details(lines):
    lines = list(dict.fromkeys(line for line in map(clean, lines) if 0 < len(line) <= 250))
    price = []
    conditions = []
    daily = []
    opening = []
    status = ''
    for line in lines:
        if re.search(r'^(?:Status\s*:\s*)?(?:(?:Die Veranstaltung|Das Event)\s+(?:ist|wurde)\s+)?(?:abgesagt|fällt aus)[.!]?$',
                     line, re.I):
            status = 'cancelled'
        elif status != 'cancelled' and re.fullmatch(
                r'(?:Status\s*:\s*)?(?:(?:Die Veranstaltung|Das Event)\s+(?:ist|wurde)\s+)?'
                r'verschoben(?:\s*[–-]\s*neuer Termin (?:folgt|offen))?[.!]?', line, re.I):
            status = 'postponed'
        elif not status and re.fullmatch(r'(?:Status\s*:\s*)?(?:ausverkauft|alle Tickets (?:sind )?ausverkauft)[.!]?', line, re.I):
            status = 'sold_out'
        if re.match(r'^(?:Eintritt(?:spreise?)?|Tageskarte|Teilnahmegebühr|Tickets?|'
                    r'Erwachsene|Kinder(?:\s+(?:bis|unter|ab)\s+\d+(?:\s+Jahre[n]?)?)?|'
                    r'Gäste\s+ab\s+\d+\s+Jahre|freier Eintritt|kostenloser Eintritt)\b', line, re.I):
            if re.search(r'\d+(?:[,.]\d{1,2})?\s*(?:€|EUR\b)|\b(?:kostenlos|frei)\b', line, re.I):
                price.append(line)
        if CONDITION.search(line):
            conditions.extend(sentence for sentence in re.split(r'(?<=[.!?])\s+(?=[A-ZÄÖÜ])', line)
                              if CONDITION.search(sentence))
        if re.search(TIME_RANGE, line, re.I):
            if re.match(rf'^(?:{WEEKDAY}(?=\W|$)|(?:Markt|Öffnungszeiten)\s+{WEEKDAY}(?=\W|$))', line, re.I):
                daily.append(line)
            elif re.match(r'^(?:Öffnungszeiten|Marktzeiten|Geöffnet|Täglich)\b', line, re.I):
                opening.append(line)
    return {
        'price': ' · '.join(price[:4]),
        'opening_hours': ' · '.join(daily or opening),
        'attendance_conditions': ' '.join(conditions[:4]),
        'event_status': status,
    }


def detail_lines(document):
    return [
        ' '.join(node.xpath('.//text()[not(ancestor::script or ancestor::style)]'))
        for node in document.xpath(
            '//main//*[self::p or self::li or self::h2 or self::h3 or self::tr'
            ' or self::h4 or self::h5]'
            '[not(ancestor::nav or ancestor::footer or ancestor::header)]'
        )
    ]


def mps_details(document):
    details = announcement_details(detail_lines(document))
    # MPS has separate market and campsite hours, plus ticket tiers by age.
    hours = []
    adult_day_prices = []
    for heading in document.xpath('//*[self::h3 or self::h4][normalize-space()="Öffnungszeiten" or normalize-space()="Preise"]'):
        for sibling in heading.itersiblings():
            if sibling.tag in ('h1', 'h2', 'h3', 'h4'):
                break
            for table in sibling.xpath('self::table | .//table'):
                rows = table.xpath('.//tr')
                if clean(heading.text_content()) == 'Öffnungszeiten':
                    if not hours:
                        hours.extend(filter(None, (clean(' '.join(row.itertext())) for row in rows)))
                    break
                day_ticket = False
                for row in rows:
                    cells = [clean(cell.text_content()) for cell in row.xpath('./td|./th')]
                    if not cells:
                        continue
                    if any('Preis Vorverkauf' in cell for cell in cells):
                        day_ticket = bool(re.match(
                            r'Tageskarte|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag',
                            cells[0], re.I,
                        ))
                    if day_ticket and re.match(r'Gäste ab 15 Jahre', cells[0], re.I):
                        adult_day_prices.extend(
                            Decimal(price.replace(',', '.'))
                            for price in re.findall(r'(\d+(?:,\d{2})?)\s*€', ' '.join(cells[1:]))
                        )
    if hours:
        details['opening_hours'] = ' · '.join(hours)
    if adult_day_prices:
        amount = format(min(adult_day_prices).normalize(), 'f').replace('.', ',')
        details['price'] = f'Tageskarte ab {amount} € (ab 15 Jahren)'
    return details


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
                        **announcement_details(paragraphs),
                    ))
    if source.slug == 'drachenfest':
        for node in document.xpath('//p'):
            text = clean(' '.join(node.itertext()))
            announcement = re.match(
                r'Das (DrachenFest|Zeit der Legenden|Zeit der Abenteuer) (20\d{2}) findet\b',
                text,
            )
            if not announcement:
                continue
            dates = find_date_range(text)
            if not dates or 'Waldeck' not in text:
                continue
            arrival = re.search(
                rf'\bDie optionalen? Frühanreisen? für das {re.escape(announcement[1])} '
                rf'{announcement[2]}[^!\n]*', text, re.I,
            )
            conditions = arrival.group(0) if arrival else ''
            events.append(EventDraft(
                title=f'{announcement[1]} {announcement[2]}', category=Category.LARP,
                start_date=dates.start, end_date=dates.end, city='Waldeck', zip='34513',
                location_precision='city',
                venue='LARP-Gelände Waldeck', source_name=source.name, source_url=url, website=url,
                organizer='Wyvern', description=text[:arrival.start()].strip() if arrival else text, confidence=0.9,
                attendance_conditions=conditions,
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
                **announcement_details(detail_lines(document)),
            ))
    structured = []
    for script in document.xpath('//script[@type="application/ld+json"]/text()'):
        try:
            data = json.loads(script)
        except ValueError:
            continue
        for item in walk(data):
            types = item.get('@type', [])
            types = [types] if isinstance(types, str) else types
            if 'Event' not in (types or []):
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
            if not isinstance(location, dict) or (not location and
                    schema_term(item.get('eventStatus')) == 'EventCancelled'):
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
            raw_offers = item.get('offers')
            offers = [offer for offer in walk(raw_offers) if
                      any(field in offer for field in ('price', 'lowPrice', 'highPrice', 'availability'))]
            statuses = [schema_term(offer.get('availability')) for offer in offers]
            event_status = EVENT_STATUSES.get(schema_term(item.get('eventStatus')), '')
            if not event_status and statuses and all(status == 'SoldOut' for status in statuses):
                event_status = 'sold_out'
            description = item.get('description') or ''
            lines = re.split(r'[\n\r]+|</(?:p|li|div)>|<br\s*/?>', str(description), flags=re.I)
            details = announcement_details(lines)
            details['price'] = structured_price(item, offers) or details['price']
            details['event_status'] = event_status or details['event_status']
            if not details['opening_hours'] and start == end:
                first, last = (re.match(r'\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})', str(item.get(key) or ''))
                               for key in ('startDate', 'endDate'))
                if first and last and first[1] < last[1]:
                    details['opening_hours'] = f'{first[1]}–{last[1]} Uhr'
            website = item.get('sameAs')
            if not isinstance(website, str) or not website.startswith(('https://', 'http://')):
                website = link
            if item.get('typicalAgeRange'):
                details['attendance_conditions'] = ' '.join(filter(None, (
                    f'Altersangabe: {clean(item["typicalAgeRange"])}.',
                    details['attendance_conditions'],
                )))
            category = source.category if source.category == Category.LARP else category_for(title, source.category)
            if source.slug == 'eventgilde':
                badges = document.xpath('//h1/../div/span[contains(@class,"uppercase")]/text()')
                category = category_for(' '.join(badges), category)
            structured.append(EventDraft(
                title=title, category=category,
                start_date=start, end_date=end, source_name=source.name, source_url=link,
                website=website, venue=clean(location.get('name')),
                city=clean(address.get('addressLocality')), zip=clean(address.get('postalCode')),
                address=clean(address.get('streetAddress')), lat=lat, lng=lng,
                location_precision=('city' if source.slug == 'larp-radar' else 'venue') if lat is not None else 'unknown',
                description=clean(item.get('description'))[:1000], organizer=clean(organizer.get('name')),
                confidence=0.9, **details,
            ))
    if len(structured) == 1 and structured[0].source_url.rstrip('/') == url.rstrip('/'):
        event = structured[0]
        for field, value in announcement_details(detail_lines(document)).items():
            if value and (not getattr(event, field) or (field == 'event_status' and value == 'cancelled')
                          or field == 'opening_hours'):
                setattr(event, field, value)
    events.extend(structured)
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
                **announcement_details([' '.join(line.itertext()) for line in cells[1].xpath('.//p|.//li')]),
            ))
    return events
