# Budapest places gazetteer

Local place-name + coordinate database for **book address matching**, **map
pins**, and **Hungarian OCR identity/display repair**.

**Never rewrite immutable book OCR / `pages.txt` from these files.** They feed
matching, geocoding, and display canonicalize only. Raw evidence offsets stay
intact; repaired spellings are presentation-layer (`surface` / `quote` with
optional `ocr_*` raw fields).

## Local vs live API

| When | Network? | What happens |
|------|----------|----------------|
| **Extract / map / OCR repair (normal path)** | **No** | Reads these files from disk |
| **Rebuild gazetteer** (`npm run build:places-gazetteer`) | **Yes** | Overpass API → OpenStreetMap download, then rewrite local files |
| **Optional KG geocode** (`npm run geocode:kg`) | **Yes** | Nominatim — separate path for staged KG names, **not** what powers the provisional map |

So: day-to-day address identity is **offline/local**. Live OSM calls are for
**refreshing** the gazetteer (or the optional Nominatim tool).

## What is OSM / ODbL?

- **OSM** = [OpenStreetMap](https://www.openstreetmap.org/) — community map data
  (streets, landmarks, `addr:*` points).
- **ODbL** = Open Database License — OSM’s data license. Use is allowed if you
  **attribute** © OpenStreetMap contributors and respect **share-alike** for
  public derived databases. Attribution must appear wherever geometry is shown
  (GeoJSON `attribution`, map viewer footer).

Book quotes and historical facts are **not** OSM data; they come from the
restricted monograph corpus.

## Files

| File | Contents |
|------|----------|
| `budapest-streets.json` | OSM highway names + centroids + historical renames (~9k) |
| `budapest-landmarks.json` | Named tourism/historic/amenity/building + Budapest100 / műemlék / Wikidata seeds |
| `budapest-addresses.jsonl.gz` | OSM `addr:street` + `addr:housenumber` points (large — keep gzipped) |
| `budapest-places-index.json` | Folded key/token → unique target index for OCR unique-hit repair |

## How a book place becomes a map pin

1. NLP tags place/building mentions; address regex finds street(+number) spans.
2. Match against **local** street gazetteer (exact / accent-fold / historical /
   careful fuzzy).
3. Attach coordinates from (in order): fact-joined address center → local
   `addr:*` point → street centroid → landmark center.
4. Optional HU OCR display repair (`Dohdny`→`Dohány`) via unique gazetteer hit
   (`lib/hungarianOcrGazetteer.js` + `config/hungarian-ocr-place-confusions.json`).
5. Index pages (≥580 for Jewish Budapest) are excluded from provisional map/
   browser content.

## Build / refresh (live Overpass)

```bash
cd talesofbudapest-backend
npm run build:gazetteer              # streets only
npm run build:places-gazetteer       # streets + landmarks + addresses + index
```

Resume after rate-limit:

```bash
node cli/build-budapest-places-gazetteer.js --skip-streets --skip-landmarks
bash cli/resume-budapest-places-gazetteer.sh
```

## Load path (code)

```js
import {
  loadPlacesIndex,
  loadAddresses,
  loadStreetGazetteer,
} from '../lib/budapestPlacesGazetteer.js';

const placesIndex = await loadPlacesIndex();     // OCR unique-hit repair
const streets = await loadStreetGazetteer();     // historicalAddresses.matchStreet
const addresses = await loadAddresses();         // streams .gz when present
```

Extract `--gazetteer` defaults to `budapest-streets.json`; subject-memory also
loads `budapest-places-index.json` when present.

## Related docs

- Provisional KG + map: `docs/PROVISIONAL_KG_LOAD_AND_MAP.md`
- HU OCR design: `docs/superpowers/specs/2026-07-21-hungarian-ocr-gazetteer-design.md`
- Scripts: `docs/scripts.md`
