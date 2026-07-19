# Environment variables

All environment configuration for the monorepo.

## Files

| File | Committed? | Used by |
|------|------------|---------|
| `talesofbudapest-backend/.env` | No (`.env.example` yes) | Backend, ingest (fallback), frontend (auto-loaded) |
| `talesofbudapest-frontend/.env.local` | No | Optional frontend overrides |
| `talesofbudapest-admin/.env.local` | No (`.env.example` yes) | Private admin authentication and server-only Supabase access |
| `infra/supabase-upstream/docker/.env` | No | Docker Supabase stack |
| `ingest/.env` | No | Optional ingest overrides |
| `rag/.env` | No | RAG Python script |

The frontend loads `../talesofbudapest-backend/.env` and optionally `../infra/supabase-upstream/docker/.env` via `next.config.ts`. A separate frontend `.env.local` is usually unnecessary.

## Backend / shared (`talesofbudapest-backend/.env`)

Copy from `talesofbudapest-backend/.env.example`.

### Supabase

| Variable | Required for | Description |
|----------|--------------|-------------|
| `SUPABASE_URL` | Everything | API base URL (`http://localhost:8000` or cloud) |
| `SUPABASE_ANON_KEY` | Read, fallback writes | Public anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Audio upload, admin writes | Service role JWT |
| `SUPABASE_JWT_SECRET` | Key derivation | Sign service role if key missing |
| `DATABASE_URL` | Migrations, direct PG | Postgres connection string |

### OpenRouter (LLM + TTS)

| Variable | Required for | Default / notes |
|----------|--------------|-----------------|
| `OPENROUTER_API_KEY` | Audio, narratives, historian | Required for generation |
| `OPENROUTER_LOGS` | All OpenRouter calls | Structured redacted request logs; defaults enabled, set `0` only for local suppression |
| `OPENROUTER_MODEL` | General chat | Fallback for other models |
| `OPENROUTER_HISTORIAN_MODEL` | Historian enrichment | Falls back to `OPENROUTER_MODEL` |
| `KG_EXTRACT_MODEL` | Legacy MEK entity extraction | Model override for `extract:mek` |
| `KG_DEEP_EXTRACT_MODEL` | Deep MEK extraction | Defaults to `google/gemini-2.5-flash` |
| `KG_RESTRICTED_EXTRACT_MODEL` | Restricted-book extraction override | Leave blank for the free→cheap ladder |
| `KG_EXTRACTION_MAX_COST_USD` | Restricted-book extraction | Hard conservative per-invocation ceiling; defaults to `1.00` |
| `KG_ALIAS_TRANSLATION_MODEL` | Alias translation backfill | Defaults to `google/gemini-2.5-flash-lite`; output remains review-gated |
| `KG_RESEARCH_MODEL` | Placeholder knowledge triage | Defaults to `qwen/qwen3.5-flash-02-23`; no live web search, cached and never publishes |
| `OPENROUTER_EMBEDDING_MODEL` | KG embeddings | Defaults to `openai/text-embedding-3-small` |
| `OPENROUTER_EMBEDDING_ENDPOINT` | KG embeddings | Optional API endpoint override |
| `OPENROUTER_EMBEDDING_DIMENSIONS` | KG embeddings | Must match the database vector dimension |
| `OPENROUTER_EMBEDDING_INPUT_COST_PER_MILLION` | Embedding cost reports | Estimate only; defaults to `0.02` |
| `OPENROUTER_AUDIO_MODEL` | Tour script generation | |
| `OPENROUTER_TTS_MODEL` | Text-to-speech | Gemini flash TTS (multilingual HU) |
| `OPENROUTER_TTS_VOICE` | TTS voice preset | |
| `OPENROUTER_TTS_RESPONSE_FORMAT` | Text-to-speech | Optional response-format override; normally inferred from model |
| `GEMINI_API_KEY` | Direct Gemini curated TTS | Server-only Google AI Studio key; not used by default runtime TTS |
| `GEMINI_TTS_MODEL` | Direct Gemini curated TTS | Defaults to `gemini-3.1-flash-tts-preview` |
| `GEMINI_TTS_VOICE` | Direct Gemini curated TTS | Defaults to the warm `Sulafat` voice |
| `GEMINI_TTS_REQUEST_INTERVAL_MS` | Direct Gemini curated TTS | Defaults to `31000` for conservative free-tier pacing |
| `OPENROUTER_SITE_URL` | OpenRouter requests | HTTP referer used by shared chat/TTS client; defaults to localhost |
| `OPENROUTER_HTTP_REFERER` | Embedding requests | Optional HTTP referer for embedding calls |
| `OPENROUTER_APP_NAME` | Embedding requests | Optional OpenRouter `X-Title` attribution |

