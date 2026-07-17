# Tales of Budapest — Documentation

Documentation for the monorepo: a Budapest audio-tour app with a map of landmarks, on-demand landmark narration, and AI-generated walking tours.

## Quick links

| Doc | What it covers |
|-----|----------------|
| [Getting started](getting-started.md) | Install, env setup, first run |
| [Architecture](architecture.md) | System overview and data flow |
| [Frontend](frontend.md) | Next.js app, routes, stores, components |
| [Backend](backend.md) | CLI tools, audio pipeline, LLM/TTS |
| [Ingest](ingest.md) | Scraping Budapest100, Wikipedia, Műemlékem |
| [Database](database.md) | Schema, migrations, local vs cloud |
| [Infrastructure](infra.md) | Self-hosted Supabase Docker |
| [RAG](rag.md) | Historical corpus embeddings |
| [Environment](environment.md) | All env vars by package |
| [Scripts](scripts.md) | npm commands reference |
| [Licensing](licensing.md) | Data source licenses (Budapest100, Fortepan, etc.) |
| [Attribution backlog](ATTRIBUTION_BACKLOG.md) | Every credit the app owes, where it goes in the UI, and status |
| [App and architecture — simple guide](APP_AND_ARCHITECTURE_SIMPLE.md) | The whole product and system explained without technical jargon |
| [Admin site](ADMIN_SITE.md) | Private overview, Insights analytics, multi-view graph explorer, entity inspection, and approval workflow |

## Choose a starting point

- **Run the public app:** [Getting started](getting-started.md#run-the-app)
- **Inspect or review the knowledge graph:** [Admin site](ADMIN_SITE.md), then run `npm run dev:admin`
- **Ingest open landmark data:** [Ingest](ingest.md) and [Licensing](licensing.md)
- **Extract a restricted book safely:** [OpenRouter](OPENROUTER.md#safe-runbook-for-the-next-book) before [Extraction pipeline](EXTRACTION_PIPELINE.md)
- **Understand the whole product without implementation detail:** [App and architecture — simple guide](APP_AND_ARCHITECTURE_SIMPLE.md)

## Knowledge graph

| Doc | What it covers |
|-----|----------------|
| [KG app system](KG_APP_SYSTEM.md) | Knowledge-graph → Chronicle system: data boundary, entity resolution, alias matching |
| [Extraction pipeline](EXTRACTION_PIPELINE.md) | File intake, models, prompts (P1/P1-R/P2/P3), quality gates |
| [Historical book knowledge extraction](HISTORICAL_BOOK_KNOWLEDGE_EXTRACTION.md) | Research, page experiment findings, and the decided evidence-first canonical-event architecture |
| [Historical reference resolution](HISTORICAL_REFERENCE_RESOLUTION.md) | Detailed pronoun, possessive, repeated-description, batching, caching, validation, and cost design |
| [Historical Extraction V3 — architecture](HISTORICAL_EXTRACTION_V3_HANDOFF.md) | V3 design: typed subject memory, layout-first processing, cost routing, evaluation gates |
| [Historical Extraction V3 — current handoff](HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md) | Current V3 state: frozen model config, measured cost, address/geography and OCR layers, known defects |
| [V3 model comparison](CLAUDE_HANDOFF_MODEL_COMPARISON_2026-07-16.md) | Bounded A/B that froze DeepSeek V4 Flash primary + Qwen audit and rejected GPT-OSS-20B |
| [Vector DB improvements](VECTOR_DB_IMPROVEMENTS.md) | Retrieval upgrades: enriched embeddings, hybrid search, era taxonomy, name matching |
| [Decisions log](DECISIONS.md) | Dated record of prompt, model, and pipeline-behavior changes |
| [OpenRouter](OPENROUTER.md) | Models, cost, prompt caching, the July 2026 cost incident, and the cost-control/health-check tooling |

## Strategy docs

| Doc | What it covers |
|-----|----------------|
| [Viral features](VIRAL_FEATURES.md) | Viral feature tier list |
| [Bizdev & funding plan](BIZDEV_FUNDING_PLAN.md) | Grants + bizdev plan for Hungary/Budapest/EU |
| [Data moat plan](DATA_MOAT_PLAN.md) | Plan for making the facts DB a defensible moat |
| [Killer app plan](KILLER_APP_PLAN.md) | Task-numbered execution backlog (workstreams WS-*) |
| [Competitor landscape](COMPETITOR_LANDSCAPE.md) | Competitor analysis for the AI-tour / Budapest-history space |
| [Project blueprint](PROJECT_BLUEPRINT.md) | Product and system blueprint: strategy, architecture, edge-case playbooks |

## Repository layout

```
talesofbudapest/
├── docs/                         # This documentation
├── talesofbudapest-frontend/     # Next.js 15 + TypeScript + Tailwind
├── talesofbudapest-admin/        # Private KG operations and review console
├── talesofbudapest-backend/      # Node.js CLI: seed, audio, migrations
├── ingest/                       # TypeScript scrapers → JSON → Postgres
├── supabase/migrations/          # SQL schema (ordered migrations)
├── infra/                        # Self-hosted Supabase Docker stack
├── rag/                          # Python RAG ingest (pgvector)
└── .github/skills/               # Agent coding guidelines
```

## Two databases (important)

The project can talk to **two separate Postgres instances**:

| Instance | Typical use | Landmark count (example) |
|----------|-------------|--------------------------|
| **Local Docker** (`supabase-db`) | Dev with `SUPABASE_URL=http://localhost:8000` | ~433 after `load:landmarks` |
| **Supabase cloud** (dashboard) | Production / hosted project | ~4 after `npm run seed` only |

Scraped landmarks are loaded into **whichever database the ingest script targets**. By default `load:landmarks` writes to local Docker via `docker exec supabase-db psql`. See [Database](database.md#local-vs-cloud).

## Typical workflows

### New developer setup

```bash
npm install
cp talesofbudapest-backend/.env.example talesofbudapest-backend/.env
# Fill in Supabase + OpenRouter keys
npm run db:migrate
npm run dev:frontend
```

### Full local landmark dataset

```bash
npm run scrape:budapest100    # → ingest/output/budapest100_map_anchors.json
npm run ingest:wikipedia
npm run ingest:muemlekem
npm run load:landmarks          # → local Docker Postgres
```

### Generate landmark audio

```bash
npm run enrich:history          # optional: LLM historian narratives
npm run generate:audio -- --name "Hungarian Parliament Building"
```

### Preview a restricted-book extraction cost

Run the model health check and a bounded, no-generation preflight before spending anything:

```bash
npm run check:openrouter-models --workspace=talesofbudapest-backend
npm run extract:restricted:deep -- --source <source-id> --limit 5 --preflight-only
```

See [OpenRouter](OPENROUTER.md) for the cost ceiling, model ladder, and full-book guard.
