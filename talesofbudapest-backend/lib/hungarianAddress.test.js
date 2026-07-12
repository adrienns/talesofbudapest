import test from 'node:test';
import assert from 'node:assert/strict';
import { districtFromPostcode, formatDistrictRoman, parseBudapestAddress } from './hungarianAddress.js';

test('plain Hungarian street + house number', () => {
  assert.deepEqual(parseBudapestAddress('Dohány utca 2'), {
    street_name: 'Dohány', street_type: 'utca', house_number: '2', district: null, postcode: null,
  });
});

test('abbreviated street type "u." with an en-dash house-number range', () => {
  const result = parseBudapestAddress('Kazinczy u. 29–31');
  assert.equal(result.street_name, 'Kazinczy');
  assert.equal(result.street_type, 'utca');
  assert.equal(result.house_number, null, 'a range is recognized but carries no single house_number');
  assert.equal(result.district, null);
});

test('trailing period on both street type and house number', () => {
  assert.deepEqual(parseBudapestAddress('Wesselényi utca 7.'), {
    street_name: 'Wesselényi', street_type: 'utca', house_number: '7', district: null, postcode: null,
  });
});

test('"krt." abbreviation normalizes to körút, hyphenated range has no house_number', () => {
  const result = parseBudapestAddress('Erzsébet krt. 9-11');
  assert.equal(result.street_type, 'körút');
  assert.equal(result.house_number, null);
});

test('"kőrút" typo variant normalizes the same as "körút"', () => {
  assert.equal(parseBudapestAddress('Andrássy kőrút 3').street_type, 'körút');
});

test('rakpart / rkp. abbreviation', () => {
  assert.equal(parseBudapestAddress('Belgrád rkp. 1').street_type, 'rakpart');
  assert.equal(parseBudapestAddress('Belgrád rakpart 1').street_type, 'rakpart');
});

test('sétány / stny. abbreviation', () => {
  assert.equal(parseBudapestAddress('Erzsébet stny. 2').street_type, 'sétány');
});

test('tér and its possessive form tere both normalize to tér', () => {
  assert.equal(parseBudapestAddress('Kossuth tér').street_type, 'tér');
  assert.equal(parseBudapestAddress('Hősök tere').street_type, 'tér');
});

test('út and possessive útja both normalize to út', () => {
  assert.equal(parseBudapestAddress('Andrássy út 60').street_type, 'út');
  assert.equal(parseBudapestAddress('Andrássy útja 60').street_type, 'út');
});

test('English street-type words are recognized and kept in English, lowercased', () => {
  const result = parseBudapestAddress('Andrássy Street 10');
  assert.equal(result.street_type, 'street');
  assert.equal(result.street_name, 'Andrássy');
  assert.equal(result.house_number, '10');
  assert.equal(parseBudapestAddress('Heroes Square').street_type, 'square');
  assert.equal(parseBudapestAddress('Erzsébet Boulevard 9').street_type, 'boulevard');
  assert.equal(parseBudapestAddress('Belgrád Quay 1').street_type, 'quay');
});

test('district prefix "VII., Dob utca 35" — leading position pattern', () => {
  assert.deepEqual(parseBudapestAddress('VII., Dob utca 35'), {
    street_name: 'Dob', street_type: 'utca', house_number: '35', district: 7, postcode: null,
  });
});

test('district-only forms: "VII. kerület"', () => {
  assert.deepEqual(parseBudapestAddress('VII. kerület'), {
    street_name: null, street_type: null, house_number: null, district: 7, postcode: null,
  });
});

test('district-only forms: "7. kerület"', () => {
  assert.equal(parseBudapestAddress('7. kerület').district, 7);
});

test('district-only forms: "District VII"', () => {
  assert.equal(parseBudapestAddress('District VII').district, 7);
});

test('district-only forms: "7th district"', () => {
  assert.equal(parseBudapestAddress('7th district').district, 7);
});

test('district-only forms: "(VII)"', () => {
  assert.deepEqual(parseBudapestAddress('(VII)'), {
    street_name: null, street_type: null, house_number: null, district: 7, postcode: null,
  });
});

