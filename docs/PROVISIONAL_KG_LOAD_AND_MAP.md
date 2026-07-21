# Provisional V3 KG → vector DB + map

Commands for loading the provisional full-book V3 load plan into private
Supabase/pgvector tables and exporting map GeoJSON. **Provisional ≠ promoted.**
Fact statements are paraphrases only; never ship verbatim book quotes.

## Prerequisites

- `talesofbudapest-backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
- Local stack: `cd infra/supabase-upstream/docker && docker compose -f docker-compose.yml -f ../../../infra/docker-compose.override.yml up -d`
- Migrations applied: `npm run db:migrate`

## Load + embed

```bash
# Dry-run (no writes)
npm run load:kg:plan -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json

# Commit into staging + draft/private canonical tables
npm run load:kg:plan -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json \
  --commit

# Embed (raise --limit above entity/claim count; cache is append-only JSONL)
npm run embed:kg -- --target all --commit --limit 50000 \
  --source-id jewish-budapest-private
# Cache file: ingest/corpus/restricted/experiments/kg-embeddings.cache.jsonl
```

Rebuild the provisional plan (no re-extract) if needed:

```bash
node talesofbudapest-backend/cli/transform-v3-to-kg.js \
  --source jewish-budapest \
  --include-experiment fullbook-v2.12,fullbook-v2.12-retry \
  --pages 1-579 \
  --output ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json
```

## Map GeoJSON

```bash
# Address mentions including experiment runs (ODbL attribution in file)
npm run export:historical:map -w talesofbudapest-backend -- \
  --include-experiment fullbook-v2.12,fullbook-v2.12-retry

# Location entities joined to address/gazetteer centers
npm run export:kg:locations:map -w talesofbudapest-backend -- \
  --input ../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json
```

Artifacts (under `ingest/corpus/restricted/extractions/`):

- `jewish-budapest.historical-map-provisional.geojson`
- `jewish-budapest.locations-map-provisional.geojson`
- `provisional-map-viewer.html`

## Open the map

Serve the extractions directory so the HTML can fetch sibling GeoJSON:

```bash
cd ingest/corpus/restricted/extractions
python3 -m http.server 8765
# open http://127.0.0.1:8765/provisional-map-viewer.html
```

Or open the HTML and use the file picker.
