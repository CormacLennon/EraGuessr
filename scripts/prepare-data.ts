// Simplifies the raw datasets once (run convert-ohm first):
//   data/source/cliopatria.simplified.geojson.gz  polities from 1 AD on (input to generate-puzzles)
//   data/source/ohm.simplified.geojson.gz         OHM dated countries, simplified to ~12 km since its coastlines are very detailed
// The two sources are committed, so the daily build only needs this repository.
//   client/public/land.geojson          land underlay so unclaimed territory doesn't look like ocean
// Needs a large heap for the OHM file: node --max-old-space-size=12000 scripts/prepare-data.ts [rawDir] [simplify]
import { readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import mapshaper from 'mapshaper'

const RAW_DIR = process.argv[2] ?? 'data/raw'
const SIMPLIFY = process.argv[3] ?? '4%'

await mapshaper.runCommands(
  `-i ${RAW_DIR}/cliopatria.geojson.zip ` +
    `-filter 'ToYear >= 1' ` +
    `-filter-fields Name,FromYear,ToYear,MemberOf ` +
    `-simplify ${SIMPLIFY} keep-shapes ` +
    `-o data/cliopatria.simplified.geojson precision=0.001 force`,
)

await mapshaper.runCommands(
  `-i data/ohm-admin2.geojson ` +
    `-simplify interval=12000 keep-shapes ` +
    `-o data/ohm.simplified.geojson precision=0.001 force`,
)

await mapshaper.runCommands(
  `-i ${RAW_DIR}/ne_50m_land.geojson ` +
    `-filter-fields '' ` +
    `-simplify 30% keep-shapes ` +
    `-o client/public/land.geojson precision=0.01 force`,
)

for (const name of ['cliopatria', 'ohm']) {
  const plain = `data/${name}.simplified.geojson`
  await writeFile(`data/source/${name}.simplified.geojson.gz`, gzipSync(await readFile(plain), { level: 9 }))
  await rm(plain)
}
