#!/usr/bin/env node
/**
 * Export unique locations from a restricted-book entities JSONL as GeoJSON,
 * matching against the local Budapest gazetteer (streets + landmarks).
 *
 * Usage:
 *   node cli/export-restricted-locations-geojson.js --source budapest-joe-hajdu --max-page 294
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLocationName } from '../lib/kgLocationResolver.js';
import {
  loadStreetGazetteer,
  loadJsonIfExists,
  LANDMARKS_PATH,
  normalizePlaceKey,
} from '../lib/budapestPlacesGazetteer.js';
import { buildQuoteEntityLinks, isRoleLabel, resolveQuoteSpeaker } from '../lib/quoteSpeakerAttribution.js';
import { resolveRestrictedEntitiesInput } from '../lib/restrictedSpeakerInput.js';
import { assertSpeakersArtifactIntegrity } from '../lib/speakersArtifactIntegrity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_SLUG = option('--source', 'budapest-joe-hajdu');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const TEXT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/text');
const resolvedInput = resolveRestrictedEntitiesInput({
  source: SOURCE_SLUG,
  extractionsDir: EXTRACTIONS,
  explicitInput: option('--input'),
});
const INPUT = path.resolve(resolvedInput.input);
const PAGES_TXT = path.resolve(option('--pages-txt', path.join(TEXT_DIR, `${SOURCE_SLUG}.pages.txt`)));
const OUTPUT = path.resolve(option('--output', path.join(EXTRACTIONS, `${SOURCE_SLUG}.locations-map.geojson`)));
const MAX_PAGE = Math.max(1, Number(option('--max-page', '294')) || 294);

const normalizeWs = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();
const fold = (value) => normalizePlaceKey(value) || normalizeLocationName(value);
const foldMatch = (value) => normalizeWs(value)
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const pagesFromText = (text) => {
  const map = new Map();
  for (const match of text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g)) {
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
};

/** Prefer the page whose text actually contains the evidence quote. Fail closed: unique exact only. */
const attributePages = (quote, windowPages, pageTextMap) => {
  const pages = windowPages.filter((page) => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE);
  if (!pages.length) return [];
  const needle = foldMatch(quote);
  if (!needle || needle.length < 12) return [];
  const hits = pages.filter((page) => foldMatch(pageTextMap.get(page) ?? '').includes(needle));
  return hits.length === 1 ? hits : [];
};

const pagesForEvidence = (evidence, windowPages, pageTextMap) => {
  if (evidence && Object.prototype.hasOwnProperty.call(evidence, 'quote_page')) {
    const page = Number(evidence.quote_page);
    if (Number.isInteger(page) && page >= 1 && page <= MAX_PAGE) return [page];
    return [];
  }
  return attributePages(evidence?.quote, windowPages, pageTextMap);
};

