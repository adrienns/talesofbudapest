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
pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_DIR/postgres.dump"

if [ -d "$DATA_DIR/storage" ]; then
  echo "Archiving storage volume"
  tar -czf "$BACKUP_DIR/storage.tar.gz" -C "$DATA_DIR" storage
fi

echo "Backup complete: $BACKUP_DIR"
