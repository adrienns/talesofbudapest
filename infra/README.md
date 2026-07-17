# Self-hosted Supabase (local Docker → Oracle)

Run the official [Supabase Docker stack](https://github.com/supabase/supabase/tree/master/docker) on your Mac now. The same layout copies to Oracle Cloud Free Tier later.

## Prerequisites

- Docker Desktop (8 GB+ RAM recommended)
- Ports free: `5432`, `8000`, `3000`
- `git`, `node` (for key generation)

## Ready-Made Tours

```bash
# 1. Generate secrets
node infra/scripts/generate-keys.mjs

# 2. Clone Supabase + start containers
bash infra/scripts/setup.sh

# 3. Paste generated keys into infra/supabase-upstream/docker/.env
#    (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY)
#    Then restart:
cd infra/supabase-upstream/docker
docker compose -f docker-compose.yml -f ../../../infra/docker-compose.override.yml up -d

# 4. Point the app at local Supabase (talesofbudapest-backend/.env)
#    SUPABASE_URL=http://localhost:8000
#    DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
#    (+ anon / service role keys from step 1)

# 5. Run migrations (includes RAG schema)
npm run db:migrate
# If host DATABASE_URL fails (pooler auth), use:
# bash infra/scripts/migrate.sh
npm run seed
```

## Data on disk

Volumes bind to `infra/data/`:

| Path | Contents |
|------|----------|
| `infra/data/postgres` | PostgreSQL + pgvector |
| `infra/data/storage` | MP3 tours, uploaded files (no S3) |

## RAG ingestion

```bash
cd rag
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
export OPENAI_API_KEY=sk-...
python ingest.py --file sample.txt --source-id sample-001
```

## Backup (practice before Oracle cutover)

```bash
export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
bash infra/scripts/backup.sh
```

Creates `infra/backups/TIMESTAMP/postgres.dump` + `storage.tar.gz`.

## Oracle migration

1. Provision ARM Ampere A1 VM, install Docker
2. Copy `infra/` + `supabase/migrations/` to the server
3. `bash infra/scripts/setup.sh`
4. `bash infra/scripts/restore.sh infra/backups/LATEST`
5. `rsync -avz infra/data/storage/ oracle:/path/to/infra/data/storage/`
6. Point DNS at Nginx (`infra/nginx/supabase.conf`) + Let's Encrypt
7. Update app env: `SUPABASE_URL=https://api.yourdomain.com`

Keep the same `JWT_SECRET` / keys to avoid invalidating existing tokens.

## Troubleshooting

**`npm run db:migrate` fails with `ECONNRESET` from the host**

Docker maps port `5432` to Supavisor (pooler), which may reject direct connections. Apply migrations inside the DB container instead:

```bash
bash infra/scripts/migrate.sh
```

**Kong returns `503` / `name resolution failed` / PostgREST restarts**

Usually means Postgres role passwords in `infra/data/postgres` no longer match `infra/supabase-upstream/docker/.env` (e.g. after regenerating keys on an existing volume). Fix options:

1. Reset the data volume (destructive): `rm -rf infra/data/postgres` then `bash infra/scripts/setup.sh`
2. Or keep the volume and paste the **existing** `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` from your current `.env` into app `.env` files — do not regenerate keys unless you reset data.

**Seed via REST fails while DB is healthy**

Seed directly: `docker exec -i supabase-db psql -U postgres -d postgres` and upsert into `locations`, or wait until Kong/PostgREST are healthy after password sync.

## Gitignored paths

- `infra/supabase-upstream/` (cloned upstream)
- `infra/data/`
- `infra/backups/`
- `infra/supabase-upstream/docker/.env`
