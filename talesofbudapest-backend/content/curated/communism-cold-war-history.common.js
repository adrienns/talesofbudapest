export const CURATED_TOUR_SLUG = 'communism-cold-war-history';
export const CURATED_TOUR_VERSION = 1;

export const FIRST_LIGHT_PARTICLES = {
  id: 'first-light-particles',
  title: 'First Light Particles',
  creator: 'Yoiyami',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl: 'https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track',
  sourceFileUrl: 'https://opengameart.org/sites/default/files/first_light_particles_0.wav',
  sha256: 'f0538a1a67450cc1d5e305fad5bc0d5d422ad809f720d695ab356e55fbe40fc5',
  localFileUrl: new URL('./assets/first-light-particles.wav', import.meta.url),
};

export const WALKING_ROUTE = {
  // Pedestrian route calculated with Valhalla/OpenStreetMap on 2026-07-19.
  // Coordinates are downsampled and stored in Leaflet [latitude, longitude] order.
  geometry: [[47.506826,19.065433],[47.506102,19.062262],[47.508003,19.059309],[47.509848,19.056736],[47.510374,19.055336],[47.511316,19.053067],[47.512765,19.048945],[47.512948,19.047743],[47.512986,19.04713],[47.510948,19.046113],[47.508864,19.045415],[47.506894,19.045264],[47.505291,19.044881],[47.504078,19.045201],[47.504412,19.050367],[47.503226,19.05094],[47.500618,19.052038],[47.498513,19.053574],[47.497904,19.055065],[47.496491,19.057707],[47.495128,19.059497],[47.494156,19.060214],[47.491716,19.061467],[47.490301,19.063062],[47.490927,19.065094],[47.49073,19.064104],[47.490621,19.062788],[47.491083,19.062111],[47.490643,19.062592],[47.491182,19.06385],[47.489483,19.064268],[47.489049,19.065656],[47.48754,19.070202],[47.486909,19.070154]],
  distanceMeters: 7589,
  durationSeconds: 5729,
};

export const STOP_COORDINATES = {
  'house-of-terror': { lat: 47.50693, lng: 19.06528 },
  oktogon: { lat: 47.50591, lng: 19.06310 },
  'imre-nagy-statue': { lat: 47.51302, lng: 19.04718 },
  'kossuth-square': { lat: 47.50718, lng: 19.04567 },
  'liberty-square': { lat: 47.50455, lng: 19.05021 },
  astoria: { lat: 47.49448, lng: 19.06016 },
  'hungarian-radio': { lat: 47.49091, lng: 19.06510 },
  'national-museum': { lat: 47.49120, lng: 19.06272 },
  'corvin-passage': { lat: 47.48691, lng: 19.07014 },
};

export const LOCATION_SLUGS = {
  'house-of-terror': 'house-of-terror',
  oktogon: 'oktogon',
  'imre-nagy-statue': 'imre-nagy-statue-jaszai',
  'kossuth-square': 'kossuth-square-1956',
  'liberty-square': 'liberty-square',
  astoria: 'astoria',
  'hungarian-radio': 'hungarian-radio-brody-sandor',
  'national-museum': 'hungarian-national-museum',
  'corvin-passage': 'corvin-passage',
};

export const SOURCES = {
  TERROR_HOUSE_POLITICAL_POLICE: 'https://www.terrorhaza.hu/en/exhibitions/permanent-exhibition/first-floor/anteroom-of-the-hungarian-political-police',
  TERROR_HOUSE_CELLS: 'https://www.terrorhaza.hu/en/exhibitions/permanent-exhibition/basement/reconstructed-prison-cells',
  HUNGARIAN_ARCHIVES_RAJK: 'https://mnl.gov.hu/mnl/ol/hirek/mienk_a_borton_magunknak_epitettuk',
  STALIN_STATUE_BHM: 'https://artsandculture.google.com/asset/statue-of-stalin-s%C3%A1ndor-mikus/2AEAMnZihMEIDQ?hl=en',
  STALIN_STATUE_TERROR_HOUSE: 'https://www.terrorhaza.hu/hu/tudastar/a-sztalin-szobor-talapzatanak-dombormuvei',
  FORTEPAN_OKTOGON: 'https://fortepan.hu/en/photos/?id=21754',
  PESTBUDA_OKTOGON: 'https://pestbuda.hu/en/cikk/20220710_the_birth_of_an_iconic_place_oktogon_is_150_years_old_which_was_called_nyolcszog_square_for_decades',
  PESTBUDA_ANDRASSY: 'https://pestbuda.hu/en/cikk/20220309_its_construction_has_caused_controversy_today_it_is_one_of_the_most_elegant_parts_of_the_capital_the_andrassy_avenue',
  NAGY_IMRE_NEB: 'https://neb.hu/nemzeti-emlekezet-bizottsaga/articles/show/nagy-imre',
  NAGY_IMRE_STATUE: 'https://commons.wikimedia.org/wiki/File:Nagy_Imre_statue,_J%C3%A1szai_Mari_t%C3%A9r.jpg',
  MNM_1956_2000: 'https://mnm.hu/en/en/collection/historical-photo-department/hungarian-events-1956-2000',
  PARLIAMENT_1989: 'https://www.parlament.hu/en/web/orszaghaz/evfordulok/-/asset_publisher/RMYRiipmAR57/content/az-1989-es-nemzeti-kerekasztal-targyalasok-magyarorszagon',
  PARLIAMENT_KOSSUTH_SQUARE: 'https://www.parlament.hu/documents/1779743/1846295/angol.pdf/038a18a7-97ce-11de-4f14-a45c61073d29',
  PARLIAMENT_1956_MEMORIAL: 'https://www.parlament.hu/en/web/orszaggyulesi-muzeum/latogatas',
  US_STATE_HUNGARY: 'https://history.state.gov/countries/hungary',
  BUDAPEST_INFO_LIBERTY_SQUARE: 'https://www.budapestinfo.hu/en/budapest-by-bike-in-13-stages',
  MNM_ASTORIA: 'https://mnm.hu/en/node/16874',
  TERROR_HOUSE_RADIO: 'https://www.terrorhaza.hu/hu/tudastar/kommunikacio-az-1956-os-forradalom-es-szabadsagharc-idejen',
  MNM_MUSEUM_FIRE: 'https://mnm.hu/hu/cikk/eg-nemzeti-muzeum-1956-oktober-24-26',
  MNM_CORVIN: 'https://museumapgallery.mnm.hu/kiallitas-munkaanyagok/item/821-among-freedom-fighters',
  MNM_NAGY_BROADCAST: 'https://mnm.hu/blog/2015-11-02/itt-nagy-imre-beszel',
  NEB_REPRESSION: 'https://archiv.neb.hu/en/in-pursuit-of-trials-ending-with-long-imprisonment',
  HUNGARIAN_ARCHIVES_KADAR: 'https://mnl.gov.hu/mnl/pml/a_kadar_korszak/1000',
  OSA_RFE_ARCHIVE: 'https://legacy.osaarchivum.org/digital-repository/osa%3A484d852e-1334-4570-a2be-e41230b9e36a',
  UNHCR_1956: 'https://www.unhcr.org/uk/news/stories/fiftieth-anniversary-hungarian-uprising-and-refugee-crisis',
};
