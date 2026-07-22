# Getting started

## Prerequisites

- Node.js 20+
- npm (workspaces)
- Docker Desktop (for self-hosted Supabase)
- OpenRouter API key (for LLM and optional paid TTS override)
- Google AI Studio API key (for default Gemini free-tier TTS)
- Optional: OpenAI API key (for RAG ingest only)

## Install

```bash
git clone <repo>
cd talesofbudapest
npm install
```

## Environment

```bash
cp talesofbudapest-backend/.env.example talesofbudapest-backend/.env
```

Minimum for frontend + map (read-only):

```env
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=<from generate-keys or Supabase dashboard>
```

For audio generation, also set:

```env
SUPABASE_SERVICE_ROLE_KEY=<service role key>
GEMINI_API_KEY=<Google AI Studio key>
```

Direct Gemini TTS is the default and uses the free-tier, quota-limited model
`gemini-3.1-flash-tts-preview`. Set `OPENROUTER_API_KEY` only if you explicitly
choose the paid `--audio-provider openrouter` override for curated narration.

For migrations:

```env
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
```

See [Environment](environment.md) for the full list.

## Option A: Local Supabase (Docker)

Recommended for development with the full landmark dataset.

```bash
node infra/scripts/generate-keys.mjs
bash infra/scripts/setup.sh
# Paste keys into infra/supabase-upstream/docker/.env, restart compose

npm run db:migrate
# If pooler auth fails:
# bash infra/scripts/migrate.sh

npm run seed                    # 4 iconic landmarks (optional)
npm run load:landmarks          # ~433 landmarks from scrape JSON
```

Point `.env` at local Supabase:

```env
SUPABASE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
```

## Option B: Supabase cloud

1. Create a project at [supabase.com](https://supabase.com)
2. Copy connection string → `DATABASE_URL` (Session pooler, port 6543)
3. Copy project URL + anon key → `SUPABASE_URL`, `SUPABASE_ANON_KEY`
4. Run `npm run db:migrate`
5. Run `npm run seed` (4 landmarks) or load landmarks with `DATABASE_URL` pointing at cloud

## Run the app

```bash
npm run dev:frontend    # http://localhost:3000
```

The frontend auto-loads `talesofbudapest-backend/.env` via `next.config.ts`, so you usually do not need a separate frontend `.env.local`.

To run the private database/KG console, create its separate server-only environment file and start it on port 3100:

```bash
cp talesofbudapest-admin/.env.example talesofbudapest-admin/.env.local
# Set ADMIN_PASSWORD, ADMIN_SESSION_SECRET, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY
npm run dev:admin       # http://localhost:3100
```

The admin app deliberately does not inherit the backend environment. Check the displayed database target before approving writes. Never expose the service-role key through a `NEXT_PUBLIC_` variable.

## Verify the database

```bash
docker exec supabase-db psql -U postgres -d postgres -c "SELECT source, count(*) FROM locations GROUP BY source;"
```

Or connect a GUI (TablePlus, VS Code Database Client) to `localhost:5432`.

## Next steps

- [Ingest](ingest.md) — scrape and load more landmarks
- [Backend](backend.md) — generate audio tours
- [Database](database.md) — understand schema and local vs cloud
- [Admin site](ADMIN_SITE.md) — inspect the KG and handle explicit review actions
- [OpenRouter](OPENROUTER.md) — preflight extraction cost before ingesting a book

## Safe first extraction sample

Restricted-book extraction is private and cost-guarded. Verify the current model ladder, then estimate a bounded five-window sample without generating anything:

```bash
npm run check:openrouter-models --workspace=talesofbudapest-backend
npm run extract:restricted:deep -- --source <source-id> --limit 5 --preflight-only
```

After reviewing the estimate, remove `--preflight-only` to run those same five windows. Do not use `--confirm-full-book` until the sample output and cost are acceptable.
