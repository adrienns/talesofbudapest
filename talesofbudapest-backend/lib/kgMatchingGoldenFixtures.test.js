import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, '../fixtures/kg-matching-golden.json');
const VALID_TAGS = new Set(['hu', 'en', 'de', 'historical', 'translation-pair', 'person-name', 'negative']);

test('fixtures/kg-matching-golden.json parses as JSON with a non-empty cases array', () => {
  const raw = fs.readFileSync(FIXTURES_PATH, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.cases));
  assert.ok(data.cases.length >= 50 && data.cases.length <= 60, `expected 50-60 cases, got ${data.cases.length}`);
});

test('every case has a non-empty mention string', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  for (const golden of data.cases) {
    assert.equal(typeof golden.mention, 'string');
    assert.ok(golden.mention.trim().length > 0, `empty mention in case: ${JSON.stringify(golden)}`);
  }
});

test('expected is either null or a non-empty string', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  for (const golden of data.cases) {
    assert.ok(golden.expected === null || (typeof golden.expected === 'string' && golden.expected.trim().length > 0),
      `invalid expected in case: ${JSON.stringify(golden)}`);
  }
});

test('every tag is one of the documented tags, and every case has at least one tag', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  for (const golden of data.cases) {
    assert.ok(Array.isArray(golden.tags) && golden.tags.length > 0, `case has no tags: ${JSON.stringify(golden)}`);
    for (const tag of golden.tags) {
      assert.ok(VALID_TAGS.has(tag), `invalid tag "${tag}" in case: ${JSON.stringify(golden)}`);
    }
  }
});

test('a case with expected: null carries the "negative" tag, and vice versa', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  for (const golden of data.cases) {
    assert.equal(golden.expected === null, golden.tags.includes('negative'),
      `expected/negative-tag mismatch in case: ${JSON.stringify(golden)}`);
  }
});

test('every "translation-pair" tagged case has a non-null expected value', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  for (const golden of data.cases.filter((row) => row.tags.includes('translation-pair'))) {
    assert.notEqual(golden.expected, null, `translation-pair case must not be a negative: ${JSON.stringify(golden)}`);
  }
});

test('mentions are unique across the fixture set', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const mentions = data.cases.map((row) => row.mention);
  assert.equal(new Set(mentions).size, mentions.length, 'duplicate mention found in fixtures');
});

test('every documented tag is exercised by at least one case', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const usedTags = new Set(data.cases.flatMap((row) => row.tags));
  for (const tag of VALID_TAGS) assert.ok(usedTags.has(tag), `tag "${tag}" is never used in fixtures`);
});
