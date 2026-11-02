// Converts the raw OHM Overpass dump (relations + ways + nodes) into dated country polygons.
// Usage: node --max-old-space-size=8192 scripts/convert-ohm.ts [in=data/raw/ohm-admin2.json] [out=data/ohm-admin2.geojson]
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'

const IN_FILE = process.argv[2] ?? 'data/raw/ohm-admin2.json'
const OUT_FILE = process.argv[3] ?? 'data/ohm-admin2.geojson'

type Position = [number, number]

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  members?: { type: string; ref: number; role: string }[]
  tags?: Record<string, string>
}

// OHM dates are YYYY, YYYY-MM or YYYY-MM-DD. Normalise to a sortable YYYY-MM-DD; anything else is skipped.
function normaliseDate(value: string | undefined): string | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value ?? '')
  if (!match) return undefined
  return `${match[1]}-${match[2] ?? '01'}-${match[3] ?? '01'}`
}

// Joins way node lists end to end into closed rings. Unclosable fragments (broken relations) are dropped.
function assembleRings(wayNodeLists: number[][]): number[][] {
  const remaining = wayNodeLists.filter((nodes) => nodes.length >= 2).map((nodes) => [...nodes])
  const rings: number[][] = []
  while (remaining.length > 0) {
    const ring = remaining.pop()!
    let extended = true
    while (ring[0] !== ring.at(-1) && extended) {
      extended = false
      for (let i = 0; i < remaining.length; i++) {
        const way = remaining[i]
        const end = ring.at(-1)
        if (way[0] === end) ring.push(...way.slice(1))
        else if (way.at(-1) === end) ring.push(...way.reverse().slice(1))
        else continue
        remaining.splice(i, 1)
        extended = true
        break
      }
    }
    if (ring.length >= 4 && ring[0] === ring.at(-1)) rings.push(ring)
  }
  return rings
}

function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const dump: { elements: OsmElement[] } = JSON.parse(await readFile(IN_FILE, 'utf8'))
const nodes = new Map<number, Position>()
const ways = new Map<number, number[]>()
const relations: OsmElement[] = []
for (const element of dump.elements) {
  // ~100 m precision is plenty for a world map that gets simplified anyway.
  if (element.type === 'node') nodes.set(element.id, [Math.round(element.lon! * 1e3) / 1e3, Math.round(element.lat! * 1e3) / 1e3])
  else if (element.type === 'way') ways.set(element.id, element.nodes!)
  else relations.push(element)
}

const features = []
const skipped = { noDates: 0, noGeometry: 0 }
for (const relation of relations) {
  const tags = relation.tags ?? {}
  const start = normaliseDate(tags.start_date)
  const end = tags.end_date === undefined ? '9999-12-31' : normaliseDate(tags.end_date)
  if (!start || !end) {
    skipped.noDates++
    continue
  }

  const byRole = (inner: boolean) =>
    (relation.members ?? [])
      .filter((m) => m.type === 'way' && (m.role === 'inner') === inner)
      .map((m) => ways.get(m.ref))
      .filter((w): w is number[] => w !== undefined)
  const toCoords = (ring: number[]) => ring.map((id) => nodes.get(id)).filter((p): p is Position => p !== undefined)

  const polygons: Position[][][] = assembleRings(byRole(false)).map((ring) => [toCoords(ring)])
  for (const inner of assembleRings(byRole(true)).map(toCoords)) {
    polygons.find(([outer]) => pointInRing(inner[0], outer))?.push(inner)
  }
  if (polygons.length === 0) {
    skipped.noGeometry++
    continue
  }

  features.push({
    type: 'Feature',
    properties: { Name: tags['name:en'] ?? tags.name ?? '', Start: start, End: end, OhmId: relation.id },
    geometry: { type: 'MultiPolygon', coordinates: polygons },
  })
}

// Written feature by feature: borders repeat across a country's dated versions, so the whole collection
// is too large for a single JSON string.
const out = createWriteStream(OUT_FILE)
out.write('{"type":"FeatureCollection","features":[\n')
features.forEach((feature, i) => out.write((i > 0 ? ',\n' : '') + JSON.stringify(feature)))
out.write('\n]}\n')
await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())))
console.log(`${features.length} dated countries written; skipped ${skipped.noDates} without usable dates, ` +
  `${skipped.noGeometry} without closed rings`)
