# Scripts reference

All npm commands from the monorepo root and workspaces.

## Root (`package.json`)

| Command | Workspace | Description |
|---------|-----------|-------------|
| `npm run dev:frontend` | frontend | Start Next.js dev server (`localhost:3000`) |
| `npm run dev:admin` | admin | Start the private admin console (`localhost:3100`) |
| `npm run build:admin` | admin | Create a production admin build |
| `npm run start:admin` | admin | Serve the production admin build on port `3100` |
| `npm run test:admin` | admin | Run admin validation and safe-response tests |
| `npm run typecheck:admin` | admin | Type-check the admin workspace without emitting files |
| `npm run dev:backend` | backend | Nodemon on seed entry (dev watcher) |
| `npm run seed` | backend | Upsert 4 iconic landmarks |
| `npm run generate:story` | backend | Demo LLM script for Parliament |
| `npm run generate:audio` | backend | Generate TTS for one landmark |
| `npm run generate:audio:all` | backend | Generate TTS for all landmarks |
| `npm run db:migrate` | backend | Apply SQL migrations |
| `npm run setup` | backend | migrate → seed → generate all audio |
| `npm run extract:historical:v3` | backend | V3 restricted-book extraction (add `--preflight-only` for a free local dry run) |
| `npm run eval:historical:v3` | backend | Evaluate V3 against held-out gold; fails closed until human gold exists |
| `npm run eval:historical:v3:dev` | backend | Development eval (`--split development --allow-incomplete --report-only`) |
| `npm run eval:historical:v3:test` | backend | Frozen test-split eval (`--split test --allow-incomplete --report-only`) |
| `npm run eval:historical:v3:probe` | backend | Frozen probe-split eval on newly extracted pages |
| `npm run rescore:historical:v3` | backend | Free structural re-score + pronoun grounding (no paid re-extract) |
| `npm run gold:seed` | backend | Seed draft-auto gold annotations from a V3 run |
| `npm run gold:merge` | backend | Merge annotation JSON into the V3 gold fixture |
| `npm run gold:rebind` | backend | Rebind gold clause IDs after layout changes |
| `npm run gold:dedupe` | backend | Drop duplicate gold items that share clause_ids |
| `npm run gold:seed-test` | backend | Freeze test split gold (pages 97/140/160/180) |
| `npm run gold:seed-probe` | backend | Freeze probe split gold (pages 55/65/95/115) |
| `npm run build:historical:v3-browser` | backend | Build the self-contained V3 facts browser HTML |
| `npm run build:restricted:browser` | backend | Restricted entities HTML browser (requires `*.entities.content.speakers.jsonl` unless `--input`) |
| `npm run annotate:restricted:speakers` | backend | Offline fail-closed quote-speaker post-pass → `*.entities.content.speakers.jsonl` |
| `npm run report:restricted:speakers` | backend | Confession stats for speaker + quote_page attribution |
| `npm run report:restricted:speaker-precision` | backend | Confidence tiers + review queue for roster/page-name speaker fallbacks |
| `npm run report:restricted:muzny-candidates` | backend | $0 diagnostic: Muzny trigram speaker candidates on direct_speech/no_frame quotes (CSV only) |
| `npm run test:restricted:speakers` | backend | Unit + artifact regression tests for quote-speaker attribution |
| `npm run export:restricted:map` | backend | Restricted locations GeoJSON map (requires speakers artifact unless `--input`) |
| `npm run build:gazetteer` | backend | Refresh local Budapest street gazetteer via OSM Overpass (ODbL); day-to-day matching is offline |
| `npm run build:places-gazetteer` | backend | Refresh streets + landmarks + address points + OCR places index (live Overpass) |
| `npm run measure:hungarian-ocr` | backend | HU OCR place-damage report; promotes unique-hit confusions into config |
| `npm run export:historical:map` | backend | Address facts → GeoJSON with book mention quotes (local gazetteer coords) |
| `npm run export:kg:locations:map` | backend | KG location entities → GeoJSON (gazetteer join) |
| `npm run load:kg:plan` | backend | Load kg-load-plan JSON into private staging/canonical KG tables |
| `npm run hungaricana:lookup` | backend | Print Hungaricana search URLs for human verification and record confirmed facts |
| `npm run scrape:budapest100` | ingest | Scrape budapest100.hu → JSON |
| `npm run ingest:wikipedia` | ingest | Fetch Wikidata landmarks → JSON |
| `npm run ingest:muemlekem` | ingest | Scrape muemlekem.hu → JSON |
| `npm run fetch:mek` | ingest | Download the allowlisted MEK/OSZK Budapest PDFs and write a manifest |
| `npm run poll:open-wikidata` | ingest | Poll a bounded CC0 Budapest discovery batch from Wikidata |
| `npm run poll:open-commons` | ingest | Poll open-licensed media metadata from a Commons category |
| `npm run load:landmarks` | ingest | Merge JSON sources → Postgres (Docker) |
| `npm run fix:service-key` | infra | Fix service role key mismatch |

