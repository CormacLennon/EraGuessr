# EraGuessr

A daily history map game: every day, everyone gets the same 5 world maps from somewhere between 1 AD and 2024, and has one guess each at when the map is from.

It's a static site hosted on GitHub Pages; there is no server.

- `client/` Vite + TypeScript + MapLibre. Loads `puzzles/<today in UTC>.json`, scores guesses in the browser and keeps the player's progress in `localStorage` (no cookies).
- `shared/` scoring and puzzle types used by both the client and the generator.
- `scripts/` data pipeline that turns the source datasets into daily puzzle files.
- `data/source/` the simplified, gzipped border data the generator reads (committed, ~14 MB).
- `.github/workflows/deploy.yml` builds the site and publishes it with the puzzles for yesterday, today and tomorrow, daily just after midnight UTC and on every push to `master`.
- `docs/data-sources.md` survey of historical border datasets and their licences.

Each puzzle file includes its answers so the browser can score guesses. Anyone determined can read them; only puzzles up to tomorrow are ever published.

## How the maps are built

- **Before 1825:** Cliopatria only, year precision. Umbrella polities such as the Holy Roman Empire are drawn as dashed outlines around their member states.
- **From 1825:** OpenHistoricalMap countries, with Cliopatria filling areas OHM doesn't cover. From 1886 rounds are scored on the month too, since OHM dates go down to the day. Maps from 1856 also ask for a month but score on the year only, so the month question doesn't give the era away.
- Every day has at least one map from 1886 or later, at a random position.
- Every polity is labelled with its name. Labels use self-hosted Noto Sans glyphs in `client/public/fonts` (SIL OFL).

## Run locally

```bash
npm install
npm run puzzles:generate    # writes client/public/puzzles/<day>.json for the next 30 UTC days (gitignored)
npm run dev                 # http://localhost:5173
npm test                    # scoring rules, plus checks on every generated puzzle file
```

In dev only, `?day=YYYY-MM-DD` plays another day's puzzle and `?reset` clears its saved progress first, e.g. `http://localhost:5173/?day=2026-11-27&reset`. Production builds ignore both.

## Deploying

In the GitHub repository, go to Settings → Pages and set the source to **GitHub Actions**. The workflow then deploys on every push to `master`, daily at 00:05 UTC, and when run by hand from the Actions tab. For a custom domain, add a `CNAME` file containing the domain to `client/public/`.

## Refreshing the source data

Only needed to pick up new Cliopatria or OpenHistoricalMap edits. The steps need a lot of memory (the npm scripts raise Node's heap to 8–12 GB) and take a few minutes.

```bash
npm run data:fetch          # Cliopatria, Natural Earth land, label fonts, and an OHM Overpass bulk export (~490 MB) into data/raw
npm run data:convert        # assembles the OHM dump into dated country polygons (data/ohm-admin2.geojson, ~1.2 GB)
npm run data:prepare        # simplifies everything into data/source/*.geojson.gz and client/public/land.geojson
```

Then commit the updated `data/source` files.

## Data and attribution

- Borders: [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank), CC BY 4.0, simplified.
- Borders since 1825: [OpenHistoricalMap](https://www.openhistoricalmap.org/), CC0.
- Land: [Natural Earth](https://www.naturalearthdata.com/), public domain.
- Label font: Noto Sans glyphs from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets), SIL Open Font License.
