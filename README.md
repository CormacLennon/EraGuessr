# EraGuessr

A daily history map game: every day, everyone gets the same 5 world maps from somewhere between 1 AD and 2024, and has one guess each at when the map is from.

- `client/` Vite + TypeScript + MapLibre. Keeps the player's progress in `localStorage` (no cookies).
- `server/` Node HTTP API, no framework, run directly as TypeScript (Node 24 type stripping). Stateless: serves the day's maps without answers and scores a guess.
- `scripts/` data pipeline that turns the source datasets into daily puzzle files.
- `docs/data-sources.md` survey of historical border datasets and their licences.

## How the maps are built

- **Before 1825:** Cliopatria only, year precision. Umbrella polities such as the Holy Roman Empire are drawn as dashed outlines around their member states.
- **From 1825:** OpenHistoricalMap countries, with Cliopatria filling areas OHM doesn't cover. From 1886 rounds ask for the month too, since OHM dates go down to the day.
- Every polity is labelled with its name. Labels use self-hosted Noto Sans glyphs in `client/public/fonts` (SIL OFL).

## Setup

The data steps need a lot of memory (the npm scripts raise Node's heap to 8–12 GB) and take a few minutes. OHM changes slowly, so re-fetching it every month or so is plenty.

```bash
npm install
npm run data:fetch          # Cliopatria, Natural Earth land, label fonts, and an OHM Overpass bulk export (~490 MB) into data/raw
npm run data:convert        # assembles the OHM dump into dated country polygons (data/ohm-admin2.geojson, ~1.2 GB)
npm run data:prepare        # simplifies everything into data/*.simplified.geojson and client/public/land.geojson
npm run puzzles:generate    # writes data/puzzles/<day>.json for the next 30 UTC days (contains answers, gitignored)
```

## Run

```bash
npm run dev:server   # API on http://localhost:8787
npm run dev:client   # game on http://localhost:5173, proxies /api to the server
```

## API

- `GET /api/daily` today's (UTC) maps: `{ day, minYear, maxYear, rounds: [{ precision, map: { polities, groups, labels } }] }`. Cached for 5 minutes.
- `POST /api/daily/:day/:round/guess` with `{ "year": 1066 }` (plus `"month"` on month-precision rounds) returns `{ direction, off, points, answer }`. Past days are allowed; future days are not.

## Data and attribution

- Borders: [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank), CC BY 4.0, simplified.
- Borders since 1825: [OpenHistoricalMap](https://www.openhistoricalmap.org/), CC0.
- Land: [Natural Earth](https://www.naturalearthdata.com/), public domain.
- Label font: Noto Sans glyphs from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets), SIL Open Font License.