`KG_RESEARCH_MODEL` invokes a knowledge-assistance model and incurs token charges only under the default Qwen route. It does not provide live web verification; preview a small `--limit` before committing a large research pass. Restricted-book extraction has a separate hard ceiling through `KG_EXTRACTION_MAX_COST_USD`; see [OpenRouter](OPENROUTER.md).

## Frontend (`NEXT_PUBLIC_*`)

Optional if backend `.env` is loaded automatically.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Falls back to `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Falls back to `SUPABASE_ANON_KEY` |

Server-side API routes also use `SUPABASE_SERVICE_ROLE_KEY` via `supabaseAdmin.ts`.

## Admin (`talesofbudapest-admin/.env.local`)

Copy from `talesofbudapest-admin/.env.example`. The admin application intentionally does not load the backend or frontend environment files automatically, so its database target is explicit.

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Private console password |
| `ADMIN_SESSION_SECRET` | Yes | HMAC session secret containing at least 32 characters |
| `SUPABASE_URL` | Yes | The single local or hosted Supabase instance displayed by the console |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key for protected KG reads and explicit review writes |

Do not add a `NEXT_PUBLIC_` version of the service-role key. See [Admin site](ADMIN_SITE.md) for the security and deployment boundary.

## Ingest

Read from `ingest/.env` or fallback to `talesofbudapest-backend/.env`.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | For REST upsert path |
| `SUPABASE_SERVICE_ROLE_KEY` | For REST upsert path |
| `SUPABASE_DB_CONTAINER` | Docker container name (default: `supabase-db`) |
| `DATABASE_URL` | Direct Postgres for `load-landmarks.ts` |
| `OPEN_DATA_USER_AGENT` | Optional contact-bearing user agent for Wikidata and Commons polling |
| `MEK_USER_AGENT` | Optional contact-bearing user agent for MEK PDF downloads |

## Geocoding

| Variable | Description |
|----------|-------------|
| `NOMINATIM_CONTACT_EMAIL` | Contact included in the Nominatim user agent for `geocode:kg`; set this before a batch run |

## RAG

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres with pgvector |
| `OPENAI_API_KEY` | Embeddings (`text-embedding-3-small`) |

## Infra Docker (`infra/supabase-upstream/docker/.env`)

Generated by `node infra/scripts/generate-keys.mjs`:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing secret |
| `ANON_KEY` | Supabase anon key |
| `SERVICE_ROLE_KEY` | Supabase service role key |
| `SITE_URL` | App URL for auth redirects |
| `API_EXTERNAL_URL` | External API URL |
| `SUPABASE_PUBLIC_URL` | Public Supabase URL |

See `infra/.env.example` for port settings.

## Minimum env by task

| Task | Required variables |
|------|-------------------|
| Frontend dev (map only) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Admin console | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Landmark audio generation | + `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` |
| Direct Gemini curated audio | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` |
| Restricted-book cost preflight | `OPENROUTER_API_KEY` is not used for `--preflight-only`, but live catalog access is required |
| Restricted-book extraction | `OPENROUTER_API_KEY`; optional `KG_EXTRACTION_MAX_COST_USD` |
| KG load/resolve/placeholder creation | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| KG embedding | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` |
| Placeholder research | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`; paid by default |
| KG geocoding | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOMINATIM_CONTACT_EMAIL` recommended |
| Migrations | `DATABASE_URL` (or use `infra/scripts/migrate.sh`) |
| Ingest load (Docker) | Docker running, `SUPABASE_DB_CONTAINER` optional |
| Ingest load (cloud) | `DATABASE_URL` pointing at cloud |
| RAG ingest | `DATABASE_URL`, `OPENAI_API_KEY` |
| Self-hosted Supabase | Full `infra/.../docker/.env` from key generation |

## Local vs cloud example

**Local Docker:**

```env
SUPABASE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
```

**Supabase cloud:**

```env
SUPABASE_URL=https://xxxxx.supabase.co
DATABASE_URL=postgresql://postgres.xxxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
```

## Related

- [Getting started](getting-started.md)
- [Infrastructure](infra.md)
- [Admin site](ADMIN_SITE.md)
