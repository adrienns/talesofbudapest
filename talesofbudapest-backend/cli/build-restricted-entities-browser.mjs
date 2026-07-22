#!/usr/bin/env node
/**
 * Build a standalone HTML browser for restricted-book entities JSONL
 * (output of cli/extract-restricted-book.js).
 *
 * Usage:
 *   node cli/build-restricted-entities-browser.mjs --source budapest-joe-hajdu
 *   node cli/build-restricted-entities-browser.mjs --source budapest-joe-hajdu --output ../path.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQuoteSpeaker } from '../lib/quoteSpeakerAttribution.js';
import { resolveRestrictedEntitiesInput } from '../lib/restrictedSpeakerInput.js';
import { assertSpeakersArtifactIntegrity } from '../lib/speakersArtifactIntegrity.js';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(backend, '..');
const extractionDir = path.join(workspace, 'ingest/corpus/restricted/extractions');
const textDir = path.join(workspace, 'ingest/corpus/restricted/text');

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
};

const sourceId = option('--source') ?? 'budapest-joe-hajdu';
const resolvedInput = resolveRestrictedEntitiesInput({
  source: sourceId,
  extractionsDir: extractionDir,
  explicitInput: option('--input'),
});
const inputPath = path.resolve(resolvedInput.input);
const pagesPath = path.resolve(option('--pages-txt') ?? path.join(textDir, `${sourceId}.pages.txt`));
const outputPath = path.resolve(
  option('--output') ?? path.join(extractionDir, `${sourceId}-facts-browser.html`),
);

/** Parse "15-24,30,40-42" into a Set of page numbers. */
const parsePageFilter = (raw) => {
  if (!raw) return null;
  const pages = new Set();
  for (const part of String(raw).split(',')) {
    const range = part.trim().match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let page = Number(range[1]); page <= Number(range[2]); page += 1) pages.add(page);
      continue;
    }
    const page = Number(part.trim());
    if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid --pages value: ${part}`);
    pages.add(page);
  }
  return pages;
};

const pageFilter = parsePageFilter(option('--pages'));

const foldForMatch = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const attributePage = (quote, windowPages, pageTextMap) => {
  const needle = foldForMatch(quote);
  if (!needle || needle.length < 12) return null;
  const hits = windowPages.filter((page) => foldForMatch(pageTextMap.get(page) ?? '').includes(needle));
  return hits.length === 1 ? hits[0] : null;
};

const pageForItem = (item, windowPages, pageTextMap) => {
  const evidence = item.evidence;
  if (evidence && Object.prototype.hasOwnProperty.call(evidence, 'quote_page')) {
    const page = Number(evidence.quote_page);
    return Number.isInteger(page) ? page : null;
  }
  return attributePage(evidence?.quote ?? item.quote ?? '', windowPages, pageTextMap);
};

const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});

const pagesFromText = (text) => {
  const map = new Map();
  for (const match of text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g)) {
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const rows = readJsonl(inputPath);
if (!rows.length) throw new Error(`No rows in ${inputPath}`);
console.error(`input=${inputPath}`);
console.error(`input_provenance=${resolvedInput.provenance}`);
if (resolvedInput.warning) console.error(`warning: ${resolvedInput.warning}`);
const integrity = assertSpeakersArtifactIntegrity(rows, { provenance: resolvedInput.provenance });
if (!integrity.skipped) console.error(`speakers_integrity=ok quotes=${integrity.quotes}`);

const pageText = fs.existsSync(pagesPath) ? pagesFromText(fs.readFileSync(pagesPath, 'utf8')) : new Map();

const facts = [];
const locations = [];
const people = [];
const events = [];
const relations = [];
const pages = new Set();
let cost = 0;
const models = new Set();
let droppedExcluded = 0;

const keepPage = (page) => pageFilter == null || (page != null && pageFilter.has(page));

for (const row of rows) {
  const payload = row.payload ?? {};
  const windowPages = (Array.isArray(row.pdf_pages) ? row.pdf_pages : [])
    .map(Number)
    .filter((page) => Number.isInteger(page));
  const allowedWindowPages = windowPages.filter(keepPage);
  // Skip windows wholly outside the content range (e.g. bibliography-only).
  if (pageFilter && !allowedWindowPages.length) {
    droppedExcluded += 1;
    continue;
  }
  for (const page of allowedWindowPages) pages.add(page);
  cost += Number(row.usage?.cost ?? 0);
  if (row.model) models.add(row.model);
  const pageLabel = allowedWindowPages.length
    ? `${allowedWindowPages[0]}–${allowedWindowPages.at(-1)}`
    : '—';
  const meta = {
    pages: allowedWindowPages,
    page_label: pageLabel,
    model: row.model ?? null,
    window_id: row.window_id ?? null,
    extracted_at: row.extracted_at ?? null,
    prompt_version: row.prompt_version ?? null,
  };

  const pushFiltered = (bucket, item, kind, statement) => {
    const quote = item.evidence?.quote ?? '';
    const page = pageForItem(item, windowPages, pageText);
    if (pageFilter) {
      if (page != null && !keepPage(page)) {
        droppedExcluded += 1;
        return;
      }
      if (page == null && !allowedWindowPages.length) {
        droppedExcluded += 1;
        return;
      }
    }
    bucket.push({
      ...item,
      ...meta,
      page,
      pages: page != null ? [page] : allowedWindowPages,
      page_label: page != null ? String(page) : (item.evidence?.quote_page_reason || (pageFilter ? 'unmatched' : pageLabel)),
      kind,
      statement,
      quote,
    });
  };

  for (const item of payload.facts ?? []) {
    pushFiltered(facts, item, 'fact', item.text_en ?? '');
  }
  for (const item of payload.locations ?? []) {
    pushFiltered(locations, item, 'location', item.name_en || item.source_name || '');
  }
  for (const item of payload.people ?? []) {
    pushFiltered(people, item, 'person', item.name_en || item.source_name || '');
  }
  for (const item of payload.events ?? []) {
    pushFiltered(events, item, 'event', item.title_en || item.statement_en || '');
  }
  for (const item of payload.relations ?? []) {
    pushFiltered(
      relations,
      item,
      'relation',
      item.statement_en || `${item.subject_en ?? '?'} ${item.predicate ?? '?'} ${item.object_en ?? '?'}`,
    );
  }
}

  // Prefer persisted evidence.speaker; live resolve only for explicit legacy --input.
  {
    const peopleByPage = new Map();
    for (const person of people) {
      for (const page of person.pages ?? (person.page != null ? [person.page] : [])) {
        const list = peopleByPage.get(page) ?? [];
        list.push({
          name_en: person.name_en,
          source_name: person.source_name,
          role_en: person.role_en,
          years_hint: person.years_hint,
          quote: person.quote,
        });
        peopleByPage.set(page, list);
      }
    }
    const allowLive = resolvedInput.provenance === 'explicit_input';
    for (const location of locations) {
      const persisted = location.evidence?.speaker;
      if (persisted?.status) {
        location.speaker_status = persisted.status;
        location.speaker_reason = persisted.reason;
        location.speaker_resolution_source = persisted.resolution_source;
        location.speaker_surface = persisted.surface;
        location.speaker_name_en = persisted.name_en ?? null;
        location.speaker_role_en = persisted.role_en ?? null;
        continue;
      }
      if (!allowLive) {
        location.speaker_status = 'none';
        location.speaker_reason = 'missing_persisted_speaker';
        location.speaker_resolution_source = null;
        location.speaker_surface = null;
        location.speaker_name_en = null;
        location.speaker_role_en = null;
        continue;
      }
      const page = location.page;
      const attribution = resolveQuoteSpeaker({
        quote: location.quote,
        pageText: pageText.get(page) ?? '',
        people: peopleByPage.get(page) ?? [],
      });
      location.speaker_status = attribution.status;
      location.speaker_reason = attribution.reason;
      location.speaker_resolution_source = attribution.resolution_source;
      location.speaker_surface = attribution.surface;
      location.speaker_name_en = attribution.person?.name_en ?? null;
      location.speaker_role_en = attribution.person?.role_en ?? null;
    }
  }

const pageList = [...pages].sort((a, b) => a - b);
const pageSpan = pageList.length
  ? (pageList.length > 2 ? `${pageList[0]}–${pageList.at(-1)}` : pageList.join('–'))
  : '—';

const exclusionNote = pageFilter
  ? ` Excludes non-content pages outside ${pageSpan} (TOC/bibliography/index when present).`
  : '';

const data = {
  source_id: sourceId,
  title: `Restricted extract · ${sourceId} · pages ${pageSpan}`,
  warning: `Private restricted-book extract. Not promoted. Red-license source — do not publish verbatim quotes.${exclusionNote}`,
  windows: rows.length,
  cost,
  models: [...models],
  pages: pageList,
  page_text: Object.fromEntries([...pageText].filter(([page]) => pages.has(page))),
  counts: {
    facts: facts.length,
    locations: locations.length,
    people: people.length,
    events: events.length,
    relations: relations.length,
  },
  facts: facts.sort((a, b) => (b.interestingness ?? 0) - (a.interestingness ?? 0) || String(a.statement).localeCompare(String(b.statement))),
  locations: locations.sort((a, b) => String(a.statement).localeCompare(String(b.statement))),
  people: people.sort((a, b) => String(a.statement).localeCompare(String(b.statement))),
  events: events.sort((a, b) => String(a.statement).localeCompare(String(b.statement))),
  relations: relations.sort((a, b) => String(a.statement).localeCompare(String(b.statement))),
};

const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
  <title>${escapeHtml(data.title)}</title>
</head>
<body>
<main id="reb">
  <header class="reb-head">
    <div>
      <p class="reb-kicker">Restricted extract · private</p>
      <h1>${escapeHtml(sourceId)}</h1>
      <p class="reb-sub">Pages ${escapeHtml(pageSpan)} · ${rows.length} windows · ${escapeHtml([...models].join(', ') || '—')}</p>
    </div>
    <div class="reb-stats" aria-label="Counts">
      <div class="reb-stat"><span class="reb-stat-n" id="stat-facts">${facts.length}</span><span>Facts</span></div>
      <div class="reb-stat"><span class="reb-stat-n">${locations.length}</span><span>Place mentions</span></div>
      <div class="reb-stat"><span class="reb-stat-n">${people.length}</span><span>People mentions</span></div>
      <div class="reb-stat"><span class="reb-stat-n">${events.length}</span><span>Event mentions</span></div>
      <div class="reb-stat"><span class="reb-stat-n">$${cost.toFixed(3)}</span><span>Cost</span></div>
    </div>
  </header>

  <div class="reb-warn">${escapeHtml(data.warning)}</div>

  <div class="reb-controls">
    <button type="button" class="btn active" data-tab="facts">Facts</button>
    <button type="button" class="btn" data-tab="locations">Locations</button>
    <button type="button" class="btn" data-tab="people">People</button>
    <button type="button" class="btn" data-tab="events">Events</button>
    <button type="button" class="btn" data-tab="relations">Relations</button>
    <button type="button" class="btn" data-tab="pages">Page text</button>
    <label class="reb-search">Search
      <input id="reb-search" type="search" placeholder="Person, place, quote…">
    </label>
    <label>Page
      <select id="reb-page"><option value="all">All pages</option></select>
    </label>
  </div>

  <p class="reb-meta" id="reb-meta"></p>
  <div id="reb-results" class="reb-results" aria-live="polite"></div>
</main>

<style>
  :root {
    color-scheme: dark;
    --bg: #101113;
    --panel: #1a1c20;
    --panel2: #23262c;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #30343b;
    --accent: #7dc1ff;
    --accent-bg: #082e50;
    --warn: #ffe1a9;
    --warn-bg: #4a2700;
    --warn-border: #a56818;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    min-height: 100%;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.45 "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  }
  #reb { margin: 0 auto; max-width: 78rem; padding: 1.5rem; }
  .reb-head {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: end;
    margin-bottom: 1rem;
  }
  .reb-kicker { color: var(--accent); font-size: .78rem; letter-spacing: .08em; margin: 0 0 .35rem; text-transform: uppercase; }
  h1 { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 650; margin: 0; }
  .reb-sub { color: var(--muted); margin: .4rem 0 0; }
  .reb-stats { display: grid; gap: .55rem; grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .reb-stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: .7rem;
    display: grid;
    gap: .15rem;
    padding: .7rem .75rem;
  }
  .reb-stat span:last-child { color: var(--muted); font-size: .78rem; }
  .reb-stat-n { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.15rem; font-weight: 700; }
  .reb-warn {
    background: var(--warn-bg);
    border: 1px solid var(--warn-border);
    border-radius: .55rem;
    color: var(--warn);
    margin: 0 0 1rem;
    padding: .7rem .85rem;
  }
  .reb-controls {
    align-items: end;
    display: grid;
    gap: .65rem;
    grid-template-columns: repeat(6, auto) minmax(12rem, 1fr) minmax(7rem, .55fr);
    margin-bottom: .75rem;
  }
  .btn, select, input {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: .55rem;
    color: var(--text);
    font: inherit;
    min-height: 2.45rem;
    padding: .4rem .65rem;
  }
  .btn { cursor: pointer; }
  .btn:hover, .btn.active { background: var(--accent-bg); border-color: transparent; color: var(--accent); }
  .reb-search, .reb-controls > label { display: grid; font-size: .85rem; font-weight: 600; gap: .3rem; }
  .reb-meta { color: var(--muted); font-size: .875rem; margin: .25rem 0 .75rem; }
  .reb-results { border-top: 1px solid var(--border); }
  details { border-bottom: 1px solid var(--border); padding: .7rem 0; }
  summary { cursor: pointer; display: grid; gap: .55rem; grid-template-columns: minmax(0, 1fr) auto; }
  .reb-statement { font-weight: 550; overflow-wrap: anywhere; }
  .reb-badge {
    background: var(--accent-bg);
    border-radius: 999px;
    color: var(--accent);
    display: inline-block;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: .78rem;
    font-weight: 650;
    padding: .15rem .5rem;
    white-space: nowrap;
  }
  .reb-detail { display: grid; gap: .55rem; padding: .7rem 0 .15rem; }
  .reb-label { color: var(--muted); margin-right: .35rem; }
  .reb-quote {
    border-left: 2px solid var(--accent);
    padding-left: .75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reb-page-block {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: .7rem;
    margin: .75rem 0;
    padding: 1rem;
  }
  .reb-page-block h3 { margin: 0 0 .6rem; }
  .reb-page-block pre {
    font: inherit;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reb-empty { color: var(--muted); padding: 2rem 0; text-align: center; }
  .reb-tags { display: flex; flex-wrap: wrap; gap: .35rem; }
  .reb-mention {
    border-top: 1px solid var(--border);
    display: grid;
    gap: .35rem;
    padding: .65rem 0;
  }
  .reb-mention:first-child { border-top: 0; padding-top: .15rem; }
  @media (max-width: 900px) {
    .reb-head, .reb-controls, .reb-stats { grid-template-columns: 1fr; }
    summary { grid-template-columns: 1fr; }
  }
</style>

<script type="application/json" id="reb-data">${encoded}</script>
<script>
(() => {
  // atob alone treats UTF-8 bytes as Latin-1 (KirÃ¡ly / MohÃ¡cs). Decode as UTF-8.
  const DATA = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(document.getElementById('reb-data').textContent), (char) => char.charCodeAt(0)),
  ));
  const root = document.getElementById('reb');
  const results = document.getElementById('reb-results');
  const meta = document.getElementById('reb-meta');
  const search = document.getElementById('reb-search');
  const pageSelect = document.getElementById('reb-page');
  let tab = 'facts';

  for (const page of DATA.pages) {
    const opt = document.createElement('option');
    opt.value = String(page);
    opt.textContent = 'Page ' + page;
    pageSelect.appendChild(opt);
  }

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const badge = (text) => text ? '<span class="reb-badge">' + esc(text) + '</span>' : '';

  const foldKey = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const matches = (item, q, page) => {
    if (page !== 'all') {
      const pages = item.pages || [];
      if (!pages.map(String).includes(page)) return false;
    }
    if (!q) return true;
    const hay = [
      item.statement, item.quote, item.text_en, item.name_en, item.source_name,
      item.address_en, item.address_source, item.role_en, item.title_en, item.statement_en,
      item.subject_en, item.object_en, item.predicate, item.location_source_name, item.when, item.type, item.category,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  };

  const groupMentions = (items, keyFn) => {
    const groups = new Map();
    for (const item of items) {
      const key = keyFn(item) || foldKey(item.statement) || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: item.name_en || item.source_name || item.title_en || item.statement || key,
          mentions: [],
        });
      }
      const group = groups.get(key);
      group.mentions.push(item);
      // Prefer a fuller display label when a later mention has more detail.
      const candidate = item.name_en || item.source_name || item.title_en || item.statement;
      if (candidate && candidate.length > String(group.label).length) group.label = candidate;
    }
    return [...groups.values()]
      .map((group) => {
        const pages = [...new Set(group.mentions.flatMap((m) => m.pages || []).map(Number).filter(Number.isFinite))]
          .sort((a, b) => a - b);
        const roles = [...new Set(group.mentions.map((m) => m.role_en || m.kind || m.type).filter(Boolean))];
        return { ...group, pages, roles, mention_count: group.mentions.length };
      })
      .sort((a, b) => b.mention_count - a.mention_count || String(a.label).localeCompare(String(b.label)));
  };

  const renderList = (items, renderer) => {
    const q = search.value.trim().toLowerCase();
    const page = pageSelect.value;
    const filtered = items.filter((item) => matches(item, q, page));
    meta.textContent = filtered.length + ' / ' + items.length + ' shown';
    if (!filtered.length) {
      results.innerHTML = '<div class="reb-empty">No matches.</div>';
      return;
    }
    results.innerHTML = filtered.map(renderer).join('');
  };

  const renderGrouped = (items, keyFn, mentionDetail) => {
    const q = search.value.trim().toLowerCase();
    const page = pageSelect.value;
    const filtered = items.filter((item) => matches(item, q, page));
    const groups = groupMentions(filtered, keyFn);
    meta.textContent = groups.length + ' identities · ' + filtered.length + ' mentions'
      + (items.length !== filtered.length ? ' (filtered from ' + items.length + ')' : '');
    if (!groups.length) {
      results.innerHTML = '<div class="reb-empty">No matches.</div>';
      return;
    }
    results.innerHTML = groups.map((group) => {
      const pageBadges = group.pages.slice(0, 8).map((p) => badge('p' + p)).join('')
        + (group.pages.length > 8 ? badge('+' + (group.pages.length - 8)) : '');
      return \`
      <details>
        <summary>
          <div class="reb-statement">\${esc(group.label)}</div>
          <div class="reb-tags">\${badge(group.mention_count + '×')}\${group.roles.slice(0, 2).map(badge).join('')}\${pageBadges}</div>
        </summary>
        <div class="reb-detail">
          \${group.mentions
            .slice()
            .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
            .map(mentionDetail)
            .join('')}
        </div>
      </details>\`;
    }).join('');
  };

  const factRow = (item) => \`
    <details>
      <summary>
        <div class="reb-statement">\${esc(item.statement)}</div>
        <div class="reb-tags">\${badge('p' + item.page_label)}\${badge(item.category)}\${badge(item.interestingness != null ? '★' + item.interestingness : '')}</div>
      </summary>
      <div class="reb-detail">
        <div><span class="reb-label">Location</span>\${esc(item.location_source_name || '—')}</div>
        <div><span class="reb-label">When</span>\${esc(item.year ?? item.year_approx ?? '—')} · confidence \${esc(item.confidence ?? '—')}</div>
        <div class="reb-quote">\${esc(item.quote || '(no quote)')}</div>
      </div>
    </details>\`;

  const locationMention = (item) => \`
    <div class="reb-mention">
      <div class="reb-tags">\${badge('p' + (item.page ?? item.page_label))}\${badge(item.kind)}\${item.speaker_name_en ? badge('speaker: ' + item.speaker_name_en) : (item.speaker_status && item.speaker_status !== 'none' ? badge('speaker:' + item.speaker_status) : '')}</div>
      <div><span class="reb-label">Source name</span>\${esc(item.source_name || '—')}</div>
      <div><span class="reb-label">Address</span>\${esc(item.address_en || item.address_source || '—')}</div>
      \${item.speaker_name_en ? \`<div><span class="reb-label">Speaker</span>\${esc(item.speaker_name_en)}\${item.speaker_role_en ? ' · ' + esc(item.speaker_role_en) : ''}</div>\` : ''}
      <div class="reb-quote">\${esc(item.quote || '(no quote)')}</div>
    </div>\`;

  const personMention = (item) => \`
    <div class="reb-mention">
      <div class="reb-tags">\${badge('p' + (item.page ?? item.page_label))}\${badge(item.role_en)}\${item.partial_name ? badge('partial name') : ''}</div>
      <div><span class="reb-label">Source name</span>\${esc(item.source_name || '—')}</div>
      <div><span class="reb-label">Years</span>\${esc(item.years_hint || '—')}</div>
      <div class="reb-quote">\${esc(item.quote || '(no quote)')}</div>
    </div>\`;

  const eventMention = (item) => \`
    <div class="reb-mention">
      <div class="reb-tags">\${badge('p' + (item.page ?? item.page_label))}\${badge(item.type)}\${badge(item.when)}</div>
      <div>\${esc(item.statement_en || item.title_en || '')}</div>
      <div class="reb-quote">\${esc(item.quote || '(no quote)')}</div>
    </div>\`;

  const relationRow = (item) => \`
    <details>
      <summary>
        <div class="reb-statement">\${esc(item.statement)}</div>
        <div class="reb-tags">\${badge('p' + item.page_label)}\${badge(item.predicate)}</div>
      </summary>
      <div class="reb-detail">
        <div><span class="reb-label">Link</span>\${esc(item.subject_en)} (\${esc(item.subject_kind)}) → \${esc(item.object_en)} (\${esc(item.object_kind)})</div>
        <div class="reb-quote">\${esc(item.quote || '(no quote)')}</div>
      </div>
    </details>\`;

  const renderPages = () => {
    const q = search.value.trim().toLowerCase();
    const page = pageSelect.value;
    const entries = Object.entries(DATA.page_text || {})
      .map(([n, text]) => [Number(n), text])
      .filter(([n, text]) => (page === 'all' || String(n) === page) && (!q || text.toLowerCase().includes(q)))
      .sort((a, b) => a[0] - b[0]);
    meta.textContent = entries.length + ' pages';
    if (!entries.length) {
      results.innerHTML = '<div class="reb-empty">No page text in range.</div>';
      return;
    }
    results.innerHTML = entries.map(([n, text]) => \`
      <article class="reb-page-block">
        <h3>Page \${n}</h3>
        <pre>\${esc(text)}</pre>
      </article>\`).join('');
  };

  const personKey = (item) => foldKey(item.name_en || item.source_name);
  const locationKey = (item) => foldKey(item.name_en || item.source_name);
  const eventKey = (item) => foldKey(item.title_en || item.statement_en);

  const render = () => {
    if (tab === 'facts') return renderList(DATA.facts, factRow);
    if (tab === 'locations') return renderGrouped(DATA.locations, locationKey, locationMention);
    if (tab === 'people') return renderGrouped(DATA.people, personKey, personMention);
    if (tab === 'events') return renderGrouped(DATA.events, eventKey, eventMention);
    if (tab === 'relations') return renderList(DATA.relations, relationRow);
    return renderPages();
  };

  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el === btn));
      render();
    });
  });
  search.addEventListener('input', render);
  pageSelect.addEventListener('change', render);
  render();
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Wrote ${outputPath}`);
console.log(`facts=${facts.length} locations=${locations.length} people=${people.length} events=${events.length} relations=${relations.length} pages=${pageSpan}`);
if (pageFilter) console.log(`excluded_filter_drops=${droppedExcluded} (--pages ${option('--pages')})`);