test('postcode leading form derives district from the postcode', () => {
  assert.deepEqual(parseBudapestAddress('1074 Budapest, Dohány utca 2'), {
    street_name: 'Dohány', street_type: 'utca', house_number: '2', district: 7, postcode: '1074',
  });
});

test('bare postcode + Budapest with no street', () => {
  assert.deepEqual(parseBudapestAddress('1013 Budapest'), {
    street_name: null, street_type: null, house_number: null, district: 1, postcode: '1013',
  });
});

test('house-number letter suffix variants carry no house_number', () => {
  assert.equal(parseBudapestAddress('Wesselényi utca 2/a').house_number, null);
  assert.equal(parseBudapestAddress('Wesselényi utca 2b').house_number, null);
  assert.equal(parseBudapestAddress('Wesselényi utca 2/a').street_name, 'Wesselényi');
});

test('hrsz. plot references carry no house_number', () => {
  assert.equal(parseBudapestAddress('Váci út hrsz.').house_number, null);
  assert.equal(parseBudapestAddress('Váci út hrsz.').street_name, 'Váci');
  const withPlotNumber = parseBudapestAddress('Váci út 0195/3 hrsz.');
  assert.equal(withPlotNumber.house_number, null);
  assert.equal(withPlotNumber.street_name, 'Váci');
  assert.equal(withPlotNumber.street_type, 'út');
});

test('name-only inputs produce no false street match: a synagogue is not a street', () => {
  assert.deepEqual(parseBudapestAddress('Dohány Street Synagogue'), {
    street_name: null, street_type: null, house_number: null, district: null, postcode: null,
  });
});

test('name-only inputs: cafe name is not misread as an address', () => {
  assert.deepEqual(parseBudapestAddress('New York kávéház'), {
    street_name: null, street_type: null, house_number: null, district: null, postcode: null,
  });
});

test('roman numeral inside a proper name is not misread as a district marker', () => {
  const result = parseBudapestAddress('II. János Pál pápa tér');
  assert.equal(result.district, null, 'the "II." here belongs to the pope\'s name, not a district marker');
  assert.equal(result.street_type, 'tér');
  assert.equal(result.street_name, 'II. János Pál pápa');
});

test('junk inputs yield all nulls without throwing', () => {
  const empty = { street_name: null, street_type: null, house_number: null, district: null, postcode: null };
  assert.deepEqual(parseBudapestAddress(''), empty);
  assert.deepEqual(parseBudapestAddress(null), empty);
  assert.deepEqual(parseBudapestAddress(undefined), empty);
  assert.deepEqual(parseBudapestAddress('PDF Page 15'), empty);
  assert.deepEqual(parseBudapestAddress('Budapest'), empty);
  assert.deepEqual(parseBudapestAddress('   '), empty);
});

test('districtFromPostcode derives district 01-23 from the middle two digits, rejects non-Budapest codes', () => {
  assert.equal(districtFromPostcode('1074'), 7);
  assert.equal(districtFromPostcode('1013'), 1);
  assert.equal(districtFromPostcode('1230'), 23);
  assert.equal(districtFromPostcode('1000'), null, 'district 00 does not exist');
  assert.equal(districtFromPostcode('1240'), null, 'out of the 01-23 range');
  assert.equal(districtFromPostcode('2000'), null, 'not a Budapest (1xxx) code');
  assert.equal(districtFromPostcode('abcd'), null);
  assert.equal(districtFromPostcode(null), null);
});

test('formatDistrictRoman formats 1-23 as roman numerals and rejects out-of-range input', () => {
  assert.equal(formatDistrictRoman(1), 'I');
  assert.equal(formatDistrictRoman(4), 'IV');
  assert.equal(formatDistrictRoman(7), 'VII');
  assert.equal(formatDistrictRoman(9), 'IX');
  assert.equal(formatDistrictRoman(14), 'XIV');
  assert.equal(formatDistrictRoman(23), 'XXIII');
  assert.equal(formatDistrictRoman(0), null);
  assert.equal(formatDistrictRoman(24), null);
  assert.equal(formatDistrictRoman(null), null);
});
