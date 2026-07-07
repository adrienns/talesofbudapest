# Tales of Budapest

Monorepo for the Tales of Budapest audio tour app.

## Structure

```
supabase/migrations/        # Database and storage SQL migrations
infra/                      # Self-hosted Supabase Docker (local → Oracle)
rag/                        # RAG ingestion scripts (Python)
talesofbudapest-backend/    # Node.js CLI pipeline (Supabase, OpenRouter LLM + TTS)
talesofbudapest-frontend/   # Next.js + TypeScript + Tailwind CSS app
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

`npm run db:migrate` connects directly to Postgres (not the Supabase REST API) and runs:

1. `001_alter_only.sql` — adds `audio_url` column to `locations`
2. `002_storage.sql` — creates public `audio-tours` storage bucket + policies

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
| `npm run dev:backend` | Start the backend with nodemon |
| `npm run seed` | Upsert landmark data into Supabase |
| `npm run generate:story` | Generate a tour script via OpenRouter |
| `npm run generate:audio` | Generate audio, upload to Storage, update audio_url |
| `npm run db:migrate` | Add missing DB columns via DATABASE_URL |
| `node infra/scripts/generate-keys.mjs` | Generate self-hosted Supabase secrets |
| `bash infra/scripts/setup.sh` | Start local Supabase Docker stack |

## Frontend architecture

See [talesofbudapest-frontend/README.md](talesofbudapest-frontend/README.md) and [.github/skills/react-best-practices/SKILL.md](.github/skills/react-best-practices/SKILL.md).
