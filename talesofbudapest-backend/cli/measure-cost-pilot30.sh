#!/usr/bin/env bash
# Stratified ~30-page uncached cost/quality pilot on frozen stack.
set -uo pipefail
cd "$(dirname "$0")/.."
EXPERIMENT="${1:-cost-pilot-30-v2.12}"
PAGES=(12 28 46 55 75 88 100 101 102 120 140 160 180 200 220 240 260 280 300 320 340 360 380 400 420 440 460 480 500 520 540 560 580 600)
LOG=../ingest/corpus/restricted/extractions/cost-pilot30-$(date +%Y%m%d-%H%M%S).log
echo "Logging to $LOG n=${#PAGES[@]} experiment=$EXPERIMENT" | tee "$LOG"
for page in "${PAGES[@]}"; do
  echo "=== pilot page $page ===" | tee -a "$LOG"
  node cli/extract-historical-book-v2.js --v3 \
    --from-page "$page" \
    --page-count 1 \
    --max-cost-usd 0.02 \
    --experiment-id "$EXPERIMENT" \
    --quality-model google/gemma-3-27b-it \
    2>&1 | tee -a "$LOG" | tail -3
done
echo "DONE pilot30" | tee -a "$LOG"
EXPERIMENT="$EXPERIMENT" node --input-type=module -e '
import fs from "fs";
const exp = process.env.EXPERIMENT;
const rows = fs.readFileSync("../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl","utf8")
  .trim().split("\n").map(JSON.parse).filter(r => r.experiment_id === exp);
const byPage = new Map();
for (const r of rows) {
  for (const p of r.pdf_pages || []) {
    const prev = byPage.get(p);
    if (!prev || String(r.extracted_at) > String(prev.extracted_at)) byPage.set(p, r);
  }
}
const costs = [...byPage.entries()].map(([page, r]) => ({
  page,
  cost: r.usage?.cost || 0,
  status: r.status,
  calls: r.usage?.call_count || 0,
  supported: (r.items||[]).filter(i => i.verification?.verdict==="supported").length,
}));
const paid = costs.filter(c => c.cost > 0);
const avg = paid.reduce((s,c)=>s+c.cost,0) / Math.max(paid.length,1);
const under = costs.filter(c => c.cost <= 0.0020005 && ["complete","failed_cost_gate"].includes(c.status) && c.cost <= 0.0020005).length;
const completeUnder = costs.filter(c => c.status === "complete" && c.cost <= 0.0020005).length;
const sorted = [...paid].map(c=>c.cost).sort((a,b)=>a-b);
const p95 = sorted.length ? sorted[Math.min(sorted.length-1, Math.floor(sorted.length*0.95))] : null;
const statuses = {};
for (const c of costs) statuses[c.status] = (statuses[c.status]||0)+1;
console.log(JSON.stringify({ experiment: exp, pages: costs.length, avg: +avg.toFixed(4), p95: p95!=null?+p95.toFixed(4):null, complete_under_002: completeUnder, statuses }, null, 2));
'
