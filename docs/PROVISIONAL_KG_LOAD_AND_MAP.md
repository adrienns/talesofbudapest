# Provisional V3 KG → vector DB + map

Load the provisional full-book V3 plan into private Supabase/pgvector and export
map GeoJSON with **book mention quotes**. **Provisional ≠ promoted.**

Fact **statements** in the KG are paraphrases. Map/browser **Book text** lines
are OCR snippets (display may apply known HU place repairs; immutable
`pages.txt` is never rewritten).

## How locations are identified (short)

1. Book NLP + address parsing on pages **1–579** (index ≥580 excluded).
2. Match streets against the **local** Budapest gazetteer (no live OSM call per
   extract). See `ingest/gazetteer/README.md`.
3. Coordinates from local OSM-derived street/landmark/`addr:*` data (ODbL —
   attribute on display).
4. Optional: `geocode:kg` uses live Nominatim for staged KG names — **not** the
   provisional map path.

## Prerequisites

- `talesofbudapest-backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
- Local Supabase up + `npm run db:migrate`

## Load + embed

```bash
npm run load:kg:plan -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json

npm run load:kg:plan -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json \
  --commit

npm run embed:kg -- --target all --commit --limit 50000 \
  --source-id jewish-budapest-private
```

Rebuild plan (no re-extract):

```bash
node talesofbudapest-backend/cli/transform-v3-to-kg.js \
  --source jewish-budapest \
  --include-experiment fullbook-v2.12,fullbook-v2.12-retry \
  --pages 1-579 \
  --output ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json
```

## Map GeoJSON + mentions

```bash
npm run export:historical:map -w talesofbudapest-backend -- \
  --include-experiment fullbook-v2.12,fullbook-v2.12-retry
# → historical-map-provisional.geojson (all mention_samples by default; max page 579)

npm run export:kg:locations:map -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json
# → locations-map-provisional.geojson
```

Each address feature carries `mention_samples`: `{ page, surface, quote, … }`
(and `ocr_*` raw fields when display repair ran). Click a pin → side panel lists
**every** sample (not a tiny popup).

### Open the map (reliable)

Prefer the **standalone** HTML (GeoJSON embedded — works offline / `file://`):

```bash
open ingest/corpus/restricted/extractions/provisional-map-standalone.html
```

Or serve the extractions dir:

```bash
cd ingest/corpus/restricted/extractions
python3 -m http.server 8899 --bind 127.0.0.1
# http://127.0.0.1:8899/provisional-map-standalone.html
# http://127.0.0.1:8899/provisional-map-viewer.html  (fetches sibling GeoJSON)
```

Regenerate standalone after exporting GeoJSON (embed both address + location
collections into one HTML) — see the recipe used in-session, or copy from
`provisional-map-viewer.html` + inject `window.EMBEDDED_DATASETS`.

## Hungarian OCR display repair

Known place OCR errors (`Dohdny`→`Dohány`, `Kirdly`→`Király`, …) live in
`talesofbudapest-backend/config/hungarian-ocr-place-confusions.json` and are
applied on **unique gazetteer hit** only (`lib/hungarianOcrGazetteer.js`).

- Measure / promote: `npm run measure:hungarian-ocr -w talesofbudapest-backend`
- Design: `docs/superpowers/specs/2026-07-21-hungarian-ocr-gazetteer-design.md`

Once a confusion is confirmed, rebuild map + facts browser so **display**
surfaces pick it up everywhere. Do not treat this as rewriting historical
evidence offsets.

## Artifacts (gitignored under `extractions/`)

| File | Role |
|------|------|
| `jewish-budapest.kg-load-plan-provisional.json` | Provisional KG plan |
| `jewish-budapest.historical-map-provisional.geojson` | Address pins + book quotes |
| `jewish-budapest.locations-map-provisional.geojson` | Location entities with coords |
| `provisional-map-viewer.html` | Leaflet viewer (fetch GeoJSON) |
| `provisional-map-standalone.html` | Same viewer with data embedded |
| `historical-facts-browser-v3-fullbook.html` | Facts/entities browser |

## Licensing note

Street/landmark geometry © OpenStreetMap contributors (**ODbL**). Keep
attribution on any public map surface. Restricted book text stays private /
red-license — never ship verbatim quotes to public clients.
