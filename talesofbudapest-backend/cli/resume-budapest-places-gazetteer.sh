#!/usr/bin/env bash
# Resume Budapest places gazetteer after Overpass rate-limit / timeout.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Resuming places gazetteer (skipping layers that already exist when flagged)..."
node cli/build-budapest-places-gazetteer.js "$@"