## Backend (`talesofbudapest-backend/package.json`)

| Command | File | Description |
|---------|------|-------------|
| `npm run dev` | `index.js` | Nodemon dev watcher |
| `npm run seed` | `index.js` | Seed 4 landmarks |
| `npm run generate:story` | `generateStory.js` | One demo script |
| `npm run generate:audio` | `generateAudio.js` | TTS for landmark(s) |
| `npm run generate:audio:all` | `generateAudio.js --all` | TTS for all |
| `npm run db:migrate` | `migrate.js` | Run migrations |
| `npm run setup` | `setup.js` | Full initial setup |
| `npm run enrich:history` | `cli/enrich-history.js` | Batch historian narratives |
| `npm run extract:mek` | `cli/extract-mek.js` | Extract entities from the public-domain MEK 1939 Budapest lexicon (volume 1) into JSONL |
| `npm run extract:mek:deep` | `cli/extract-mek-deep.js` | Deep-extraction pass over paginated MEK text into claim-level JSONL for the canonical KG |
| `npm run load:mek:kg` | `cli/load-mek-kg-supabase.js` | Load MEK deep-extraction JSONL into the private staging knowledge graph |
| `npm run extract:restricted:deep` | `cli/extract-restricted-book.js` | Extract a restricted book (`--source`, required bounded `--limit` unless explicitly full-book). p4 uses **1 page/window**, 80–200 char fold-aligned quotes, `--output` / `--to-page` / `--failure-output`. `--preflight-only` prints live-price worst-case cost; default `$1` hard ceiling prevents accidental spend |
| `npm run load:restricted:kg` | `cli/load-restricted-kg.js` | Load restricted-book extraction JSONL into private KG staging; accepts p1, p2, and p3 records, resolves by payload shape (not model name or prompt version) |
| `npm run load:kg:plan` | `cli/load-kg-load-plan.js` | Load a V3 `*.kg-load-plan*.json` into private staging + draft/private canonical KG (never publishes; provisional plans stay draft). `--commit` required to write |
| `npm run embed:kg` | `cli/embed-kg.js` | Generate/cache embeddings for canonical entities, staged locations, or claims (`--target canonical\|staging\|claims\|all`, `--seed-public-locations`, `--commit`) |
| `npm run export:historical:map` | `cli/export-address-geojson.js` | Address mentions → GeoJSON with full `mention_samples` book quotes; `--include-experiment`; coords from **local** gazetteer (ODbL attribution in file) |
| `npm run export:kg:locations:map` | `cli/export-kg-locations-geojson.js` | Location entities from a kg-load-plan → GeoJSON (gazetteer/address join; ODbL attribution) |
| `npm run resolve:kg` | `cli/resolve-kg-locations.js` | Preview/commit auto-linking staged locations to mapped landmarks (`--source-id`, `--geocoded <path>`, `--commit`) |
| `npm run resolve:kg-relations` | `cli/resolve-kg-relations.js` | Preview/commit exact normalized relation-endpoint links to staged locations, people, organisations, and events (`--source-id`, `--report`, `--commit`) |
| `npm run create:kg-placeholders` | `cli/create-kg-placeholders.js` | Preview/commit conservative, private `pending` placeholders for unresolved named relation endpoints; never approves or publishes |
| `npm run research:kg-placeholders` | `cli/research-kg-placeholders.js` | Paid, cached Qwen Flash knowledge triage for flagged placeholders (`--kind`, `--limit`, `--batch-size`, `--commit`); no live web search and confirmed rows still require human review |
| `npm run check:openrouter-models` | `cli/check-openrouter-models.js` | Check configured extraction model IDs against OpenRouter's live catalog and fail if a `:free` rung is no longer free |
| `npm run geocode:kg` | `cli/geocode-kg.js` | Geocode staged restricted-book locations via free Nominatim; feeds `resolve:kg --geocoded` |
| `npm run backfill:kg-alias-normalization` | `cli/backfill-kg-alias-normalization.js` | Re-normalize existing `kg_entity_aliases.normalized_alias` with the shared `lib/kgNormalize.js`, with collision handling (`--commit`) |
| `npm run expand:kg-aliases` | `cli/expand-kg-aliases.js` | Derive additional approved `translated_name` aliases from approved name aliases via the curated `lib/kgNameLexicon.js` lexicon (`--commit`) |
| `npm run load:wikidata:aliases` | `cli/load-wikidata-aliases.js` | Anchor Wikidata hu/en/de labels onto existing canonical entities only, never importing new landmarks (`--commit`) |
| `npm run backfill:kg-alias-translations` | `cli/backfill-kg-alias-translations.js` | LLM tail backfill of hu/en aliases for landmarks the deterministic layers missed; rows always `needs_review` (`--commit`) |
| `npm run eval:kg-matching` | `cli/eval-kg-matching.js` | Golden-set eval (`fixtures/kg-matching-golden.json`) for the resolver + exact/hybrid RPCs (`--offline` default, `--embed-missing`, `--db`) |
| `npm run promote:kg-location` | `cli/promote-kg-location.js` | Preview/commit one human-reviewed staged-location promotion into the canonical KG (`--staged-location-id` or `--staged-location-name`, `--public-location-id`, `--commit`) |
| `npm run test:kg-resolver` | `lib/kgLocationResolver.test.js` + `lib/kgEmbeddings.test.js` + `lib/kgPublicLocationSeeder.test.js` | Unit tests for the location resolver, embeddings, and public-location seeder |
| `npm run test:kg-promotion` | `lib/kgPromotion.test.js` | Unit tests for the KG promotion planner |

