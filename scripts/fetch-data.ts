// Downloads the pinned source datasets. Run rarely (OHM is worth refreshing every month or so); outputs are gitignored
// except the label fonts, which are committed under client/public/fonts.
// Usage: node scripts/fetch-data.ts [rawDir=data/raw]
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const RAW_DIR = process.argv[2] ?? 'data/raw'
const FONT_DIR = 'client/public/fonts/Noto Sans Regular'
const FONT_ASSETS = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f713baecad011301ff7a69acc39bcc2ae7/fonts'
const FONT_RANGES = 33 // 0-8447: Latin, Greek, Cyrillic, Arabic, Indic and general punctuation. CJK is drawn from local fonts.
const OHM_OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter'

const SOURCES = [
  {
    // Cliopatria v0.2.1, CC BY 4.0: https://github.com/Seshat-Global-History-Databank/cliopatria
    file: 'cliopatria.geojson.zip',
    url: 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/v0.2.1/cliopatria.geojson.zip',
  },
  {
    // Natural Earth 1:50m land, public domain: https://www.naturalearthdata.com/
    file: 'ne_50m_land.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson',
  },
]

// OpenHistoricalMap country boundaries valid at any point since 1800, CC0. One bulk query (~440 MB) with each way and
// node listed once, rather than per-date `out geom` queries that repeat shared borders (~150 MB per date).
const OHM_QUERY =
  '[out:json][timeout:900][maxsize:4000000000];' +
  'rel["boundary"="administrative"]["admin_level"="2"](if: !is_tag("end_date") || t["end_date"] >= "1800");' +
  'out body;>;out skel qt;'

async function download(url: string, path: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(path, bytes)
  return bytes.length
}

await mkdir(RAW_DIR, { recursive: true })
for (const { file, url } of SOURCES) {
  const size = await download(url, join(RAW_DIR, file))
  console.log(`${file}: ${(size / 1e6).toFixed(1)} MB`)
}

await mkdir(FONT_DIR, { recursive: true })
await download(`${FONT_ASSETS}/OFL.txt`, join(FONT_DIR, 'OFL.txt'))
for (let i = 0; i < FONT_RANGES; i++) {
  const range = `${i * 256}-${i * 256 + 255}`
  await download(`${FONT_ASSETS}/Noto%20Sans%20Regular/${range}.pbf`, join(FONT_DIR, `${range}.pbf`))
}
console.log(`fonts: ${FONT_RANGES} glyph ranges`)

const ohmSize = await download(OHM_OVERPASS, join(RAW_DIR, 'ohm-admin2.json'), {
  method: 'POST',
  body: new URLSearchParams({ data: OHM_QUERY }),
})
console.log(`ohm-admin2.json: ${(ohmSize / 1e6).toFixed(1)} MB`)
