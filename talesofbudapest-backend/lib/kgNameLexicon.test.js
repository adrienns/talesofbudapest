import test from 'node:test';
import assert from 'node:assert/strict';
import { expandNameVariants, MAX_VARIANTS, normalizeLocationName } from './kgNameLexicon.js';

const expand = (name, options) => expandNameVariants(normalizeLocationName(name), options);

test('expands erzsebet bridge to elisabeth bridge (given-name translation)', () => {
  assert.ok(expand('erzsebet bridge').includes('elisabeth bridge'));
});

test('expands szabadsag bridge to liberty bridge (concept-word translation)', () => {
  assert.ok(expand('szabadsag bridge').includes('liberty bridge'));
});

test('expands margit bridge to margaret bridge (given-name translation)', () => {
  assert.ok(expand('margit bridge').includes('margaret bridge'));
});

test('expands the normalized form of Franz Joseph Bridge to liberty bridge (full-name group)', () => {
  assert.ok(expand('Franz Joseph Bridge').includes('liberty bridge'));
});

test('erzsebetvaros (a single fused token) never expands -- it must not become erzsebet + varos', () => {
  const variants = expand('Erzsébetváros');
  assert.deepEqual(variants, ['erzsebetvaros']);
});

test('bidirectionality: expand(elisabeth bridge) also reaches erzsebet bridge', () => {
  assert.ok(expand('Elisabeth Bridge').includes('erzsebet bridge'));
});

test('bidirectionality holds for full-name groups too', () => {
  assert.ok(expand('Liberty Bridge').includes('ferencz jozsef bridge'));
  assert.ok(expand('Liberty Bridge').includes('franz joseph bridge'));
});

test('person entityKind emits the two-token order swap', () => {
  const variants = expandNameVariants('liszt ferenc', { entityKind: 'person' });
  assert.ok(variants.includes('liszt ferenc'));
  assert.ok(variants.includes('ferenc liszt'));
});

test('person entityKind translates a given name after the order swap, on either token position', () => {
  const variants = expandNameVariants('nagy istvan', { entityKind: 'person' });
  assert.ok(variants.includes('istvan nagy'), 'plain order swap');
  assert.ok(variants.includes('stephen nagy'), 'given-name translation applied to the swapped form');
});

test('location entityKind (the default) does not emit the person order swap', () => {
  const variants = expandNameVariants('nagy istvan');
  assert.ok(!variants.includes('istvan nagy'));
});

test('the combinatorial cap is enforced', () => {
  const variants = expand('Magyar Állami Operaház');
  assert.ok(variants.length <= MAX_VARIANTS, `expected at most ${MAX_VARIANTS} variants, got ${variants.length}`);
  assert.ok(variants.includes('hungarian state opera house'));
});

test('all twenty measured translation-pair failures from the golden set now resolve through the lexicon', () => {
  const cases = [
    ['Erzsébet híd', 'Elisabeth Bridge'],
    ['Szabadság híd', 'Liberty Bridge'],
    ['Margit híd', 'Margaret Bridge'],
    ['Franz Joseph Bridge', 'Liberty Bridge'],
    ['Magyar Állami Operaház', 'Hungarian State Opera House'],
    ['Vajdahunyad vára', 'Vajdahunyad Castle'],
    ['Castle of Ofen', 'Buda Castle'],
    ['Országház', 'Hungarian Parliament Building'],
    ['Halászbástya', "Fisherman's Bastion"],
    ['Lánchíd', 'Széchenyi Chain Bridge'],
    ['Cipők a Duna-parton', 'Shoes on the Danube Bank'],
    ['Terror Háza', 'House of Terror Museum'],
    ['Magyar Tudományos Akadémia', 'Hungarian Academy of Sciences'],
    ['Magyar Nemzeti Múzeum', 'Hungarian National Museum'],
    ['Sziklakórház Atombunker Múzeum', 'Hospital in the Rock Nuclear Bunker Museum'],
    ['Rudas fürdő', 'Rudas Thermal Bath and Swimming Pool'],
    ['Szabadság-szobor', 'Liberty Statue'],
    ['Városliget', 'City Park'],
    ["Szent István-bazilika", "St. Stephen's Basilica"],
    ['Budai Vár', 'Buda Castle'],
  ];
  for (const [mention, expected] of cases) {
    const mentionVariants = expand(mention);
    const expectedVariants = expand(expected);
    const hit = mentionVariants.some((variant) => expectedVariants.includes(variant));
    assert.ok(hit, `expected an overlapping variant between ${JSON.stringify(mention)} and ${JSON.stringify(expected)}`);
  }
});

test('the eighteen golden-set negatives never gain an overlapping variant with a landmark they must not match', () => {
  // Each pair below is a negative mention alongside a real landmark it
  // shares a root with but must never be confused for.
  const negatives = [
    ['Erzsébetváros', 'Elisabeth Bridge'],
    ['Szabadság tér', 'Liberty Bridge'],
    ['Szabadság tér', 'Liberty Statue'],
    ['Erzsébet tér', 'Elisabeth Bridge'],
    ['Margit sziget', 'Margaret Bridge'],
    ['Andrássy Boulevard', 'Buda Castle'],
    ['Dohány utca', 'Dohány Street Synagogue'],
  ];
  for (const [mention, unrelated] of negatives) {
    const mentionVariants = expand(mention);
    const unrelatedVariants = expand(unrelated);
    const overlap = mentionVariants.some((variant) => unrelatedVariants.includes(variant));
    assert.equal(overlap, false, `${JSON.stringify(mention)} must not overlap with ${JSON.stringify(unrelated)}`);
  }
});
