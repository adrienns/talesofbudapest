import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoLinkMatchReason, classifyRestrictedLocation, haversineMeters,
  normalizeLocationName, scoreLocationCandidate,
} from './kgLocationResolver.js';

test('normalizes Hungarian and English street aliases', () => {
  assert.equal(normalizeLocationName('Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('Dohany Street'), 'dohany street');
});

test('normalizes bidirectional Hungarian/English generic terms', () => {
  assert.equal(normalizeLocationName('Andrássy körút'), 'andrassy boulevard');
  assert.equal(normalizeLocationName('Andrassy Boulevard'), 'andrassy boulevard');
  assert.equal(normalizeLocationName('Erzsébet híd'), 'erzsebet bridge');
  assert.equal(normalizeLocationName('Erzsébet Bridge'), 'erzsebet bridge');
  assert.equal(normalizeLocationName('Rákóczi út'), 'rakoczi road');
  assert.equal(normalizeLocationName('Rakoczi Avenue'), 'rakoczi road');
  assert.equal(normalizeLocationName('Belgrád rakpart'), 'belgrad quay');
  assert.equal(normalizeLocationName('Belgrád Embankment'), 'belgrad quay');
  assert.equal(normalizeLocationName('Dohány utcai zsinagóga'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Dohány Street Synagogue'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Kozma utcai temető'), 'kozma street cemetery');
  assert.equal(normalizeLocationName('Kozma Street Cemetery'), 'kozma street cemetery');
  assert.equal(normalizeLocationName('Mátyás templom'), 'matyas church');
  assert.equal(normalizeLocationName('Matthias Church'), 'matthias church');
  assert.equal(normalizeLocationName('Gellért fürdő'), 'gellert baths');
  assert.equal(normalizeLocationName('Gellért Baths'), 'gellert baths');
  assert.equal(normalizeLocationName('Margit sziget'), 'margit island');
  assert.equal(normalizeLocationName('Margaret Island'), 'margaret island');
  assert.equal(normalizeLocationName('New York kávéház'), 'new york cafe');
  assert.equal(normalizeLocationName('New York Café'), 'new york cafe');
  assert.equal(normalizeLocationName('New York Coffee House'), 'new york cafe');
  assert.equal(normalizeLocationName('Zichy palota'), 'zichy palace');
  assert.equal(normalizeLocationName('Zichy Palace'), 'zichy palace');
});

test('strips ordinal/district prefixes and leading articles', () => {
  assert.equal(normalizeLocationName('VII. Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('VII. kerület, Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('7th district, Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('The Dohány Street Synagogue'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Kazinczy utca 29–31'), 'kazinczy street 29 31');
  assert.equal(normalizeLocationName('Kazinczy utca 29-31'), 'kazinczy street 29 31');
});

test('exact bilingual alias now clears the auto-link bar on its own', () => {
  const result = scoreLocationCandidate({ name_en: 'Dohány utca', kind: 'street' }, { name: 'Dohany Street', landmark_type: 'road' });
  assert.equal(result.signals.exactName, true);
  assert.equal(result.autoLinkEligible, true);
  assert.ok(result.score >= 0.9, `expected score >= 0.9, got ${result.score}`);
  assert.equal(result.autoMatch, true, 'an exact normalized alias match is the strong deterministic signal the design requires');
  assert.equal(autoLinkMatchReason(result), 'exact_alias');
});

test('Dohány Street Synagogue mention auto-links to the public landmark despite a kind-field mismatch', () => {
  // Mirrors the real jewish-budapest.location-candidates.json entry: a mention
  // whose location_kind ("synagogue") does not line up with the public
  // location's landmark_type, previously capping this at score 0.54.
  const mention = { name_en: 'Dohány Street Synagogue', source_name_hu: 'Dohány utcai zsinagóga', address_en: 'Dohány utca, Pest, Budapest', kind: 'synagogue' };
  const candidate = { id: '84427db4-c1e8-439e-9d06-0a96d780f9ba', name: 'Dohány Street Synagogue', landmark_type: 'monument' };
  const result = scoreLocationCandidate(mention, candidate);
  assert.equal(result.signals.exactName, true);
  assert.equal(result.signals.kindMatch, false);
  assert.ok(result.score >= 0.9, `expected score >= 0.9, got ${result.score}`);
  assert.equal(result.autoMatch, true);
  assert.equal(autoLinkMatchReason(result), 'exact_alias');
});

test('source_name (not just name_en) can carry the exact-match signal', () => {
  const mention = { name_en: 'Nagy Zsinagóga', source_name: 'Dohány Street Synagogue' };
  const candidate = { name: 'Dohány Street Synagogue' };
  const result = scoreLocationCandidate(mention, candidate);
  assert.equal(result.signals.exactName, true);
  assert.equal(result.autoMatch, true);
});

test('house-number address styled as a name still normalizes to an exact match', () => {
  const mention = { name_en: 'Kazinczy utca 29–31', address_en: 'Kazinczy utca 29-31, Budapest' };
  const candidate = { name: 'Kazinczy utca 29-31' };
  const result = scoreLocationCandidate(mention, candidate);
  assert.equal(result.signals.exactName, true);
  assert.equal(result.autoMatch, true);
  assert.equal(autoLinkMatchReason(result), 'exact_alias');
});

test('New York kávéház auto-links to New York Café via the Hungarian/English cafe alias', () => {
  const mention = { name_en: 'New York kávéház', address_en: 'Erzsébet körút 9-11, Budapest' };
  const candidate = { name: 'New York Café' };
  const result = scoreLocationCandidate(mention, candidate);
  assert.equal(result.signals.exactName, true);
  assert.equal(result.autoMatch, true);
});

test('junk page-marker source_name values never produce a false exact-match auto-link', () => {
  // Real p1 extraction defect: source_name sometimes holds "PDF Page 15" or a
  // bare page number instead of the as-written name. Two unrelated mentions
  // that merely share a page marker must not collapse into an exact match.
  const mentionA = { name_en: 'Assembly Hall', source_name: 'PDF Page 15' };
  const mentionB = { name_en: 'Rashekols', source_name: 'PDF Page 15' };
  const result = scoreLocationCandidate(mentionA, { name: mentionB.name_en, source_name: mentionB.source_name });
  assert.equal(result.signals.exactName, false);
  assert.equal(result.autoMatch, false);

  const bareNumber = scoreLocationCandidate({ name_en: 'Jewish Hospital', source_name: '42' }, { name: 'Zsidó Gimnázium', source_name: '42' });
  assert.equal(bareNumber.signals.exactName, false);
  assert.equal(bareNumber.autoMatch, false);
});

test('vector similarity alone never auto-matches', () => {
  const result = scoreLocationCandidate({ name_en: 'Great Synagogue' }, { id: 'x', name: 'Central Temple' }, { vectorSimilarity: 0.99 });
  assert.equal(result.deterministic, false);
  assert.equal(result.autoLinkEligible, false);
  assert.equal(result.autoMatch, false);
  assert.equal(autoLinkMatchReason(result), null);
});

test('high name similarity without an exact match or proximity stays a review candidate', () => {
  // Real-world near-miss: a street mention scored against a synagogue on the
  // same street shares two of three tokens but is not the same entity.
  const result = scoreLocationCandidate({ name_en: 'Dohány utca' }, { name: 'Dohány Street Synagogue' });
  assert.equal(result.signals.exactName, false);
  assert.ok(result.signals.nameSimilarity > 0.5 && result.signals.nameSimilarity < 1);
  assert.equal(result.autoLinkEligible, false);
  assert.equal(result.autoMatch, false);
});

test('exact name plus close coordinates auto-matches', () => {
  const result = scoreLocationCandidate(
    { name_en: 'Dohány Street Synagogue', latitude: 47.4959, longitude: 19.0605 },
    { name: 'Dohany Street Synagogue', latitude: 47.4958, longitude: 19.0606 },
  );
  assert.ok(result.signals.distanceMeters < 50);
  assert.equal(result.autoMatch, true);
  assert.equal(autoLinkMatchReason(result), 'exact_alias');
});

test('close coordinates alone (no exact name) satisfy the distance arm of the auto-link gate', () => {
  const result = scoreLocationCandidate(
    { name_en: 'Great Synagogue', kind: 'synagogue', latitude: 47.4959, longitude: 19.0605 },
    { name: 'Dohány Street Synagogue', landmark_type: 'synagogue', latitude: 47.4959, longitude: 19.0606 },
  );
  assert.equal(result.signals.exactName, false);
  assert.ok(result.signals.distanceMeters <= 50);
  assert.equal(result.autoLinkEligible, true);
  if (result.score >= 0.9) {
    assert.equal(result.autoMatch, true);
    assert.equal(autoLinkMatchReason(result), 'distance');
  }
});

test('distance just beyond 50m does not satisfy the auto-link gate by itself', () => {
  const result = scoreLocationCandidate(
    { name_en: 'Great Synagogue', latitude: 47.4959, longitude: 19.0605 },
    { name: 'Dohány Street Synagogue', latitude: 47.4964, longitude: 19.0605 },
  );
  assert.ok(result.signals.distanceMeters > 50);
  assert.equal(result.autoLinkEligible, false);
  assert.equal(result.autoMatch, false);
});

test('haversine returns null without complete coordinates', () => assert.equal(haversineMeters({}, {}), null));

test('same exact name but different districts blocks auto-link even though closeEnough/exactName would otherwise qualify', () => {
  // "Kazinczy utca" (or any street name) recurs across multiple districts —
  // an exact name match alone is not enough once the districts disagree.
  const mention = { name_en: 'Kazinczy utca 5', district: 7 };
  const candidate = { name: 'Kazinczy utca 5', district: 13 };
  const result = scoreLocationCandidate(mention, candidate);
  assert.equal(result.signals.exactName, true);
  assert.equal(result.signals.districtAgreement, false);
  assert.equal(result.signals.districtConflict, true);
  assert.equal(result.autoLinkEligible, false, 'district conflict vetoes auto-link eligibility despite the exact name match');
  assert.equal(result.autoMatch, false);
  assert.equal(autoLinkMatchReason(result), null);
});

test('district conflict also vetoes the distance arm of auto-link eligibility', () => {
  const mention = { name_en: 'Great Synagogue', latitude: 47.4959, longitude: 19.0605, district: 7 };
  const candidate = { name: 'Different Synagogue Name', latitude: 47.4959, longitude: 19.0606, district: 9 };
  const result = scoreLocationCandidate(mention, candidate);
  assert.ok(result.signals.distanceMeters <= 50);
  assert.equal(result.signals.districtConflict, true);
  assert.equal(result.autoLinkEligible, false);
  assert.equal(result.autoMatch, false);
});

test('district agreement boosts the score over an otherwise-identical candidate without district info', () => {
  const mention = { name_en: 'Rashekols', district: 7 };
  const withAgreement = scoreLocationCandidate(mention, { name: 'Rashekols', district: 7 });
  const withoutDistrict = scoreLocationCandidate(mention, { name: 'Rashekols' });
  assert.equal(withAgreement.signals.districtAgreement, true);
  assert.equal(withoutDistrict.signals.districtAgreement, null);
  assert.ok(withAgreement.score > withoutDistrict.score, 'district agreement should score higher than no district information at all');
});

test('street name + house number agreement boosts the review-tier score without granting auto-link eligibility on its own', () => {
  const mention = { name_en: 'Assembly Hall', street_name: 'Dohány utca', house_number: '2' };
  const withMatch = scoreLocationCandidate(mention, { name: 'Great Hall', street_name: 'Dohány utca', house_number: '2' });
  const withoutMatch = scoreLocationCandidate(mention, { name: 'Great Hall' });
  assert.equal(withMatch.signals.streetNumberMatch, true);
  assert.equal(withMatch.deterministic, true, 'street+number agreement counts as deterministic review-tier evidence');
  assert.ok(withMatch.score > withoutMatch.score);
  assert.equal(withMatch.autoLinkEligible, false, 'street+number agreement alone must not satisfy the auto-link gate');
  assert.equal(withMatch.autoMatch, false);
});

test('street name matching but house numbers differing does not count as street+number agreement', () => {
  const mention = { name_en: 'Assembly Hall', street_name: 'Dohány utca', house_number: '2' };
  const result = scoreLocationCandidate(mention, { name: 'Great Hall', street_name: 'Dohány utca', house_number: '4' });
  assert.equal(result.signals.streetNumberMatch, false);
});

test('all-null district/street/house_number fields leave scoring identical to the pre-existing behavior', () => {
  // Regression guard: candidates/mentions that never carry the new optional
  // fields must score exactly as before this change.
  const exact = scoreLocationCandidate({ name_en: 'Dohány utca', kind: 'street' }, { name: 'Dohany Street', landmark_type: 'road' });
  assert.equal(exact.score, 0.98);
  assert.equal(exact.signals.districtAgreement, null);
  assert.equal(exact.signals.districtConflict, false);
  assert.equal(exact.signals.streetNumberMatch, false);

  const review = scoreLocationCandidate({ name_en: 'Dohány utca' }, { name: 'Dohány Street Synagogue' });
  assert.equal(review.signals.districtAgreement, null);
  assert.equal(review.signals.districtConflict, false);
  assert.equal(review.signals.streetNumberMatch, false);
});

test('Szabadság híd exact-matches Liberty Bridge via the name lexicon', () => {
  const result = scoreLocationCandidate({ name_en: 'Szabadság híd' }, { name: 'Liberty Bridge' });
  assert.equal(result.signals.exactName, true);
  assert.equal(result.autoMatch, true);
});

test('Erzsébetváros (a district) does not exact-match Elisabeth Bridge despite sharing the erzsebet root', () => {
  const result = scoreLocationCandidate({ name_en: 'Erzsébetváros' }, { name: 'Elisabeth Bridge' });
  assert.equal(result.signals.exactName, false);
  assert.equal(result.autoMatch, false);
});

test('filters metadata and explicit foreign addresses', () => {
  assert.deepEqual(classifyRestrictedLocation({ name_en: 'Publisher Office', evidence: { quote_en: 'Published by Example Press' } }).accept, false);
  assert.deepEqual(classifyRestrictedLocation({ name_en: 'Vienna Temple', address_en: 'Vienna, Austria' }).reason, 'explicitly_non_budapest');
  assert.equal(classifyRestrictedLocation({ name_en: 'Kazinczy utca', address_en: 'Budapest, Hungary' }).accept, true);
  assert.deepEqual(classifyRestrictedLocation({ name_en: 'Zichy Palace' }), { accept: true, reason: 'requires_location_review' });
});
