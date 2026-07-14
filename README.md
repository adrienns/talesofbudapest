# Tales of Budapest

Monorepo for the Tales of Budapest audio tour app.

**Full documentation:** [docs/README.md](docs/README.md)

## Structure

```
supabase/migrations/        # Database and storage SQL migrations
infra/                      # Self-hosted Supabase Docker (local → Oracle)
rag/                        # RAG ingestion scripts (Python)
ingest/                     # Budapest100 scraper (TypeScript)
talesofbudapest-backend/    # Node.js CLI pipeline (Supabase, OpenRouter LLM + TTS)
talesofbudapest-frontend/   # Next.js + TypeScript + Tailwind CSS app
talesofbudapest-admin/      # Private KG operations/review console (port 3100)
```

## Setup

```bash
npm install
```

### Backend environment

```bash
cp talesofbudapest-backend/.env.example talesofbudapest-backend/.env
```

### Frontend environment

```bash
cp talesofbudapest-frontend/.env.local.example talesofbudapest-frontend/.env.local
```

### Database migrations

`npm run db:migrate` connects directly to Postgres (not the Supabase REST API) and runs, in order:

1. `001_locations.sql` — creates `locations` table + read RLS
2. `001_alter_only.sql` — adds `audio_url` if missing
3. `002_storage.sql` — `audio-tours` storage bucket
4. `003_locations_name_unique.sql` — unique index on `name`
5. `004_landmark_images.sql` — `image_url`, `images` columns
6. `005_storage_landmark_images.sql` — `landmark-images` bucket
7. `006_narratives.sql` — narratives + chapters tables
8. `007_narrative_writes.sql` — insert policies
9. `008_rag_history.sql` — pgvector RAG tables
10. `009_location_provenance.sql` — `source`, `external_id`, `landmark_type` columns on `locations`
11. `010_location_translations.sql` — `location_translations` table (hu/en names, prompts, audio)
12. `011_location_importance.sql` — `importance_tier`, `importance_score` columns
13. `012_locations_map_index.sql` — map query index on `(importance_tier, latitude, longitude)`
14. `013_location_history.sql` — `history_depth`, `source_material`, `historical_narrative`, `location_audio_variants` table
15. `014_knowledge_graph_staging.sql` — private staging KG tables (`kg_sources`, `kg_pages`, `kg_mentions`, `kg_locations`, `kg_people`, `kg_events`, `kg_facts`, `kg_staged_relations`)
16. `015_knowledge_graph_canonical.sql` — canonical, reviewable KG (`kg_entities`, `kg_entity_aliases`, `kg_edges`, `kg_claims`, `kg_evidence`) + `match_kg_entity_candidates`/`get_location_chronicle` RPCs
17. `016_kg_hybrid_search.sql` — full-text + trigram + vector hybrid search RPCs (`match_kg_claims_hybrid`, `match_kg_entities_hybrid`)
18. `017_kg_claim_era.sql` — `era` column on `kg_claims`
19. `018_kg_alias_exact_match.sql` — `source` column on `kg_entity_aliases` + `match_kg_entity_exact` RPC
20. `019_kg_organisations_and_placeholders.sql` — staged organisations, organisation relation endpoints, and placeholder metadata/indexes
21. `020_narrative_walking_routes.sql` — cached walking geometry, distance, and duration for saved narratives
22. `021_curated_narratives.sql` — stable slug, version, and locale identity for fixed bilingual tours

**Get `DATABASE_URL`** (one-time setup in `talesofbudapest-backend/.env`):

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Project Settings** → **Database**
3. **Connection string** → **URI** tab
4. Choose **Session pooler** (port `6543`)
5. Copy the string and replace `[YOUR-PASSWORD]` with your database password  
   (same page: **Database password** — reset if you don’t have it)
6. Add to `.env`:

```env
DATABASE_URL=postgresql://postgres.xxxxx:YOUR_PASSWORD@....pooler.supabase.com:6543/postgres
```

**Run migrations:**

```bash
npm run db:migrate
```

This is only needed for schema/storage setup — not for everyday app use (`seed`, `generate:audio` use `SUPABASE_URL` instead).

Then seed landmarks:

```bash
npm run seed
```

## Self-hosted Supabase (local Docker)

Use Docker Desktop to run the same Supabase stack you will later deploy on Oracle Free Tier. Full guide: [infra/README.md](infra/README.md).

```bash
# Generate JWT + Postgres secrets
node infra/scripts/generate-keys.mjs

# Clone upstream Supabase docker stack and start containers
bash infra/scripts/setup.sh

# Paste keys into infra/supabase-upstream/docker/.env, then restart compose
# Point talesofbudapest-backend/.env at http://localhost:8000

npm run db:migrate   # includes 008_rag_history.sql (pgvector)
npm run seed
```

