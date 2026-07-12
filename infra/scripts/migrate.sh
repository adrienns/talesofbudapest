#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

MIGRATION_FILES=(
  001_locations.sql
  001_alter_only.sql
  002_storage.sql
  003_locations_name_unique.sql
  004_landmark_images.sql
  005_storage_landmark_images.sql
  006_narratives.sql
  007_narrative_writes.sql
  008_rag_history.sql
  009_location_provenance.sql
  010_location_translations.sql
  011_location_importance.sql
  012_locations_map_index.sql
  013_location_history.sql
  014_knowledge_graph_staging.sql
)

if ! docker ps --format '{{.Names}}' | grep -q '^supabase-db$'; then
  echo "supabase-db container is not running. Start with: bash infra/scripts/setup.sh"
  exit 1
fi

for file in "${MIGRATION_FILES[@]}"; do
  echo "Running $file..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$MIGRATIONS_DIR/$file"
done

echo "All migrations complete"
