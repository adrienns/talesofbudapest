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
  020_narrative_walking_routes.sql
  021_curated_narratives.sql
  022_locations_map_theme.sql
  023_private_user_narratives.sql
  024_expensive_endpoint_guards.sql
  025_narrative_generation_jobs.sql
  026_tour_planning_metadata.sql
  027_narrative_drafts.sql
  028_lock_down_source_material.sql
  029_revoke_public_source_table_privileges.sql
  030_walking_route_rate_limit.sql
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
