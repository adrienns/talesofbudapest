# Budapest places gazetteer

Derived place-name database for OCR identity repair and address matching.
**Never rewrite immutable book OCR** from these files — they feed identity /
display canonicalize and geocoding only.

## Files

| File | Contents | Size note |
|------|----------|-----------|
| `budapest-streets.json` | OSM highway names + centroids + historical renames | ~2MB |
| `budapest-landmarks.json` | OSM named tourism/historic/amenity/building + Budapest100 / műemlék / Wikidata seeds | medium |
| `budapest-addresses.jsonl` / `.gz` | OSM `addr:street` + `addr:housenumber` points with lat/lon | **large** — prefer `.gz` |
| `budapest-places-index.json` | Compact folded key/token → unique target index for OCR repair | medium |

## Licensing

- Street / landmark OSM tags / address points: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Keep attribution wherever geodata is displayed; share-alike applies to the database.
- Seed merges retain per-row `sources` (Budapest100, műemlékem, Wikidata).

## Build

```bash
cd talesofbudapest-backend
npm run build:gazetteer              # streets only (existing)
npm run build:places-gazetteer       # streets refresh + landmarks + addresses + places index
```

Flags for resume after Overpass rate-limit:

```bash
node cli/build-budapest-places-gazetteer.js --skip-streets --skip-landmarks
node cli/build-budapest-places-gazetteer.js --skip-streets --skip-addresses
```

See `budapest-addresses.RESUME.md` if the address layer failed mid-run.

## Load path (code)

```js
import {
  loadPlacesIndex,
  loadAddresses,
  loadStreetGazetteer,
  STREETS_PATH,
} from '../lib/budapestPlacesGazetteer.js';

const placesIndex = await loadPlacesIndex();     // OCR unique-hit repair
const streets = await loadStreetGazetteer();     // historicalAddresses.matchStreet
const addresses = await loadAddresses();         // optional full address points (streams .gz)
```

Extract defaults: `--gazetteer` still points at `budapest-streets.json` for the
address fact layer; subject-memory also loads `budapest-places-index.json` when
present.
