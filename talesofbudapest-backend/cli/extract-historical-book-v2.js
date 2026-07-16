import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import { estimateExtractionCeiling, fetchOpenRouterCatalog, formatUsd, pricingForModels } from '../lib/openRouterCostGuard.js';
import { maskPdfFurniture } from '../lib/historicalPdfLayout.js';
import { buildStreetIndex, extractAddressReferences } from '../lib/historicalAddresses.js';
import {
  buildSubjectEntityIndex,
  createSubjectState,
  resolveSubjectReferences,
  serializeSubjectState,
  subjectContext,
} from '../lib/historicalSubjectMemory.js';
import {
  HISTORICAL_V2_PROMPT_VERSION,
  HISTORICAL_V2_SCHEMA_VERSION,
  SCHEMA_REGISTRY,
  aggregateUsage,
  applyCoverage,
  applyResolvedReferences,
  assignMentionIds,
  batchesOf,
  boundaryContextForPage,
  buildClauseLedger,
  dedupeHistoricalItems,
  itemHasResolvedReferences,
  needsQualityEscalation,
  normalizeModelItems,
  parseHistoricalPages,
  realignModelItemsToClauses,
  semanticTokenOverlap,
  sha256,
} from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? null;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const FROM_PAGE = Number(option('--from-page', '46'));
const PAGE_COUNT = Number(option('--page-count', '3'));
const MAX_COST_USD = Number(option('--max-cost-usd', String(PAGE_COUNT * 0.002)));
const PRIMARY_MODEL = option('--primary-model', process.env.KG_HISTORICAL_V2_PRIMARY_MODEL ?? 'google/gemini-2.5-flash-lite');
const AUDIT_MODEL = option('--audit-model', process.env.KG_HISTORICAL_V2_AUDIT_MODEL ?? 'qwen/qwen3-30b-a3b-instruct-2507');
const QUALITY_MODEL = option('--quality-model', process.env.KG_HISTORICAL_V2_QUALITY_MODEL ?? 'google/gemini-2.5-flash');
const NLP_MODEL = option('--nlp-model', process.env.KG_NLP_MODEL ?? 'fastino/gliner2-multi-v1');
const NLP_THRESHOLD = Number(option('--nlp-threshold', process.env.KG_NLP_THRESHOLD ?? '0.50'));
const NLP_PYTHON = option('--nlp-python', process.env.KG_NLP_PYTHON ?? path.join(__dirname, '../.venv-historical-nlp/bin/python'));
const PREFLIGHT_ONLY = args.includes('--preflight-only');
const RESUME = args.includes('--resume');
const V3 = args.includes('--v3');
// Experiment runs (model A/B tests) get their own cache-key component and a
// record marker so cache hits never masquerade as fresh model evidence and
// the browser's default/latest view is not polluted.
const EXPERIMENT_ID = option('--experiment-id', null);
// TSV extraction needs answers, not chains of thought: reasoning tokens count
// against max_tokens and truncate the protocol on reasoning-first models.
// Some endpoints (GPT-OSS) cannot disable reasoning, only lower it, so the
// extractor and auditor each get their own setting.
const REASONING = option('--reasoning', null); // off | low | medium | high
const PRIMARY_REASONING = option('--primary-reasoning', REASONING);
const AUDIT_REASONING = option('--audit-reasoning', REASONING);
const reasoningParam = (value) => value === null ? undefined
  : value === 'off' ? { enabled: false }
  : { effort: value };

const INPUT = path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`);
const OUTPUT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const PDF_PATH = option('--pdf', process.env.KG_HISTORICAL_PDF ?? (SOURCE_ID === 'jewish-budapest' ? path.join(__dirname, '../../ingest/corpus/restricted/raw/Jewish Budapest.pdf') : null));
const ITEM_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-items-${V3 ? 'v3' : 'v2'}.jsonl`);
const COVERAGE_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-coverage-${V3 ? 'v3' : 'v2'}.jsonl`);
const CACHE_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-${V3 ? 'v3' : 'v2'}-model-cache.jsonl`);
const SUBJECT_TRANSITIONS_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-subject-transitions-v3.jsonl`);
const SUBJECT_MEMORY_OUTPUT = path.resolve(option('--state-file', path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-subject-memory-v3.json`)));
const LAYOUT_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-layout-v3.jsonl`);
const ADDRESS_OUTPUT = path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-addresses-v3.jsonl`);
const GAZETTEER_PATH = option('--gazetteer', path.join(__dirname, '../../ingest/gazetteer/budapest-streets.json'));

const PRIMARY_MAX_TOKENS = 2500;
const AUDIT_MAX_TOKENS = 1800;
const VERIFY_MAX_TOKENS = 240;
const VERIFY_BATCH_SIZE = 8;
const QUALITY_MAX_TOKENS = 2200;
const MAX_QUALITY_CLAUSES = 12;
const PRIMARY_CACHE_VERSION = V3 ? 'historical-stateful-v3.1' : 'historical-semi-open-v2.8';
// Page 75/97 dev runs hit the previous caps exactly and truncated mid-item,
// which cascaded into audit mismatches and mass quality escalation. Measured
// natural output on dense dev pages is ~70 completion tokens per clause for
// the primary (I+R rows) and ~20 for the audit.
const primaryTokenLimit = (clauseCount) => V3 ? Number(process.env.KG_V3_PRIMARY_TOKENS ?? Math.min(4200, Math.max(800, 300 + clauseCount * 65))) : PRIMARY_MAX_TOKENS;
const auditTokenLimit = (clauseCount) => V3 ? Math.min(2400, Math.max(560, 220 + clauseCount * 24)) : AUDIT_MAX_TOKENS;
const qualityTokenLimit = () => V3 ? 700 : QUALITY_MAX_TOKENS;
// Compact TSV is mostly ASCII English. Two bytes/token remains deliberately
// pessimistic while avoiding V2's invalid one-byte-per-token reservation.
const v3InputTokens = (request) => Math.ceil(Buffer.byteLength(request, 'utf8') / 2);
const estimatedCeiling = ({ requests, modelPricing, maxOutputTokens }) => V3
  ? { usd: requests.reduce((sum, request) => sum + (v3InputTokens(request) * modelPricing.prompt) + (maxOutputTokens * modelPricing.completion) + modelPricing.request, 0) }
  : estimateExtractionCeiling({ requests, modelPricing: [modelPricing], maxOutputTokens });

const PRIMARY_LINE_PROTOCOL = `Output plain TSV lines, no JSON, markdown, header, tabs inside text, or commentary.
R<TAB>clause_id<TAB>antecedent_mention_id<TAB>surface_or_CONTINUATION
I<TAB>K<TAB>A<TAB>open_type<TAB>canonical_type_or_-<TAB>clause_ids_comma<TAB>participants_or_-<TAB>F<TAB>statement
V<TAB>item_id<TAB>J<TAB>short_reason
K: E event, A assertion. A: - event, S state, C rule/custom, R relationship, B belief/report, D description.
participants: mention_id=role comma-separated. F: three chars; polarity +|N, modality A|R|B|P|H|U, attribution -|T.
R maps a contextual pronoun/possessive or page-start continuation to one explicit antecedent mention. Emit R rows before I rows. Omit generic pronouns with no concrete entity antecedent.
Example: for c9="He died in Buda", c9 mentions m5=Buda/place, and boundary has m0=R. Efraim/person, emit R<TAB>c9<TAB>m0<TAB>He. Never emit m5: Buda is not the antecedent. Never emit R rows merely to list ordinary clause mentions.
J: S supported, P partial, U unsupported, A ambiguous, X contradicted.`;
const REVIEW_LINE_PROTOCOL = `Output plain TSV lines, no JSON, markdown, header, tabs inside text, or commentary.
I<TAB>K<TAB>A<TAB>open_type<TAB>canonical_type_or_-<TAB>clause_ids_comma<TAB>participants_or_-<TAB>F<TAB>statement
V<TAB>item_id<TAB>J<TAB>short_reason
K: E event, A assertion. A: - event, S state, C rule/custom, R relationship, B belief/report, D description.
participants: mention_id=role comma-separated. F: three chars; polarity +|N, modality A|R|B|P|H|U, attribution -|T.
J: S supported, P partial, U unsupported, A ambiguous, X contradicted.`;
const ITEM_EXAMPLES = `Valid examples (actual tab-separated rows):
I\tE\t-\tdeath\tbirth_or_death\tcl_example1\tm_example1=person\t+A-\tR. Example died during the epidemic.
I\tA\tC\tprivate_prayer_restriction\t-\tcl_example2\tm_example2=authority\tNR-\tPrivate prayer was not customary.
Never print K, A, F, ITEM, field names, or a row for a clause with no item. Every item row starts with I.`;
const WIRE_PAGE = `Input PAGE={"p":page_ref,"s":current_subjects,"b":{"prev":[boundary_text,mentions],"next":[boundary_text,mentions]},"c":[[clause_id,text,mentions,suggested_schemas,resolutions]...]}; mentions=[[mention_id,text,type]...]. s is compact source-local subject memory: [entity_id,label,type,aliases,roles]. resolutions=[[surface,antecedent]...] are authoritative locally resolved references for that clause (e.g. ["He","R. Efraim"]).`;

