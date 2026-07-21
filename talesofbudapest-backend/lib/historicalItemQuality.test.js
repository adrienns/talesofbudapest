import assert from 'node:assert/strict';
import test from 'node:test';
import { groundPronominalStatement, itemStructuralQualityReason } from './historicalItemQuality.js';

test('structural item gate rejects meta mentions, fragments, and unresolved pronouns', () => {
  assert.equal(itemStructuralQualityReason({ statement_en: 'Budapest is mentioned.' }), 'meta_mention_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Occasionally called Logodi gate.' }), 'fragment_without_subject');
  assert.equal(itemStructuralQualityReason({ statement_en: 'It shines with festivity.', subject_attribution: { status: 'unresolved' } }), 'unresolved_pronominal_subject');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Book without foreword is like body without soul.', evidence: [{ quote: '“A book without a foreword” says a Yiddish proverb.' }] }), 'quoted_maxim_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'There was a Jewish quarter in each.', subject_attribution: { status: 'unresolved' } }), 'unbound_deictic_or_existential_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: '+A- He was asked a question.' }), 'malformed_statement_prefix');
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Burghers were Germans.', subject_attribution: { status: 'unresolved' },
    clause_references: [{ surface: 'its burghers' }],
  }), 'possessive_owner_not_safe_fact_subject');
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Lane name was used.', subject_attribution: { status: 'unresolved' },
    evidence: [{ quote: 'The latter was referred to as Juden Gasse.' }],
  }), 'unresolved_ordinal_anaphor_subject');
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Face may not be visible.', subject_attribution: { status: 'unresolved' },
    evidence: [{ page_ref: 2, start_offset: 100, quote: 'It may not be visible to everyone.' }],
  }), 'unresolved_source_pronominal_subject');
  assert.equal(itemStructuralQualityReason({
    statement_en: 'King occupied a palace.', subject_attribution: { status: 'unresolved' },
    evidence: [{ page_ref: 2, start_offset: 100, quote: 'The king occupied a palace.' }],
    clause_unresolved_references: [{ page_ref: 2, start_offset: 100, surface: 'The king' }],
  }), 'unresolved_source_reference_subject');
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Person was a citizen of Buda.', subject_attribution: { status: 'unresolved' },
    evidence: [{ page_ref: 2, start_offset: 100, quote: 'A person, whether subject of the king, was a citizen.' }],
    clause_unresolved_references: [{ page_ref: 2, start_offset: 133, surface: 'the king' }],
  }), null);
});

test('structural item gate rejects underspecified claims without anchors', () => {
  assert.equal(itemStructuralQualityReason({ statement_en: 'Architects designed houses.' }), 'underspecified_without_anchor');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Neighborhood became modern.' }), 'underspecified_without_anchor');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Jews paid a special tax.' }), null);
  assert.equal(itemStructuralQualityReason({ statement_en: 'Flood changed Kiraly utca appearance.' }), null);
  assert.equal(itemStructuralQualityReason({ statement_en: 'People in black kaftans are tourists.' }), 'present_day_observation_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Mother was daughter of a learned rabbi.' }), 'bare_kinship_subject');
  assert.equal(itemStructuralQualityReason({ statement_en: 'Space next to plot for cemetery.' }), 'fragment_without_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'The relocation was done under official order.' }), 'underspecified_abstract_event');
  assert.equal(itemStructuralQualityReason({ statement_en: 'The killing occurred in a synagogue.' }), 'underspecified_abstract_event');
  assert.equal(itemStructuralQualityReason({ statement_en: 'The marker states graves from before 1888 were reburied here in honor.' }), 'meta_mention_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'R. Simhah\'s mother was Hungarian.' }), null);
  assert.equal(itemStructuralQualityReason({ statement_en: 'Jews expelled from Obuda in 1745.' }), null);
  assert.equal(itemStructuralQualityReason({ statement_en: 'The authors describe visible or known historical sites in Budapest.' }), 'meta_mention_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'The book describes Jewish customs in detail.' }), 'meta_mention_not_historical_claim');
  assert.equal(itemStructuralQualityReason({ statement_en: 'The Book of Esther is written on a scroll.' }), null);
});

test('grounded statements survive unresolved source pronouns in evidence', () => {
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Cemetery visible on 1909 map.',
    subject_attribution: { status: 'unresolved' },
    evidence: [{ quote: 'It can be seen on a map of the capital from 1909.' }],
  }), null);
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Moshe Miinz gravestone refurbished.',
    subject_attribution: { status: 'unresolved' },
    clause_references: [{ surface: 'his gravestone' }],
  }), null);
});

test('structural item gate rejects caption furniture leaked into evidence', () => {
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Jewish delegates asked for confirmation of privileges.',
    evidence: [{ quote: '14. Portrait of “Mandl Jvd” (Mendel) on his seal their privileges.' }],
  }), 'caption_or_title_furniture_in_evidence');
});

test('groundPronominalStatement replaces resolved He/His with the literal subject', () => {
  const grounded = groundPronominalStatement({
    statement_en: 'He returned to Prague.',
    literal_subject: 'R. Efraim',
    subject_attribution: { status: 'resolved', literal_subject: 'R. Efraim' },
  });
  assert.equal(grounded.statement_en, 'R. Efraim returned to Prague.');
  assert.equal(groundPronominalStatement({
    statement_en: 'His tomb was visited.',
    literal_subject: 'R. Efraim',
    subject_attribution: { status: 'resolved' },
  }).statement_en, "R. Efraim's tomb was visited.");
});

test('structural item gate keeps a resolved pronoun and a substantive claim', () => {
  assert.equal(itemStructuralQualityReason({ statement_en: 'He founded a school.', subject_attribution: { status: 'resolved' } }), null);
  assert.equal(itemStructuralQualityReason({ statement_en: 'Jews paid a special tax.' }), null);
  assert.equal(itemStructuralQualityReason({
    statement_en: 'Buda burghers were Germans.', subject_attribution: { status: 'resolved' },
    clause_references: [{ surface: 'its burghers' }],
  }), null);
});
