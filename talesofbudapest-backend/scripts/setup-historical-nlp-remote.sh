#!/usr/bin/env bash
# Prepare a remote server (satoshi/nakamoto) for the full-book V3 pass.
# Run FROM the Mac: ./scripts/setup-historical-nlp-remote.sh <host>
# Nothing here touches the remote until you invoke it explicitly.
set -euo pipefail

HOST="${1:?usage: setup-historical-nlp-remote.sh <ssh-host>}"
REMOTE_DIR="${REMOTE_DIR:-~/talesofbudapest}"
LOCAL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== 1/4 sync code + corpus (excludes node_modules, venv, extractions) =="
rsync -az --delete \
  --exclude node_modules --exclude .venv-historical-nlp --exclude .git \
  --exclude 'ingest/corpus/restricted/extractions' \
  "$LOCAL_ROOT/talesofbudapest-backend" "$LOCAL_ROOT/ingest" "$HOST:$REMOTE_DIR/"

echo "== 2/4 node deps =="
ssh "$HOST" "cd $REMOTE_DIR/talesofbudapest-backend && npm install --omit=dev"

echo "== 3/4 python NLP venv (GLiNER2 + spaCy) =="
ssh "$HOST" "cd $REMOTE_DIR/talesofbudapest-backend && python3 -m venv .venv-historical-nlp \
  && .venv-historical-nlp/bin/pip install -q -r requirements-historical-nlp.txt \
  && .venv-historical-nlp/bin/python -m spacy download en_core_web_sm"

echo "== 4/4 preflight smoke (no paid calls; needs OPENROUTER_API_KEY in backend/.env on remote) =="
ssh "$HOST" "cd $REMOTE_DIR/talesofbudapest-backend && npm run extract:historical:v3 -- \
  --source jewish-budapest --from-page 46 --page-count 1 --preflight-only --max-cost-usd 0.002"

cat <<'NEXT'
Remote ready. Full pass (screen/tmux recommended):
  node cli/run-historical-v3-batches.js --max-total-usd 2.50 \
    --primary-model deepseek/deepseek-v4-flash \
    --audit-model qwen/qwen3-30b-a3b-instruct-2507 \
    --quality-model google/gemini-2.5-flash \
    --primary-reasoning off
Pull results back with:
  rsync -az <host>:~/talesofbudapest/ingest/corpus/restricted/extractions/ ingest/corpus/restricted/extractions/
NEXT
