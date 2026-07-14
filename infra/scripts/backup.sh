#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${1:-$REPO_ROOT/infra/backups/$(date +%Y%m%d-%H%M%S)}"
DATA_DIR="$REPO_ROOT/infra/data"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$REPO_ROOT/talesofbudapest-backend/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/talesofbudapest-backend/.env"
    set +a
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up Postgres to $BACKUP_DIR/postgres.dump"
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_DIR/postgres.dump"
elif docker container inspect supabase-db >/dev/null 2>&1; then
  echo "Host pg_dump is unavailable; using pg_dump from the supabase-db container"
  docker exec -i supabase-db pg_dump -U postgres -d postgres -Fc > "$BACKUP_DIR/postgres.dump"
else
  echo "pg_dump is not installed and the supabase-db container is not available"
  echo "Install PostgreSQL client tools or start the local Supabase Docker stack."
  exit 1
fi

if [ -d "$DATA_DIR/storage" ]; then
  echo "Archiving storage volume"
  tar -czf "$BACKUP_DIR/storage.tar.gz" -C "$DATA_DIR" storage
fi

echo "Backup complete: $BACKUP_DIR"