const PRIMARY_PROMPT = `Extract an exhaustive, source-grounded ledger from one historical-book page.

${PRIMARY_LINE_PROTOCOL}
${ITEM_EXAMPLES}
${WIRE_PAGE}

Rules:
- Inspect every clause. Return every explicit action, occurrence, change, state, rule, custom, relationship, belief, attributed report, and historically relevant description.
- No maximum item count. Separate genuinely independent items; do not split qualifiers into fake events.
- Keep statement under 20 words. Do not copy long source sentences.
- clause_ids and mention_ids must be copied exactly. Evidence is attached later from clause offsets; never write quotations.
- suggested schemas are hints, never gates. Use canonical_type null and a precise new open_type when needed.
- Boundary context resolves names and pronouns only. An item must be asserted by target clause_ids.
- Current subject memory is authoritative context, not evidence. Treat aliases such as full name, first name, R. Name, and "the rabbi" as one entity only when s presents them together. Never invent a different subject.
- When a fact spans adjacent clauses (name in one, predicate in the next), list every asserting clause id.
- Every acting, speaking, believing, described, or referenced person/group/organization must be a participant. For he/she/they/his/her/their and lowercase page-start continuations, copy the antecedent mention_id from boundary or earlier clauses. Never leave a resolvable subject or attribution unlinked.
- Emit one R row for every resolvable contextual reference, once per clause/reference. This clause-level map is mandatory even when several I rows share that clause.
- R surface must be the exact contextual expression: He, She, They, His, Her, Their, This, That, the former, the latter, or CONTINUATION. Never write "clause" as the surface.
- Preserve negation, plans, uncertainty, attribution, legends, beliefs, and disputed claims. Source support is not objective truth.
- Do not use outside knowledge. Emit I lines only. Every supplied clause is already tracked by the local ledger.`;

const AUDIT_PROMPT = `Independently extract every historical item from the supplied clauses.

Output plain TSV only: I<TAB>clause_ids_comma<TAB>kind<TAB>atomic_statement_under_20_words
kind is E for an event or A for an assertion. Example: I<TAB>c7<TAB>E<TAB>He returned to Prague.
No JSON, markdown, header, field names, mention IDs, schemas, verdicts, or commentary.
Input pages use {"p":page,"b":boundary_context,"c":[[clause_id,text,resolutions]...]}; resolutions=[[surface,antecedent]...] are authoritative locally resolved references for that clause.

Rules:
- Independently inspect every clause for events and assertions.
- Emit each discovery once as an I line. Never repeat a discovery.
- Keep statement under 20 words. Do not copy long source sentences.
- A static custom, rule, relationship, belief, report, or description is an assertion, not an event.
- Attributed, negated, planned, uncertain, or disputed content can be supported when represented with correct status.
- clause_ids and mention_ids must be copied exactly. Never invent evidence, names, dates, or outside facts.
- Resolve page-start continuations and pronouns from boundary/earlier clauses. Include the antecedent in the statement; audit output has no participant field.
- Emit I lines only. Do not discuss or judge another model's output.`;

const VERIFY_PROMPT = `Verify compact candidate items against supplied exact clause text.
Output exactly one TSV row per candidate and nothing else: item_id<TAB>judgment.
Judgment is S supported, P partially supported, U unsupported, A ambiguous, or X contradicted.
Example actual row: hi_example1\tS
No header, field names, reasons, JSON, markdown, or commentary. Judge semantic support, participant roles, polarity, modality, attribution, and scope. Clauses may carry resolutions [[surface,antecedent]...]: treat them as authoritative, so a candidate naming the antecedent where the clause shows only a pronoun is still supported. A statement logically equivalent to the clause content (paraphrase, double negation) is supported; content the clause presupposes ("even after he converted" asserts the conversion) is asserted content, but a candidate ADDING anything absent from the clauses (names, dates, verse or chapter numbers, places) is unsupported even when plausible. No outside knowledge. Classify every candidate ID exactly once.`;

const QUALITY_PROMPT = `Adjudicate difficult historical extraction candidates using only supplied clauses and boundary context.

${REVIEW_LINE_PROTOCOL}
${ITEM_EXAMPLES}
Input CANDIDATE rows are compact arrays. Emit one V row per candidate, then I only for new/corrected items.
Valid verdict example: V\thi_example1\tS\tclause asserts the death directly

Rules:
- Return one verdict per candidate. If a candidate is materially wrong, reject it and optionally add a corrected item.
- Search supplied risky clauses for omissions too. I lines contain only new or corrected grounded items.
- Resolve cross-page pronouns only from boundary context. The target clause must still assert the item.
- Clause resolutions [[surface,antecedent]...] are authoritative: a candidate naming the antecedent where the clause shows a pronoun is supported.
- A statement logically equivalent to the clause content is supported: paraphrase, double negation, presupposed content ("even after he converted" asserts the conversion), or a fact asserted jointly by directly adjacent supplied clauses. A candidate ADDING anything absent from the clauses (names, dates, verse or chapter numbers, places) is unsupported even when plausible.
- A candidate with he/she/they/his/her/their or a lowercase page-start continuation is not supported when its antecedent participant is missing. Reject it and emit a corrected I row with the boundary/earlier mention_id.
- Preserve open types, negation, attribution, uncertainty, plans, and disputed beliefs.
- clause_ids and mention_ids must be copied exactly. No outside knowledge. No rewritten evidence.
- FIRST judge every candidate individually: one V row per candidate with its own item_id, judgment, and a short evidence-based reason. Blanket identical judgments without inspection are protocol violations. Then optional I lines.`;

class BudgetExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceeded';
  }
}

const appendJsonl = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
};

