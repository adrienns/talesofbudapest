import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCoverage,
  applyResolvedReferences,
  aggregateUsage,
  assignMentionIds,
  buildClauseLedger,
  itemHasResolvedReferences,
  needsQualityEscalation,
  normalizeModelItems,
  realignModelItemsToClauses,
  retrieveSchemas,
} from './historicalExtractionV2.js';

const readingPage = (page, text) => ({
  page,
  text,
  raw_starts: [...text].map((_, index) => index),
  raw_ends: [...text].map((_, index) => index + 1),
});

test('clause ledger includes every clause without event-cue gating and preserves offsets', () => {
  const text = 'He stayed there; prayers were not customary. A quiet courtyard remained.';
  const mentions = assignMentionIds('book', [{ page: 46, start_offset: 17, end_offset: 24, text: 'prayers', type: 'event', confidence: 0.9 }]);
  const clauses = buildClauseLedger({
    sourceId: 'book',
    targetPages: [{ page: 46, text }],
    readingPages: [readingPage(46, text)],
    mentions,
  });
  assert.equal(clauses.length, 3);
  assert.deepEqual(clauses.map((clause) => clause.source_quote), ['He stayed there;', 'prayers were not customary.', 'A quiet courtyard remained.']);
  assert.ok(clauses.every((clause) => clause.allow_other));
  assert.ok(clauses[1].risk_flags.includes('negation'));
  assert.equal(clauses[2].suggested_schemas.length, 0);
});

test('schema retrieval is advisory and returns at most eight likely schemas', () => {
  const schemas = retrieveSchemas('The community built and opened a synagogue after the flood.', [
    { type: 'organisation' }, { type: 'building' }, { type: 'event' },
  ]);
  assert.ok(schemas.includes('construction'));
  assert.ok(schemas.includes('disaster_or_rescue'));
  assert.ok(schemas.length <= 8);
});

test('model items use exact clause evidence and may resolve an adjacent-page mention', () => {
  const text = 'He died during the epidemic.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 46, text }], readingPages: [readingPage(46, text)], mentions: [] });
  const mentions = assignMentionIds('book', [{ page: 45, start_offset: 0, end_offset: 8, text: 'R. Efraim', type: 'person', confidence: 1 }]);
  const items = normalizeModelItems({
    sourceId: 'book', clauses, mentions, discoverySource: 'primary',
    rawItems: [{
      kind: 'event', assertion_kind: null, open_type: 'death', canonical_type: 'birth_or_death',
      statement_en: 'R. Efraim died during the epidemic.', clause_ids: [clauses[0].clause_id],
      participants: [{ mention_id: mentions[0].mention_id, role: 'person', resolved_entity_id: null }],
      time: null, place: null, polarity: 'affirmed', modality: 'asserted', attribution: null,
      dynamic_attributes: [],
    }],
  });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].evidence[0], { page_ref: 46, start_offset: 0, end_offset: text.length, quote: text });
  assert.equal(items[0].participants[0].mention_id, mentions[0].mention_id);
});

test('lowercase page continuation requires a linked antecedent participant', () => {
  const text = 'sponded with the Jewish world.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 46, text }], readingPages: [readingPage(46, text)], mentions: [] });
  const mentions = assignMentionIds('book', [{ page: 45, start_offset: 10, end_offset: 19, text: 'R. Efraim', type: 'person', confidence: 1 }]);
  const mentionById = new Map(mentions.map((mention) => [mention.mention_id, mention]));
  const clauseById = new Map(clauses.map((clause) => [clause.clause_id, clause]));
  const item = {
    clause_ids: [clauses[0].clause_id],
    participants: [],
  };
  assert.ok(clauses[0].risk_flags.includes('cross_page_continuation'));
  assert.equal(itemHasResolvedReferences(item, clauseById, mentionById), false);
  assert.equal(itemHasResolvedReferences({ ...item, participants: [{ mention_id: mentions[0].mention_id, role: 'agent' }] }, clauseById, mentionById), true);
});

