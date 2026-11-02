# Historical border data sources

Surveyed 2026-11-02. Items marked "unverified" were not confirmed against the source.

| Source | Time model | Level / coverage | License | URL |
|---|---|---|---|---|
| Cliopatria (Seshat) | 3400 BCE–2024, per-polygon FromYear/ToYear (year precision) | ~1,600 polities, world; no admin-1 | CC BY 4.0 | https://github.com/Seshat-Global-History-Databank/cliopatria |
| aourednik/historical-basemaps | Fixed snapshot years (1, 100…1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010) | Countries, world | GPL-3.0 | https://github.com/aourednik/historical-basemaps |
| CShapes 2.0 | 1886–2019 (Europe from 1816), day-level start/end; skips changes <10,000 km² | Countries + dependencies, world | CC BY-NC-SA 4.0 | https://icr.ethz.ch/data/cshapes/ |
| OpenHistoricalMap | Any date, YYYY / YYYY-MM / YYYY-MM-DD where entered | All admin levels, crowd-sourced, uneven | CC0 (some features tagged CC BY / BY-SA) | https://www.openhistoricalmap.org/copyright |
| Natural Earth | Present day | Admin-0 + admin-1 | Public domain | https://www.naturalearthdata.com/ |
| Thenmap | World 1945+, US states 1865+, Nordic/Swiss municipalities | Countries + some sub-national | Data license unverified | https://www.thenmap.net/ |
| HistoGIS | ~1815–1919, day-level | Central Europe incl. sub-national | CC BY 4.0 (unverified) | https://github.com/acdh-oeaw/histogis-data |
| Newberry AHCB | Day-level | US states and counties | CC BY-NC-SA; CC0 copy via LoC/Zenodo, also in OHM | https://zenodo.org/records/7080770 |
| Euratlas, GeaCron | Snapshots | Europe / world | Commercial | — |
| CHGIS, IPUMS NHGIS | Snapshots / series | China / US | No redistribution | — |

## Recommended stack (license-safe)

- 1 AD → ~1886: Cliopatria (any year, year precision).
- ~1886 → today: OHM admin_level 2 (CC0, filter out BY-SA features), gaps patched from Cliopatria. CShapes is cleaner but non-commercial + share-alike.
- Present day: Natural Earth admin-0 / admin-1.
- Sub-national: OHM where it exists, HistoGIS for Habsburg lands 1815–1918.

## Gaps

- Sub-national units before ~1800 are essentially missing from open data.
- No open world dataset gives month precision before ~1886.
