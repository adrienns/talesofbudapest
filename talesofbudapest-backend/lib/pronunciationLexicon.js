/**
 * Grapheme → speakable English approximation (NPR-style stressed syllables in CAPS).
 * Applied at TTS time; display scripts keep proper orthography.
 */
export const PRONUNCIATION_LEXICON = {
  'Széchenyi': 'SEH-cheh-nee',
  Szechenyi: 'SEH-cheh-nee',
  Kazinczy: 'KAH-zin-tsee',
  Andrássy: 'AHN-drahs-see',
  Andrassy: 'AHN-drahs-see',
  Dohány: 'DOH-hahn',
  Dohany: 'DOH-hahn',
  'Fiumei út': 'FEE-oo-may oot',
  'Fiumei ut': 'FEE-oo-may oot',
  Gellért: 'GEL-lairt',
  Gellert: 'GEL-lairt',
  Rákóczi: 'RAH-koh-tsee',
  Rakoczi: 'RAH-koh-tsee',
  Erzsébet: 'AIR-zhay-bet',
  Erzsebet: 'AIR-zhay-bet',
  Vörösmarty: 'VER-rem-shar-tee',
  Vorosmarty: 'VER-rem-shar-tee',
  Hősök: 'HUR-shurk',
  Hosok: 'HUR-shurk',
  'Magyar Nemzeti Múzeum': 'MOD-yor NEM-zet-ee MOO-zay-om',
  Matthias: 'muh-THY-us',
  Mátyás: 'MAH-tyaash',
  Matyas: 'MAH-tyaash',
  Budavár: 'BOO-dah-var',
  Budavar: 'BOO-dah-var',
  Lipótváros: 'LEE-poat-var-osh',
  Lipotvaros: 'LEE-poat-var-osh',
  Gozsdu: 'GOZH-doo',
  Unicum: 'OO-nee-koom',
  Tokaj: 'TOH-koy',
  Habsburg: 'HABS-burg',
  Horthy: 'HOR-tee',
  Kossuth: 'KOH-shoot',
  Deák: 'DAY-ahk',
  Deak: 'DAY-ahk',
};

/** Longest-match keys first so multi-word names win over prefixes. */
export const lexiconEntriesByLength = () =>
  Object.entries(PRONUNCIATION_LEXICON).sort((a, b) => b[0].length - a[0].length);
