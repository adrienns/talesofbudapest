import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const speakersPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../ingest/corpus/restricted/extractions/budapest-joe-hajdu.entities.content.speakers.jsonl',
);

test('Hajdu speakers artifact keeps Great Synagogue → Székely on quote_page 89', { skip: !fs.existsSync(speakersPath) }, () => {
  let hit = null;
  for (const line of fs.readFileSync(speakersPath, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    for (const location of row.payload?.locations ?? []) {
      const quote = location.evidence?.quote ?? '';
      if (!quote.includes('cultural institution')) continue;
      hit = location.evidence;
      break;
    }
    if (hit) break;
  }
  assert.ok(hit, 'expected Great Synagogue cultural-institution quote');
  assert.equal(hit.quote_page, 89);
  assert.equal(hit.quote_page_reason, 'exact_unique');
  assert.equal(hit.speaker?.status, 'resolved');
  assert.equal(hit.speaker?.name_en, 'Gábor Székely');
});

test('Hajdu speakers regression: resolved all high, no review queue', {
  skip: !fs.existsSync(speakersPath),
}, () => {
  let resolved = 0;
  let notHigh = 0;
  let needsReview = 0;
  for (const line of fs.readFileSync(speakersPath, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of row.payload?.[kind] ?? []) {
        const speaker = item.evidence?.speaker;
        if (speaker?.status !== 'resolved') continue;
        resolved += 1;
        if (speaker.confidence !== 'high') notHigh += 1;
        if (speaker.needs_review) needsReview += 1;
      }
    }
  }
  assert.ok(resolved >= 36, `expected >=36 resolved, got ${resolved}`);
  assert.equal(notHigh, 0, 'all resolved must be high confidence');
  assert.equal(needsReview, 0, 'review queue must stay empty');
});
