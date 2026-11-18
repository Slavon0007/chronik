"""Build the permanent heritage catalogue from Wikidata and official visit pages."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CURATED = ROOT / "backend" / "heritage_curated.json"
OUTPUT = ROOT / "public" / "heritage.json"
COUNTRIES = {"Q183": "Deutschland", "Q40": "Österreich", "Q39": "Schweiz"}
THEME = re.compile(
    r"mittelalter|medieval|middle ages|moyen[ -]âge|medievale|ritter(?:museum|tum|rüstung)|"
    r"\b(?:burgenmuseum|burgmuseum|castle museum|hansemuseum)|wikinger|viking|"
    r"frühmittelalter|karolinger|ottonen|staufer|mittelalterlich",
    re.I,
)


def bindings(country, root_type):
    query = f"""
SELECT DISTINCT ?item ?coord ?itemLabel ?itemDescription ?website WHERE {{
  ?item wdt:P17 wd:{country}; wdt:P625 ?coord; wdt:P31/wdt:P279* wd:{root_type}.
  OPTIONAL {{ ?item wdt:P856 ?website. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en,fr,it". }}
}}
"""
    url = "https://query.wikidata.org/sparql?" + urlencode({"query": query, "format": "json"})
    request = Request(url, headers={
        "User-Agent": "Chronik/1.0 (https://github.com/Slavon0007/chronik)",
        "Accept": "application/sparql-results+json",
    })
    with urlopen(request, timeout=75) as response:
        return json.load(response)["results"]["bindings"]


def read_places(rows, country, kind):
    result = {}
    for row in rows:
        def read(name):
            return row.get(name, {}).get("value", "")

        identifier = read("item").rsplit("/", 1)[-1]
        point = re.fullmatch(r"Point\(([-\d.]+) ([-\d.]+)\)", read("coord"))
        title, description = read("itemLabel"), read("itemDescription")
        if not re.fullmatch(r"Q\d+", identifier) or not point or not title or title == identifier:
            continue
        if kind == "museum" and (
            not THEME.search(f"{title} {description}")
            or re.search(r"ehemaliges Museum|former museum", description, re.I)
            or identifier == "Q12130582"  # Conflicting name and coordinates.
        ):
            continue
        lng, lat = map(float, point.groups())
        if not (45.7 <= lat <= 55.2 and 5.7 <= lng <= 17.2):
            continue
        website = read("website")
        if website and (urlsplit(website).scheme not in {"https", "http"} or not urlsplit(website).netloc):
            website = ""
        entry = {
            "id": f"heritage-{identifier}", "title": title, "kind": kind,
            "country": country, "lat": round(lat, 6), "lng": round(lng, 6),
            "description": description or f"Historischer Ort in {country}.",
            "source": f"https://www.wikidata.org/wiki/{identifier}",
        }
        if website:
            entry["website"] = website
        if identifier not in result or "website" in entry:
            result[identifier] = entry
    return result


def main():
    places = {}
    for country_id, country in COUNTRIES.items():
        for kind, root_type in (("castle", "Q23413"), ("museum", "Q33506")):
            rows = bindings(country_id, root_type)
            if not rows:
                raise ValueError(f"Empty Wikidata result: {country}, {kind}")
            entries = read_places(rows, country, kind)
            if kind == "castle":
                places.update(entries)
            else:
                for identifier, entry in entries.items():
                    places.setdefault(identifier, entry)
            print(f"{country} {kind}: {len(entries)} of {len(rows)}", flush=True)

    for identifier, curated in json.loads(CURATED.read_text(encoding="utf-8")).items():
        places[identifier] = {**places.get(identifier, {}), "id": f"heritage-{identifier}", **curated}

    entries = sorted(places.values(), key=lambda place: (place["title"].casefold(), place["id"]))
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else OUTPUT
    temporary = target.with_suffix(".tmp")
    lines = [json.dumps(entry, ensure_ascii=False, separators=(",", ":")) for entry in entries]
    temporary.write_text('{"places":[\n' + ',\n'.join(lines) + '\n]}\n', encoding="utf-8")
    temporary.replace(target)
    print(f"Wrote {len(entries)} places to {target}")


if __name__ == "__main__":
    main()
