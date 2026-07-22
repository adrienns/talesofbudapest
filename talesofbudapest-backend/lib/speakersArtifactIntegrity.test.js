import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSpeakersArtifactIntegrity,
  validateSpeakersArtifactRecord,
} from './speakersArtifactIntegrity.js';

const baseRecord = () => ({
  pdf_pages: [89, 90, 91],
  speaker_attribution: { version: 'quote-speaker-v2', annotated_at: '2026-07-22T00:00:00.000Z' },
  payload: {
    locations: [{
      name_en: 'Great Synagogue',
      evidence: {
        quote: 'I look at the Great Synagogue.',
        speaker: { status: 'resolved', reason: 'speech_frame_person', name_en: 'Gábor Székely', confidence: 'high', needs_review: false },
        quote_page: 89,
        quote_page_reason: 'exact_unique',
        quote_zone: 'direct_speech',
        quote_zone_reason: 'inside_quoted_run',
      },
    }],
    facts: [],
    relations: [],
    events: [],
  },
});

test('valid record passes', () => {
  assert.equal(validateSpeakersArtifactRecord(baseRecord()).length, 0);
});

test('missing version fails', () => {
  const row = baseRecord();
  delete row.speaker_attribution;
  assert.ok(validateSpeakersArtifactRecord(row).some((error) => error.reason.includes('version')));
});

test('missing speaker fails', () => {
  const row = baseRecord();
  delete row.payload.locations[0].evidence.speaker;
  assert.ok(validateSpeakersArtifactRecord(row).some((error) => error.reason === 'missing_speaker'));
});

test('exact_unique_cross_page quote_page outside pdf_pages fails', () => {
  const row = baseRecord();
  row.pdf_pages = [10, 11];
  row.payload.locations[0].evidence.quote_page = 89;
  row.payload.locations[0].evidence.quote_page_reason = 'exact_unique_cross_page';
  assert.ok(validateSpeakersArtifactRecord(row).some((error) => error.reason === 'quote_page_outside_window'));
});

test('exact_unique_cross_page inside window passes', () => {
  const row = baseRecord();
  row.payload.locations[0].evidence.quote_page_reason = 'exact_unique_cross_page';
  assert.equal(validateSpeakersArtifactRecord(row).length, 0);
});

test('explicit input skips integrity assert', () => {
  const result = assertSpeakersArtifactIntegrity([{}], { provenance: 'explicit_input' });
  assert.equal(result.skipped, true);
});

test('assert throws on partial artifact', () => {
  const row = baseRecord();
  delete row.payload.locations[0].evidence.quote_page_reason;
  assert.throws(
    () => assertSpeakersArtifactIntegrity([row], { provenance: 'content_speakers' }),
    /integrity gate/,
  );
});

const speakersPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../ingest/corpus/restricted/extractions/budapest-joe-hajdu.entities.content.speakers.jsonl',
);

test('live Hajdu speakers artifact passes integrity', { skip: !fs.existsSync(speakersPath) }, () => {
  const records = fs.readFileSync(speakersPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const result = assertSpeakersArtifactIntegrity(records, { provenance: 'content_speakers' });
  assert.equal(result.ok, true);
  assert.ok(result.quotes > 2000);
});
