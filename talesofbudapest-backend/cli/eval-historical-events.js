import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const GOLDEN = option('--golden', path.join(__dirname, '../fixtures/historical-book-events-golden.json'));
const EVENTS = option('--events', path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-events.jsonl`));
const REPORT_ONLY = args.includes('--report-only');
const requestedPages = option('--pages', null)?.split(',').map(Number).filter(Number.isInteger) ?? null;

const fold = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const alternatives = (term) => (Array.isArray(term) ? term : [term]).map(fold);
const jsonl = (text) => text.trim().split('\n').filter(Boolean).map(JSON.parse);

const main = async () => {
  const golden = JSON.parse(await fs.readFile(GOLDEN, 'utf8'));
  if (golden.source_id !== SOURCE_ID || !Array.isArray(golden.events)) throw new Error('Golden fixture source/events mismatch');
  const rows = jsonl(await fs.readFile(EVENTS, 'utf8'));
  const latest = new Map();
  for (const row of rows.filter((item) => item.source_id === SOURCE_ID && Array.isArray(item.pdf_pages))) {
    const key = row.pdf_pages.join(',');
    const previous = latest.get(key);
    if (!previous || String(row.extracted_at ?? '') > String(previous.extracted_at ?? '')) latest.set(key, row);
  }
  const coveredPages = new Set([...latest.values()].flatMap((row) => row.pdf_pages));
  const pages = new Set(requestedPages ?? golden.pages.filter((page) => coveredPages.has(page)));
  const expected = golden.events.filter((event) => pages.has(event.page));
  const predicted = [...latest.values()].flatMap((row) => row.claims ?? [])
    .filter((claim) => pages.has(claim.evidence?.page_ref) && claim.verification?.verdict === 'supported')
    .map((claim, index) => ({ ...claim, prediction_id: `${claim.claim_id ?? 'claim'}:${index}` }));
  const used = new Set();
  const results = expected.map((event) => {
    const matches = predicted.flatMap((claim) => {
      if (used.has(claim.prediction_id) || claim.evidence?.page_ref !== event.page || claim.event_type !== event.event_type) return [];
      const claimText = fold(claim.claim_text);
      const participants = fold((claim.participants ?? []).flatMap((participant) => [participant.mention, participant.source_mention]).join(' '));
      const evidence = fold(claim.evidence?.quote);
      const allText = `${claimText} ${participants} ${evidence}`;
      if (!event.required_terms.every((term) => alternatives(term).some((value) => allText.includes(value)))) return [];
      const score = event.required_terms.reduce((sum, term) => sum + Math.max(...alternatives(term).map((value) => (claimText.includes(value) ? 3 : 0) + (participants.includes(value) ? 2 : 0) + (evidence.includes(value) ? 1 : 0))), 0);
      return [{ claim, score }];
    }).sort((left, right) => right.score - left.score);
    const match = matches[0]?.claim;
    if (match) used.add(match.prediction_id);
    return { id: event.id, page: event.page, matched: Boolean(match), prediction: match?.claim_text ?? null };
  });
  const truePositive = results.filter((item) => item.matched).length;
  const falsePositive = predicted.length - used.size;
  const falseNegative = expected.length - truePositive;
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = expected.length ? truePositive / expected.length : 0;
  const report = {
    source_id: SOURCE_ID,
    evaluated_pages: [...pages].sort((a, b) => a - b),
    expected: expected.length,
    predicted_supported: predicted.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision,
    recall,
    gate: { precision: 0.95, recall: 0.80, passed: precision >= 0.95 && recall >= 0.80 },
    misses: results.filter((item) => !item.matched),
    unmatched_predictions: predicted.filter((claim) => !used.has(claim.prediction_id)).map((claim) => ({ page: claim.evidence?.page_ref, event_type: claim.event_type, claim_text: claim.claim_text })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!REPORT_ONLY && !report.gate.passed) process.exitCode = 1;
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
