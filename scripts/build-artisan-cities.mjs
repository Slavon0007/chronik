import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function buildArtisanCities(output) {
  const groups = new Map()
  const fold = (value) => value.toLocaleLowerCase('de').normalize('NFC')
  for (const country of ['DE', 'AT', 'CH']) {
    const data = await readFile(join('backend/data', country.toLowerCase() + '-postcodes.tsv'), 'utf8')
    for (const line of data.split(/\r?\n/)) {
      if (!line) continue
      const [postcode, name, region, lat, lng] = line.split('\t')
      const label = name.trim()
      const key = [country, fold(region), fold(label)].join('|')
      if (!groups.has(key)) {
        const id = createHash('sha256').update(key).digest('hex').slice(0, 16)
        groups.set(key, { id, name: label, region, country, postcodes: new Set(), lat: 0, lng: 0, count: 0 })
      }
      const entry = groups.get(key)
      entry.postcodes.add(postcode)
      entry.lat += Number(lat)
      entry.lng += Number(lng)
      entry.count += 1
    }
  }

  // Reuse the existing city centres where available; postal centroids are estimates.
  const known = JSON.parse(await readFile('backend/data/cities.json', 'utf8'))
  const knownByName = new Map(known.map((city) => [fold(city.name), city]))
  const buckets = new Map()
  const search = []
  for (const entry of groups.values()) {
    const city = entry.country === 'DE' ? knownByName.get(fold(entry.name)) : undefined
    const lat = city?.lat ?? Number((entry.lat / entry.count).toFixed(5))
    const lng = city?.lng ?? Number((entry.lng / entry.count).toFixed(5))
    const bucket = entry.id.slice(0, 2)
    if (!buckets.has(bucket)) buckets.set(bucket, {})
    buckets.get(bucket)[entry.id] = [entry.name, entry.country, lat, lng]
    search.push([entry.id, entry.name, entry.region, entry.country, [...entry.postcodes], lat, lng])
  }
  search.sort((a, b) => a[1].localeCompare(b[1], 'de'))
  const dir = join(output, 'artisan-cities')
  await mkdir(dir, { recursive: true })
  await Promise.all([
    writeFile(join(output, 'artisan-cities.json'), JSON.stringify(search)),
    ...[...buckets].map(([bucket, cities]) => writeFile(join(dir, bucket + '.json'), JSON.stringify(cities))),
  ])
}
