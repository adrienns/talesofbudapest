// Decides whether a staged relation endpoint that failed to resolve against
// the existing entity index LOOKS like a real, specific named entity worth
// creating a flagged "needs research" placeholder for (see
// cli/create-kg-placeholders.js), vs. generic noise (a role title, a
// demographic category, a clause/description) that would just add review
// noise if turned into a placeholder row.
//
// Deliberately conservative: when in doubt, return false. A missed
// placeholder is recoverable (a later, better heuristic or a human can still
// create it); a false placeholder pollutes the graph with junk entities that
// someone has to notice and reject.
import { normalizeLocationName } from './kgNormalize.js';

// Phrases seen in this corpus that name a category, role, or clause rather
// than a specific entity. Matched against the FULL normalized text (not
// substrings), case-insensitively, diacritics folded.
const EXACT_STOPLIST = new Set([
  // Demographic / religious categories, not a named entity.
  'jews', 'jew', 'jewish community', 'jewish community of buda', 'jewish community of pest', 'jewish community of obuda',
  'gentiles', 'christians', 'catholics', 'protestants', 'hungarians', 'germans', 'austrians', 'romanians', 'slovaks', 'nazis', 'communists', 'soldiers', 'refugees',
  'traditional jewish life', 'jewish secondary school', 'jewish life',
  // Institutional categories, not a named institution.
  'detention centers', 'detention center', 'internment camp', 'internment camps', 'labor camp', 'labor camps',
  // Occupations / bare role titles used alone.
  'architect', 'historian', 'poet', 'painter', 'sculptor', 'engineer', 'publisher', 'editor', 'printer', 'photographer', 'writer',
  'emperor', 'king', 'baron', 'rabbi', 'minister', 'prefect', 'governor', 'mayor', 'bishop', 'duke', 'count', 'chancellor', 'president',
  // Specific noisy title phrases seen in the corpus.
  'minister of interior',
]);

// Role words that only signal noise when NOT immediately followed by a
// capitalized token (a plausible proper name), e.g. "Minister of Interior"
// (rejected: "of" is lowercase) vs. "Emperor Francis I of Austria" (kept:
// "Francis" is capitalized). Checked before the exact-phrase stoplist so a
// bare role word ("Minister") is already caught there too.
const ROLE_PREFIXES = new Set([
  'emperor', 'king', 'baron', 'rabbi', 'minister', 'prefect', 'governor', 'mayor',
  'bishop', 'duke', 'count', 'chancellor', 'president',
]);

const MAX_WORDS = 8;
const MIN_LENGTH = 2;

const startsWithCapital = (text) => /^\p{Lu}/u.test(text);

const isRolePhraseWithoutName = (words) => {
  if (words.length < 2) return false;
  const [first, second] = words;
  if (!ROLE_PREFIXES.has(first.toLowerCase())) return false;
  return !startsWithCapital(second);
};

export const isPlaceholderCandidate = (text, _kind) => {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length <= MIN_LENGTH) return false;
  if (!startsWithCapital(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) return false;
  if (words.length === 1 && ROLE_PREFIXES.has(words[0].toLowerCase())) return false;
  if (isRolePhraseWithoutName(words)) return false;

  const normalized = normalizeLocationName(trimmed);
  if (!normalized) return false;
  if (EXACT_STOPLIST.has(normalized)) return false;

  return true;
};

export const placeholderTable = (kind) => {
  switch (kind) {
    case 'location': return 'kg_locations';
    case 'person': return 'kg_people';
    case 'event': return 'kg_events';
    case 'organisation': return 'kg_organisations';
    default: return null;
  }
};
