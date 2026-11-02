// Generates each day's set of maps (the same for every player).
//   Before OHM_FROM_YEAR: Cliopatria only, year precision.
//   From OHM_FROM_YEAR:   OpenHistoricalMap countries, with Cliopatria filling areas OHM doesn't cover.
//                         Month precision from MONTH_PRECISION_FROM_YEAR, since OHM dates go down to the day.
// Usage: node --max-old-space-size=8192 scripts/generate-puzzles.ts [startDay=today UTC] [days=30]
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import mapshaper from 'mapshaper'
import { precisionFor, type MapDate } from '../server/src/era.ts'
import { ROUNDS_PER_DAY, type DailyPuzzle, type FeatureCollection, type Round, type RoundMap } from '../server/src/puzzle.ts'

const CLIOPATRIA_FILE = 'data/cliopatria.simplified.geojson'
const OHM_FILE = 'data/ohm.simplified.geojson'
const OUT_DIR = 'data/puzzles'
const MIN_YEAR = 1
const MAX_YEAR = 2024 // Cliopatria ends in 2024
const OHM_FROM_YEAR = 1825
const MIN_POLITIES = 15
const COLOURS = ['#c9a66b', '#a3b18a', '#d4a5a5', '#9fb4c7', '#e0c58f', '#b5a1c9', '#c7b199', '#8fb8a8']

const startDay = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const days = Number(process.argv[3] ?? 30)
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !Number.isInteger(days) || days < 1) {
  throw new Error('Usage: generate-puzzles.ts [YYYY-MM-DD] [days]')
}

interface Feature<P> {
  type: 'Feature'
  properties: P
  geometry: unknown
}
type CliopatriaFeature = Feature<{ Name: string; FromYear: number; ToYear: number; MemberOf: string }>
type OhmFeature = Feature<{ Name: string; Start: string; End: string }>

const cliopatria: CliopatriaFeature[] = JSON.parse(await readFile(CLIOPATRIA_FILE, 'utf8')).features
const ohm: OhmFeature[] = JSON.parse(await readFile(OHM_FILE, 'utf8')).features

// Deterministic per day, so regenerating gives the same puzzles.
function seededInt(day: string, attempt: number, salt: string, modulo: number): number {
  return createHash('sha256').update(`${day}#${attempt}#${salt}`).digest().readUInt32BE(0) % modulo
}

const collection = (features: Feature<object>[]): FeatureCollection => ({ type: "FeatureCollection", features: features as FeatureCollection["features"] })
const named = <P extends { Name: string }>(f: Feature<P>, name = f.properties.Name) =>
  ({ type: 'Feature' as const, properties: { name }, geometry: f.geometry })

// Cliopatria marks umbrella entities with parentheses, e.g. "(Holy Roman Empire)" around its member states.
const isGroup = (f: CliopatriaFeature) => f.properties.Name.startsWith('(')

