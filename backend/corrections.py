"""Date-scoped corrections confirmed by event organizers."""

from datetime import date

from .dedupe import normalize_title
from .models import EventDraft

WIKINGERSOMMER_SOURCE = "https://www.rattenbaecker.de/news"


def apply_event_corrections(events: list[EventDraft]) -> None:
    """Apply confirmed details before geocoding and deduplication."""
    # Official announcement and application form confirm Festwiese, Kirchspielweg.
    # https://www.rattenbaecker.de/_files/ugd/a637c7_2034bfb79a444aa59bd93ffd0b37228f.pdf
    # The street point matches OSM way 31055371 and EventGilde's 2027 listing.
    # It is approximate, so routing uses the published venue address.
    for event in events:
        # Organizer poster supplied on 2026-11-23, 5197231739418386944.jpg.
        if (
            "adebar" in normalize_title(event.title).split()
            and "axt" in normalize_title(event.title).split()
            and event.start_date == date(2027, 7, 17)
            and event.end_date == date(2027, 7, 18)
            and event.city in {"Bergenhusen", "Bergenhusen-Blumental"}
        ):
            event.opening_hours = "Samstag 11–20 Uhr; Sonntag 10–17 Uhr"
            event.price = "Samstag 4 Taler; Sonntag 3 Taler"
            event.attendance_conditions = "Kinder bis Schwertmaß frei."
            event.organizer = "Mittelalterfreunde Bergenhusen n. e. V."
            if not event.description or normalize_title(event.description) == normalize_title(event.title):
                event.description = "Lagerleben, Handwerk, Händler und mehr."
            continue
        if (
            "wikingersommer" not in normalize_title(event.title).split()
            or event.start_date != date(2027, 6, 19)
            or event.end_date != date(2027, 6, 20)
            or not (event.zip == "25889" or event.city in {"Witzwort", "Uelvesbüll"})
        ):
            continue
        event.title = "Wikingersommer – Das Fest 2027"
        event.city = "Uelvesbüll"
        event.venue = "Festwiese Uelvesbüll"
        event.address = "Festwiese Uelvesbüll, Kirchspielweg, 25889 Uelvesbüll"
        event.zip = "25889"
        event.lat = 54.415142
        event.lng = 8.923433
        event.location_precision = "street"
        event.website = WIKINGERSOMMER_SOURCE
        event.organizer = "Die Rattenbäcker"
        event.description = "Wikingerfest auf der Festwiese Uelvesbüll am Kirchspielweg."
        event.source_urls = list(dict.fromkeys([*event.source_urls, event.source_url, WIKINGERSOMMER_SOURCE]))
        event.source_url = WIKINGERSOMMER_SOURCE
        event.source_name = "Die Rattenbäcker"
