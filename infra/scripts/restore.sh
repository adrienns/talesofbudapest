#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: DATABASE_URL=postgresql://... $0 /path/to/backup-dir"
  exit 1
fi

BACKUP_DIR="$1"
DUMP_FILE="$BACKUP_DIR/postgres.dump"
STORAGE_ARCHIVE="$BACKUP_DIR/storage.tar.gz"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="$REPO_ROOT/infra/data"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Missing $DUMP_FILE"
  exit 1
fi

echo "Restoring Postgres from $DUMP_FILE"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP_FILE"

if [ -f "$STORAGE_ARCHIVE" ]; then
  echo "Restoring storage volume"
  mkdir -p "$DATA_DIR"
  tar -xzf "$STORAGE_ARCHIVE" -C "$DATA_DIR"
fi

echo "Restore complete"