const readJsonl = async (file) => (await fs.readFile(file, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at line ${index + 1}`); }
  });

const main = async () => {
  console.error(`input=${INPUT}`);
  console.error(`input_provenance=${resolvedInput.provenance}`);
  if (resolvedInput.warning) console.error(`warning: ${resolvedInput.warning}`);
  const records = await readJsonl(INPUT);
  console.error(`records=${records.length}`);
  const integrity = assertSpeakersArtifactIntegrity(records, { provenance: resolvedInput.provenance });
  if (!integrity.skipped) console.error(`speakers_integrity=ok quotes=${integrity.quotes}`);
  let pageTextMap = new Map();
  try {
    pageTextMap = pagesFromText(await fs.readFile(PAGES_TXT, 'utf8'));
    console.error(`loaded pages.txt=${pageTextMap.size}`);
  } catch {
    console.error(`warning: missing pages.txt at ${PAGES_TXT}; cannot attribute quotes to exact pages`);
  }
  const geocodedPath = option('--geocoded');
  const geocodedByName = new Map();
  if (geocodedPath) {
    const rows = JSON.parse(await fs.readFile(path.resolve(geocodedPath), 'utf8'));
    for (const row of rows) {
      if (!row?.matched || row.lat == null || row.lon == null) continue;
      for (const name of row.staged_names ?? []) {
        const key = fold(name);
        if (key && !geocodedByName.has(key)) {
          geocodedByName.set(key, {
            center: { lat: row.lat, lon: row.lon, precision: row.precision ?? 'nominatim' },
            label: name,
            source: 'nominatim',
          });
        }
      }
      const qKey = fold(row.query);
      if (qKey && !geocodedByName.has(qKey)) {
        geocodedByName.set(qKey, {
          center: { lat: row.lat, lon: row.lon, precision: row.precision ?? 'nominatim' },
          label: row.query,
          source: 'nominatim',
        });
      }
    }
    console.error(`loaded geocoded=${geocodedByName.size}`);
  }
  const streetsDoc = await loadStreetGazetteer();
  const streets = streetsDoc?.streets ?? [];
  console.error(`loaded streets=${streets.length}`);
  const landmarks = (await loadJsonIfExists(LANDMARKS_PATH))?.landmarks ?? [];
  console.error(`loaded landmarks=${landmarks.length}`);

  const landmarkCenterByKey = new Map();
  for (const landmark of landmarks) {
    const center = landmark.center ?? (landmark.lat != null && landmark.lon != null
      ? { lat: landmark.lat, lon: landmark.lon, precision: 'landmark' }
      : null);
    if (!center) continue;
    const key = landmark.key ?? normalizePlaceKey(landmark.name);
    if (key) landmarkCenterByKey.set(key, { center, label: landmark.name ?? landmark.display ?? key });
    for (const alias of landmark.aliases ?? []) {
      const aliasKey = normalizePlaceKey(alias);
      if (aliasKey && !landmarkCenterByKey.has(aliasKey)) {
        landmarkCenterByKey.set(aliasKey, { center, label: landmark.name ?? alias });
      }
    }
  }

  const streetCenterByKey = new Map();
  for (const street of streets) {
    if (!street?.center) continue;
    const key = street.key ?? normalizePlaceKey(street.modern);
    if (key) streetCenterByKey.set(key, { center: street.center, label: street.modern ?? key });
    for (const alias of street.historical ?? []) {
      const aliasKey = normalizePlaceKey(alias);
      if (aliasKey && !streetCenterByKey.has(aliasKey)) {
        streetCenterByKey.set(aliasKey, { center: street.center, label: street.modern ?? alias });
      }
    }
  }

  // District / city-part centroids when gazetteer has no unique POI.
  const DISTRICT_CENTROIDS = new Map(Object.entries({
    budapest: { lat: 47.4979, lon: 19.0402, precision: 'city' },
    buda: { lat: 47.498, lon: 19.033, precision: 'district' },
    pest: { lat: 47.501, lon: 19.06, precision: 'district' },
    obuda: { lat: 47.541, lon: 19.045, precision: 'district' },
    ujpest: { lat: 47.56, lon: 19.09, precision: 'district' },
    erzsbetvaros: { lat: 47.501, lon: 19.07, precision: 'district' },
    erzsebetvaros: { lat: 47.501, lon: 19.07, precision: 'district' },
    'csepel island': { lat: 47.42, lon: 19.07, precision: 'district' },
    csepel: { lat: 47.42, lon: 19.07, precision: 'district' },
    'buda hills': { lat: 47.52, lon: 18.98, precision: 'district' },
    'margaret island': { lat: 47.527, lon: 19.047, precision: 'landmark' },
    'city park': { lat: 47.5145, lon: 19.083, precision: 'landmark' },
    varosliget: { lat: 47.5145, lon: 19.083, precision: 'landmark' },
    '7th district': { lat: 47.501, lon: 19.07, precision: 'district' },
  }).map(([k, v]) => [normalizePlaceKey(k), v]));
  const SYNONYMS = new Map(Object.entries({
    'castle hill': 'buda castle',
    'castle hill of buda': 'buda castle',
    'buda castle district': 'buda castle',
    'castle district': 'buda castle',
    'castle district of buda': 'buda castle',
    'royal palace': 'budavari palota',
    'royal palace castle hill': 'budavari palota',
    'matthias church': 'matthias church',
    'fishermens bastion': 'halaszbastya',
    "fishermen's bastion": 'halaszbastya',
    'heroes square': 'hosok tere',
    "heroes' square": 'hosok tere',
    'chain bridge': 'szechenyi lanchid',
    'elizabeth bridge': 'erzsebet hid',
    'liberty bridge': 'szabadsag hid',
    'margaret bridge': 'margit hid',
    'rakoczi bridge': 'rakoczi hid',
    'gellert hill': 'gellert hegy',
    'gellert thermal baths': 'gellert gyogyfurdo',
    'gellert baths': 'gellert gyogyfurdo',
    'szechenyi baths': 'szechenyi gyogyfurdo',
    'szechenyi thermal spa baths': 'szechenyi gyogyfurdo',
    'rudas thermal baths': 'rudas gyogyfurdo',
    'kiraly thermal bath': 'kiraly furdo',
    'rac thermal bath': 'rac furdo',
    'western railway station': 'nyugati palyaudvar',
    'budapest west railway station': 'nyugati palyaudvar',
    'budapest west station': 'nyugati palyaudvar',
    'nyugati railway station west station': 'nyugati palyaudvar',
    'eastern station': 'keleti palyaudvar',
    'keleti station': 'keleti palyaudvar',
    'ferihegy airport': 'liszt ferenc nemzetkozi repulerter',
    'budapest ferenc liszt international airport': 'liszt ferenc nemzetkozi repulerter',
    'gellert thermal bath': 'gellert gyogyfurdo',
    'gellert thermal baths': 'gellert gyogyfurdo',
    'dagaly bath': 'dagaly furdo',
    'holocaust memorial centre': 'holocaust memorial center',
    'central european university': 'central european university',
    'central european university ceu': 'central european university',
    'andrassy avenue 60': 'andrassy ut',
    'andrassy boulevard': 'andrassy ut',
    'elizabeth boulevard': 'erzsebet korut',
    'aquincum': 'aquincum',
    'obuda': 'obuda',
    'buda': 'buda',
    'pest': 'pest',
    'city park': 'varosliget',
    'varosliget city park': 'varosliget',
    'grand boulevard': 'nagykorut',
    'grand boulevard of inner pest': 'nagykorut',
    'andrassy avenue': 'andrassy ut',
    'shoes on the danube bank memorial': 'cipok a danaparton',
    'csepel island': 'csepel',
    'liberation monument': 'szabadsag szobor',
    'house of music hungary': 'magyar zene haza',
    'opera house': 'magyar allami operahaz',
    'parliament': 'orszaghaz',
    'andrassy avenue 60': 'andrassy ut 60',
    'political prison at andrassy ut 60': 'andrassy ut 60',
    'house of terror': 'terror haza',
    'dagaly bath': 'dagaly furdo',
    'lukacs thermal bath': 'lukacs gyogyfurdo',
    'rudas thermal bath': 'rudas gyogyfurdo',
    'rudas thermal baths': 'rudas gyogyfurdo',
    'veli bey thermal bath': 'veli bej furdoje',
    'gellert thermal bath': 'gellert gyogyfurdo',
    'gellert thermal baths': 'gellert gyogyfurdo',
    'kossuth square': 'kossuth lajos ter',
    'moscow square': 'szell kalman ter',
    'szell kalman square': 'szell kalman ter',
    'szel kalman square': 'szell kalman ter',
    'felvonulas square': 'hosok tere',
    'november 7th square': 'onyehetedike ter',
    'liberation square': 'szabadsag ter',
    'joseph bem square': 'bem jozsef ter',
    'kauzal square': 'klauzal ter',
    'klauzal square': 'klauzal ter',
    'franciscans square': 'ferenciek tere',
    'old royal palace': 'budavari palota',
    'new york palace and coffee house': 'new york palota',
    'operetta theatre of budapest': 'budapesti operettszinhaz',
    'budapest south station': 'deli palyaudvar',
    'budapest music centre': 'bmc budapest music center',
    'pest danube embankment': 'pesti also rakpart',
    'grand boulevard of inner pest': 'nagykorut',
    'emanu el synagogue': 'dohany utcai zsinagoga',
    'dominican church': 'belvarosi plebaniatemplom',
  }).map(([k, v]) => [normalizePlaceKey(k), normalizePlaceKey(v)]));

  const BUDAPEST_BBOX = { minLat: 47.35, maxLat: 47.62, minLon: 18.90, maxLon: 19.35 };
  const inBudapest = (center) => center
    && center.lat >= BUDAPEST_BBOX.minLat && center.lat <= BUDAPEST_BBOX.maxLat
    && center.lon >= BUDAPEST_BBOX.minLon && center.lon <= BUDAPEST_BBOX.maxLon;

  const candidateKeys = (name) => {
    const raw = normalizeWs(name);
    if (!raw) return [];
    const out = [];
    const push = (value) => {
      const key = fold(value);
      if (key && !out.includes(key)) out.push(key);
    };
    push(raw);
    push(raw.split(',')[0]);
    push(raw.replace(/\b(of buda|in buda|in pest|of pest|in budapest|budapest)\b/giu, ' '));
    const syn = SYNONYMS.get(fold(raw)) || SYNONYMS.get(fold(raw.split(',')[0]));
    if (syn) out.push(syn);
    // Street-ish tail: "... Király utca" / "Andrássy ut 60"
    const streetish = raw.match(/([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}'-]+(?:\s+[\p{L}'-]+){0,3}\s+(?:utca|út|ut|tér|körút|krt\.?|rakpart|útja))/u);
    if (streetish) push(streetish[1]);
    return out;
  };

  const lookupKey = (key) => {
    if (!key) return null;
    if (landmarkCenterByKey.has(key)) {
      return { ...landmarkCenterByKey.get(key), source: 'gazetteer_landmark', key };
    }
    if (streetCenterByKey.has(key)) {
      return { ...streetCenterByKey.get(key), source: 'gazetteer_street', key };
    }
    if (DISTRICT_CENTROIDS.has(key)) {
      return { center: DISTRICT_CENTROIDS.get(key), label: key, source: 'district_centroid', key };
    }
    if (geocodedByName.has(key)) {
      const hit = geocodedByName.get(key);
      if (inBudapest(hit.center)) return { ...hit, key };
    }
    return null;
  };

  const resolveCenter = (names) => {
    for (const name of names) {
      for (const key of candidateKeys(name)) {
        const hit = lookupKey(key);
        if (hit) return hit;
      }
    }
    return null;
  };

  /** Collect people per page (for pronoun/name linking in quotes). */
  const peopleByPage = new Map();
  const addPersonToPages = (person, pages) => {
    const nameEn = normalizeWs(person.name_en);
    const sourceName = normalizeWs(person.source_name);
    if (!nameEn && !sourceName) return;
    const entry = {
      name_en: nameEn || sourceName,
      source_name: sourceName || null,
      role_en: normalizeWs(person.role_en) || null,
      years_hint: person.years_hint ?? null,
      quote: normalizeWs(person.evidence?.quote) || null,
      aliases: [...new Set([nameEn, sourceName].filter(Boolean))],
    };
    for (const page of pages) {
      const list = peopleByPage.get(page) ?? [];
      if (!list.some((p) => fold(p.name_en) === fold(entry.name_en))) list.push(entry);
      peopleByPage.set(page, list);
    }
  };

  /** Prefer persisted evidence.speaker; never live-resolve when the field exists. */
  const speakerFromPersisted = (evidenceSpeaker, people) => {
    if (!evidenceSpeaker || evidenceSpeaker.status == null) return null;
    const status = evidenceSpeaker.status;
    if (status === 'resolved') {
      const name = normalizeWs(evidenceSpeaker.name_en);
      const person = people.find((row) => fold(row.name_en) === fold(name))
        ?? (name ? {
          name_en: name,
          source_name: evidenceSpeaker.source_name ?? null,
          role_en: evidenceSpeaker.role_en ?? null,
          years_hint: null,
          quote: null,
        } : null);
      if (!person) {
        return {
          status: 'none',
          reason: 'persisted_unmatched',
          resolution_source: evidenceSpeaker.resolution_source ?? 'persisted',
          person: null,
          surface: evidenceSpeaker.surface ?? null,
          frame: null,
          confidence: null,
          needs_review: false,
        };
      }
      return {
        status: 'resolved',
        reason: evidenceSpeaker.reason ?? 'persisted',
        resolution_source: evidenceSpeaker.resolution_source ?? 'persisted',
        person,
        surface: evidenceSpeaker.surface ?? null,
        frame: null,
        confidence: evidenceSpeaker.confidence ?? null,
        needs_review: evidenceSpeaker.needs_review ?? false,
      };
    }
    return {
      status,
      reason: evidenceSpeaker.reason ?? 'persisted',
      resolution_source: evidenceSpeaker.resolution_source ?? 'persisted',
      person: null,
      surface: evidenceSpeaker.surface ?? null,
      frame: null,
      confidence: null,
      needs_review: false,
    };
  };

  /** Clickable spans via shared fail-closed quote speaker attribution. */
  const buildEntityLinks = (quote, page, evidenceSpeaker = null) => {
    const people = (peopleByPage.get(page) ?? []).filter((person) => !isRoleLabel(person.name_en));
    const pageText = pageTextMap.get(page) ?? '';
    // Persisted speaker always wins when present. Live resolve only for explicit legacy --input.
    const speaker = speakerFromPersisted(evidenceSpeaker, people)
      ?? (resolvedInput.provenance === 'explicit_input'
        ? resolveQuoteSpeaker({ quote, pageText, people })
        : {
          status: 'none',
          reason: 'missing_persisted_speaker',
          resolution_source: null,
          person: null,
          surface: null,
          frame: null,
        });
    const entity_links = buildQuoteEntityLinks({
      quote,
      pageText,
      people,
      speakerAttribution: speaker,
    });
    return { entity_links, speaker };
  };

  /** @type {Map<string, any>} */
  const byKey = new Map();
  /** @type {Map<number, {name_en:string, role_en:string|null, kind:string, quote:string|null}[]>} */
  const resolvedSpeakersByPage = new Map();
  const pushPageSpeaker = (page, speaker, kind, quote) => {
    if (!Number.isInteger(page) || speaker?.status !== 'resolved' || !speaker.name_en) return;
    const list = resolvedSpeakersByPage.get(page) ?? [];
    const key = fold(speaker.name_en);
    if (list.some((row) => fold(row.name_en) === key)) return;
    list.push({
      name_en: speaker.name_en,
      role_en: speaker.role_en ?? null,
      kind,
      quote: normalizeWs(quote) || null,
    });
    resolvedSpeakersByPage.set(page, list);
  };

  // Pass 1: people index + resolved speakers per page (from annotated evidence).
  for (const record of records) {
    const pages = (record.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE);
    if (!pages.length) continue;
    for (const person of record.payload?.people ?? []) {
      addPersonToPages(person, pages);
    }
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of record.payload?.[kind] ?? []) {
        const quote = normalizeWs(item.evidence?.quote);
        for (const page of pagesForEvidence(item.evidence, pages, pageTextMap)) {
          pushPageSpeaker(page, item.evidence?.speaker, kind, quote);
        }
      }
    }
  }

  // Pass 2: location mentions with entity links + co-page speakers.
  for (const record of records) {
    const pages = (record.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE);
    if (!pages.length) continue;
    for (const location of record.payload?.locations ?? []) {
      const nameEn = normalizeWs(location.name_en);
      const sourceName = normalizeWs(location.source_name);
      const key = fold(nameEn) || fold(sourceName);
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          name_key: key,
          name_en: nameEn || sourceName,
          source_names: new Set(),
          kinds: new Set(),
          addresses: new Set(),
          mentions: [],
        });
      }
      const row = byKey.get(key);
      if (nameEn && nameEn.length > String(row.name_en).length) row.name_en = nameEn;
      if (sourceName) row.source_names.add(sourceName);
      if (location.kind) row.kinds.add(location.kind);
      const address = normalizeWs(location.address_en || location.address_source);
      if (address) row.addresses.add(address);
      const quote = normalizeWs(location.evidence?.quote);
      const attributed = pagesForEvidence(location.evidence, pages, pageTextMap);
      for (const page of attributed) {
        const linked = buildEntityLinks(quote, page, location.evidence?.speaker ?? null);
        const mentionSpeaker = linked.speaker.person?.name_en || location.evidence?.speaker?.name_en || '';
        const pageSpeakers = (resolvedSpeakersByPage.get(page) ?? [])
          .filter((speaker) => fold(speaker.name_en) !== fold(mentionSpeaker));
        row.mentions.push({
          page,
          surface: nameEn || sourceName,
          quote: quote || null,
          kind: location.kind ?? null,
          entity_links: linked.entity_links,
          speaker_status: linked.speaker.status,
          speaker_reason: linked.speaker.reason,
          speaker_resolution_source: linked.speaker.resolution_source,
          speaker_confidence: linked.speaker.confidence ?? null,
          speaker_needs_review: linked.speaker.needs_review ?? false,
          speaker_surface: linked.speaker.surface,
          speaker_name_en: linked.speaker.person?.name_en ?? null,
          page_speakers: pageSpeakers,
          quote_page_reason: location.evidence?.quote_page_reason ?? null,
        });
      }
    }
  }

  const features = [];
  let withCoords = 0;
  let withoutCoords = 0;

  for (const row of [...byKey.values()].sort((a, b) => String(a.name_en).localeCompare(String(b.name_en)))) {
    const aliases = [...row.source_names];
    const hit = resolveCenter([row.name_en, ...aliases, ...row.addresses]);
    const mentionSamples = [];
    const seen = new Set();
    const quotePages = new Map();
    for (const sample of row.mentions.sort((a, b) => a.page - b.page)) {
      const quoteKey = foldMatch(sample.quote || '');
      // Same verbatim quote must not be listed on multiple pages (window fan-out residue).
      if (quoteKey && quotePages.has(quoteKey)) continue;
      const dedupe = `${sample.page}|${sample.quote || sample.surface}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      if (quoteKey) quotePages.set(quoteKey, sample.page);
      mentionSamples.push({
        page: sample.page,
        surface: sample.surface,
        quote: sample.quote,
        ocr_quote: sample.quote,
        kind: sample.kind,
        entity_links: sample.entity_links ?? [],
        speaker_status: sample.speaker_status ?? null,
        speaker_reason: sample.speaker_reason ?? null,
        speaker_resolution_source: sample.speaker_resolution_source ?? null,
        speaker_confidence: sample.speaker_confidence ?? null,
        speaker_needs_review: sample.speaker_needs_review ?? false,
        speaker_surface: sample.speaker_surface ?? null,
        speaker_name_en: sample.speaker_name_en ?? null,
        page_speakers: sample.page_speakers ?? [],
        quote_page_reason: sample.quote_page_reason ?? null,
      });
    }

    if (hit?.center?.lat != null && hit?.center?.lon != null) {
      withCoords += 1;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [hit.center.lon, hit.center.lat] },
        properties: {
          entity_id: `loc:${row.name_key}`,
          label: row.name_en,
          type: [...row.kinds][0] ?? 'place',
          kind: 'location',
          aliases,
          addresses: [...row.addresses],
          coord_source: hit.source,
          precision: hit.center.precision ?? null,
          mention_samples: mentionSamples,
          mention_sample_total: mentionSamples.length,
          provisional: true,
          source_id: `${SOURCE_SLUG}-private`,
        },
      });
    } else {
      withoutCoords += 1;
    }
  }

  const collection = {
    type: 'FeatureCollection',
    attribution: '© OpenStreetMap contributors (ODbL). Book quotes are private restricted corpus — do not republish.',
    generated_at: new Date().toISOString(),
    source_id: `${SOURCE_SLUG}-private`,
    max_page: MAX_PAGE,
    summary: {
      unique_locations: byKey.size,
      with_coords: withCoords,
      without_coords: withoutCoords,
      features: features.length,
    },
    page_texts: (() => {
      const needed = new Set();
      for (const feature of features) {
        for (const sample of feature.properties.mention_samples ?? []) {
          if (sample.page != null) needed.add(Number(sample.page));
        }
      }
      const out = {};
      for (const page of [...needed].sort((a, b) => a - b)) {
        const text = pageTextMap.get(page);
        if (text) out[String(page)] = text;
      }
      return out;
    })(),
    features,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`);
  console.log(JSON.stringify({ output: OUTPUT, ...collection.summary }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
