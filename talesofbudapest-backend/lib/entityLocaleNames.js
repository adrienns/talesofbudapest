import { expandNameVariants, GIVEN_NAMES, normalizeLocationName } from './kgNameLexicon.js';
import { DEFAULT_LOCALE, isAppLocale } from './locale.js';

const capitalizeToken = (token) =>
  token ? token.charAt(0).toUpperCase() + token.slice(1) : token;

const titleCaseTokens = (tokens) => tokens.map(capitalizeToken).join(' ');

const englishGivenNames = () => {
  const names = new Set();
  for (const value of Object.values(GIVEN_NAMES)) {
    const list = Array.isArray(value) ? value : [value];
    for (const name of list) names.add(name);
  }
  return names;
};

const EN_GIVEN = englishGivenNames();

/**
 * Person-name order conventions by locale — not Hungarian-specific; any
 * locale can declare western (given-family) vs eastern (family-given) order.
 */
export const PERSON_NAME_ORDER = {
  en: 'western',
  hu: 'eastern',
};

const swapDisplayTokens = (displayName) => {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return displayName;
  return titleCaseTokens([tokens[1], tokens[0]]);
};

const pickPersonVariantForOrder = (display, normalized, order) => {
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length !== 2) return display;

  const variants = expandNameVariants(normalized, { entityKind: 'person' });
  const [first, second] = tokens;
  const flipped = `${second} ${first}`;

  if (order === 'western') {
    if (EN_GIVEN.has(first)) return display;
    if (variants.includes(flipped)) return swapDisplayTokens(display);
    const western = variants.find((variant) => EN_GIVEN.has(variant.split(' ')[0]));
    return western ? titleCaseTokens(western.split(' ')) : display;
  }

  if (EN_GIVEN.has(first) && variants.includes(flipped)) {
    return swapDisplayTokens(display);
  }

  return display;
};

/**
 * Picks a person-name surface form for the target locale when only one
 * spelling is known. Prefer explicit en/hu aliases from KG when provided.
 */
export const resolvePersonDisplayName = ({
  name,
  locale = DEFAULT_LOCALE,
  nameEn,
  nameHu,
}) => {
  if (!isAppLocale(locale)) return name?.trim() ?? '';

  if (locale === 'hu' && nameHu?.trim()) return nameHu.trim();
  if (locale === 'en' && nameEn?.trim()) {
    const en = nameEn.trim();
    if (nameHu?.trim() && normalizeLocationName(nameHu) !== normalizeLocationName(en)) {
      return en;
    }
    return pickPersonVariantForOrder(en, normalizeLocationName(en), 'western');
  }

  const display = name?.trim() || '';
  if (!display) return '';

  const normalized = normalizeLocationName(display);
  const order = PERSON_NAME_ORDER[locale] ?? 'western';
  return pickPersonVariantForOrder(display, normalized, order);
};

const pickAliasForLocale = (aliases, locale) => {
  if (!aliases?.length) return null;
  const preferred =
    aliases.find((row) => row.language_code === locale && row.alias?.trim()) ??
    aliases.find((row) => !row.language_code && row.alias?.trim());
  return preferred?.alias?.trim() ?? null;
};

/**
 * @param {Map<string, Array<{alias:string, language_code:string|null, alias_kind:string}>>} aliasMap
 */
export const buildNameGlossary = ({ chronicle, locale = DEFAULT_LOCALE, aliasMap }) => {
  if (!isAppLocale(locale) || !chronicle) return [];

  const entries = [];
  const seen = new Set();

  for (const person of chronicle.people ?? []) {
    const aliases = aliasMap?.get(person.id) ?? [];
    const nameEn =
      pickAliasForLocale(
        aliases.filter((row) => row.language_code === 'en'),
        'en',
      ) ?? person.name;
    const nameHu = pickAliasForLocale(
      aliases.filter((row) => row.language_code === 'hu'),
      'hu',
    );
    const displayName = resolvePersonDisplayName({
      name: person.name,
      locale,
      nameEn,
      nameHu,
    });

    if (!displayName || seen.has(displayName.toLowerCase())) continue;
    seen.add(displayName.toLowerCase());

    entries.push({
      entityKind: 'person',
      displayName,
      nameEn: nameEn ?? person.name,
      nameHu: nameHu ?? null,
      role: person.description ?? person.relationship ?? null,
    });
  }

  return entries;
};

export const formatNameGlossaryForPrompt = (entries, locale = DEFAULT_LOCALE) => {
  if (!entries?.length) return '';

  const lines = entries.map((entry) => {
    const alt =
      locale === 'hu'
        ? entry.nameEn && entry.nameEn !== entry.displayName
          ? ` (English: ${entry.nameEn})`
          : ''
        : entry.nameHu
          ? ` (Hungarian: ${entry.nameHu})`
          : '';
    const role = entry.role ? ` — ${entry.role}` : '';
    return `- ${entry.displayName}${alt}${role}`;
  });

  if (locale === 'hu') {
    return `SZEMÉLYNEVEK (pontosan így használd; magyar sorrend: családnév először):\n${lines.join('\n')}`;
  }

  return `PERSON NAMES (use exactly as written; Western order: given name first):\n${lines.join('\n')}`;
};
