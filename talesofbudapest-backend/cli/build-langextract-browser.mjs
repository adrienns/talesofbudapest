#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(backend, '..');
const extractionDir = path.join(workspace, 'ingest/corpus/restricted/extractions');
const sourceId = process.env.HISTORICAL_SOURCE_ID || 'jewish-budapest';
const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : path.join(extractionDir, 'historical-facts-browser.fragment.html');

const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const fold = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(?:r|rabbi|dr|mr|mrs|saint|st)\.?\s+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const itemRows = readJsonl(path.join(extractionDir, `${sourceId}.langextract-pilot.jsonl`));
const run = itemRows.find((row) => row.record_type === 'run');
const report = JSON.parse(fs.readFileSync(path.join(extractionDir, `${sourceId}.langextract-pilot.report.json`), 'utf8'));
if (!run) throw new Error(`No run header in ${sourceId}.langextract-pilot.jsonl`);
if (report.run_id !== run.run_id) {
  throw new Error(`Refusing to mix runs: JSONL=${run.run_id}, report=${report.run_id}. Regenerate both from the same extraction run.`);
}
const items = itemRows.filter((row) => row.record_type === 'item');
const mentionRuns = readJsonl(path.join(extractionDir, `${sourceId}.mentions.jsonl`));
const mentionRun = mentionRuns.filter((row) => (row.pdf_pages ?? []).some((page) => run.pages.includes(page))).at(-1);
const localMentions = mentionRun?.mentions ?? [];

const entityGroups = new Map();
const upsertEntity = (key, label, type, alias, mention) => {
  if (!key) return;
  const group = entityGroups.get(key) ?? { key, label, type, aliases: new Set(), mentions: new Map(), item_ids: new Set() };
  if (alias) group.aliases.add(alias);
  if (mention) {
    const mentionKey = [mention.page, mention.start, mention.end, mention.text].join(':');
    const current = group.mentions.get(mentionKey) ?? { ...mention, item_ids: new Set() };
    for (const itemId of mention.item_ids ?? []) current.item_ids.add(itemId);
    group.mentions.set(mentionKey, current);
  }
  entityGroups.set(key, group);
};

for (const mention of localMentions) {
  const key = `mention::${fold(mention.normalized_text ?? mention.text)}`;
  if (!fold(mention.normalized_text ?? mention.text)) continue;
  upsertEntity(key, mention.normalized_text ?? mention.text, mention.type ?? 'entity', mention.text, {
    page: mention.page, start: mention.start_offset, end: mention.end_offset, text: mention.text,
    confidence: mention.confidence ?? null, quote: mention.text, item_ids: [],
  });
}

const pronouns = new Set(['he', 'his', 'him', 'she', 'her', 'hers', 'they', 'their', 'them', 'it', 'its']);
const itemViews = items.map((item) => {
  const resolved = item.resolved_subject;
  const subjectKey = resolved && !pronouns.has(fold(resolved)) ? `subject::${fold(resolved)}` : null;
  if (subjectKey) {
    for (const evidence of item.evidence ?? []) {
      upsertEntity(subjectKey, resolved, 'resolved subject', item.literal_subject, {
        page: evidence.page_ref, start: evidence.start_offset, end: evidence.end_offset,
        text: item.literal_subject ?? resolved, quote: evidence.quote, confidence: null, item_ids: [item.item_id],
      });
    }
    entityGroups.get(subjectKey).item_ids.add(item.item_id);
  }
  const antecedent = item.reference_antecedent;
  const referenceKey = antecedent && !pronouns.has(fold(antecedent)) ? `subject::${fold(antecedent)}` : null;
  if (referenceKey) {
    for (const evidence of item.evidence ?? []) {
      upsertEntity(referenceKey, antecedent, 'reference antecedent', item.literal_subject, {
        page: evidence.page_ref, start: evidence.start_offset, end: evidence.end_offset,
        text: (item.literal_subject ?? '').match(/^[^\s]+/)?.[0] ?? item.literal_subject ?? antecedent,
        quote: evidence.quote, confidence: null, item_ids: [item.item_id],
      });
    }
    entityGroups.get(referenceKey).item_ids.add(item.item_id);
  }
  const evidence = (item.evidence ?? []).map((entry) => ({
    ...entry,
    entities: localMentions.filter((mention) => mention.page === entry.page_ref && mention.start_offset < entry.end_offset && mention.end_offset > entry.start_offset)
      .map((mention) => ({
        key: `mention::${fold(mention.normalized_text ?? mention.text)}`,
        text: mention.text, type: mention.type, start: mention.start_offset, end: mention.end_offset,
      })),
  }));
  return {
    id: item.item_id, kind: item.kind, type: item.open_type, polarity: item.polarity, modality: item.modality,
    statement: item.statement_en, literal_subject: item.literal_subject, resolved_subject: item.resolved_subject,
    reference_antecedent: item.reference_antecedent, reference_status: item.reference_status,
    risk_flags: item.risk_flags ?? [], subject_key: subjectKey, reference_key: referenceKey, evidence,
  };
});

