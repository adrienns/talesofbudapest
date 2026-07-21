#!/usr/bin/env bash
# Full-book V3 extract harness: chunked, resumable, fail-soft, spend-aware.
# Does NOT claim promotion. Default: dry-run inventory only.
#
# Usage:
#   bash cli/scan-historical-book-v3.sh --dry-run
#   bash cli/scan-historical-book-v3.sh --from-page 1 --to-page 50 --execute
#   bash cli/scan-historical-book-v3.sh --execute   # content pages only (default to-page 579)
#
# Default stops before the book index (pp.580–615). See
# config/jewish-budapest-page-ranges.json. Pass --to-page 615 only if you
# intentionally want index pages.
set -uo pipefail
cd "$(dirname "$0")/.."

SOURCE_ID=jewish-budapest
PAGES_FILE=../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt
ITEMS=../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-items-v3.jsonl
LEDGER=../ingest/corpus/restricted/extractions/${SOURCE_ID}.scan-ledger-v3.jsonl
LOG=../ingest/corpus/restricted/extractions/scan-book-$(date +%Y%m%d-%H%M%S).log
EXPERIMENT="${EXPERIMENT:-fullbook-v2.12}"
CHUNK="${CHUNK:-1}"
MAX_COST_PAGE="${MAX_COST_PAGE:-0.02}"
GLOBAL_CAP="${GLOBAL_CAP:-2.00}"
FROM_PAGE=1
# Last narrative/bib page before Index title (PDF p.580). Not the PDF last page.
TO_PAGE=579
EXECUTE=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-page) FROM_PAGE="$2"; shift 2 ;;
    --to-page) TO_PAGE="$2"; shift 2 ;;
    --chunk) CHUNK="$2"; shift 2 ;;
    --experiment-id) EXPERIMENT="$2"; shift 2 ;;
    --global-cap) GLOBAL_CAP="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

mapfile -t ALL_PAGES < <(node --input-type=module -e "
import fs from 'fs';
import { parseHistoricalPages } from './lib/historicalExtractionV2.js';
const pages = parseHistoricalPages(fs.readFileSync('$PAGES_FILE','utf8')).map(p => p.page).sort((a,b)=>a-b);
const from = $FROM_PAGE;
const to = $TO_PAGE || pages[pages.length-1];
for (const p of pages) if (p >= from && p <= to) console.log(p);
")

echo "pages_planned=${#ALL_PAGES[@]} from=$FROM_PAGE to=${TO_PAGE:-end} experiment=$EXPERIMENT chunk=$CHUNK" | tee "$LOG"
if [[ ${#ALL_PAGES[@]} -eq 0 ]]; then
  echo "No pages in range"; exit 1
fi

# Inventory: detect duplicates / gaps in planned set
node --input-type=module -e "
const planned = \`${ALL_PAGES[*]}\`.trim().split(/\s+/).map(Number);
const set = new Set(planned);
console.log(JSON.stringify({
  planned: planned.length,
  unique: set.size,
  duplicates: planned.length - set.size,
  first: planned[0],
  last: planned[planned.length-1],
}, null, 2));
" | tee -a "$LOG"

if [[ "$DRY_RUN" -eq 1 || "$EXECUTE" -eq 0 ]]; then
  echo "DRY-RUN only (pass --execute to extract). Ledger untouched." | tee -a "$LOG"
  exit 0
fi

spent=0
ok=0
fail=0
skip=0
for ((i=0; i<${#ALL_PAGES[@]}; i+=CHUNK)); do
  chunk=("${ALL_PAGES[@]:i:CHUNK}")
  page="${chunk[0]}"
  count=${#chunk[@]}
  # Skip if ledger says complete for this experiment+page
  if node --input-type=module -e "
    import fs from 'fs';
    const page=$page, exp='$EXPERIMENT';
    let rows=[];
    try { rows = fs.readFileSync('$LEDGER','utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch {}
    const hit = rows.findLast(r => r.experiment_id===exp && r.from_page===page && r.page_count===$count && r.status==='ok');
    process.exit(hit ? 0 : 1);
  "; then
    echo "=== skip ledger-complete page $page x$count ===" | tee -a "$LOG"
    skip=$((skip+1))
    continue
  fi
  # Global spend ceiling from items jsonl for this experiment
  spent=$(node --input-type=module -e "
    import fs from 'fs';
    let sum=0;
    try {
      for (const line of fs.readFileSync('$ITEMS','utf8').trim().split('\n').filter(Boolean)) {
        const r=JSON.parse(line);
        if (r.experiment_id==='$EXPERIMENT') sum += Number(r.usage?.cost||0);
      }
    } catch {}
    console.log(sum.toFixed(6));
  ")
  awk -v s="$spent" -v c="$GLOBAL_CAP" 'BEGIN{exit (s+0 >= c+0) ? 0 : 1}' && {
    echo "STOP global spend $spent >= cap $GLOBAL_CAP" | tee -a "$LOG"
    break
  }
  echo "=== extract page $page count=$count spent_so_far=$spent ===" | tee -a "$LOG"
  if node cli/extract-historical-book-v2.js --v3 \
    --from-page "$page" \
    --page-count "$count" \
    --max-cost-usd "$(node -e "console.log(($MAX_COST_PAGE*$count).toFixed(4))")" \
    --experiment-id "$EXPERIMENT" \
    --quality-model google/gemma-3-27b-it \
    --resume \
    2>&1 | tee -a "$LOG" | tail -8; then
    status=ok
    ok=$((ok+1))
  else
    status=warn
    fail=$((fail+1))
  fi
  echo "{\"experiment_id\":\"$EXPERIMENT\",\"from_page\":$page,\"page_count\":$count,\"status\":\"$status\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LEDGER"
done
echo "DONE ok=$ok warn=$fail skip=$skip spent~$spent" | tee -a "$LOG"
