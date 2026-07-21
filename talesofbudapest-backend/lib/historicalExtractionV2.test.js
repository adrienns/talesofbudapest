import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCoverage,
  applyResolvedReferences,
  aggregateUsage,
  assignMentionIds,
  buildClauseLedger,
  collapseClauseSiblingItems,
  dedupeHistoricalItems,
  itemHasResolvedReferences,
  needsQualityEscalation,
  normalizeModelItems,
  realignModelItemsToClauses,
  retrieveSchemas,
  assembleCanonicalEvents,
  looksLikeQuotedMaterial,
  statementsSamePolarity,
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

test('chronology labels stay attached to their content and repeated labels split entries', () => {
  const text = '1827: The school opened. 1830: It moved to Buda.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  assert.deepEqual(clauses.map((clause) => clause.text), ['1827: The school opened.', '1830: It moved to Buda.']);
  assert.ok(clauses.every((clause) => !/^\d{4}:$/u.test(clause.text)));
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
  const byId = new Map(clauses.map((clause) => [clause.clause_id, clause]));
  assert.equal(needsQualityEscalation(item, 'supported', byId), false);
  assert.equal(needsQualityEscalation(item, undefined, byId), false, 'audit silence without risk flags must not escalate');
  const covered = applyCoverage({ clauses, items: [item], coverageRows: [], auditStatus: 'agreed' });
  assert.equal(covered[0].disposition, 'covered');
  assert.deepEqual(covered[0].item_ids, [item.item_id]);
});

test('quality escalation ignores ocr_noise alone and resolved cross-page refs', () => {
  const text = 'He returned to Prague after the war.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const clause = { ...clauses[0], risk_flags: ['ocr_noise'] };
  const item = {
    item_id: 'hi_x', clause_ids: [clause.clause_id], participants: [], statement_en: text,
  };
  const byId = new Map([[clause.clause_id, clause]]);
  assert.equal(needsQualityEscalation(item, undefined, byId), false);
  const risky = { ...clause, risk_flags: ['cross_page_continuation'] };
  const byRisky = new Map([[risky.clause_id, risky]]);
  const mentions = new Map([['m1', { mention_id: 'm1', type: 'person' }]]);
  const resolved = [{ clause_id: risky.clause_id, surface: 'He', antecedent_mention_id: 'm1', resolved_entity_id: 'e1' }];
  const withParticipant = { ...item, participants: [{ mention_id: 'm1', role: 'subject' }] };
  assert.equal(needsQualityEscalation(withParticipant, 'supported', byRisky, mentions, resolved), false);
  assert.equal(needsQualityEscalation(item, 'unsupported', byId), true);
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

test('near duplicate items on adjacent evidence merge without merging separate facts', () => {
  const base = (id, statement, offset) => ({
    item_id: id, kind: 'event', assertion_kind: null, open_type: 'death', statement_en: statement,
    clause_ids: [`c${id}`], participants: [], evidence: [{ page_ref: 1, start_offset: offset, end_offset: offset + 20, quote: statement }],
    corefers_with: [], discovery_sources: [id],
  });
  const merged = dedupeHistoricalItems([base('a', 'Efraim died in Buda during an epidemic.', 10), base('b', 'Efraim died in Buda.', 90)]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].clause_ids.sort(), ['ca', 'cb']);
  const distinct = dedupeHistoricalItems([base('a', 'Efraim died in Buda during an epidemic.', 10), base('c', 'Efraim died in Prague during a fire.', 90)]);
  assert.equal(distinct.length, 2);
});

test('collapseClauseSiblingItems keeps one paraphrase per identical clause set', () => {
  const base = (id, statement, clause) => ({
    item_id: id,
    kind: 'event',
    assertion_kind: null,
    statement_en: statement,
    clause_ids: [clause],
    verification: { verdict: 'supported' },
    evidence: [{ page_ref: 1, start_offset: 0, end_offset: 10, quote: statement }],
  });
  const collapsed = collapseClauseSiblingItems([
    base('a', 'Cemetery opened around 1820.', 'cl_x'),
    base('b', 'The cemetery was opened around 1820.', 'cl_x'),
    base('c', 'Jews left Obuda in 1745.', 'cl_y'),
  ]);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed.find((item) => item.clause_ids[0] === 'cl_x').item_id, 'b');
  // Distinct facts sharing a clause id must not collapse.
  const distinct = collapseClauseSiblingItems([
    base('a', 'Cemetery opened around 1820.', 'cl_x'),
    base('b', 'Cemetery might have been demolished during construction.', 'cl_x'),
  ]);
  assert.equal(distinct.length, 2);
  // Opposite polarity must not collapse.
  const polarity = collapseClauseSiblingItems([
    base('a', 'Jews settled in Obuda.', 'cl_z'),
    base('b', 'Jews did not settle in Obuda.', 'cl_z'),
  ]);
  assert.equal(polarity.length, 2);
  const contraction = collapseClauseSiblingItems([
    base('a', 'Jews settled in Obuda.', 'cl_c'),
    base('b', "Jews didn't settle in Obuda.", 'cl_c'),
  ]);
  assert.equal(contraction.length, 2);
  const failedTo = collapseClauseSiblingItems([
    base('a', 'Jews settled in Obuda.', 'cl_f'),
    base('b', 'Jews failed to settle in Obuda.', 'cl_f'),
  ]);
  assert.equal(failedTo.length, 2);
  const antonyms = collapseClauseSiblingItems([
    base('a', 'Authorities permitted residence.', 'cl_a'),
    base('b', 'Authorities prohibited residence.', 'cl_a'),
  ]);
  assert.equal(antonyms.length, 2);
  for (const [left, right] of [
    ['The person was alive in Buda.', 'The person was dead in Buda.'],
    ['This was a public synagogue.', 'This was a private synagogue.'],
    ['Jews entered the castle.', 'Jews exited the castle.'],
    ['They built the synagogue in Buda.', 'They demolished the synagogue in Buda.'],
  ]) {
    assert.equal(statementsSamePolarity(left, right), false, `${left} vs ${right}`);
    assert.equal(collapseClauseSiblingItems([base('a', left, 'cl_x'), base('b', right, 'cl_x')]).length, 2);
  }
  // Non-aligned commercial verbs must not count as contradictions.
  assert.equal(statementsSamePolarity('They leased the land in 1732.', 'They sold the land in 1737.'), true);
  assert.equal(statementsSamePolarity('They built a synagogue.', 'They demolished a bridge.'), true);
  assert.equal(statementsSamePolarity('It was illegal.', 'It was illegal.'), true);
});