const entities = [...entityGroups.values()].map((group) => ({
  key: group.key,
  label: group.label,
  type: group.type,
  aliases: [...group.aliases].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  item_ids: [...group.item_ids],
  mentions: [...group.mentions.values()].map((mention) => ({ ...mention, item_ids: [...mention.item_ids] }))
    .sort((a, b) => a.page - b.page || a.start - b.start),
})).sort((a, b) => b.mentions.length - a.mentions.length || a.label.localeCompare(b.label));

const data = {
  run: {
    id: run.run_id, source: run.source_id, pages: run.pages, model: run.model, cost: run.usage.cost,
    average_cost: report.usage.average_uncached_equivalent_cost_usd_per_page ?? report.usage.average_total_cost_usd_per_page ?? report.usage.average_cost_usd_per_page,
    actual_average_cost: report.usage.average_total_cost_usd_per_page ?? report.usage.average_cost_usd_per_page,
    cache_hits: Number(report.usage.cache_hits ?? 0) + Number(report.reference_resolution?.usage?.cache_hits ?? 0),
    grounding_rate: report.extraction.grounded_rate, schema_rate: report.extraction.schema_valid_rate,
    unresolved: report.extraction.unresolved_references,
  },
  items: itemViews,
  entities,
};
const encodedData = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');

