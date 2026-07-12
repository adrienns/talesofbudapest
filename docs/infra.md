# Infrastructure

Self-hosted Supabase stack for local development, with a path to Oracle Cloud deployment.

**Path:** `infra/`

## Overview

Uses the official [Supabase Docker stack](https://github.com/supabase/supabase/tree/master/docker), cloned into `infra/supabase-upstream/` by `setup.sh`. Custom override bind-mounts data for persistence.

```mermaid
flowchart LR
  App[Next.js / Backend] --> Kong[Kong :8000]
  Kong --> REST[PostgREST]
  Kong --> Auth[GoTrue]
  Kong --> Storage[Storage API]
  REST --> DB[(supabase-db Postgres)]
  Storage --> Disk[infra/data/storage]
  DB --> PGData[infra/data/postgres]
```

## Quick start

```bash
node infra/scripts/generate-keys.mjs
bash infra/scripts/setup.sh

# Paste generated keys into infra/supabase-upstream/docker/.env:
# POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY

cd infra/supabase-upstream/docker
docker compose -f docker-compose.yml -f ../../../infra/docker-compose.override.yml up -d

npm run db:migrate
```

Point `talesofbudapest-backend/.env`:

```env
SUPABASE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
SUPABASE_ANON_KEY=<from generate-keys>
SUPABASE_SERVICE_ROLE_KEY=<from generate-keys>
```

## Docker containers

| Container | Role | Host port |
|-----------|------|-----------|
| `supabase-db` | PostgreSQL + pgvector | internal (access via pooler) |
| `supabase-pooler` | Connection pooler | `5432`, `6543` |
| `supabase-kong` | API gateway | `8000` |
| `supabase-rest` | PostgREST | internal |
| `supabase-auth` | GoTrue auth | internal |
| `supabase-storage` | File storage | internal |
| `supabase-studio` | Admin UI | **not mapped by default** |

### Accessing Supabase Studio locally

`supabase-studio` runs but port 3000 is not exposed to the host. Options:

- Use a DB GUI on `localhost:5432` (TablePlus, VS Code Database Client)
- Use `docker exec supabase-db psql`
- Add `ports: ["3000:3000"]` to the studio service in docker-compose

## Persistent data

Configured in `docker-compose.override.yml`:

| Host path | Contents |
|-----------|----------|
| `infra/data/postgres/` | PostgreSQL data directory |
| `infra/data/storage/` | Uploaded MP3s and files |

These directories survive `docker compose down`. Gitignored.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate-keys.mjs` | Generate Postgres password, JWT secret, anon/service keys |
| `scripts/generate-keys.sh` | Shell wrapper for key generation |
| `scripts/setup.sh` | Clone upstream Supabase docker, create data dirs, start compose |
| `scripts/migrate.sh` | Apply migrations inside `supabase-db` (workaround when host `DATABASE_URL` fails) |
| `scripts/backup.sh` | Postgres dump + storage tarball → `infra/backups/` |
| `scripts/restore.sh` | Restore from backup |
| `scripts/fix-service-role-key.mjs` | Fix service role key mismatch (`npm run fix:service-key`) |
| `scripts/sign-service-role.mjs` | Sign JWT service role from secret |

### migrate.sh vs npm run db:migrate

- `npm run db:migrate` — connects from host via `DATABASE_URL`
- `bash infra/scripts/migrate.sh` — runs SQL inside the container (use when Supavisor/pooler auth fails)

## Nginx (production)

`nginx/supabase.conf` — reverse proxy template for TLS termination on Oracle Cloud. Proxies to Kong on port 8000.

## Environment template

`infra/.env.example`:

```env
POSTGRES_PASSWORD=your-super-secret-password
JWT_SECRET=...
ANON_KEY=...
SERVICE_ROLE_KEY=...
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:8000
SUPABASE_PUBLIC_URL=http://localhost:8000
STUDIO_PORT=3000
KONG_HTTP_PORT=8000
```

Copy values to `infra/supabase-upstream/docker/.env` after `generate-keys.mjs`.

## Prerequisites

- Docker Desktop (8 GB+ RAM recommended)
- Free ports: `5432`, `8000`, `3000`
- `git`, `node`

## Oracle Cloud path

Same docker-compose layout copies to Oracle Free Tier. Use `backup.sh` / `restore.sh` to migrate data. See `infra/README.md` for deployment notes.

## Related

- [Getting started](getting-started.md)
- [Database](database.md)
- [Environment](environment.md)
