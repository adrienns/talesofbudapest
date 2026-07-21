#!/usr/bin/env bash
# Measure cost-opt extract on a sample of held-out pages (fresh experiment cache namespace).
set -uo pipefail
cd "$(dirname "$0")/.."
EXPERIMENT=cost-opt-v2.12
PAGES=(90 170 190 250 290 330)
LOG=../ingest/corpus/restricted/extractions/cost-opt-measure-$(date +%Y%m%d-%H%M%S).log
LOG=../ingest/corpus/restricted/extractions/cost-opt-measure-$(date +%Y%m%d-%H%M%S).log
echo "Logging to $LOG"
for page in "${PAGES[@]}"; do
  echo "=== cost-opt page $page ===" | tee -a "$LOG"
  node cli/extract-historical-book-v2.js --v3 \
    --from-page "$page" \
    --page-count 1 \
    --max-cost-usd 0.02 \
    --experiment-id "$EXPERIMENT" \
    2>&1 | tee -a "$LOG" | tail -3
done
echo "DONE cost-opt measure" | tee -a "$LOG"
