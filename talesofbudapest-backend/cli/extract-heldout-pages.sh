#!/usr/bin/env bash
# Extract V3 for held-out pages that lack runs. Sequential to limit API load.
# failed_cost_gate is an acceptable finished run (over $0.002/page); keep going.
set -uo pipefail
cd "$(dirname "$0")/.."
PAGES=(70 90 110 130 150 170 190 210 230 250 290 330 370 410 470)
ITEMS=../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl
LOG=../ingest/corpus/restricted/extractions/heldout-extract-$(date +%Y%m%d-%H%M%S).log
echo "Logging to $LOG"
failed=0
for page in "${PAGES[@]}"; do
  if node --input-type=module -e "
    import fs from 'fs';
    const page = $page;
    const rows = fs.readFileSync('$ITEMS','utf8').trim().split('\n').map(JSON.parse)
      .filter(r => Array.isArray(r.items) && ['complete','failed_cost_gate'].includes(r.status)
        && (r.pdf_pages||[]).includes(page));
    process.exit(rows.length ? 0 : 1);
  "; then
    echo "=== skip page $page (already has finished run) ===" | tee -a "$LOG"
    continue
  fi
  echo "=== extract held-out page $page ===" | tee -a "$LOG"
  if ! node cli/extract-historical-book-v2.js --v3 \
    --from-page "$page" \
    --page-count 1 \
    --max-cost-usd 0.02 \
    --resume \
    2>&1 | tee -a "$LOG"; then
    echo "WARN: extract page $page exited non-zero (may still have written failed_cost_gate)" | tee -a "$LOG"
    failed=$((failed + 1))
  fi
done
echo "DONE held-out extracts (non-zero exits=$failed)" | tee -a "$LOG"
