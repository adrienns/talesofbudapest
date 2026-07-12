#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
UPSTREAM_DIR="$INFRA_DIR/supabase-upstream"
DOCKER_DIR="$UPSTREAM_DIR/docker"
OVERRIDE_FILE="$INFRA_DIR/docker-compose.override.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop and try again."
  exit 1
fi

mkdir -p "$INFRA_DIR/data/postgres" "$INFRA_DIR/data/storage"

if [ ! -d "$DOCKER_DIR" ]; then
  echo "Cloning supabase/supabase (docker stack)..."
  git clone --depth 1 https://github.com/supabase/supabase.git "$UPSTREAM_DIR"
fi

cd "$DOCKER_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Created $DOCKER_DIR/.env from template."
  echo "Run: node $INFRA_DIR/scripts/generate-keys.mjs"
  echo "Then paste POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY into .env"
  echo ""
fi

COMPOSE_ARGS=(-f docker-compose.yml -f "$OVERRIDE_FILE")

echo "Starting Supabase..."
docker compose "${COMPOSE_ARGS[@]}" up -d

echo ""
echo "Supabase API:  http://localhost:8000"
echo "Studio:        http://localhost:3000"
echo "Postgres:      localhost:5432"
echo ""
echo "Next: update talesofbudapest-backend/.env, then npm run db:migrate && npm run seed"