const fragment = `<div id="langextract-facts-browser">
  <div class="viz-grid lfb-stats" aria-label="Extraction summary">
    <div class="card viz-stat"><div class="text-muted">Extracted facts</div><div class="viz-stat-value" id="lfb-total"></div><div class="text-small">pages 46–48</div></div>
    <div class="card viz-stat"><div class="text-muted">Exact grounding</div><div class="viz-stat-value" id="lfb-grounding"></div><div class="text-small" id="lfb-schema"></div></div>
    <div class="card viz-stat"><div class="text-muted">New-page cost</div><div class="viz-stat-value" id="lfb-cost"></div><div class="text-small" id="lfb-unresolved"></div></div>
  </div>

  <div class="viz-controls lfb-controls" aria-label="Browser controls">
    <button type="button" class="btn btn-primary" id="lfb-facts-tab" aria-pressed="true">Facts</button>
    <button type="button" class="btn" id="lfb-entities-tab" aria-pressed="false">Entities</button>
    <label class="form-label lfb-search">Search
      <input class="form-control" id="lfb-search" type="search" placeholder="Person, place, event, quote…">
    </label>
    <label class="form-label">Kind
      <select class="form-select" id="lfb-kind"><option value="all">All kinds</option><option value="event">Events</option><option value="assertion">Assertions</option></select>
    </label>
    <label class="form-label">Page
      <select class="form-select" id="lfb-page"><option value="all">All pages</option></select>
    </label>
  </div>

  <div class="text-small text-muted lfb-meta" id="lfb-meta"></div>
  <div class="lfb-results" id="lfb-results" aria-live="polite"></div>

  <dialog id="lfb-dialog" aria-labelledby="lfb-dialog-title">
    <div class="card lfb-dialog-panel">
      <div class="lfb-dialog-head">
        <div><h3 id="lfb-dialog-title"></h3><div class="text-small text-muted" id="lfb-dialog-meta"></div></div>
        <button type="button" class="btn" id="lfb-dialog-close">Close</button>
      </div>
      <div class="lfb-dialog-body">
        <div class="lfb-tags" id="lfb-dialog-aliases"></div>
        <div id="lfb-dialog-mentions"></div>
      </div>
    </div>
  </dialog>
</div>

<style>
  #langextract-facts-browser { color: var(--foreground); }
  #langextract-facts-browser .lfb-stats { margin-bottom: 1rem; }
  #langextract-facts-browser .lfb-controls { align-items: end; margin-bottom: .75rem; }
  #langextract-facts-browser .lfb-search { flex: 1 1 16rem; }
  #langextract-facts-browser .lfb-meta { margin: .5rem 0; }
  #langextract-facts-browser .lfb-results { border-top: 1px solid var(--border); }
  #langextract-facts-browser details { border-bottom: 1px solid var(--border); padding: .7rem 0; }
  #langextract-facts-browser summary { cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; align-items: start; }
  #langextract-facts-browser summary::marker { color: var(--muted-foreground); }
  #langextract-facts-browser .lfb-statement { font-weight: 500; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-detail { display: grid; gap: .65rem; padding: .75rem 0 .2rem; }
  #langextract-facts-browser .lfb-label { color: var(--muted-foreground); margin-right: .35rem; }
  #langextract-facts-browser .lfb-tags, #langextract-facts-browser .lfb-entity-line { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
  #langextract-facts-browser .lfb-evidence { border-left: 2px solid var(--viz-series-1); padding-left: .75rem; }
  #langextract-facts-browser .lfb-quote { white-space: pre-wrap; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-empty { padding: 2rem 0; color: var(--muted-foreground); text-align: center; }
  #langextract-facts-browser .lfb-entity-row { border-bottom: 1px solid var(--border); display: grid; gap: .4rem; padding: .7rem 0; }
  #langextract-facts-browser dialog { background: transparent; border: 0; color: var(--foreground); margin: auto; max-height: none; max-width: min(42rem, calc(100% - 2rem)); overflow: visible; padding: 0; width: 100%; }
  #langextract-facts-browser dialog::backdrop { background: rgb(0 0 0 / .58); }
  #langextract-facts-browser .lfb-dialog-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: min(42rem, calc(100vh - 2rem)); overflow: hidden; padding: 0; }
  #langextract-facts-browser .lfb-dialog-head { align-items: start; border-bottom: 1px solid var(--border); display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr) auto; padding: 1rem; }
  #langextract-facts-browser .lfb-dialog-head h3 { margin: 0 0 .25rem; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-dialog-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .75rem 1rem 1rem; }
  #langextract-facts-browser .lfb-mention { border-bottom: 1px solid var(--border); display: grid; gap: .35rem; padding: .75rem 0; }
  #langextract-facts-browser .lfb-mention:last-child { border-bottom: 0; }
  #langextract-facts-browser mark { background: var(--accent); color: var(--accent-foreground); }
  @media (max-width: 520px) { #langextract-facts-browser summary { grid-template-columns: 1fr; } }
</style>

<script>
(() => {
  const root = document.getElementById('langextract-facts-browser');
  const DATA = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encodedData}'), (char) => char.charCodeAt(0))));
  const byEntity = new Map(DATA.entities.map((entity) => [entity.key, entity]));
  const byItem = new Map(DATA.items.map((item) => [item.id, item]));
  const els = {
    results: root.querySelector('#lfb-results'), search: root.querySelector('#lfb-search'), kind: root.querySelector('#lfb-kind'), page: root.querySelector('#lfb-page'),
    factsTab: root.querySelector('#lfb-facts-tab'), entitiesTab: root.querySelector('#lfb-entities-tab'), meta: root.querySelector('#lfb-meta'),
    dialog: root.querySelector('#lfb-dialog'), dialogTitle: root.querySelector('#lfb-dialog-title'), dialogMeta: root.querySelector('#lfb-dialog-meta'),
    dialogAliases: root.querySelector('#lfb-dialog-aliases'), dialogMentions: root.querySelector('#lfb-dialog-mentions'), dialogClose: root.querySelector('#lfb-dialog-close'),
  };
  let view = 'facts';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const label = (value) => String(value ?? '').replaceAll('_', ' ');
  const pages = [...new Set(DATA.items.flatMap((item) => item.evidence.map((entry) => entry.page_ref)))].sort((a, b) => a - b);
  pages.forEach((page) => els.page.insertAdjacentHTML('beforeend', '<option value="' + page + '">' + page + '</option>'));
  root.querySelector('#lfb-total').textContent = DATA.items.length;
  root.querySelector('#lfb-grounding').textContent = Math.round(DATA.run.grounding_rate * 100) + '%';
  root.querySelector('#lfb-schema').textContent = Math.round(DATA.run.schema_rate * 100) + '% compact-schema valid';
  root.querySelector('#lfb-cost').textContent = '$' + Number(DATA.run.average_cost).toFixed(4);
  root.querySelector('#lfb-unresolved').textContent = DATA.run.cache_hits
    ? '$' + Number(DATA.run.actual_average_cost).toFixed(4) + '/page paid in last cached run · ' + DATA.run.cache_hits + ' cache hits'
    : DATA.run.unresolved + ' references need fallback';

  const entityButton = (key, text) => key && byEntity.has(key)
    ? '<button type="button" class="btn btn-ghost" data-entity-key="' + esc(key) + '">' + esc(text) + '</button>'
    : '<span>' + esc(text || '—') + '</span>';
  const highlightedQuote = (entry) => {
    const quote = String(entry.quote ?? '');
    const refs = [...(entry.entities ?? [])].sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = 0;
    let html = '';
    for (const ref of refs) {
      const start = Math.max(0, ref.start - entry.start_offset);
      const end = Math.min(quote.length, ref.end - entry.start_offset);
      if (start < cursor || end <= start) continue;
      html += esc(quote.slice(cursor, start));
      html += entityButton(ref.key, quote.slice(start, end) || ref.text);
      cursor = end;
    }
    return html + esc(quote.slice(cursor));
  };
  const renderFact = (item) => {
    const subject = item.subject_key
      ? '<div class="lfb-entity-line"><span class="lfb-label">Subject</span>' + entityButton(item.subject_key, item.resolved_subject) + '<span class="text-small text-muted">literal: ' + esc(item.literal_subject || '—') + '</span></div>'
      : '<div><span class="lfb-label">Subject</span>' + esc(item.literal_subject || '—') + ' <span class="text-small text-muted">' + esc(label(item.reference_status)) + '</span></div>';
    const reference = item.reference_key
      ? '<div class="lfb-entity-line"><span class="lfb-label">Reference</span><span>' + esc((item.literal_subject || '').match(/^[^\\s]+/)?.[0] || item.literal_subject || '—') + ' →</span>' + entityButton(item.reference_key, item.reference_antecedent) + '</div>'
      : item.reference_status === 'ambiguous' ? '<div><span class="lfb-label">Reference</span>needs fallback</div>' : '';
    const evidence = item.evidence.map((entry) => '<div class="lfb-evidence"><div class="text-small"><span class="lfb-label">Page</span>' + esc(entry.page_ref) + ' · offsets ' + esc(entry.start_offset) + '–' + esc(entry.end_offset) + '</div><div class="lfb-quote">' + highlightedQuote(entry) + '</div></div>').join('');
    return '<details><summary><span class="lfb-statement">' + esc(item.statement) + '</span><span class="viz-badge">' + esc(label(item.kind)) + '</span></summary><div class="lfb-detail"><div class="lfb-tags"><span class="viz-badge">' + esc(label(item.type)) + '</span><span class="viz-badge">' + esc(label(item.modality)) + '</span>' + (item.polarity === 'negated' ? '<span class="viz-badge">negated</span>' : '') + (item.reference_status === 'ambiguous' ? '<span class="viz-badge">needs reference fallback</span>' : '') + '</div>' + subject + reference + evidence + '<div class="text-small text-muted">' + esc(item.id) + '</div></div></details>';
  };
  const renderEntity = (entity) => '<div class="lfb-entity-row"><div class="lfb-entity-line">' + entityButton(entity.key, entity.label) + '<span class="viz-badge">' + esc(label(entity.type)) + '</span><span class="text-small text-muted">' + entity.mentions.length + ' mentions · ' + entity.item_ids.length + ' facts</span></div><div class="text-small text-muted">' + esc(entity.aliases.join(' · ') || entity.label) + '</div></div>';
  const openEntity = (key) => {
    const entity = byEntity.get(key);
    if (!entity) return;
    els.dialogTitle.textContent = entity.label;
    els.dialogMeta.textContent = label(entity.type) + ' · ' + entity.mentions.length + ' mentions · ' + entity.item_ids.length + ' linked facts';
    els.dialogAliases.innerHTML = entity.aliases.map((alias) => '<span class="viz-badge">' + esc(alias) + '</span>').join('');
    els.dialogMentions.innerHTML = entity.mentions.map((mention) => {
      const statements = mention.item_ids.map((id) => byItem.get(id)?.statement).filter(Boolean);
      return '<div class="lfb-mention"><div><span class="viz-badge">page ' + esc(mention.page) + '</span> <span class="viz-badge">offsets ' + esc(mention.start) + '–' + esc(mention.end) + '</span></div><div class="lfb-quote">' + esc(mention.quote) + '</div><div class="text-small text-muted">mention: ' + esc(mention.text) + (mention.confidence == null ? '' : ' · confidence ' + Number(mention.confidence).toFixed(3)) + '</div>' + (statements.length ? '<div>' + statements.map(esc).join('<br>') + '</div>' : '') + '</div>';
    }).join('') || '<div class="lfb-empty">No grounded mentions</div>';
    els.dialog.showModal();
  };
  const render = () => {
    const query = els.search.value.trim().toLowerCase();
    const page = els.page.value;
    if (view === 'facts') {
      const rows = DATA.items.filter((item) => (els.kind.value === 'all' || item.kind === els.kind.value) && (page === 'all' || item.evidence.some((entry) => String(entry.page_ref) === page)) && (!query || [item.statement, item.type, item.literal_subject, item.resolved_subject, item.reference_antecedent, ...item.evidence.map((entry) => entry.quote)].filter(Boolean).join(' ').toLowerCase().includes(query)));
      els.meta.textContent = rows.length + ' facts shown · ' + DATA.run.source + ' · run ' + DATA.run.id.slice(0, 8);
      els.results.innerHTML = rows.length ? rows.map(renderFact).join('') : '<div class="lfb-empty">No matching facts</div>';
    } else {
      const rows = DATA.entities.filter((entity) => (!query || [entity.label, entity.type, ...entity.aliases].join(' ').toLowerCase().includes(query)) && (page === 'all' || entity.mentions.some((mention) => String(mention.page) === page)));
      els.meta.textContent = rows.length + ' entity groups shown · provisional until cross-document resolution';
      els.results.innerHTML = rows.length ? rows.map(renderEntity).join('') : '<div class="lfb-empty">No matching entities</div>';
    }
  };
  const setView = (next) => {
    view = next;
    const facts = next === 'facts';
    els.factsTab.classList.toggle('btn-primary', facts);
    els.entitiesTab.classList.toggle('btn-primary', !facts);
    els.factsTab.setAttribute('aria-pressed', String(facts));
    els.entitiesTab.setAttribute('aria-pressed', String(!facts));
    render();
  };
  [els.search, els.kind, els.page].forEach((control) => control.addEventListener('input', render));
  els.factsTab.addEventListener('click', () => setView('facts'));
  els.entitiesTab.addEventListener('click', () => setView('entities'));
  root.addEventListener('click', (event) => { const button = event.target.closest('[data-entity-key]'); if (button && root.contains(button)) openEntity(button.dataset.entityKey); });
  els.dialogClose.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
  render();
})();
</script>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fragment);
console.log(JSON.stringify({ output: outputPath, items: items.length, entities: entities.length, bytes: Buffer.byteLength(fragment) }));