### generate:audio examples

```bash
npm run generate:audio -- --name "Hungarian Parliament Building"
npm run generate:audio -- --all
npm run generate:audio -- --name "Buda Castle" --force --locale hu --style storyteller
```

### enrich:history examples

```bash
npm run enrich:history -- --limit 50 --concurrency 4
npm run enrich:history -- --id <uuid> --force
```

## Frontend (`talesofbudapest-frontend/package.json`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

## Admin (`talesofbudapest-admin/package.json`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the private admin console on port `3100` |
| `npm run build` | Create a production Next.js build |
| `npm run start` | Serve the production build on port `3100` |
| `npm run test` | Run review validation and response-mapping tests |
| `npm run typecheck` | Type-check the application without emitting files |

The root aliases are preferred for normal use. See [Admin site](ADMIN_SITE.md) for authentication, database selection, approval behavior, and API details.

## Ingest (`ingest/package.json`)

| Command | File | Description |
|---------|------|-------------|
| `npm run scrape` | `scrape-budapest100.ts` | Budapest100 scrape |
| `npm run load` | `load-all-landmarks.ts` | Load all sources to DB |
| `npm run ingest:wikipedia` | `ingest-wikipedia.ts` | Wikipedia ingest |
| `npm run ingest:muemlekem` | `ingest-muemlekem.ts` | Műemlékem ingest |
| `npm run fetch:mek` | `fetch-mek.ts` | Download allowlisted MEK PDFs, retain provenance/license metadata, and write `ingest/corpus/mek/manifest.json` |
| `npm run poll:open-wikidata` | `poll-open-wikidata.ts` | Write a bounded CC0 Budapest discovery batch (`--limit`, `--offset`, `--modified-since`, `--dry-run`) |
| `npm run poll:open-commons` | `poll-open-commons.ts` | Write open-license Commons media metadata (`--category`, `--limit`, `--continue`, `--dry-run`) |
| `npm run backfill:importance` | `backfill-importance.ts` | Recompute importance tiers |

### Common ingest workflows

```bash
# Full scrape + load pipeline
npm run scrape:budapest100 -- --geocode --min-tier standard
npm run ingest:wikipedia
npm run ingest:muemlekem -- --geocode
npm run load:landmarks

# Dry run (no DB writes)
npm run load:landmarks -- --dry-run

# Load with tier filter
npm run load:landmarks -- --min-tier featured
```

## Infra shell scripts

| Script | Description |
|--------|-------------|
| `node infra/scripts/generate-keys.mjs` | Generate Supabase secrets |
| `bash infra/scripts/setup.sh` | Clone and start Docker stack |
| `bash infra/scripts/migrate.sh` | Migrate via Docker container |
| `bash infra/scripts/backup.sh` | Backup Postgres + storage |
| `bash infra/scripts/restore.sh` | Restore from backup |
| `node infra/scripts/fix-service-role-key.mjs` | Fix JWT key mismatch |

## RAG (Python, not npm)

```bash
cd rag
source .venv/bin/activate
python ingest.py --file corpus/sample.txt --source-id budapest-sample-001
```

## Typical sequences

### First-time local setup

```bash
npm install
node infra/scripts/generate-keys.mjs
bash infra/scripts/setup.sh
# configure .env files
npm run db:migrate
npm run load:landmarks
npm run dev:frontend
```

### Regenerate all landmark audio

```bash
npm run enrich:history -- --concurrency 4
npm run generate:audio:all
```

### Safely start a restricted book

```bash
# Live catalog check; no model generation
npm run check:openrouter-models --workspace=talesofbudapest-backend

# Live-price estimate only; no extraction request
npm run extract:restricted:deep -- --source <source-id> --limit 5 --preflight-only

# Run the same bounded sample after reviewing the estimate
npm run extract:restricted:deep -- --source <source-id> --limit 5
```

The extractor refuses an unbounded run unless `--confirm-full-book` is explicitly supplied. See [OpenRouter](OPENROUTER.md).

### Inspect database

```bash
docker exec supabase-db psql -U postgres -d postgres \
  -c "SELECT source, count(*) FROM locations GROUP BY source;"
```

## Related

- [Getting started](getting-started.md)
- [Ingest](ingest.md)
- [Backend](backend.md)
- [Admin site](ADMIN_SITE.md)