test('single-capital initials do not split sentences', () => {
  const text = 'His son, R. Judah, survived the siege of Buda. He settled in the land of Zion.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  assert.equal(clauses.length, 2);
  assert.match(clauses[0].text, /R\. Judah, survived/u);
});

test('resolver-linked antecedent satisfies the reference gate without a local participant', () => {
  const text = 'He maintained that a curse cannot be imposed on scholars.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const clauseById = new Map(clauses.map((clause) => [clause.clause_id, clause]));
  const item = { clause_ids: [clauses[0].clause_id], participants: [] };
  assert.equal(itemHasResolvedReferences(item, clauseById, new Map()), false);
  const references = [{ clause_id: clauses[0].clause_id, surface: 'He', resolved_entity_id: 'se_x', antecedent_mention_id: 'm_x' }];
  assert.equal(itemHasResolvedReferences(item, clauseById, new Map(), references), true);
});

test('quoted spans are not split on internal colons or semicolons', () => {
  const text = 'Maimonides wrote: “Hear, O Israel; the Lord is one; keep these precepts.” The city remembered him.';
  const clauses = buildClauseLedger({ sourceId: 'book', targetPages: [{ page: 1, text }], readingPages: [readingPage(1, text)], mentions: [] });
  const quoted = clauses.filter((clause) => clause.zone === 'quote');
  assert.ok(quoted.length >= 1);
  assert.ok(quoted.some((clause) => /Hear, O Israel; the Lord is one; keep these precepts/u.test(clause.text)));
  assert.equal(clauses.filter((clause) => /^the Lord is one/u.test(clause.text.trim())).length, 0);
});

test('explicit reporting clause can attach a speaker mention to a following quote', () => {
  const text = 'R. Efraim said “Return to Prague.” The tomb remained.';
  const mentions = assignMentionIds('book', [{ page: 1, start_offset: 0, end_offset: 9, text: 'R. Efraim', type: 'person', confidence: 1 }]);
  const clauses = buildClauseLedger({
    sourceId: 'book',
    targetPages: [{ page: 1, text }],
    readingPages: [readingPage(1, text)],
    mentions,
  });
  const quote = clauses.find((clause) => clause.speaker_mention_id === mentions[0].mention_id);
  assert.ok(quote, JSON.stringify(clauses.map((clause) => ({ text: clause.text, zone: clause.zone, speaker: clause.speaker_mention_id }))));
  assert.match(quote.text, /Return to Prague/u);
});

test('assembleCanonicalEvents groups schema-typed supported claims only', () => {
  const events = assembleCanonicalEvents([
    {
      item_id: 'hi_1',
      kind: 'event',
      open_type: 'independent_event',
      canonical_type: 'construction',
      statement_en: 'The community built a synagogue in 1827.',
      subject_entity_id: 'se_community',
      participants: [{ resolved_entity_id: 'se_synagogue', role: 'building' }],
      verification: { verdict: 'supported' },
    },
    {
      item_id: 'hi_2',
      kind: 'assertion',
      open_type: 'independent_assertion',
      canonical_type: null,
      statement_en: 'A proverb about books.',
      verification: { verdict: 'supported' },
    },
    {
      item_id: 'hi_3',
      kind: 'event',
      canonical_type: 'construction',
      statement_en: 'Unsupported construction claim.',
      verification: { verdict: 'unsupported' },
    },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'construction');
  assert.deepEqual(events[0].evidence_claim_ids, ['hi_1']);
  assert.ok(events[0].derived_relations.some((row) => row.projection && row.to_entity_id === 'se_synagogue'));
});

test('looksLikeQuotedMaterial detects exhortations and quote zones', () => {
  assert.equal(looksLikeQuotedMaterial('Let every man keep the Sabbath.'), true);
  assert.equal(looksLikeQuotedMaterial('The synagogue opened in 1827.'), false);
  assert.equal(looksLikeQuotedMaterial('plain', [{ zone: 'quote' }]), true);
});