### RAG ingestion

```bash
cd rag
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
export OPENAI_API_KEY=sk-...
python ingest.py --file corpus/sample.txt --source-id budapest-sample-001
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:frontend` | Start the frontend dev server |
| `npm run dev:admin` | Start the private admin console on port `3100` |
| `npm run dev:backend` | Start the backend with nodemon |
| `npm run seed` | Upsert landmark data into Supabase |
| `npm run generate:story` | Generate a tour script via OpenRouter |
| `npm run generate:audio` | Generate audio, upload to Storage, update audio_url |
| `npm run db:migrate` | Apply SQL migrations via DATABASE_URL |
| `bash infra/scripts/migrate.sh` | Apply migrations via Docker when host DB URL fails |
| `npm run seed:curated-tours` | Validate, upsert, and pre-generate bilingual fixed-tour audio (`-- --local-audio` for private macOS TTS; `-- --skip-audio` for scripts only) |
| `npm run scrape:budapest100` | Scrape Budapest100 houses to JSON |
| `node infra/scripts/generate-keys.mjs` | Generate self-hosted Supabase secrets |
| `bash infra/scripts/setup.sh` | Start local Supabase Docker stack |

### Knowledge-graph pipeline scripts

Backend CLIs (`talesofbudapest-backend/cli/`) that turn source books into a cited, reviewable knowledge graph. Full reference: [docs/scripts.md](docs/scripts.md); system design: [docs/KG_APP_SYSTEM.md](docs/KG_APP_SYSTEM.md).

| Command | Description |
|---------|-------------|
| `npm run extract:mek` | Extract entities from the public-domain MEK 1939 Budapest lexicon into JSONL |
| `npm run extract:mek:deep` | Deep-extraction pass over paginated MEK text into claim-level JSONL |
| `npm run extract:restricted:deep` | Extract a restricted book (`--source <id>`) into private JSONL (prompt_version `restricted-book-entities-p3`) |
| `npm run load:mek:kg` | Load MEK deep-extraction JSONL into the private staging knowledge graph |
| `npm run load:restricted:kg` | Load restricted-book extraction JSONL into private KG staging (accepts p1/p2/p3 records) |
| `npm run embed:kg` | Generate/cache embeddings for canonical entities, staged locations, or claims (`--target canonical\|staging\|claims`, `--seed-public-locations`) |
| `npm run geocode:kg --workspace=talesofbudapest-backend` | Geocode staged restricted-book locations via free Nominatim |
| `npm run resolve:kg --workspace=talesofbudapest-backend` | Preview/commit auto-linking staged locations to mapped landmarks (`--commit`) |
| `npm run eval:kg-matching --workspace=talesofbudapest-backend` | Golden-set eval of Hungarian↔English location-name matching |
| `npm run expand:kg-aliases --workspace=talesofbudapest-backend` | Materialize translated-name aliases from approved aliases via the curated lexicon |
| `npm run backfill:kg-alias-normalization --workspace=talesofbudapest-backend` | Re-normalize existing `kg_entity_aliases` rows with the shared normalizer |
| `npm run load:wikidata:aliases --workspace=talesofbudapest-backend` | Anchor Wikidata hu/en/de labels onto existing canonical location entities |
| `npm run backfill:kg-alias-translations --workspace=talesofbudapest-backend` | LLM tail alias translations for landmarks the deterministic layers missed (review-gated) |
| `npm run promote:kg-location` | Human-reviewed promotion of one staged location into the canonical knowledge graph |
| `npm run resolve:kg-relations --workspace=talesofbudapest-backend` | Preview/commit relation endpoint links to staged entities |
| `npm run create:kg-placeholders --workspace=talesofbudapest-backend` | Preview/commit private pending placeholders for unresolved named endpoints |
| `npm run research:kg-placeholders --workspace=talesofbudapest-backend` | Triage pending placeholders through cached Qwen Flash knowledge assistance; never publishes |
| `npm run check:openrouter-models --workspace=talesofbudapest-backend` | Verify extraction ladder IDs and free-model pricing against OpenRouter's live catalog |
| `npm run enrich:history --workspace=talesofbudapest-backend` | Batch-generate historian narratives for locations lacking one |
| `npm run test:kg-resolver --workspace=talesofbudapest-backend` | Unit tests for the KG location resolver, embeddings, and public-location seeder |
| `npm run test:kg-promotion --workspace=talesofbudapest-backend` | Unit tests for the KG promotion planner |

## Frontend architecture

See [talesofbudapest-frontend/README.md](talesofbudapest-frontend/README.md) and [.github/skills/react-best-practices/SKILL.md](.github/skills/react-best-practices/SKILL.md).

For first-run instructions, admin setup, and safe extraction preflights, start with [docs/getting-started.md](docs/getting-started.md).
