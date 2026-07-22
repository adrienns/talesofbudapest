import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPayloadEvidenceQuotes,
  foldQuoteMatch,
  quoteAlignmentReason,
} from './restrictedEvidenceQuotes.js';

test('foldQuoteMatch joins line-break hyphenation and smart quotes', () => {
  assert.match(foldQuoteMatch('finan-\ncial “hub”'), /financial 'hub'/);
});

test('quoteAlignmentReason accepts verbatim page substring in range', () => {
  const page = 'Budapest has dozens of coffee houses and bars that stay open long after midnight.';
  const quote = 'Budapest has dozens of coffee houses and bars that stay open long after midnight.';
  assert.equal(quoteAlignmentReason(quote, page), null);
});

test('quoteAlignmentReason rejects paraphrase and out-of-range length', () => {
  const page = 'Budapest has dozens of coffee houses and bars that stay open long after midnight.';
  assert.equal(
    quoteAlignmentReason('Budapest has many cafes and night spots that remain open long after midnight for visitors.', page),
    'quote_not_on_page',
  );
  assert.equal(quoteAlignmentReason('Too short.', page), 'quote_too_short');
});

test('filterPayloadEvidenceQuotes drops misaligned items only', () => {
  const page = 'The Great Synagogue stands on Dohány Street near the old Jewish quarter of Pest.';
  const good = 'The Great Synagogue stands on Dohány Street near the old Jewish quarter of Pest.';
  const bad = 'This invented sentence about the synagogue is nowhere in the supplied page text at all.';
  const { payload, dropped } = filterPayloadEvidenceQuotes({
    language: 'en',
    locations: [
      { name_en: 'Great Synagogue', evidence: { quote: good } },
      { name_en: 'Fake', evidence: { quote: bad } },
    ],
    people: [{ name_en: 'X', evidence: { quote: good } }],
    events: [],
    facts: [],
    relations: [],
  }, page);
  assert.equal(payload.locations.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].reason, 'quote_not_on_page');
});
