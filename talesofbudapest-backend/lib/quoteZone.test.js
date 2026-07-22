import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuoteZone, findQuotedRuns } from './quoteZone.js';

const page89 = [
  'The attitude of the political scientist Professor Gábor Székely, with whom the author spoke, illustrates the difficulties.',
  'As Székely explained:',
  '‘My position is that I accept my Jewishness when Jews are attacked, but I’m not religious and do not see my identity as an active member of any Jewish community. I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution. My own family shows some of the crosscurrents of Jewish life here.’',
  '',
  'Both Szita and Székely put the size of the Jewish population in Budapest today at ‘around 100,000’.',
].join('\n');

const speechQuote = 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.';
const proseQuote = 'The attitude of the political scientist Professor Gábor Székely, with whom the author spoke, illustrates the difficulties.';
const proseWithInlineQuote = 'Both Szita and Székely put the size of the Jewish population in Budapest today at ‘around 100,000’.';

test('findQuotedRuns ignores apostrophes inside words', () => {
  const runs = findQuotedRuns(page89);
  assert.ok(runs.length >= 1);
  const big = runs.find((run) => page89.slice(run.start, run.end).includes('Great Synagogue'));
  assert.ok(big);
});

test('speech interior is direct_speech; narrator prose is prose', () => {
  assert.equal(classifyQuoteZone(page89, speechQuote).zone, 'direct_speech');
  assert.equal(classifyQuoteZone(page89, proseQuote).zone, 'prose');
});

test('evidence that straddles an inline quote run is unknown (fail-closed)', () => {
  assert.equal(classifyQuoteZone(page89, proseWithInlineQuote).zone, 'unknown');
});

test('unlocated quote is unknown', () => {
  assert.equal(classifyQuoteZone(page89, 'This text is nowhere on the page at all and long enough.').zone, 'unknown');
});