const readJsonl = async (file) => {
  try {
    return (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

const readSubjectMemory = async (file, sourceId, expectedPreviousPage) => {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value?.source_id !== sourceId || value?.version !== 1 || value?.last_page !== expectedPreviousPage) return null;
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const saveSubjectMemory = async (file, state, lastPage) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(serializeSubjectState(state, lastPage), null, 2)}\n`, 'utf8');
};

const runLocalNlp = (pages) => new Promise((resolve, reject) => {
  const script = path.join(__dirname, '../nlp/gliner2_mentions.py');
  const child = spawn(NLP_PYTHON, [script, '--model', NLP_MODEL, '--threshold', String(NLP_THRESHOLD), ...(V3 ? ['--noun-ledger'] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
  child.on('error', (error) => reject(new Error(`Could not start local NLP at ${NLP_PYTHON}: ${error.message}`)));
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`Local NLP failed (${code}): ${stderr.trim() || 'no diagnostic'}`));
    try { resolve(JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1))); }
    catch (error) { reject(new Error(`Local NLP returned invalid JSON: ${error.message}`)); }
  });
  child.stdin.end(JSON.stringify({ pages }));
});

const mentionsForClause = (clause, mentionById) => clause.mention_ids.flatMap((id) => {
  const mention = mentionById.get(id);
  return mention ? [{ mention_id: id, text: mention.normalized_text ?? mention.text, type: mention.type }] : [];
});

const COREFERENCE_MENTION_TYPES = new Set(['person', 'family', 'group', 'organisation']);
const boundaryMentions = ({ allPages, page, mentions, boundary }) => {
  const pageText = new Map(allPages.map((entry) => [entry.page, entry.text]));
  const collect = (boundaryPage, text, fromEnd) => {
    if (!text) return [];
    const source = pageText.get(boundaryPage) ?? '';
    const start = fromEnd ? source.lastIndexOf(text) : source.indexOf(text);
    if (start < 0) return [];
    const end = start + text.length;
    return mentions.filter((mention) => mention.page === boundaryPage
      && COREFERENCE_MENTION_TYPES.has(mention.type)
      && mention.start_offset < end && mention.end_offset > start)
      .map((mention) => ({ mention_id: mention.mention_id, text: mention.normalized_text ?? mention.text, type: mention.type }));
  };
  return {
    previous: collect(page - 1, boundary.previous_page_last_paragraph, true),
    next: collect(page + 1, boundary.next_page_first_paragraph, false),
  };
};

const pagePayload = ({ page, clauses, mentionById, mentions, allPages }) => {
  const boundaryContext = boundaryContextForPage(allPages, page);
  return {
  page_ref: page,
  boundary_context: boundaryContext,
  boundary_mentions: boundaryMentions({ allPages, page, mentions, boundary: boundaryContext }),
  clauses: clauses.filter((clause) => clause.page_ref === page).map((clause) => ({
    clause_id: clause.clause_id,
    text: clause.text,
    mentions: mentionsForClause(clause, mentionById),
    suggested_schemas: clause.suggested_schemas,
    allow_other: true,
    risk_flags: clause.risk_flags,
  })),
  };
};

const createWireIds = (clauses, mentions) => {
  const clauseToWire = new Map(clauses.map((clause, index) => [clause.clause_id, `c${index.toString(36)}`]));
  const mentionToWire = new Map(mentions.map((mention, index) => [mention.mention_id, `m${index.toString(36)}`]));
  return {
    clause: (id) => clauseToWire.get(id) ?? id,
    mention: (id) => mentionToWire.get(id) ?? id,
    clauseFromWire: new Map([...clauseToWire].map(([id, wire]) => [wire, id])),
    mentionFromWire: new Map([...mentionToWire].map(([id, wire]) => [wire, id])),
  };
};

const wireClause = (clause, wireIds) => [
  wireIds.clause(clause.clause_id),
  clause.text,
  (clause.mentions ?? []).map((mention) => [wireIds.mention(mention.mention_id), mention.text, mention.type]),
  clause.suggested_schemas.slice(0, 3),
  (clause.resolutions ?? []).map((row) => [row.surface, row.label]),
];

const wireBoundary = (payload, wireIds) => ({
  prev: [
    payload.boundary_context.previous_page_last_paragraph,
    payload.boundary_mentions.previous.map((mention) => [wireIds.mention(mention.mention_id), mention.text, mention.type]),
  ],
  next: [
    payload.boundary_context.next_page_first_paragraph,
    payload.boundary_mentions.next.map((mention) => [wireIds.mention(mention.mention_id), mention.text, mention.type]),
  ],
});

const wirePage = (payload, wireIds) => ({
  p: payload.page_ref,
  s: payload.subject_context ?? [],
  b: wireBoundary(payload, wireIds),
  c: payload.clauses.map((clause) => wireClause(clause, wireIds)),
});

const wireAuditPage = (payload, wireIds) => ({
  p: payload.page_ref,
  b: wireBoundary(payload, wireIds),
  c: payload.clauses.map((clause) => [wireIds.clause(clause.clause_id), clause.text, (clause.resolutions ?? []).map((row) => [row.surface, row.label])]),
});

const modalityCode = { asserted: 'A', reported: 'R', believed: 'B', planned: 'P', hypothetical: 'H', uncertain: 'U' };
const assertionCode = { state: 'S', rule_custom: 'C', relationship: 'R', belief_report: 'B', description: 'D' };
const wireKnownItem = (item, wireIds, itemId = item.item_id) => [
  itemId,
  item.kind === 'event' ? 'E' : 'A',
  item.assertion_kind ? assertionCode[item.assertion_kind] : '-',
  item.open_type,
  item.canonical_type ?? '-',
  item.clause_ids.map((id) => wireIds.clause(id)).join(','),
  item.participants.map((participant) => `${wireIds.mention(participant.mention_id)}=${participant.role}`).join(',') || '-',
  `${item.polarity === 'negated' ? 'N' : '+'}${modalityCode[item.modality] ?? 'A'}${item.attribution ? 'T' : '-'}`,
  item.statement_en,
];

const decodeItemLine = (columns, wireIds) => {
  const kind = columns[1] === 'E' ? 'event' : columns[1] === 'A' ? 'assertion' : null;
  const assertionKinds = { S: 'state', C: 'rule_custom', R: 'relationship', B: 'belief_report', D: 'description' };
  const modalities = { A: 'asserted', R: 'reported', B: 'believed', P: 'planned', H: 'hypothetical', U: 'uncertain' };
  const flags = columns[7] ?? '+A-';
  let statement = columns.slice(8).join(' ').trim();
  const leakedType = statement.match(/^([a-z][a-z0-9_]+)\.\s+/u)?.[1];
  if (leakedType && SCHEMA_REGISTRY[leakedType]) statement = statement.replace(/^[a-z][a-z0-9_]+\.\s+/u, '');
  return {
    kind,
    assertion_kind: kind === 'assertion' ? assertionKinds[columns[2]] ?? (columns[2] === '-' ? 'description' : null) : null,
    open_type: columns[3],
    canonical_type: columns[4] === '-' ? null : columns[4],
    clause_ids: columns[5]?.split(',').filter(Boolean).map((id) => wireIds.clauseFromWire.get(id) ?? id) ?? [],
    participants: columns[6] === '-' ? [] : (columns[6]?.split(',').flatMap((value) => {
      const separator = value.indexOf('=');
      const mentionId = value.slice(0, separator);
      return separator > 0 ? [{ mention_id: wireIds.mentionFromWire.get(mentionId) ?? mentionId, role: value.slice(separator + 1), resolved_entity_id: null }] : [];
    }) ?? []),
    polarity: flags[0] === 'N' ? 'negated' : 'affirmed',
    modality: modalities[flags[1]] ?? 'asserted',
    attribution: flags[2] === 'T' ? 'source_attributed' : null,
    statement_en: statement,
    time: null,
    place: null,
    dynamic_attributes: [],
  };
};

const parseProtocol = (completion, wireIds) => {
  const raw = String(completion.choices?.[0]?.message?.content ?? '').replace(/^```[^\n]*\n|\n```$/g, '').trim();
  const response = { items: [], coverage: [], verdicts: [], references: [], raw_preview: raw.slice(0, 1000) };
  for (const line of raw.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
    const normalizedLine = line.replace(/<TAB>/giu, '\t').replace(/\\t/gu, '\t');
    const columns = normalizedLine.includes('\t')
      ? normalizedLine.split('\t').map((value) => value.trim())
      : normalizedLine.includes('|')
        ? normalizedLine.replace(/^\||\|$/g, '').split('|').map((value) => value.trim())
        : normalizedLine.split(/\s{2,}/u).map((value) => value.trim());
    if (columns[0] === 'I' && columns.length === 8 && /^c[0-9a-z]+$/u.test(columns[4] ?? '')) columns.splice(4, 0, '-');
    // Audit models sometimes fuse clause ids and kind with a comma
    // ("I<TAB>c0,E<TAB>statement"); repair deterministically.
    if (columns[0] === 'I' && /^c[0-9a-z]+(?:,c[0-9a-z]+)*,[EA]$/u.test(columns[1] ?? '')) {
      const parts = columns[1].split(',');
      const fusedKind = parts.pop();
      columns.splice(1, 1, parts.join(','), fusedKind);
    }
    if (columns[0] === 'R' && columns.length >= 4) {
      response.references.push({
        clause_id: wireIds.clauseFromWire.get(columns[1]) ?? columns[1],
        antecedent_mention_id: wireIds.mentionFromWire.get(columns[2]) ?? columns[2],
        surface: columns.slice(3).join(' ').slice(0, 80),
        resolution_source: 'primary_coreference',
      });
    } else if (columns[0] === 'I' && /^c[0-9a-z]+(?:,c[0-9a-z]+)*$/u.test(columns[1] ?? '') && ['E', 'A', 'E|A'].includes(columns[2]) && columns.length >= 4) {
      const auditKind = columns[2] === 'E' ? 'event' : 'assertion';
      response.items.push({
        kind: auditKind,
        assertion_kind: auditKind === 'assertion' ? 'description' : null,
        open_type: auditKind === 'event' ? 'independent_event' : 'independent_assertion',
        canonical_type: null,
        clause_ids: columns[1].split(',').map((id) => wireIds.clauseFromWire.get(id) ?? id),
        participants: [], polarity: 'affirmed', modality: 'asserted', attribution: null,
        statement_en: columns.slice(3).join(' ').trim(), time: null, place: null, dynamic_attributes: [],
      });
    } else if (columns[0] === 'I' && columns.length >= 9) response.items.push(decodeItemLine(columns, wireIds));
    else if (columns[0] === 'C' && columns.length >= 3) {
      const dispositions = { C: 'covered', B: 'background_only', R: 'reference_only', A: 'ambiguous' };
      if (dispositions[columns[1]]) {
        response.coverage.push(...columns[2].split(',').filter(Boolean).map((clauseId) => ({ clause_id: wireIds.clauseFromWire.get(clauseId) ?? clauseId, disposition: dispositions[columns[1]] })));
      }
    } else if (columns[0] === 'V' && columns.length >= 3) {
      const verdicts = { S: 'supported', P: 'partially_supported', U: 'unsupported', A: 'ambiguous', X: 'contradicted_by_evidence' };
      if (verdicts[columns[1]]) {
        response.verdicts.push(...columns[2].split(',').filter(Boolean).map((itemId) => ({ item_id: itemId, verdict: verdicts[columns[1]], reason: '' })));
      } else if (verdicts[columns[2]]) {
        response.verdicts.push({ item_id: columns[1], verdict: verdicts[columns[2]], reason: columns.slice(3).join(' ').trim() });
      }
    } else if (/^[a-z][a-z0-9_]*$/u.test(columns[0] ?? '') && columns.length >= 2) {
      const verdicts = { S: 'supported', P: 'partially_supported', U: 'unsupported', A: 'ambiguous', X: 'contradicted_by_evidence' };
      if (verdicts[columns[1]]) response.verdicts.push({ item_id: columns[0], verdict: verdicts[columns[1]], reason: '' });
    }
  }
  if (raw && !response.items.length && !response.coverage.length && !response.verdicts.length && !response.references.length) throw new Error(`unrecognized protocol: ${JSON.stringify(response.raw_preview.slice(0, 300))}`);
  return response;
};

const validateProtocol = ({ response, expectedClauseIds: _expectedClauseIds, expectedVerdictIds }) => {
  const judged = new Set(response.verdicts.map((row) => row.item_id));
  const missingVerdicts = expectedVerdictIds.filter((id) => !judged.has(id));
  if (missingVerdicts.length) throw new Error(`protocol incomplete: ${missingVerdicts.length} verdict rows missing; ${JSON.stringify(response.raw_preview?.slice(0, 300) ?? '')}`);
};

const batchItemsByClauses = (items, maximum) => {
  const batches = [];
  let current = [];
  let ids = new Set();
  for (const item of items) {
    const next = new Set([...ids, ...item.clause_ids]);
    if (current.length && next.size > maximum) {
      batches.push(current);
      current = [];
      ids = new Set();
    }
    current.push(item);
    item.clause_ids.forEach((id) => ids.add(id));
  }
  if (current.length) batches.push(current);
  return batches;
};

const sameDiscoveredItem = (left, right) => {
  if (!left.clause_ids.some((id) => right.clause_ids.includes(id))) return false;
  if (semanticTokenOverlap(left.statement_en, right.statement_en) >= 0.55) return true;
  if (left.kind !== right.kind || left.assertion_kind !== right.assertion_kind) return false;
  if (left.canonical_type && right.canonical_type) return left.canonical_type === right.canonical_type;
  return left.open_type === right.open_type && left.open_type !== 'independent_event' && left.open_type !== 'independent_assertion';
};

const main = async () => {
  if (!Number.isInteger(FROM_PAGE) || FROM_PAGE < 1 || !Number.isInteger(PAGE_COUNT) || PAGE_COUNT < 1) throw new Error('Invalid --from-page or --page-count');
  if (!Number.isFinite(MAX_COST_USD) || MAX_COST_USD <= 0 || !Number.isFinite(NLP_THRESHOLD) || NLP_THRESHOLD <= 0 || NLP_THRESHOLD > 1) throw new Error('Invalid --max-cost-usd or --nlp-threshold');
  if (new Set([PRIMARY_MODEL, AUDIT_MODEL, QUALITY_MODEL]).size !== 3) throw new Error('Primary, audit, and quality models must be distinct');

  const allPages = parseHistoricalPages(await fs.readFile(INPUT, 'utf8'));
  const targetPages = allPages.filter((page) => page.page >= FROM_PAGE).slice(0, PAGE_COUNT);
  if (targetPages.length !== PAGE_COUNT) throw new Error(`Only found ${targetPages.length} of ${PAGE_COUNT} requested pages`);
  const targetNumbers = targetPages.map((page) => page.page);
  const targetSet = new Set(targetNumbers);
  const firstPage = targetNumbers[0];
  const lastPage = targetNumbers.at(-1);
  const contextPages = allPages.filter((page) => page.page >= firstPage - 1 && page.page <= lastPage + 1);
  let nlpContextPages = contextPages;
  let payloadPages = allPages;
  let layout = [];
  if (V3) {
    if (!PDF_PATH || !(await fs.stat(PDF_PATH).then(() => true).catch(() => false))) throw new Error('incomplete_layout: V3 requires --pdf pointing to the source PDF');
    const masked = maskPdfFurniture({ pdfPath: PDF_PATH, pages: contextPages });
    nlpContextPages = masked.pages;
    layout = masked.layout;
    const maskedByPage = new Map(masked.pages.map((page) => [page.page, page]));
    payloadPages = allPages.map((page) => maskedByPage.get(page.page) ?? page);
  }
  const sourceSha = sha256(targetPages.map((page) => `${page.page}\u001f${page.text}`).join('\u001e'));
  const config = { primary_model: PRIMARY_MODEL, audit_model: AUDIT_MODEL, quality_model: QUALITY_MODEL, nlp_model: NLP_MODEL, nlp_threshold: NLP_THRESHOLD, prompt_version: HISTORICAL_V2_PROMPT_VERSION, subject_memory: V3 ? 'stateful-v3' : null, experiment_id: EXPERIMENT_ID };
  const runKey = sha256(JSON.stringify({ source_id: SOURCE_ID, pages: targetNumbers, source_sha: sourceSha, config }));

  if (RESUME) {
    const completed = (await readJsonl(ITEM_OUTPUT)).findLast((row) => row.run_key === runKey && row.status === 'complete');
    if (completed) {
      console.log(`Already complete: ${completed.run_id}; ${completed.items?.length ?? 0} items; no calls made.`);
      return;
    }
  }

  console.log(`Local NLP: ${nlpContextPages.length} pages including boundary context.`);
  const nlp = await runLocalNlp(nlpContextPages);
  const nounPhrases = V3 ? nlp.noun_phrases : [];
  if (V3 && !Array.isArray(nounPhrases)) throw new Error('V3 requires the local noun-phrase ledger; local NLP returned none');
  const indexedMentions = buildSubjectEntityIndex({ sourceId: SOURCE_ID, mentions: assignMentionIds(SOURCE_ID, nlp.mentions ?? []) });
  const mentions = indexedMentions.mentions;
  const targetReadingPages = (nlp.reading_pages ?? []).filter((page) => targetSet.has(page.page));
  const clauses = buildClauseLedger({ sourceId: SOURCE_ID, targetPages, readingPages: targetReadingPages, mentions });
  if (!clauses.length) throw new Error('Local clause ledger is empty');
  const mentionById = new Map(mentions.map((mention) => [mention.mention_id, mention]));
  const clauseById = new Map(clauses.map((clause) => [clause.clause_id, clause]));
  // Street/address fact layer: deterministic, local, gazetteer-matched.
  let addressReferences = [];
  let gazetteerSources = [];
  if (V3) {
    try {
      const gazetteer = JSON.parse(await fs.readFile(GAZETTEER_PATH, 'utf8'));
      const streetIndex = buildStreetIndex(gazetteer);
      gazetteerSources = gazetteer.sources ?? [];
      addressReferences = targetReadingPages.flatMap((page) => extractAddressReferences(page.text, streetIndex).map((row) => ({
        ...row,
        page_ref: page.page,
        start_offset: page.raw_starts[row.reading_start] ?? null,
        end_offset: page.raw_ends[Math.min(row.reading_end, page.raw_ends.length) - 1] ?? null,
      })));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      console.warn(`Gazetteer missing at ${GAZETTEER_PATH}; address layer skipped. Run: node cli/build-budapest-gazetteer.js`);
    }
  }
  const persistedSubjectMemory = V3 ? await readSubjectMemory(SUBJECT_MEMORY_OUTPUT, SOURCE_ID, firstPage - 1) : null;
  const subjectState = V3 ? createSubjectState({ sourceId: SOURCE_ID, entities: indexedMentions.entities, aliasIndex: indexedMentions.aliasIndex, persisted: persistedSubjectMemory }) : null;
  const subjectTransitions = [];
  const wireIds = createWireIds(clauses, mentions);
  const pagePayloads = targetNumbers.map((page) => pagePayload({ page, clauses, mentionById, mentions, allPages: payloadPages }));
  const pagePayloadByPage = new Map(pagePayloads.map((payload) => [payload.page_ref, payload]));
  const boundaryContinuationReferences = pagePayloads.flatMap((payload) => {
    const firstClause = payload.clauses[0];
    if (!firstClause?.risk_flags.includes('cross_page_continuation')) return [];
    const antecedent = payload.boundary_mentions.previous.filter((mention) => mention.type === 'person').at(-1);
    return antecedent ? [{
      clause_id: firstClause.clause_id,
      antecedent_mention_id: antecedent.mention_id,
      surface: 'CONTINUATION',
      resolution_source: 'deterministic_boundary_join',
    }] : [];
  });
  console.log(`Clause ledger: ${clauses.length} clauses; ${mentions.length} mentions; no cue gate.`);

  const catalog = await fetchOpenRouterCatalog();
  const pricing = new Map(pricingForModels([PRIMARY_MODEL, AUDIT_MODEL, QUALITY_MODEL], catalog).map((item) => [item.modelId, item]));
  const primaryRequests = pagePayloads.map((payload) => `${PRIMARY_PROMPT}\n${JSON.stringify(wirePage(payload, wireIds))}`);
  const auditSkeletons = batchesOf(pagePayloads, 2).map((payloads) => `${AUDIT_PROMPT}\n${JSON.stringify({ pages: payloads.map((payload) => wireAuditPage(payload, wireIds)) })}`);
  const primaryCeiling = pagePayloads.reduce((sum, payload, index) => sum + estimatedCeiling({ requests: [primaryRequests[index]], modelPricing: pricing.get(PRIMARY_MODEL), maxOutputTokens: primaryTokenLimit(payload.clauses.length) }).usd, 0);
  const auditCeiling = batchesOf(pagePayloads, 2).reduce((sum, payloads, index) => sum + estimatedCeiling({ requests: [auditSkeletons[index]], modelPricing: pricing.get(AUDIT_MODEL), maxOutputTokens: auditTokenLimit(payloads.flatMap((payload) => payload.clauses).length) }).usd, 0);
  const qualityReservePayload = { clauses: clauses.slice(0, Math.max(1, Math.ceil(clauses.length * 0.1))).slice(0, MAX_QUALITY_CLAUSES).map((clause) => wireClause({ ...clause, mentions: mentionsForClause(clause, mentionById) }, wireIds)), candidates: [] };
  const qualityReserve = estimatedCeiling({ requests: [`${QUALITY_PROMPT}\n${JSON.stringify(qualityReservePayload)}`], modelPricing: pricing.get(QUALITY_MODEL), maxOutputTokens: qualityTokenLimit() }).usd;
  console.log(`Routine ceiling ${formatUsd(primaryCeiling + auditCeiling)}; quality reserve ${formatUsd(qualityReserve)}; hard cap ${formatUsd(MAX_COST_USD)}.`);
  if (primaryCeiling + auditCeiling > MAX_COST_USD) throw new Error(`Routine conservative ceiling ${formatUsd(primaryCeiling + auditCeiling)} exceeds hard cap ${formatUsd(MAX_COST_USD)}`);
  const normalizedBodySha = V3 ? sha256(payloadPages.filter((page) => targetSet.has(page.page)).map((page) => `${page.page}${page.text}`).join('')) : null;

  const reserveFits = primaryCeiling + auditCeiling + qualityReserve <= MAX_COST_USD;
  const baseRecord = {
    run_id: crypto.randomUUID(),
    run_key: runKey,
    source_id: SOURCE_ID,
    pdf_pages: targetNumbers,
    source_text_sha256: sourceSha,
    schema_version: V3 ? 'historical-items-v3' : HISTORICAL_V2_SCHEMA_VERSION,
    config,
    max_cost_usd: MAX_COST_USD,
    publication_status: 'private',
    mentions,
    entity_aliases: V3 ? [...indexedMentions.entities.values()].map((entity) => ({ ...entity, aliases: [...entity.aliases], roles: [...entity.roles] })) : undefined,
    layout: V3 ? { pdf_path: PDF_PATH, pages: layout } : undefined,
    subject_memory_cold_start: V3 ? persistedSubjectMemory == null : undefined,
    subject_state_loaded_last_page: V3 ? persistedSubjectMemory?.last_page ?? null : undefined,
    experiment_id: EXPERIMENT_ID ?? undefined,
    budget: V3 ? {
      routine_ceiling_usd: primaryCeiling + auditCeiling,
      quality_reserve_usd: qualityReserve,
      hard_cap_usd: MAX_COST_USD,
      reserve_fits: reserveFits,
    } : undefined,
  };

  if (PREFLIGHT_ONLY) {
    await appendJsonl(COVERAGE_OUTPUT, { ...baseRecord, status: 'preflight', clauses });
    await appendJsonl(ITEM_OUTPUT, { ...baseRecord, status: 'preflight', items: [], usage: aggregateUsage([]) });
    if (V3) await appendJsonl(LAYOUT_OUTPUT, { ...baseRecord, status: 'preflight', layout });
    if (V3 && addressReferences.length) await appendJsonl(ADDRESS_OUTPUT, { ...baseRecord, status: 'preflight', gazetteer_sources: gazetteerSources, address_references: addressReferences });
    if (V3 && !reserveFits) console.warn(`Preflight warning: quality reserve ${formatUsd(qualityReserve)} does not fit the hard cap; a paid run would stop as incomplete_budget.`);
    console.log('Preflight complete. Local ledger stored; no paid calls made.');
    return;
  }

  // The whole batch must fund the quality reserve before any paid call. A
  // reserve that cannot fit stops the run; quality is never downgraded.
  if (V3 && !reserveFits) {
    const reason = `Quality reserve ${formatUsd(qualityReserve)} cannot fit: routine ${formatUsd(primaryCeiling + auditCeiling)} + reserve exceeds hard cap ${formatUsd(MAX_COST_USD)}`;
    await appendJsonl(ITEM_OUTPUT, { ...baseRecord, status: 'incomplete_budget', failure_reason: reason, items: [], usage: aggregateUsage([]) });
    console.error(`incomplete_budget: ${reason}`);
    process.exitCode = 1;
    return;
  }
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required after local preflight');

  const cachedRows = await readJsonl(CACHE_OUTPUT);
  const cache = new Map(cachedRows.filter((row) => row?.cache_key && row?.payload).map((row) => [row.cache_key, row]));
  const calls = [];
  let spent = 0;
  // Routine calls may not eat into the quality reserve; only quality
  // adjudication and its reflection verification can spend it.
  const budgetCapFor = (operation) => V3 && !/historical\.v2\.(?:quality|reflection)/u.test(operation)
    ? MAX_COST_USD - qualityReserve
    : MAX_COST_USD;
  const callProtocol = async ({ operation, model, system, payload, maxTokens, expectedClauseIds = [], expectedVerdictIds = [], stateHash = null }) => {
    const requestText = `${system}\n${JSON.stringify(payload)}`;
    const promptVersion = operation === 'historical.v2.primary' ? PRIMARY_CACHE_VERSION : HISTORICAL_V2_PROMPT_VERSION;
    // V3 cache keys bind the normalized body, incoming subject state, prompt/
    // schema version, model, and output limit: a changed prior-page subject
    // state invalidates the next page's cache entry.
    const cacheKey = sha256(JSON.stringify(V3
      ? { operation, model, prompt_version: promptVersion, request: requestText, max_tokens: maxTokens, body_sha: normalizedBodySha, state_hash: stateHash, experiment_id: EXPERIMENT_ID, reasoning: [PRIMARY_REASONING, AUDIT_REASONING] }
      : { operation, model, prompt_version: promptVersion, request: requestText }));
    const cached = cache.get(cacheKey);
    if (cached) {
      validateProtocol({ response: cached.payload, expectedClauseIds, expectedVerdictIds });
      calls.push({ operation, model, usage: cached.usage ?? null, cache_hit: true });
      return cached.payload;
    }
    const ceiling = estimatedCeiling({ requests: [requestText], modelPricing: pricing.get(model), maxOutputTokens: maxTokens }).usd;
    const budgetCap = budgetCapFor(operation);
    if (spent + ceiling > budgetCap) throw new BudgetExceeded(`${operation} ceiling ${formatUsd(ceiling)} exceeds remaining ${formatUsd(budgetCap - spent)}`);
    let completion;
    let parsed;
    const attemptCalls = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // A truncated first attempt retries once with 50% more output room.
      const attemptTokens = attempt ? Math.ceil(maxTokens * 1.5) : maxTokens;
      completion = await createChatCompletion({
        operation: `${operation}${attempt ? '.protocol_retry' : ''}`,
        model,
        messages: [{ role: 'system', content: attempt ? `${system}\nRETRY: obey TSV exactly; classify every candidate in grouped V rows first.` : system }, { role: 'user', content: JSON.stringify(payload) }],
        max_tokens: attemptTokens,
        temperature: 0,
        // The quality judge keeps its default reasoning behavior; the flags
        // only govern the routine extractor and auditor/verifier.
        reasoning: /historical\.v2\.(?:quality|reflection)/u.test(operation) ? undefined
          : operation === 'historical.v2.primary' ? reasoningParam(PRIMARY_REASONING)
          : reasoningParam(AUDIT_REASONING),
      });
      const charged = Number(completion.usage?.cost ?? ceiling);
      spent += charged;
      const attemptCall = { operation, model: completion.model ?? model, usage: completion.usage ?? null, cache_hit: false };
      calls.push(attemptCall);
      attemptCalls.push(attemptCall);
      try {
        if (completion.choices?.[0]?.finish_reason === 'length') {
          if (process.env.KG_DEBUG) console.error(`[truncated ${operation} @${attemptTokens}] tail: ${String(completion.choices?.[0]?.message?.content ?? '').slice(-400)}`);
          throw new Error('output truncated at token limit');
        }
        parsed = parseProtocol(completion, wireIds);
        validateProtocol({ response: parsed, expectedClauseIds, expectedVerdictIds });
        break;
      }
      catch (error) {
        if (attempt === 1) throw new Error(`${operation} returned incomplete line protocol twice: ${error.message}`);
        const retryCeiling = estimatedCeiling({ requests: [requestText], modelPricing: pricing.get(model), maxOutputTokens: Math.ceil(maxTokens * 1.5) }).usd;
        if (spent + retryCeiling > budgetCap) throw new BudgetExceeded(`${operation} protocol retry exceeds remaining budget`);
      }
    }
    const row = { cache_key: cacheKey, operation, model, prompt_version: promptVersion, payload: parsed, usage: aggregateUsage(attemptCalls), created_at: new Date().toISOString() };
    await appendJsonl(CACHE_OUTPUT, row);
    cache.set(cacheKey, row);
    return parsed;
  };

  const verifyCandidateItems = async ({ items, availableClauses, operation }) => {
    const verdicts = new Map();
    for (const batch of batchesOf(items, VERIFY_BATCH_SIZE)) {
      const itemAliases = new Map(batch.map((item, index) => [`v${index.toString(36)}`, item.item_id]));
      const evidenceClauseIds = new Set(batch.flatMap((item) => item.clause_ids));
      // Include directly adjacent clauses so split facts (name in one clause,
      // predicate in the next) are judged with their context.
      const orderedAvailable = [...availableClauses].sort((a, b) => a.page_ref - b.page_ref || a.start_offset - b.start_offset);
      const verificationClauses = orderedAvailable.filter((clause, index) => evidenceClauseIds.has(clause.clause_id)
        || (orderedAvailable[index - 1] && evidenceClauseIds.has(orderedAvailable[index - 1].clause_id))
        || (orderedAvailable[index + 1] && evidenceClauseIds.has(orderedAvailable[index + 1].clause_id)));
      const response = await callProtocol({
        operation, model: AUDIT_MODEL, system: VERIFY_PROMPT,
        payload: {
          clauses: verificationClauses.map((clause) => wireClause(clause, wireIds)),
          candidates: batch.map((item, index) => wireKnownItem(item, wireIds, `v${index.toString(36)}`)),
        },
        maxTokens: VERIFY_MAX_TOKENS,
        expectedVerdictIds: [...itemAliases.keys()],
      });
      for (const verdict of response.verdicts) {
        const itemId = itemAliases.get(verdict.item_id);
        if (itemId) verdicts.set(itemId, { verdict: verdict.verdict, reason: verdict.reason ?? '' });
      }
    }
    return verdicts;
  };

  let status = 'complete';
  let failureReason = null;
  let primaryItems = [];
  let auditMissing = [];
  let qualityAdded = [];
  let reflectedMissing = [];
  let coverageRows = [];
  let referenceRows = [...boundaryContinuationReferences];
  const ambiguousReferences = [];
  const unresolvedReferences = [];
  const auditVerdicts = new Map();
  const qualityVerdicts = new Map();
  const reflectionVerdicts = new Map();
  const qualityPages = new Set();

  try {
    for (const payload of pagePayloads) {
      // Incoming state hash, taken before this page mutates the memory, so a
      // changed prior-page subject state invalidates this page's cache entry.
      const incomingStateHash = V3 ? sha256(JSON.stringify(serializeSubjectState(subjectState, payload.page_ref - 1))) : null;
      const currentSubjectContext = V3 ? subjectContext(subjectState) : [];
      // Resolution needs the local ledger clauses (page_ref, offsets,
      // mention_ids), not the compact wire-shaped payload clauses.
      const pageClauses = clauses.filter((clause) => clause.page_ref === payload.page_ref);
      const deterministicSubjects = V3
        ? resolveSubjectReferences({ state: subjectState, clauses: pageClauses, mentionById, nounPhrases })
        : { references: [], transitions: [], ambiguities: [], ledgerMentions: [] };
      subjectTransitions.push(...deterministicSubjects.transitions);
      ambiguousReferences.push(...(deterministicSubjects.ambiguities ?? []));
      unresolvedReferences.push(...(deterministicSubjects.unresolved ?? []));
      for (const ledgerMention of deterministicSubjects.ledgerMentions ?? []) {
        if (!mentionById.has(ledgerMention.mention_id)) {
          mentionById.set(ledgerMention.mention_id, ledgerMention);
          mentions.push(ledgerMention);
        }
      }
      // Make deterministic resolutions visible to every model: the verifier
      // must see "he = R. Efraim" or it rejects cross-clause subjects.
      for (const reference of deterministicSubjects.references) {
        const clause = clauseById.get(reference.clause_id);
        const entity = subjectState.entities.get(reference.resolved_entity_id);
        if (clause && entity?.label) {
          clause.resolutions = clause.resolutions ?? [];
          if (!clause.resolutions.some((row) => row.surface === reference.surface)) {
            clause.resolutions.push({ surface: reference.surface, label: entity.label });
          }
        }
      }
      const deterministicReferenceKeys = new Set(deterministicSubjects.references.map((reference) => `${reference.clause_id}\u001f${String(reference.surface).toLowerCase()}`));
      referenceRows.push(...deterministicSubjects.references);
      const expectedClauseIds = payload.clauses.map((clause) => clause.clause_id);
      const response = await callProtocol({
        operation: 'historical.v2.primary', model: PRIMARY_MODEL, system: PRIMARY_PROMPT,
        payload: wirePage({ ...payload, subject_context: currentSubjectContext }, wireIds), maxTokens: primaryTokenLimit(payload.clauses.length), expectedClauseIds,
        stateHash: incomingStateHash,
      });
      const deterministicContinuationClauses = new Set(boundaryContinuationReferences.map((reference) => reference.clause_id));
      referenceRows.push(...response.references.filter((reference) => {
        const clause = clauseById.get(reference.clause_id);
        const mention = mentionById.get(reference.antecedent_mention_id);
        return clause && mention && /^(?:he|she|they|his|her|their|this|that|the former|the latter|continuation)$/iu.test(reference.surface.trim())
          && Math.abs(mention.page - clause.page_ref) <= 1
          && !deterministicReferenceKeys.has(`${reference.clause_id}\u001f${String(reference.surface).toLowerCase()}`)
          && !(clause.risk_flags.includes('cross_page_continuation') && deterministicContinuationClauses.has(clause.clause_id));
      }));
      primaryItems.push(...normalizeModelItems({ rawItems: response.items, clauses, mentions, sourceId: SOURCE_ID, discoverySource: 'primary' }));
      coverageRows.push(...response.coverage);
    }
    referenceRows = [...new Map(referenceRows.map((reference) => [`${reference.clause_id}\u001f${reference.antecedent_mention_id}`, reference])).values()];
    primaryItems = applyResolvedReferences({ items: primaryItems, references: referenceRows, mentions, sourceId: SOURCE_ID });
    primaryItems = dedupeHistoricalItems(primaryItems);

    for (const payloadBatch of batchesOf(pagePayloads, 2)) {
      const pageSet = new Set(payloadBatch.map((payload) => payload.page_ref));
      const knownItems = primaryItems.filter((item) => item.evidence.some((evidence) => pageSet.has(evidence.page_ref)));
      const audit = await callProtocol({
        operation: 'historical.v2.audit', model: AUDIT_MODEL, system: AUDIT_PROMPT,
        payload: { pages: payloadBatch.map((payload) => wireAuditPage(payload, wireIds)) },
        maxTokens: auditTokenLimit(payloadBatch.flatMap((entry) => entry.clauses).length),
      });
      const alignedAuditItems = realignModelItemsToClauses({ items: audit.items, availableClauses: clauses.filter((clause) => pageSet.has(clause.page_ref)), allClauses: clauses });
      const independentItems = dedupeHistoricalItems(applyResolvedReferences({
        items: normalizeModelItems({ rawItems: alignedAuditItems, clauses, mentions, sourceId: SOURCE_ID, discoverySource: 'audit' }),
        references: referenceRows,
        mentions,
        sourceId: SOURCE_ID,
      }));
      const matchedAuditIds = new Set();
      for (const knownItem of knownItems) {
        const match = independentItems.find((item) => !matchedAuditIds.has(item.item_id) && sameDiscoveredItem(item, knownItem));
        if (match) {
          matchedAuditIds.add(match.item_id);
          auditVerdicts.set(knownItem.item_id, { verdict: 'supported', reason: 'Independent extraction agreement.' });
        }
      }
      auditMissing.push(...independentItems.filter((item) => !matchedAuditIds.has(item.item_id)));
    }
    auditMissing = dedupeHistoricalItems(auditMissing).filter((item) => !primaryItems.some((primary) => sameDiscoveredItem(item, primary)));

    const escalationItems = dedupeHistoricalItems([
      ...primaryItems.filter((item) => needsQualityEscalation(item, auditVerdicts.get(item.item_id)?.verdict, clauseById)),
      ...auditMissing,
    ]);
    for (const batch of batchItemsByClauses(escalationItems, MAX_QUALITY_CLAUSES)) {
      const itemAliases = new Map(batch.map((item, index) => [`q${index.toString(36)}`, item.item_id]));
      batch.flatMap((item) => item.evidence.map((evidence) => evidence.page_ref)).forEach((page) => qualityPages.add(page));
      const ids = new Set(batch.flatMap((item) => item.clause_ids));
      const riskClauses = clauses.filter((clause, index) => ids.has(clause.clause_id)
        || (clauses[index - 1] && ids.has(clauses[index - 1].clause_id) && clauses[index - 1].page_ref === clause.page_ref)
        || (clauses[index + 1] && ids.has(clauses[index + 1].clause_id) && clauses[index + 1].page_ref === clause.page_ref));
      const response = await callProtocol({
        operation: 'historical.v2.quality', model: QUALITY_MODEL, system: QUALITY_PROMPT,
        payload: {
          clauses: riskClauses.map((clause) => wireClause({ ...clause, mentions: mentionsForClause(clause, mentionById) }, wireIds)),
          boundary: [...new Set(riskClauses.map((clause) => clause.page_ref))].map((page) => [page, wireBoundary(pagePayloadByPage.get(page), wireIds)]),
          candidates: batch.map((item, index) => wireKnownItem(item, wireIds, `q${index.toString(36)}`)),
        },
        maxTokens: qualityTokenLimit(),
        expectedClauseIds: riskClauses.map((clause) => clause.clause_id),
        expectedVerdictIds: [...itemAliases.keys()],
      });
      for (const verdict of response.verdicts) {
        const itemId = itemAliases.get(verdict.item_id);
        if (itemId) qualityVerdicts.set(itemId, { verdict: verdict.verdict, reason: verdict.reason ?? '' });
      }
      qualityAdded.push(...applyResolvedReferences({
        items: normalizeModelItems({ rawItems: response.items, clauses, mentions, sourceId: SOURCE_ID, discoverySource: 'quality' }),
        references: referenceRows,
        mentions,
        sourceId: SOURCE_ID,
      }));
      coverageRows.push(...response.coverage);
    }
    qualityAdded = dedupeHistoricalItems(qualityAdded);

    if (qualityAdded.length) {
      const affectedPages = [...new Set(qualityAdded.flatMap((item) => item.evidence.map((evidence) => evidence.page_ref)))];
      for (const pages of batchesOf(affectedPages, 2)) {
        const pageSet = new Set(pages);
        const payloads = pagePayloads.filter((payload) => pageSet.has(payload.page_ref));
        const knownItems = qualityAdded.filter((item) => item.evidence.some((evidence) => pageSet.has(evidence.page_ref)));
        const verification = await verifyCandidateItems({ items: knownItems, availableClauses: payloads.flatMap((payload) => payload.clauses), operation: 'historical.v2.reflection_verify' });
        for (const [itemId, verdict] of verification) reflectionVerdicts.set(itemId, verdict);
      }
    }
  } catch (error) {
    status = error instanceof BudgetExceeded ? 'incomplete_budget' : 'incomplete_api';
    failureReason = error instanceof Error ? error.message : String(error);
    console.error(`${status}: ${failureReason}`);
    if (process.env.KG_DEBUG && error instanceof Error) console.error(error.stack);
  }

  const primaryIds = new Set(primaryItems.map((item) => item.item_id));
  const auditMissingIds = new Set(auditMissing.map((item) => item.item_id));
  const qualityAddedIds = new Set(qualityAdded.map((item) => item.item_id));
  let allItems = dedupeHistoricalItems([...primaryItems, ...auditMissing, ...qualityAdded, ...reflectedMissing]);
  allItems = allItems.map((item) => {
    let judgment;
    if (qualityAddedIds.has(item.item_id)) judgment = reflectionVerdicts.get(item.item_id);
    else if (qualityVerdicts.has(item.item_id)) judgment = qualityVerdicts.get(item.item_id);
    else if (primaryIds.has(item.item_id)) judgment = auditVerdicts.get(item.item_id);
    else if (auditMissingIds.has(item.item_id)) judgment = qualityVerdicts.get(item.item_id) ?? auditVerdicts.get(item.item_id);
    else judgment = qualityVerdicts.get(item.item_id);
    const referencesResolved = itemHasResolvedReferences(item, clauseById, mentionById, referenceRows);
    const verdict = judgment?.verdict === 'supported' && referencesResolved ? 'supported' : judgment?.verdict === 'supported' ? 'ambiguous' : judgment?.verdict ?? 'ambiguous';
    const reason = referencesResolved ? judgment?.reason ?? 'Independent agreement not completed.' : 'Pronoun or page-boundary antecedent was not linked to an entity mention.';
    // The earliest reference in the first evidence clause approximates the
    // grammatical subject far better than arbitrary row order.
    const reference = item.clause_ids
      .flatMap((id) => referenceRows.filter((row) => row.clause_id === id && row.resolved_entity_id)
        .sort((a, b) => (a.start_offset ?? Infinity) - (b.start_offset ?? Infinity)))
      .find(Boolean);
    const transition = item.clause_ids.map((id) => subjectTransitions.find((row) => row.clause_id === id)).find(Boolean);
    let v3Fields = {};
    if (V3) {
      const subjectEntityId = reference?.resolved_entity_id ?? transition?.after_focus?.active ?? null;
      const resolutionSources = { deterministic_subject_memory: 'deterministic_subject_memory', deterministic_boundary_join: 'deterministic_subject_memory', primary_coreference: 'model' };
      const literalMention = item.clause_ids
        .flatMap((id) => clauseById.get(id)?.mention_ids ?? [])
        .map((id) => mentionById.get(id))
        .find((mention) => mention && mention.subject_entity_id === subjectEntityId);
      v3Fields = {
        subject_entity_id: subjectEntityId,
        subject_resolution_source: !subjectEntityId ? null
          : reference ? resolutionSources[reference.resolution_source] ?? 'model'
          : 'deterministic_subject_memory',
        discourse_chain: [...new Set([reference?.antecedent_mention_id, literalMention?.mention_id, subjectEntityId].filter(Boolean))],
        literal_subject: reference?.surface ?? literalMention?.text ?? null,
        subject_ambiguous: item.clause_ids.some((id) => ambiguousReferences.some((row) => row.clause_id === id)),
      };
    }
    return {
      ...item,
      ...v3Fields,
      verification: { verdict, reason },
    };
  });
  const supportedItems = allItems.filter((item) => item.verification.verdict === 'supported');
  const auditedCoverage = applyCoverage({ clauses, items: supportedItems, coverageRows, auditStatus: status === 'complete' ? 'agreed' : 'escalated' })
    .map((clause) => ({ ...clause, resolved_references: referenceRows.filter((reference) => reference.clause_id === clause.clause_id) }));
  const usage = aggregateUsage(calls);
  const averageCost = usage.cost / targetPages.length;
  if (status === 'complete' && averageCost > 0.002) {
    status = 'failed_cost_gate';
    failureReason = `Average cost ${formatUsd(averageCost)} exceeds $0.0020/page`;
  }

  // One compact block-level adjudication request per page instead of one
  // model question per ambiguous reference.
  const adjudicationRequests = [...new Set(ambiguousReferences.map((row) => row.page_ref))].sort((a, b) => a - b).map((page) => ({
    page_ref: page,
    requests: ambiguousReferences.filter((row) => row.page_ref === page)
      .map(({ clause_id, surface, expected, reference_kind, candidate_entity_ids }) => ({ clause_id, surface, expected, reference_kind, candidate_entity_ids })),
  }));
  const completedAt = new Date().toISOString();
  await appendJsonl(ITEM_OUTPUT, {
    ...baseRecord, status, failure_reason: failureReason, extracted_at: completedAt,
    items: allItems, supported_item_count: supportedItems.length, usage,
    resolved_references: referenceRows,
    ambiguous_references: V3 ? ambiguousReferences : undefined,
    unresolved_references_log: V3 ? unresolvedReferences : undefined,
    adjudication_requests: V3 ? adjudicationRequests : undefined,
    average_cost_usd_per_page: averageCost,
    quality_route_pages: [...qualityPages].sort((a, b) => a - b),
    quality_route_rate: qualityPages.size / targetPages.length,
  });
  await appendJsonl(COVERAGE_OUTPUT, {
    ...baseRecord, status, failure_reason: failureReason, extracted_at: completedAt,
    clauses: auditedCoverage,
    resolved_references: referenceRows,
    counts: {
      total: auditedCoverage.length,
      covered: auditedCoverage.filter((clause) => clause.disposition === 'covered').length,
      ambiguous: auditedCoverage.filter((clause) => clause.disposition === 'ambiguous').length,
    },
  });
  if (V3) {
    await appendJsonl(LAYOUT_OUTPUT, { ...baseRecord, status, extracted_at: completedAt, layout });
    if (addressReferences.length) await appendJsonl(ADDRESS_OUTPUT, { ...baseRecord, status, extracted_at: completedAt, gazetteer_sources: gazetteerSources, address_references: addressReferences });
    await appendJsonl(SUBJECT_TRANSITIONS_OUTPUT, {
      ...baseRecord, status, extracted_at: completedAt,
      transitions: subjectTransitions,
      resolved_references: referenceRows.filter((reference) => reference.resolution_source === 'deterministic_subject_memory'),
      ambiguous_references: ambiguousReferences,
      adjudication_requests: adjudicationRequests,
    });
    // Persist subject memory only when the full pipeline ran. A run that died
    // mid-loop holds partial resolution state; saving it would poison the
    // warm-start chain for the next sequential page.
    if (status === 'complete' || status === 'failed_cost_gate') {
      await saveSubjectMemory(SUBJECT_MEMORY_OUTPUT, subjectState, lastPage);
    } else {
      console.warn(`subject memory NOT persisted (status ${status}); next run cold-starts from the last complete state.`);
    }
  }
  console.log(`${status}: ${supportedItems.length}/${allItems.length} supported; ${auditedCoverage.length} clauses; ${usage.call_count} paid calls; ${usage.cache_hits} cache hits; ${formatUsd(usage.cost)} total; ${formatUsd(averageCost)}/page.`);
  if (status !== 'complete') process.exitCode = 1;
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
