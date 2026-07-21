#!/usr/bin/env bash
# Re-extract held-out pages on the frozen cost-opt stack (always fresh experiment namespace).
set -uo pipefail
cd "$(dirname "$0")/.."
EXPERIMENT="${1:-cost-opt-heldout-v2.12}"
PAGES=(50 70 90 110 130 150 170 190 210 230 250 290 330 370 410 470)
LOG=../ingest/corpus/restricted/extractions/heldout-costopt-$(date +%Y%m%d-%H%M%S).log
echo "Logging to $LOG experiment=$EXPERIMENT"
failed=0
complete=0
for page in "${PAGES[@]}"; do
  echo "=== heldout cost-opt page $page ===" | tee -a "$LOG"
  if node cli/extract-historical-book-v2.js --v3 \
    --from-page "$page" \
    --page-count 1 \
    --max-cost-usd 0.02 \
    --experiment-id "$EXPERIMENT" \
    --quality-model google/gemma-3-27b-it \
    2>&1 | tee -a "$LOG" | tail -5; then
    complete=$((complete + 1))
  else
    # failed_cost_gate still writes a usable row
    echo "WARN: page $page non-zero exit" | tee -a "$LOG"
    failed=$((failed + 1))
  fi
done
echo "DONE heldout cost-opt complete_exits=$complete nonzero=$failed" | tee -a "$LOG"
