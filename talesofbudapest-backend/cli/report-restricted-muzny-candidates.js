#!/usr/bin/env node
/**
 * $0 Muzny-style trigram candidate scan (diagnostic only).
 * Target: direct_speech quotes currently no_speech_frame.
 *
 * Patterns (after or immediately before quote span):
 *   Quote–Mention–Verb, Quote–Verb–Mention, Mention–Verb–Quote
 *
 * Usage:
 *   node cli/report-restricted-muzny-candidates.js --source budapest-joe-hajdu
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPagesTextMap } from '../lib/annotateRestrictedSpeakers.js';
import { foldPersonKey } from '../lib/quoteSpeakerAttribution.js';

// Lightweight person-surface check (mirrors attribution hygiene without importing private helpers).
const looksLikePersonSurface = (raw) => {
  const surface = String(raw ?? '').trim();
  if (!surface || !/^\p{Lu}/u.test(surface)) return false;
  const tokens = surface.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 4) return false;
  const stop = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'by', 'for', 'to', 'has', 'he', 'she', 'they', 'this', 'that', 'i']);
  if (tokens.some((token) => stop.has(foldPersonKey(token)))) return false;
  return true;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE = option('--source', 'budapest-joe-hajdu');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const TEXT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/text');
const INPUT = path.resolve(option('--input', path.join(EXTRACTIONS, `${SOURCE}.entities.content.speakers.jsonl`)));
const PAGES_TXT = path.resolve(option('--pages-txt', path.join(TEXT_DIR, `${SOURCE}.pages.txt`)));
const OUTPUT = path.resolve(option('--output', path.join(EXTRACTIONS, `${SOURCE}.muzny-candidates.csv`)));

const VERB = String.raw`said|says|explained|recalled|noted|wrote|argued|continued|added|observed|remarked|exclaimed|declared|replied|answered|asked|insisted|claimed|commented|told`;
const PERSON = String.raw`[\p{L}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){0,2}`;

const AFTER_PATTERNS = [
  {
    id: 'quote_mention_verb',
    re: new RegExp(String.raw`^\s*[,.]?\s*(${PERSON})\s+(?:${VERB})\b`, 'iu'),
  },
  {
    id: 'quote_verb_mention',
    re: new RegExp(String.raw`^\s*[,.]?\s*(?:${VERB})\s+(${PERSON})\b`, 'iu'),
  },
];

/** Cataphoric cues: after-quote "X explained" points forward to the *next* quote, not this one. */
const CATAPHORIC_AFTER_RE = /\b(?:the\s+following|as\s+follows|in\s+the\s+following\s+way)\b/iu;

const BEFORE_PATTERNS = [
  {
    id: 'mention_verb_quote',
    re: new RegExp(String.raw`\b(${PERSON})\s+(?:${VERB})\s*[,:]?\s*$`, 'iu'),
  },
  {
    id: 'verb_mention_quote',
    re: new RegExp(String.raw`\b(?:${VERB})\s+(${PERSON})\s*[,:]?\s*$`, 'iu'),
  },
];

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const locateQuote = (pageText, quote) => {
  const page = String(pageText ?? '');
  const q = String(quote ?? '');
  if (!page || !q) return null;
  let at = page.indexOf(q);
  if (at >= 0) return { start: at, end: at + q.length };
  const prefix = q.slice(0, Math.min(48, q.length));
  at = page.indexOf(prefix);
  if (at >= 0) return { start: at, end: at + prefix.length };
  return null;
};

const main = async () => {
  const pageTextMap = loadPagesTextMap(await fs.readFile(PAGES_TXT, 'utf8'));
  const lines = (await fs.readFile(INPUT, 'utf8')).split('\n').filter(Boolean);
  const rows = [];
  let scanned = 0;
  for (const line of lines) {
    const record = JSON.parse(line);
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of record.payload?.[kind] ?? []) {
        const evidence = item.evidence ?? {};
        const speaker = evidence.speaker ?? {};
        if (evidence.quote_zone !== 'direct_speech') continue;
        if (speaker.reason !== 'no_speech_frame') continue;
        scanned += 1;
        const page = evidence.quote_page;
        const pageText = pageTextMap.get(page) ?? '';
        const span = locateQuote(pageText, evidence.quote);
        if (!span) {
          rows.push({
            kind, page, pattern: 'unlocated', surface: '', gap: '', quote: evidence.quote,
          });
          continue;
        }
        const after = pageText.slice(span.end, span.end + 120);
        const before = pageText.slice(Math.max(0, span.start - 120), span.start);
        let hit = null;
        // Skip after-quote hits when the cue is cataphoric (points to a later quote).
        const afterIsCataphoric = CATAPHORIC_AFTER_RE.test(after);
        if (!afterIsCataphoric) {
          for (const pattern of AFTER_PATTERNS) {
            const match = after.match(pattern.re);
            if (match && looksLikePersonSurface(match[1])) {
              hit = { pattern: pattern.id, surface: match[1], gap: 0, side: 'after' };
              break;
            }
          }
        }
        if (!hit) {
          for (const pattern of BEFORE_PATTERNS) {
            const match = before.match(pattern.re);
            if (match && looksLikePersonSurface(match[1])) {
              hit = { pattern: pattern.id, surface: match[1], gap: before.length - match.index, side: 'before' };
              break;
            }
          }
        }
        if (hit) {
          rows.push({
            kind,
            page,
            pattern: hit.pattern,
            side: hit.side,
            surface: hit.surface,
            gap: hit.gap,
            quote: String(evidence.quote).slice(0, 160),
            label: item.name_en || item.text_en || item.title_en || '',
          });
        }
      }
    }
  }

  const header = ['kind', 'page', 'pattern', 'side', 'surface', 'gap', 'label', 'quote'];
  const csv = [
    header.join(','),
    ...rows.map((row) => header.map((key) => csvEscape(row[key] ?? '')).join(',')),
  ].join('\n');
  await fs.writeFile(OUTPUT, `${csv}\n`);
  const byPattern = {};
  for (const row of rows) byPattern[row.pattern] = (byPattern[row.pattern] ?? 0) + 1;
  console.log(JSON.stringify({
    output: OUTPUT,
    scanned_direct_speech_no_frame: scanned,
    candidates: rows.length,
    by_pattern: byPattern,
    note: 'diagnostic only — does not mutate speakers artifact',
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
