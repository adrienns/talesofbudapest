/**
 * Budapest places gazetteer loaders and folded-key helpers.
 *
 * Layers: streets (existing), landmarks, address points. Attribution stays
 * with each artifact (OpenStreetMap ODbL + seed sources). This module never
 * rewrites OCR evidence — it only supplies lookup structures for identity /
 * display canonicalize and address matching.
 */
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GAZETTEER_DIR = path.join(__dirname, '../../ingest/gazetteer');
export const STREETS_PATH = path.join(GAZETTEER_DIR, 'budapest-streets.json');
export const LANDMARKS_PATH = path.join(GAZETTEER_DIR, 'budapest-landmarks.json');
export const ADDRESSES_PATH = path.join(GAZETTEER_DIR, 'budapest-addresses.jsonl');
export const ADDRESSES_GZ_PATH = path.join(GAZETTEER_DIR, 'budapest-addresses.jsonl.gz');
export const PLACES_INDEX_PATH = path.join(GAZETTEER_DIR, 'budapest-places-index.json');

export const normalizePlaceKey = (value) => String(value ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();

const STREET_TYPE_TOKENS = new Set([
  'utca', 'u', 'ut', 'it', 'tt', 'gt', 'ter', 'korut', 'krt', 'rakpart', 'koz', 'sor', 'fasor', 'setany', 'liget', 'lejto',
  'street', 'st', 'avenue', 'ave', 'road', 'rd', 'square', 'sq', 'boulevard', 'blvd', 'lane', 'ln', 'park', 'bridge',
]);

export const placeTokens = (value) => normalizePlaceKey(value).split(/\s+/u).filter(Boolean);

/** Significant tokens for confusion lookup (drop bare street-type heads). */
export const significantPlaceTokens = (value) => placeTokens(value).filter((token) => !STREET_TYPE_TOKENS.has(token) && token.length >= 3);

/**
 * Build a compact places index from street / landmark / address rows.
 * Ambiguous folded keys are marked unique:false so repair stays fail-closed.
 */
export const buildPlacesIndexDocument = ({ streets = [], landmarks = [], addresses = [], sources = [] } = {}) => {
  const byKey = new Map();
  const tokenOwners = new Map();

  const register = (key, target) => {
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...target, unique: true });
      return;
    }
    if (existing.id === target.id && existing.layer === target.layer) return;
    byKey.set(key, { layer: existing.layer, id: existing.id, display: existing.display, unique: false, ambiguous_with: target.id });
  };

  const registerToken = (token, ownerKey) => {
    if (!token || STREET_TYPE_TOKENS.has(token)) return;
    const owners = tokenOwners.get(token) ?? new Set();
    owners.add(ownerKey);
    tokenOwners.set(token, owners);
  };

  for (const street of streets) {
    if (!street.key && !street.modern) continue;
    const key = street.key ?? normalizePlaceKey(street.modern);
    const target = { layer: 'street', id: key, display: street.modern, key };
    register(key, target);
    for (const historical of street.historical ?? []) {
      if (historical.key) register(historical.key, target);
      for (const token of significantPlaceTokens(historical.name ?? historical.key)) registerToken(token, key);
    }
    for (const token of significantPlaceTokens(street.modern ?? key)) registerToken(token, key);
  }

  for (const landmark of landmarks) {
    const key = landmark.key ?? normalizePlaceKey(landmark.name);
    if (!key) continue;
    const id = landmark.id ?? key;
    const target = { layer: 'landmark', id, display: landmark.name, key };
    register(key, target);
    for (const alias of landmark.aliases ?? []) {
      const aliasKey = normalizePlaceKey(alias);
      if (aliasKey) register(aliasKey, target);
      for (const token of significantPlaceTokens(alias)) registerToken(token, key);
    }
    for (const token of significantPlaceTokens(landmark.name)) registerToken(token, key);
  }

  for (const address of addresses) {
    const key = address.key ?? normalizePlaceKey(`${address.street ?? ''} ${address.housenumber ?? ''}`);
    if (!key) continue;
    const id = address.id ?? key;
    const target = {
      layer: 'address',
      id,
      display: `${address.street}${address.housenumber ? ` ${address.housenumber}` : ''}`,
      key,
    };
    register(key, target);
  }

  const tokens = {};
  for (const [token, owners] of tokenOwners) {
    const list = [...owners];
    // Prefer a street owner for diacritic display when the same stem appears on
    // landmarks (Dohány utca vs Dohány Street Synagogue).
    const preferred = list.find((key) => byKey.get(key)?.layer === 'street') ?? list[0];
    const owner = byKey.get(preferred);
    const displayPart = owner?.display
      ? String(owner.display).split(/\s+/u).find((piece) => normalizePlaceKey(piece) === token)
      : null;
    tokens[token] = {
      // A token spelling is "known" when present; confusion uniqueness is
      // decided among edit-distance neighbors in hungarianOcrGazetteer, not by
      // requiring a single owner (shared stems are normal).
      in_gazetteer: true,
      owner_key: preferred,
      owner_count: list.length,
      display_token: displayPart ?? token,
    };
  }

  const entries = {};
  for (const [key, value] of byKey) entries[key] = value;

  return {
    generated_at: new Date().toISOString(),
    sources,
    counts: {
      streets: streets.length,
      landmarks: landmarks.length,
      addresses: addresses.length,
      keys: Object.keys(entries).length,
      tokens: Object.keys(tokens).length,
    },
    entries,
    tokens,
  };
};

export const loadJsonIfExists = async (filePath) => {
  try {
    return JSON.parse(await fsPromises.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
};

/** Stream address JSONL or gzipped JSONL into an array (use sparingly). */
export const loadAddresses = async (filePath = null) => {
  const gzPath = filePath?.endsWith('.gz') ? filePath : ADDRESSES_GZ_PATH;
  const plainPath = filePath && !filePath.endsWith('.gz') ? filePath : ADDRESSES_PATH;
  const useGz = fs.existsSync(gzPath) && (!filePath || filePath.endsWith('.gz'));
  const sourcePath = useGz ? gzPath : plainPath;
  if (!fs.existsSync(sourcePath)) return [];
  const input = useGz ? createReadStream(sourcePath).pipe(createGunzip()) : createReadStream(sourcePath, { encoding: 'utf8' });
  const rows = [];
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip bad line */ }
  }
  return rows;
};

/**
 * Load the compact places index (preferred). If missing, build a minimal index
 * from streets (+ landmarks when present) without loading the full address dump.
 */
export const loadPlacesIndex = async ({ gazetteerDir = GAZETTEER_DIR } = {}) => {
  const indexPath = path.join(gazetteerDir, 'budapest-places-index.json');
  const cached = await loadJsonIfExists(indexPath);
  if (cached?.entries) return cached;

  const streetsDoc = await loadJsonIfExists(path.join(gazetteerDir, 'budapest-streets.json'));
  const landmarksDoc = await loadJsonIfExists(path.join(gazetteerDir, 'budapest-landmarks.json'));
  return buildPlacesIndexDocument({
    streets: streetsDoc?.streets ?? [],
    landmarks: landmarksDoc?.landmarks ?? [],
    addresses: [],
    sources: [
      ...(streetsDoc?.sources ?? []),
      ...(landmarksDoc?.sources ?? []),
      { name: 'places-index-fallback', note: 'Built on load without address layer; run build:places-gazetteer' },
    ],
  });
};

export const loadStreetGazetteer = async ({ gazetteerDir = GAZETTEER_DIR } = {}) => (
  loadJsonIfExists(path.join(gazetteerDir, 'budapest-streets.json'))
);