test('clause-level reference resolution links every item sharing the pronoun clause', () => {
  const text = 'He maintained that errors should be corrected privately.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 46, text }], readingPages: [readingPage(46, text)], mentions: [] });
  const mentions = assignMentionIds('book', [{ page: 45, start_offset: 10, end_offset: 19, text: 'R. Efraim', type: 'person', confidence: 1 }]);
  const base = (statement) => ({
    item_id: `old-${statement}`,
    kind: 'assertion', assertion_kind: 'rule_custom', open_type: 'custom', canonical_type: null,
    statement_en: statement, clause_ids: [clauses[0].clause_id], participants: [], time: null, place: null,
    polarity: 'affirmed', modality: 'reported', attribution: null, dynamic_attributes: [], evidence: [],
    corefers_with: [], relations: [], discovery_sources: ['primary'], publication_status: 'private',
  });
  const linked = applyResolvedReferences({
    items: [base('Errors should be corrected privately.'), base('The rule was attributed to R. Efraim.')],
    references: [{ clause_id: clauses[0].clause_id, antecedent_mention_id: mentions[0].mention_id, surface: 'He' }],
    mentions,
    sourceId: 'book',
  });
  assert.ok(linked.every((item) => item.participants.some((participant) => participant.mention_id === mentions[0].mention_id)));
  assert.ok(linked.every((item) => item.corefers_with.includes(mentions[0].mention_id)));
  assert.ok(linked.every((item) => item.item_id.startsWith('hi_')));
});

test('normalizer rejects invented clause IDs and invalid assertion kinds', () => {
  const text = 'A custom existed.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const base = {
    kind: 'assertion', assertion_kind: 'rule_custom', open_type: 'custom', canonical_type: null,
    statement_en: 'A custom existed.', participants: [], time: null, place: null,
    polarity: 'affirmed', modality: 'asserted', attribution: null, dynamic_attributes: [],
  };
  assert.equal(normalizeModelItems({ rawItems: [{ ...base, clause_ids: ['invented'] }], clauses, mentions: [], sourceId: 'book', discoverySource: 'primary' }).length, 0);
  assert.equal(normalizeModelItems({ rawItems: [{ ...base, assertion_kind: 'made_up', clause_ids: [clauses[0].clause_id] }], clauses, mentions: [], sourceId: 'book', discoverySource: 'primary' }).length, 0);
});

test('coverage uses only accepted items and quality routing trusts independent agreement for safe open types', () => {
  const text = 'A custom existed.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const item = normalizeModelItems({
    sourceId: 'book', clauses, mentions: [], discoverySource: 'primary',
    rawItems: [{
      kind: 'assertion', assertion_kind: 'rule_custom', open_type: 'local_custom', canonical_type: null,
      statement_en: 'A custom existed.', clause_ids: [clauses[0].clause_id], participants: [], time: null,
      place: null, polarity: 'affirmed', modality: 'asserted', attribution: null, dynamic_attributes: [],
    }],
  })[0];
  assert.equal(needsQualityEscalation(item, 'supported', new Map(clauses.map((clause) => [clause.clause_id, clause]))), false);
  const covered = applyCoverage({ clauses, items: [item], coverageRows: [], auditStatus: 'agreed' });
  assert.equal(covered[0].disposition, 'covered');
  assert.deepEqual(covered[0].item_ids, [item.item_id]);
});

test('audit statements with shifted compact IDs realign to the exact lexical clause', () => {
  const text = 'He corresponded with Venice. He maintained that ritual curses cannot be imposed on scholars.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const shifted = [{ clause_ids: [clauses[0].clause_id], statement_en: 'Ritual curses cannot be imposed on scholars.' }];
  const [aligned] = realignModelItemsToClauses({ items: shifted, availableClauses: clauses, allClauses: clauses });
  assert.equal(aligned.clause_ids[0], clauses[1].clause_id);
});

test('cache hits report saved cost without consuming the run budget', () => {
  const usage = aggregateUsage([
    { cache_hit: false, usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.002 } },
    { cache_hit: true, usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340, cost: 0.006 } },
  ]);
  assert.equal(usage.cost, 0.002);
  assert.equal(usage.saved_cost, 0.006);
  assert.equal(usage.prompt_tokens, 100);
  assert.equal(usage.saved_prompt_tokens, 300);
  assert.equal(usage.call_count, 1);
  assert.equal(usage.cache_hits, 1);
});
