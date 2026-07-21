#!/usr/bin/env bash
# Retry non-complete fullbook pages under a SEPARATE experiment so we do not
# race the live scan ledger (which only skips status=ok for its own experiment).
#
# Default source experiment: fullbook-v2.12
# Default retry experiment:  fullbook-v2.12-retry
#
# Modes:
#   bash cli/retry-failed-fullbook.sh                  # incomplete_api + incomplete_layout gaps
#   bash cli/retry-failed-fullbook.sh --all-warn       # every ledger warn page so far
#   bash cli/retry-failed-fullbook.sh --pages 11,32,47  # explicit list
#
# Skips any page the live fullbook extract is currently running.
# Does NOT claim human certification or promotion.
set -uo pipefail
cd "$(dirname "$0")/.."

SOURCE_EXPERIMENT="${SOURCE_EXPERIMENT:-fullbook-v2.12}"
RETRY_EXPERIMENT="${RETRY_EXPERIMENT:-fullbook-v2.12-retry}"
ITEMS=../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl
LEDGER=../ingest/corpus/restricted/extractions/jewish-budapest.scan-ledger-v3.jsonl
LOG=../ingest/corpus/restricted/extractions/retry-failed-$(date +%Y%m%d-%H%M%S).log
MODE=need_fix   # need_fix | all_warn | pages
PAGES_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-experiment) SOURCE_EXPERIMENT="$2"; shift 2 ;;
    --retry-experiment) RETRY_EXPERIMENT="$2"; shift 2 ;;
    --all-warn) MODE=all_warn; shift ;;
    --pages) MODE=pages; PAGES_ARG="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

mapfile -t PAGES < <(node --input-type=module -e "
import fs from 'fs';
const itemsPath = '$ITEMS';
const ledgerPath = '$LEDGER';
const source = '$SOURCE_EXPERIMENT';
const mode = '$MODE';
const pagesArg = '$PAGES_ARG';

const itemRows = fs.readFileSync(itemsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  .filter((r) => r.experiment_id === source);
const byPage = new Map();
for (const row of itemRows) {
  const page = (row.pdf_pages ?? [])[0] ?? row.config?.from_page;
  if (page != null) byPage.set(Number(page), row);
}
const ledger = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  .filter((r) => r.experiment_id === source);
const warnPages = [...new Set(ledger.filter((r) => r.status === 'warn').map((r) => r.from_page))].sort((a, b) => a - b);

let pages = [];
if (mode === 'pages') {
  pages = pagesArg.split(',').map(Number).filter(Number.isFinite);
} else if (mode === 'all_warn') {
  pages = warnPages;
} else {
  // Prefer true gaps: incomplete_api, or warn with no item row (layout/crash).
  // failed_cost_gate already wrote usable supported items — skip by default.
  for (const page of warnPages) {
    const row = byPage.get(page);
    if (!row) { pages.push(page); continue; }
    if (row.status === 'incomplete_api' || row.status === 'incomplete_budget' || row.status === 'incomplete_layout') {
      pages.push(page);
    }
  }
}
console.log(pages.join('\n'));
")

# Portable live-page skip (macOS has no /proc cmdline the way Linux does)
LIVE_PAGE=$(pgrep -fl 'extract-historical-book-v2.js' 2>/dev/null | sed -n 's/.*--from-page \([0-9][0-9]*\).*/\1/p' | head -1 || true)
FILTERED=()
for page in "${PAGES[@]}"; do
  [[ -z "$page" ]] && continue
  if [[ -n "$LIVE_PAGE" && "$page" == "$LIVE_PAGE" ]]; then
    echo "SKIP live-extract page $page (experiment still running)" | tee -a "$LOG"
    continue
  fi
  FILTERED+=("$page")
done
PAGES=("${FILTERED[@]}")

echo "retry experiment=$RETRY_EXPERIMENT source=$SOURCE_EXPERIMENT pages=${PAGES[*]:-none} live_skip=${LIVE_PAGE:-none}" | tee "$LOG"
if [[ ${#PAGES[@]} -eq 0 ]]; then
  echo "No pages to retry."; exit 0
fi

ok=0
warn=0
for page in "${PAGES[@]}"; do
  echo "=== retry page $page → $RETRY_EXPERIMENT ===" | tee -a "$LOG"
  # Dense incomplete_api pages: more primary headroom + smaller quality batches.
  if KG_V3_PRIMARY_TOKENS="${KG_V3_PRIMARY_TOKENS:-6000}" \
     KG_V3_MAX_QUALITY_CANDIDATES="${KG_V3_MAX_QUALITY_CANDIDATES:-12}" \
     node cli/extract-historical-book-v2.js --v3 \
       --from-page "$page" \
       --page-count 1 \
       --max-cost-usd 0.02 \
       --experiment-id "$RETRY_EXPERIMENT" \
       --quality-model google/gemma-3-27b-it \
       2>&1 | tee -a "$LOG" | tail -12; then
    ok=$((ok + 1))
  else
    echo "WARN: page $page non-zero exit (row may still be usable if failed_cost_gate)" | tee -a "$LOG"
    warn=$((warn + 1))
  fi
done

echo "DONE retry ok_exit=$ok nonzero=$warn experiment=$RETRY_EXPERIMENT" | tee -a "$LOG"
node --input-type=module -e "
import fs from 'fs';
const exp = '$RETRY_EXPERIMENT';
const rows = fs.readFileSync('$ITEMS','utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  .filter((r) => r.experiment_id === exp);
const counts = {};
for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(JSON.stringify({ retry_rows: rows.length, statuses: counts, pages: rows.map((r) => (r.pdf_pages||[])[0]) }, null, 2));
" | tee -a "$LOG"
