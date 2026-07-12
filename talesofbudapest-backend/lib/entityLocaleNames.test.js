import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersonDisplayName, buildNameGlossary } from './entityLocaleNames.js';

test('uses Western order for English when the source name is Hungarian-order', () => {
  const name = resolvePersonDisplayName({
    name: 'Liszt Ferenc',
    locale: 'en',
    nameEn: 'Liszt Ferenc',
  });
  assert.match(name, /Ferenc Liszt/i);
});

test('keeps Hungarian order for hu locale', () => {
  const name = resolvePersonDisplayName({
    name: 'Liszt Ferenc',
    locale: 'hu',
    nameEn: 'Franz Liszt',
    nameHu: 'Liszt Ferenc',
  });
  assert.equal(name, 'Liszt Ferenc');
});

test('buildNameGlossary prefers KG aliases per locale', () => {
  const chronicle = {
    people: [{ id: 'p1', name: 'Liszt Ferenc', description: 'Composer' }],
  };
  const aliasMap = new Map([
    [
      'p1',
      [
        { alias: 'Franz Liszt', language_code: 'en', alias_kind: 'translated_name' },
        { alias: 'Liszt Ferenc', language_code: 'hu', alias_kind: 'name' },
      ],
    ],
  ]);

  const en = buildNameGlossary({ chronicle, locale: 'en', aliasMap });
  assert.equal(en[0].displayName, 'Franz Liszt');

  const hu = buildNameGlossary({ chronicle, locale: 'hu', aliasMap });
  assert.equal(hu[0].displayName, 'Liszt Ferenc');
});
