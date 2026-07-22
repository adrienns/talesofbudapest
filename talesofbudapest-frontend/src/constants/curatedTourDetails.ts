import type { CuratedStarter } from '@/constants/questionnaire'
import type { ImageAttribution, NarrativeChapter, WalkingRoute } from '@/types/narrative'

export type CuratedTourDetail = {
  duration: string
  distance: string
  summary: string
  chapters: NarrativeChapter[]
  walkingRoute?: WalkingRoute
}

type Stop = Pick<NarrativeChapter, 'title' | 'lat' | 'lng'> & {
  imageUrl?: string
  imageAttribution?: ImageAttribution
}

const makeChapters = (slug: string, stops: Stop[], imageUrl: string): NarrativeChapter[] =>
  stops.map(({ imageUrl: stopImageUrl, ...stop }, chapterIndex) => ({
    id: `${slug}-${chapterIndex}`,
    chapterIndex,
    imageUrl: stopImageUrl ?? imageUrl,
    audioUrl: null,
    ...stop,
  }))

const tours: Record<string, CuratedTourDetail> = {
  'how-budapest-became-budapest': {
    duration: '2 hr 15 min',
    distance: '4.4 km',
    summary:
      'A first-day walk through the ambitions, ruptures, and reinventions that made modern Budapest. Follow the Danube from city-making monuments to the places where memory still speaks back.',
    chapters: makeChapters('how-budapest-became-budapest', [
      { title: 'Deák Ferenc Square', lat: 47.49755, lng: 19.05478 },
      { title: "St Stephen's Basilica", lat: 47.50088, lng: 19.0538, imageUrl: '/quick-start/basilica.webp' },
      { title: 'Liberty Square', lat: 47.50455, lng: 19.05021 },
      { title: 'Parliament & Kossuth Square', lat: 47.50718, lng: 19.04567 },
      { title: 'Shoes on the Danube Bank', lat: 47.50391, lng: 19.04485, imageUrl: '/quick-start/shoes-jewish.webp' },
      { title: 'Chain Bridge', lat: 47.50076, lng: 19.04632, imageUrl: '/quick-start/chain-bridge.webp' },
      { title: 'Gresham Palace', lat: 47.49964, lng: 19.04835, imageUrl: '/quick-start/gresham.webp' },
      { title: 'Vörösmarty Square', lat: 47.49686, lng: 19.05043 },
      { title: 'Vigadó Promenade', lat: 47.49624, lng: 19.04853 },
    ], '/quick-start/parliement.webp'),
    walkingRoute: {
      geometry: [[47.497545,19.05478],[47.497548,19.054877],[47.497534,19.054937],[47.497548,19.054951],[47.497662,19.055093],[47.49778,19.055154],[47.497869,19.055053],[47.497904,19.055065],[47.497974,19.055],[47.498092,19.054998],[47.498091,19.054939],[47.498091,19.054852],[47.498091,19.054705],[47.498091,19.054586],[47.49908,19.0546],[47.499119,19.054593],[47.499144,19.054523],[47.499224,19.054596],[47.499256,19.054605],[47.499286,19.054596],[47.499366,19.054567],[47.499479,19.054539],[47.499557,19.054639],[47.499696,19.054649],[47.500397,19.054647],[47.500843,19.054649],[47.501158,19.054652],[47.501356,19.054656],[47.50135,19.054477],[47.50116,19.054223],[47.501113,19.053749],[47.50107,19.053326],[47.501006,19.053259],[47.500717,19.053323],[47.500725,19.053119],[47.501215,19.052972],[47.501649,19.052875],[47.502018,19.052793],[47.502382,19.052711],[47.502957,19.052573],[47.50292,19.052183],[47.502918,19.052157],[47.502912,19.052101],[47.502908,19.052057],[47.502904,19.052003],[47.502902,19.05197],[47.502958,19.051916],[47.503022,19.051923],[47.503225,19.051484],[47.503728,19.05136],[47.503889,19.051326],[47.503879,19.051239],[47.503918,19.051231],[47.503912,19.051169],[47.504051,19.05114],[47.504089,19.051105],[47.504137,19.051002],[47.504139,19.050923],[47.504123,19.050743],[47.504349,19.050694],[47.504407,19.050606],[47.504358,19.050503],[47.504333,19.050383],[47.504541,19.05034],[47.504333,19.050383],[47.504336,19.050262],[47.504364,19.050149],[47.504409,19.050061],[47.50447,19.049996],[47.504541,19.049959],[47.504616,19.049954],[47.50469,19.049982],[47.504754,19.05004],[47.504925,19.049696],[47.504985,19.04971],[47.505251,19.049204],[47.505202,19.049147],[47.5055,19.04859],[47.505778,19.047967],[47.505862,19.047684],[47.505876,19.04753],[47.506265,19.047538],[47.506587,19.04751],[47.506635,19.046817],[47.507012,19.046866],[47.507016,19.046792],[47.507021,19.046725],[47.507465,19.046794],[47.507514,19.046245],[47.508403,19.046394],[47.508479,19.045403],[47.508259,19.045351],[47.508233,19.045722],[47.508287,19.045731],[47.508272,19.045929],[47.508218,19.04592],[47.508194,19.046247],[47.507978,19.046212],[47.507988,19.046082],[47.507393,19.045984],[47.507388,19.046043],[47.507354,19.046037],[47.507321,19.046476],[47.507379,19.046486],[47.507364,19.046689],[47.507146,19.046653],[47.507142,19.046726],[47.506885,19.046682],[47.506891,19.046611],[47.506673,19.046575],[47.506688,19.046372],[47.506746,19.046381],[47.506779,19.045942],[47.506745,19.045936],[47.506749,19.045878],[47.506152,19.045779],[47.506143,19.045907],[47.50593,19.045872],[47.505955,19.045545],[47.5059,19.045536],[47.505915,19.04534],[47.50597,19.045349],[47.505995,19.045018],[47.505996,19.044995],[47.506226,19.045029],[47.506224,19.045058],[47.506585,19.04511],[47.506598,19.04493],[47.505624,19.044867],[47.505624,19.044748],[47.505624,19.044662],[47.504762,19.044673],[47.504435,19.044702],[47.503906,19.044802],[47.503674,19.044846],[47.503544,19.044844],[47.503185,19.044928],[47.502766,19.045041],[47.501735,19.045337],[47.501298,19.04547],[47.501271,19.045567],[47.501182,19.045594],[47.50106,19.045655],[47.500679,19.045737],[47.500552,19.045775],[47.500573,19.045863],[47.500596,19.045892],[47.500607,19.045952],[47.500642,19.046088],[47.50068,19.046068],[47.50074,19.046031],[47.500768,19.046139],[47.500775,19.046162],[47.500786,19.046204],[47.500822,19.046181],[47.500868,19.046212],[47.500808,19.046259],[47.500753,19.046284],[47.500808,19.046259],[47.500866,19.046884],[47.500964,19.047008],[47.500974,19.047108],[47.500983,19.04719],[47.500693,19.047329],[47.500617,19.047365],[47.500473,19.047431],[47.500179,19.047567],[47.500174,19.047509],[47.500077,19.047588],[47.49987,19.047678],[47.499381,19.047958],[47.49943,19.048401],[47.499381,19.047958],[47.499362,19.047926],[47.49929,19.04786],[47.4992,19.047928],[47.498951,19.048086],[47.498739,19.048231],[47.498716,19.048272],[47.498697,19.048384],[47.498659,19.048386],[47.498576,19.048452],[47.498561,19.048399],[47.497891,19.048919],[47.497843,19.048955],[47.497277,19.049434],[47.496781,19.049927],[47.496648,19.050146],[47.496841,19.050591],[47.49692,19.050523],[47.496901,19.050475],[47.496877,19.050415],[47.496901,19.050475],[47.49692,19.050523],[47.496841,19.050591],[47.496648,19.050146],[47.496563,19.05004],[47.496128,19.048986],[47.496093,19.048866],[47.496033,19.048668]],
      distanceMeters: 4414,
      durationSeconds: 3178,
    },
  },
  'castle-royal': {
    duration: '2 hr', distance: '2.1 km',
    summary: 'Climb into the royal heart of Buda, where every stone has a siege, a king, or a legend attached to it. This is a dramatic, view-filled walk through the Castle District.',
    chapters: makeChapters('castle-royal', [
      { title: 'Buda Castle', lat: 47.4962, lng: 19.0395 },
      { title: 'Matthias Church', lat: 47.5019, lng: 19.0347 },
      { title: "Fisherman's Bastion", lat: 47.5023, lng: 19.0341 },
    ], '/quick-start/castle-royal.webp'),
  },
  'jewish-quarter-and-ruin-bars': {
    duration: '1 hr 45 min', distance: '3.0 km',
    summary: 'A clear-eyed walk through Jewish Pest, the 1944 ghetto, living religious traditions, and the courtyards that became Budapest’s ruin-bar district.',
    chapters: makeChapters('jewish-quarter-and-ruin-bars', [
      {
        title: 'The Jewish Quarter Before It Had a Name', lat: 47.4983, lng: 19.0557,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/orczy-house.webp',
        imageAttribution: { author: 'Fortepan / Budapest Főváros Levéltára', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hungary_Fortepan_82507.jpg' },
      },
      {
        title: 'Rumbach and the Middle Path', lat: 47.4988, lng: 19.0593,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/rumbach-synagogue.webp',
        imageAttribution: { author: 'Jérôme Chavel', license: 'Public domain', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rumbach_zsinagoga.jpg' },
      },
      {
        title: 'A Synagogue Built for a Metropolis', lat: 47.4959, lng: 19.0607,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/dohany-synagogue.webp',
        imageAttribution: { author: 'Justin Schüler', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Doh%C3%A1ny_Street_Synagogue,_Budapest,_Hungary_(Unsplash).jpg' },
      },
      {
        title: 'Carl Lutz and the Paper Shield', lat: 47.4975, lng: 19.0594,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/carl-lutz-memorial.webp',
        imageAttribution: { author: 'Globetrotter19', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gedenkstelle_Carl_Lutz,_2024_Erzs%C3%A9betv%C3%A1ros.jpg' },
      },
      {
        title: 'Klauzál Square Inside the Ghetto', lat: 47.5005, lng: 19.0633,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/klauzal-square.webp',
        imageAttribution: { author: 'Lajos Tihanyi / Hungarian National Gallery', license: 'Public Domain Mark 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tihanyi_Klauz%C3%A1l_Square.jpg' },
      },
      {
        title: 'Kazinczy Street and Living Orthodoxy', lat: 47.499, lng: 19.0635,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/kazinczy-synagogue.webp',
        imageAttribution: { author: 'xorge', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kazinczy_Street_Synagogue,_Budapest_(105)_(13229362653).jpg' },
      },
      {
        title: 'Szimpla and the Invention of the Ruin Bar', lat: 47.4967, lng: 19.0631,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/szimpla-kert.webp',
        imageAttribution: { author: 'Yelkrokoyade', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Szimpla_Kert_Budapest_1.jpg' },
      },
      {
        title: 'Gozsdu: Seven Courtyards, Many Lives', lat: 47.4985, lng: 19.0591,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/gozsdu-courtyard.webp',
        imageAttribution: { author: 'Christo', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Budapest,_Gozsdu_Udvar.jpg' },
      },
      {
        title: 'Who Owns the Night?', lat: 47.4987, lng: 19.0574,
        imageUrl: '/curated/jewish-quarter-and-ruin-bars/kiraly-street.webp',
        imageAttribution: { author: 'Fred Romero', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Budapest_-_Király_utca_(1).jpg' },
      },
    ], '/curated/jewish-quarter-and-ruin-bars/orczy-house.webp'),
  },
  'communism-cold-war-history': {
    duration: '2 hr 45 min', distance: '7.6 km',
    summary: 'A source-checked walk through political policing, the 1956 Revolution, Cold War Budapest, and the negotiated end of one-party rule.',
    chapters: makeChapters('communism-cold-war-history', [
      { title: 'The Address the Secret Police Took Over', lat: 47.50693, lng: 19.06528 },
      { title: 'Renaming the City—and Stalin’s Empty Boots', lat: 47.50591, lng: 19.0631 },
      { title: 'Imre Nagy: A Communist Who Broke with Moscow', lat: 47.51302, lng: 19.04718 },
      { title: 'Bloody Thursday, Without False Precision', lat: 47.50718, lng: 19.04567 },
      { title: 'The Cold War in One City Block', lat: 47.50455, lng: 19.05021 },
      { title: 'When the March Was Still Peaceful', lat: 47.49448, lng: 19.06016 },
      { title: 'Sixteen Points and the Fight for the Radio', lat: 47.49091, lng: 19.0651 },
      { title: 'The Museum Caught in the Crossfire', lat: 47.4912, lng: 19.06272 },
      { title: 'Corvin Passage: Resistance, Reprisals, Afterlife', lat: 47.48691, lng: 19.07014 },
    ], '/quick-start/parliement.webp'),
    walkingRoute: {
      geometry: [[47.506826,19.065433],[47.506102,19.062262],[47.508003,19.059309],[47.509848,19.056736],[47.510374,19.055336],[47.511316,19.053067],[47.512765,19.048945],[47.512948,19.047743],[47.512986,19.04713],[47.510948,19.046113],[47.508864,19.045415],[47.506894,19.045264],[47.505291,19.044881],[47.504078,19.045201],[47.504412,19.050367],[47.503226,19.05094],[47.500618,19.052038],[47.498513,19.053574],[47.497904,19.055065],[47.496491,19.057707],[47.495128,19.059497],[47.494156,19.060214],[47.491716,19.061467],[47.490301,19.063062],[47.490927,19.065094],[47.49073,19.064104],[47.490621,19.062788],[47.491083,19.062111],[47.490643,19.062592],[47.491182,19.06385],[47.489483,19.064268],[47.489049,19.065656],[47.48754,19.070202],[47.486909,19.070154]],
      distanceMeters: 7589,
      durationSeconds: 5729,
    },
  },
  'hidden-pest': {
    duration: '2 hr 30 min', distance: '2.6 km',
    summary: 'Step off the postcard route for courtyards, quiet façades, and coffeehouse lore. A slow, curious wander for people who want the city’s small details to do the talking.',
    chapters: makeChapters('hidden-pest', [
      { title: 'Vörösmarty Square', lat: 47.4969, lng: 19.0504 },
      { title: 'Gerbeaud Café', lat: 47.4966, lng: 19.0507 },
      { title: 'Inner-city courtyards', lat: 47.4983, lng: 19.0572 },
    ], '/quick-start/hidden-pest.webp'),
  },
  'danube-golden-hour': {
    duration: '90 min', distance: '2.4 km',
    summary: 'A golden-hour stroll for slow light, river air, and Budapest’s most cinematic skyline. Follow the water as the city softens into evening and its stories turn more intimate.',
    chapters: makeChapters('danube-golden-hour', [
      { title: 'Vigadó Promenade', lat: 47.4962, lng: 19.0485 },
      { title: 'Chain Bridge', lat: 47.4992, lng: 19.0435 },
      { title: 'Castle District View', lat: 47.5002, lng: 19.0401 },
    ], '/quick-start/danube-golden-hour.webp'),
  },
}

export const getCuratedTourDetailBySlug = (slug: string): CuratedTourDetail | undefined => tours[slug]

export const getCuratedTourDetail = (starter: CuratedStarter): CuratedTourDetail =>
  getCuratedTourDetailBySlug(starter.slug)!
