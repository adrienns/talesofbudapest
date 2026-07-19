const media = (url, author, license, sourceUrl, licenseUrl = null) => ({
  url,
  author,
  license,
  sourceUrl,
  licenseUrl,
});

export const CANONICAL_CURATED_LOCATIONS = [
  {
    slug: 'deak-ferenc-square', name: 'Deák Ferenc Square', huName: 'Deák Ferenc tér',
    lat: 47.49755, lng: 19.05478, placeKind: 'square',
    story: 'A central Pest square and transport junction named for statesman Ferenc Deák.',
    facets: { architecture: 55, 'power-history': 80, 'local-life': 75 },
  },
  {
    slug: 'st-stephens-basilica', name: "St. Stephen's Basilica", huName: 'Szent István-bazilika',
    matchNames: ["St. Stephen's Basilica"], lat: 47.5008, lng: 19.0536, placeKind: 'religious_site',
    story: 'Budapest’s monumental Roman Catholic basilica, completed in 1905 and named for King Stephen I.',
    facets: { architecture: 100, 'power-history': 75, 'arts-culture': 65 },
  },
  {
    slug: 'liberty-square', name: 'Liberty Square', huName: 'Szabadság tér',
    lat: 47.50455, lng: 19.05021, placeKind: 'square',
    story: 'A central square where monuments and counter-memorials expose competing accounts of Hungarian history.',
    facets: { 'power-history': 100, architecture: 65, 'local-life': 55 },
  },
  {
    slug: 'hungarian-parliament-building', name: 'Hungarian Parliament Building', huName: 'Országház',
    matchNames: ['Hungarian Parliament Building'], lat: 47.5071, lng: 19.0456, placeKind: 'building',
    story: 'Hungary’s neo-Gothic parliament on the Danube, designed by Imre Steindl for the new capital.',
    facets: { architecture: 100, 'power-history': 100, 'danube-engineering': 55 },
  },
  {
    slug: 'shoes-on-danube-bank', name: 'Shoes on the Danube Bank', huName: 'Cipők a Duna-parton',
    matchNames: ['Shoes on the Danube Bank'], lat: 47.5039, lng: 19.04478, placeKind: 'monument',
    story: 'A memorial to people murdered on the Danube bank by Arrow Cross militiamen in 1944 and 1945.',
    facets: { 'jewish-budapest': 100, 'power-history': 100, 'arts-culture': 65 },
  },
  {
    slug: 'szechenyi-chain-bridge', name: 'Széchenyi Chain Bridge', huName: 'Széchenyi lánchíd',
    matchNames: ['Széchenyi Chain Bridge'], lat: 47.498888888889, lng: 19.043611111111, placeKind: 'bridge',
    story: 'The first permanent bridge between Buda and Pest, opened in 1849 and rebuilt after wartime destruction.',
    facets: { 'danube-engineering': 100, 'power-history': 75, architecture: 80 },
  },
  {
    slug: 'gresham-palace', name: 'Gresham Palace', huName: 'Gresham-palota',
    lat: 47.49964, lng: 19.04835, placeKind: 'building',
    story: 'A major Hungarian Art Nouveau building completed in 1906 for the Gresham Life Assurance Company.',
    facets: { architecture: 100, 'local-life': 55, 'power-history': 45 },
  },
  {
    slug: 'vorosmarty-square', name: 'Vörösmarty Square', huName: 'Vörösmarty tér',
    lat: 47.49686, lng: 19.05043, placeKind: 'square',
    story: 'A central Pest square shaped by commerce, cafés and the city’s nineteenth-century literary culture.',
    facets: { 'local-life': 85, 'arts-culture': 85, 'food-nightlife': 70 },
  },
  {
    slug: 'vigado-promenade', name: 'Vigadó Promenade', huName: 'Vigadó tér és Duna-korzó',
    lat: 47.49624, lng: 19.04853, placeKind: 'historical_site',
    story: 'The Danube promenade beside the Vigadó concert hall, a key viewpoint onto Buda and the riverfront.',
    facets: { architecture: 80, 'arts-culture': 90, 'danube-engineering': 65 },
  },
  {
    slug: 'orczy-house', name: 'Orczy House', huName: 'Orczy-ház',
    lat: 47.4983, lng: 19.0557, placeKind: 'historical_site', lifecycleStatus: 'demolished',
    story: 'The demolished courtyard complex that served as an early commercial and religious centre of Jewish Pest.',
    facets: { 'jewish-budapest': 100, 'local-life': 90, 'power-history': 75 },
    media: media('/curated/jewish-quarter-and-ruin-bars/orczy-house.jpg', 'Fortepan / Budapest Főváros Levéltára', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Hungary_Fortepan_82507.jpg', 'https://creativecommons.org/licenses/by-sa/3.0/'),
  },
  {
    slug: 'rumbach-street-synagogue', name: 'Rumbach Street Synagogue', huName: 'Rumbach utcai zsinagóga',
    lat: 47.4988, lng: 19.0593, placeKind: 'religious_site',
    story: 'An 1870s Moorish Revival synagogue designed by Otto Wagner and associated with Status Quo Ante Judaism.',
    facets: { 'jewish-budapest': 100, architecture: 95, 'arts-culture': 65 },
    media: media('/curated/jewish-quarter-and-ruin-bars/rumbach-synagogue.jpg', 'Jérôme Chavel', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Rumbach_zsinagoga.jpg'),
  },
  {
    slug: 'dohany-street-synagogue', name: 'Dohány Street Synagogue', huName: 'Dohány utcai zsinagóga',
    matchNames: ['Dohány Street Synagogue'], lat: 47.4959, lng: 19.0607, placeKind: 'religious_site',
    story: 'Europe’s largest synagogue, completed in 1859 for Pest’s Neolog Jewish community.',
    facets: { 'jewish-budapest': 100, architecture: 100, 'power-history': 90 },
    media: media('/curated/jewish-quarter-and-ruin-bars/dohany-synagogue.jpg', 'Justin Schüler', 'CC0 1.0', 'https://commons.wikimedia.org/wiki/File:Doh%C3%A1ny_Street_Synagogue,_Budapest,_Hungary_(Unsplash).jpg', 'https://creativecommons.org/publicdomain/zero/1.0/'),
  },
  {
    slug: 'carl-lutz-memorial-dob-street', name: 'Carl Lutz Memorial', huName: 'Carl Lutz-emlékmű',
    lat: 47.4975, lng: 19.0594, placeKind: 'monument',
    story: 'A memorial to Swiss diplomat Carl Lutz and the protective documents used to rescue Jews in wartime Budapest.',
    facets: { 'jewish-budapest': 100, 'power-history': 100 },
    media: media('/curated/jewish-quarter-and-ruin-bars/carl-lutz-memorial.jpg', 'Globetrotter19', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Gedenkstelle_Carl_Lutz,_2024_Erzs%C3%A9betv%C3%A1ros.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'),
  },
  {
    slug: 'klauzal-square', name: 'Klauzál Square', huName: 'Klauzál tér',
    lat: 47.5005, lng: 19.0633, placeKind: 'square',
    story: 'A neighbourhood market square that lay within the closed Budapest ghetto in late 1944 and early 1945.',
    facets: { 'jewish-budapest': 95, 'local-life': 100, 'food-nightlife': 70, 'power-history': 90 },
    media: media('/curated/jewish-quarter-and-ruin-bars/klauzal-square.jpg', 'Lajos Tihanyi / Hungarian National Gallery', 'Public Domain Mark 1.0', 'https://commons.wikimedia.org/wiki/File:Tihanyi_Klauz%C3%A1l_Square.jpg', 'https://creativecommons.org/publicdomain/mark/1.0/'),
  },
  {
    slug: 'kazinczy-street-synagogue', name: 'Kazinczy Street Synagogue', huName: 'Kazinczy utcai zsinagóga',
    lat: 47.499, lng: 19.0635, placeKind: 'religious_site',
    story: 'The Art Nouveau centre of Budapest’s Orthodox Jewish community, completed in 1913.',
    facets: { 'jewish-budapest': 100, architecture: 90, 'local-life': 70 },
    media: media('/curated/jewish-quarter-and-ruin-bars/kazinczy-synagogue.jpg', 'xorge', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Kazinczy_Street_Synagogue,_Budapest_(105)_(13229362653).jpg', 'https://creativecommons.org/licenses/by-sa/2.0/'),
  },
  {
    slug: 'szimpla-kert', name: 'Szimpla Kert', huName: 'Szimpla Kert',
    lat: 47.4967, lng: 19.0631, placeKind: 'venue',
    story: 'The long-running ruin pub that helped popularise the adaptive reuse of neglected District VII courtyards.',
    facets: { 'food-nightlife': 100, 'local-life': 90, 'arts-culture': 70 },
    media: media('/curated/jewish-quarter-and-ruin-bars/szimpla-kert.jpg', 'Yelkrokoyade', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Szimpla_Kert_Budapest_1.jpg', 'https://creativecommons.org/licenses/by-sa/3.0/'),
  },
  {
    slug: 'gozsdu-courtyard', name: 'Gozsdu Courtyard', huName: 'Gozsdu Udvar',
    lat: 47.4985, lng: 19.0591, placeKind: 'historical_site',
    story: 'A chain of seven courtyards built in the early twentieth century and later redeveloped as a busy passage.',
    facets: { 'jewish-budapest': 85, 'food-nightlife': 95, 'local-life': 90, architecture: 70 },
    media: media('/curated/jewish-quarter-and-ruin-bars/gozsdu-courtyard.jpg', 'Christo', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Budapest,_Gozsdu_Udvar.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'),
  },
  {
    slug: 'kiraly-street', name: 'Király Street', huName: 'Király utca',
    lat: 47.4987, lng: 19.0574, placeKind: 'street',
    story: 'A historic route through Terézváros and Erzsébetváros, now central to the district’s nightlife economy.',
    facets: { 'food-nightlife': 100, 'local-life': 90, 'jewish-budapest': 70 },
    media: media('/curated/jewish-quarter-and-ruin-bars/kiraly-street.jpg', 'Fred Romero', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Budapest_-_Kir%C3%A1ly_utca_(1).jpg', 'https://creativecommons.org/licenses/by/2.0/'),
  },
];

export const CURATED_CHAPTER_LOCATION_SLUGS = {
  'how-budapest-became-budapest': [
    'deak-ferenc-square', 'st-stephens-basilica', 'liberty-square',
    'hungarian-parliament-building', 'shoes-on-danube-bank', 'szechenyi-chain-bridge',
    'gresham-palace', 'vorosmarty-square', 'vigado-promenade',
  ],
  'jewish-quarter-and-ruin-bars': [
    'orczy-house', 'rumbach-street-synagogue', 'dohany-street-synagogue',
    'carl-lutz-memorial-dob-street', 'klauzal-square', 'kazinczy-street-synagogue',
    'szimpla-kert', 'gozsdu-courtyard', 'kiraly-street',
  ],
};