async function buildMap(date: MapDate): Promise<RoundMap> {
  const year = date.year
  const iso = `${year}-${String(date.month ?? 6).padStart(2, '0')}-15`
  const clio = cliopatria.filter((f) => f.properties.FromYear <= year && year <= f.properties.ToYear)
  const useOhm = year >= OHM_FROM_YEAR
  const recent = useOhm ? ohm.filter((f) => f.properties.Start <= iso && iso < f.properties.End) : []

  // Groups add outlines on top of their members. Groups whose only member is themselves (an empire plus
  // colonies, say) are skipped, and so is everything Cliopatria-only once OHM is drawing the countries.
  const memberGroups = new Set(clio.map((f) => f.properties.MemberOf).filter(Boolean))
  const groups = useOhm ? [] : clio.filter((f) => isGroup(f) && memberGroups.has(f.properties.Name))
  const polities = clio.filter((f) => !isGroup(f))

  const ohmLayer = collection(recent.map((f) => named(f)))
  let clioLayer: FeatureCollection = collection(polities.map((f) => named(f)))
  if (recent.length > 0 && clioLayer.features.length > 0) {
    // OHM wins where both have a border; Cliopatria fills the rest. Erasing leaves slivers along borders where
    // the two sources disagree slightly, so pieces under ~5,000 km² are dropped.
    // Split into steps because mapshaper drops a layer that a command empties, failing the next command.
    const erased = await mapshaper.applyCommands(
      '-i clio.json ohm.json combine-files -erase target=clio source=ohm -explode target=clio ' +
        "-each 'area = this.area' target=clio -o format=geojson target=clio",
      { 'clio.json': clioLayer, 'ohm.json': ohmLayer },
    )
    const pieces: FeatureCollection = erased['clio.json'] ? JSON.parse(String(erased['clio.json'])) : collection([])
    pieces.features = pieces.features.filter((f) => Number(f.properties.area) > 5e9)
    clioLayer = pieces
    if (pieces.features.length > 0) {
      const dissolved = await mapshaper.applyCommands(
        '-i clio.json -dissolve fields=name -o format=geojson', { 'clio.json': pieces })
      clioLayer = JSON.parse(String(dissolved['clio.json']))
    }
  }

  // Empty layers have no geometry type and make mapshaper commands fail, so only load what's there.
  const fills = [
    ...(clioLayer.features.length > 0 ? ['clio'] : []),
    ...(ohmLayer.features.length > 0 ? ['ohm'] : []),
  ]
  const hasGroups = groups.length > 0
  const input: Record<string, unknown> = {
    'clio.json': clioLayer,
    'ohm.json': ohmLayer,
    'groups.json': collection(groups.map((f) => named(f, f.properties.Name.slice(1, -1)))),
  }
  const commands = [
    `-i ${[...fills, ...(hasGroups ? ['groups'] : [])].map((l) => `${l}.json`).join(' ')} combine-files`,
    fills.length > 1 ? `-merge-layers target=${fills.join(',')} name=polities force` : `-rename-layers polities target=${fills[0]}`,
    '-filter remove-empty target=polities',
    `-classify non-adjacent colors=${COLOURS.join(',')} save-as=fill target=polities`,
    // Rank labels so MapLibre keeps the biggest ones when they collide.
    `-each 'rank = -Math.round(this.area / 1e6)' target=${hasGroups ? 'polities,groups' : 'polities'}`,
    "-points inner + name=polity_labels target=polities -each 'kind=\"polity\"' target=polity_labels",
    ...(hasGroups
      ? [
          "-points inner + name=group_labels target=groups -each 'kind=\"group\"' target=group_labels",
          '-merge-layers target=polity_labels,group_labels name=labels force',
          '-filter-fields name target=groups',
        ]
      : ['-rename-layers labels target=polity_labels']),
    '-filter-fields name,fill target=polities',
    `-o format=geojson precision=0.001 target=${hasGroups ? 'polities,groups,labels' : 'polities,labels'}`,
  ]
  const output = await mapshaper.applyCommands(commands.join(' '), input)
  const read = (name: string): FeatureCollection =>
    output[`${name}.json`] ? JSON.parse(String(output[`${name}.json`])) : { type: 'FeatureCollection', features: [] }
  return { polities: read('polities'), groups: read('groups'), labels: read('labels') }
}

await mkdir(OUT_DIR, { recursive: true })
for (let i = 0; i < days; i++) {
  const date = new Date(`${startDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + i)
  const day = date.toISOString().slice(0, 10)

  const rounds: Round[] = []
  const used = new Set<number>()
  for (let attempt = 0; rounds.length < ROUNDS_PER_DAY; attempt++) {
    const year = MIN_YEAR + seededInt(day, attempt, 'year', MAX_YEAR - MIN_YEAR + 1)
    if (used.has(year)) continue
    const precision = precisionFor(year, year >= OHM_FROM_YEAR)
    const answer: MapDate = precision === 'month' ? { year, month: 1 + seededInt(day, attempt, 'month', 12) } : { year }
    const map = await buildMap(answer)
    if (map.polities.features.length < MIN_POLITIES) continue
    used.add(year)
    rounds.push({ precision, answer, map })
  }

  const puzzle: DailyPuzzle = {
    day,
    sources: ['cliopatria', 'openhistoricalmap'],
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    rounds,
  }
  const json = JSON.stringify(puzzle)
  await writeFile(`${OUT_DIR}/${day}.json`, json)
  const kb = (layer: FeatureCollection) => Math.round(JSON.stringify(layer).length / 1e3)
  const summary = rounds.map((r) =>
    `${r.answer.month ? `${r.answer.year}-${r.answer.month}` : r.answer.year} ` +
    `[${r.map.polities.features.length} polities ${kb(r.map.polities)}kB, ${r.map.groups.features.length} groups ${kb(r.map.groups)}kB]`)
  console.log(`${day}: ${summary.join(', ')} (${(json.length / 1e6).toFixed(2)} MB)`)
}
