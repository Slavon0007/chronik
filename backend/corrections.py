"""Date-scoped corrections confirmed by event organizers."""

from datetime import date

from .dedupe import normalize_title
from .models import EventDraft

WIKINGERSOMMER_SOURCE = "https://www.rattenbaecker.de/news"


def apply_event_corrections(events: list[EventDraft]) -> None:
    """Correct the relocated 2027 edition before geocoding and deduplication."""
    # Official announcement and application form confirm Festwiese, Kirchspielweg.
    # https://www.rattenbaecker.de/_files/ugd/a637c7_2034bfb79a444aa59bd93ffd0b37228f.pdf
    # The street point matches OSM way 31055371 and EventGilde's 2027 listing.
    # It is approximate, so routing uses the published venue address.
    for event in events:
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
