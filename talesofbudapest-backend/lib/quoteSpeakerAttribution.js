/**
 * Deterministic quote-speaker attribution for restricted-book surfaces.
 *
 * Fail-closed: first-person voice is linked only via an explicit speech frame
 * matched to a known person. Never use discourse focus / "last named person"
 * alone for I/my. Presentation consumers may call buildQuoteEntityLinks;
 * extraction (phase B) should persist resolveQuoteSpeaker() status beside evidence.
 *
 * Quote text stays immutable; attribution lives beside it.
 */

const normalizeWs = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();

export const foldPersonKey = (value) => normalizeWs(value)
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/[^a-z0-9'\s-]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TITLE_PREFIX_RE = /^(?:prof(?:essor)?|dr|mr|mrs|ms|sir|dame|lord|lady)\.?\s+/iu;
const ROLE_GLOSS_PREFIX_RE = /^(?:the\s+)?(?:historian|author|writer|journalist|scholar|architect|politician|scientist|professor|editor|critic|novelist|poet|director|painter|composer)\s+/iu;

const stripTitles = (raw) => normalizeWs(String(raw ?? '').replace(TITLE_PREFIX_RE, '').replace(ROLE_GLOSS_PREFIX_RE, ''));

const NON_PERSON_FRAME_RE = /\b(?:the\s+)?(?:inscription|plaque|sign|notice|caption|legend|epigraph|text|document|letter|diary|newspaper|article|poster|board|ideology|theory|doctrine|tradition|argument|policy|law|report)\b/iu;

const POSSESSIVE_GLOSS_RE = /[\u2019']s?\s+(?:recollections?|memories|accounts?|words|view|opinion|story|stories)\b.*$/iu;

const STOPWORD_SPEAKER = new Set([
  'a', 'an', 'the', 'as', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'and', 'or',
  'he', 'she', 'they', 'it', 'we', 'you', 'his', 'her', 'their', 'this', 'that',
  'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where',
  'how', 'why', 'if', 'then', 'than', 'so', 'such', 'also', 'only', 'even',
  'just', 'about', 'into', 'over', 'after', 'before', 'between', 'under',
  'having', 'being', 'been', 'easily', 'later', 'earlier', 'once', 'still',
  'already', 'never', 'always', 'often', 'here', 'there', 'well', 'much',
]);

const looksLikePersonSurface = (raw) => {
  let surface = stripTitles(raw);
  surface = normalizeWs(surface.replace(POSSESSIVE_GLOSS_RE, ''));
  surface = normalizeWs(surface.replace(/\s+and$/iu, ''));
  if (!surface) return false;
  if (NON_PERSON_FRAME_RE.test(surface)) return false;
  // Must start with a capital letter (Unicode).
  if (!/^\p{Lu}/u.test(surface)) return false;
  const tokens = surface.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 5) return false;
  if (tokens.every((token) => STOPWORD_SPEAKER.has(foldPersonKey(token)))) return false;
  // Reject clause fragments: "He nudged my mother and"
  if (/\b(?:nudged|lowered|espresso|funeral|table|voice|mother|father|recollections|ideology)\b/iu.test(surface)) return false;
  if (tokens.some((token) => STOPWORD_SPEAKER.has(foldPersonKey(token)) && foldPersonKey(token) !== 'and')) {
    const bad = tokens.filter((token) => {
      const key = foldPersonKey(token);
      return STOPWORD_SPEAKER.has(key) && key !== 'and';
    });
    if (bad.length) return false;
  }
  return true;
};

const isJointSpeakerSurface = (surface) => {
  // Only "Name and Name" — not arbitrary phrases containing "and".
  const m = normalizeWs(surface).match(/^([\p{L}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){0,2})\s+and\s+([\p{L}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){0,2})$/iu);
  if (!m) return false;
  return looksLikePersonSurface(m[1]) && looksLikePersonSurface(m[2]);
};

const SPEECH_VERB = String.raw`explained|said|says|told|recalled|remembered|noted|wrote|writes|argued|continued|added|observed|remarked|exclaimed|declared|replied|answered|asked|insisted|claimed|confessed|admitted|commented|acknowledged|described|describes|reads|read`;

const PERSON_NAME = String.raw`[\p{Lu}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){0,4}`;
/** Parenthetical birth/death or short appositive between name and verb. */
const NAME_PAREN = String.raw`(?:\s*\([^)]{0,40}\))?`;

/** Captures speaker surface from common English speech frames. */
const SPEECH_FRAME_RE = new RegExp(
  String.raw`(?:` +
    String.raw`\bAs\s+(${PERSON_NAME})\s+(?:${SPEECH_VERB})` +
    String.raw`|\b(${PERSON_NAME})${NAME_PAREN}\s+(?:${SPEECH_VERB})\s*[,:]` +
    // "Name, commented at the time:" / "Name, wrote in 1903:"
    String.raw`|\b(${PERSON_NAME})\s*,\s+(?:${SPEECH_VERB})\b[^.\n]{0,80}[,:]` +
    // "Granasztói explained … in the following way:" — verb then short clause then colon.
    String.raw`|\b(${PERSON_NAME})${NAME_PAREN}\s+(?:${SPEECH_VERB})\b[^.\n]{0,100}:` +
    // "Name has said:" / "Name, has commented:"
    String.raw`|\b(${PERSON_NAME})\s*,?\s+has\s+(?:said|commented|noted|written|argued|observed|remarked)\b[^.\n]{0,40}:` +
    // "Name gives/gave a … description/formulation/assessment … :"
    // Allow a short same-sentence appositive between name and gives/gave.
    String.raw`|\b(${PERSON_NAME})\b[^.\n]{0,80}?\b(?:gives|gave)\b[^.\n]{0,80}\b(?:description|formulation|assessment)\b[^.\n]{0,40}:` +
    String.raw`|\b[Aa]ccording to\s+(${PERSON_NAME})` +
  String.raw`)`,
  'gu',
);

const FIRST_PERSON_RE = /\b(I|I'm|I’ve|I'd|I'll|me|my|mine|myself)\b/giu;
const THIRD_PERSON_RE = /\b(he|him|his|she|her|hers)\b/giu;

export const isRoleLabel = (value) => {
  const name = String(value ?? '').replace(/[\u2018\u2019]/g, "'");
  if (/'s\s+/iu.test(name)) return true;
  if (/^(the\s+)?(nanny|governess|maid|cook|porter|officer|grandmother|grandfather)\b/iu.test(name)) return true;
  return false;
};

export const personAliases = (person) => {
  if (isRoleLabel(person?.name_en) || isRoleLabel(person?.source_name)) return [];
  const out = [];
  const push = (value) => {
    let alias = normalizeWs(value);
    if (!alias) return;
    alias = alias.replace(TITLE_PREFIX_RE, '').trim();
    if (!alias || alias.length < 3 || alias.length > 64) return;
    if (isRoleLabel(alias)) return;
    if (!out.includes(alias)) out.push(alias);
  };
  push(person.name_en);
  push(person.source_name);
  for (const extra of person.aliases ?? []) push(extra);
  const bare = normalizeWs(String(person.name_en ?? '').replace(TITLE_PREFIX_RE, ''));
  const parts = bare.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    push(parts[0]);
    push(parts.at(-1));
    push(parts.slice(-2).join(' '));
  }
  return out;
};

const aliasMatchesSpeaker = (aliases, rawSpeaker) => {
  const foldedSpeaker = foldPersonKey(rawSpeaker);
  if (!foldedSpeaker) return false;
  return aliases.some((alias) => {
    const foldedAlias = foldPersonKey(alias);
    if (!foldedAlias) return false;
    return foldedAlias === foldedSpeaker
      || foldedAlias.endsWith(` ${foldedSpeaker}`)
      || foldedSpeaker.endsWith(` ${foldedAlias}`);
  });
};

/**
 * Locate quote in page text; return left context before the quote start.
 * Fail soft: if not found, return full page (caller still fail-closes on frames).
 */
export const leftContextBeforeQuote = (pageText, quote) => {
  const page = String(pageText ?? '');
  const q = normalizeWs(quote);
  if (!page || !q) return page;
  const prefix = q.slice(0, Math.min(48, q.length));
  let at = page.indexOf(prefix);
  if (at < 0) at = page.toLowerCase().indexOf(prefix.toLowerCase());
  if (at < 0) {
    // Try first 32 chars of original (may include mid-quote slice).
    const soft = q.slice(0, Math.min(32, q.length));
    at = page.indexOf(soft);
    if (at < 0) at = page.toLowerCase().indexOf(soft.toLowerCase());
  }
  // at === 0 → quote opens the page; left context is empty (do NOT fall back to full page).
  if (at < 0) return page;
  return page.slice(0, at);
};

const collectFrameCandidates = (before) => {
  const frames = [];
  SPEECH_FRAME_RE.lastIndex = 0;
  let match;
  while ((match = SPEECH_FRAME_RE.exec(before)) != null) {
    const rawName = stripTitles(match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7]);
    if (!rawName) continue;
    frames.push({
      index: match.index,
      end: match.index + match[0].length,
      surface: rawName,
      matched: match[0],
    });
  }
  return frames;
};

/**
 * Nearest speech frame ending within maxGap chars before the quote start.
 * Used to reopen prose-zone quotes that sit immediately after As X explained / X said,.
 */
export const adjacentSpeechFrame = ({ pageText, quote, maxGap = 200 }) => {
  const before = leftContextBeforeQuote(pageText, quote);
  if (!before) return null;
  const frames = collectFrameCandidates(before)
    .filter((frame) => looksLikePersonSurface(frame.surface) || isJointSpeakerSurface(frame.surface));
  if (!frames.length) return null;
  const nearest = frames.reduce((best, frame) => (!best || frame.index >= best.index ? frame : best), null);
  const gap = before.length - nearest.end;
  if (gap < 0 || gap > maxGap) return null;
  // Fail closed across paragraph breaks (citation sticky FPs).
  const between = before.slice(nearest.end);
  if (/\n\s*\n/u.test(between)) return null;
  return { ...nearest, gap };
};

/**
 * Resolve the speaker of a quote from left-context speech frames only.
 *
 * @returns {{
 *   status: 'resolved'|'ambiguous'|'none',
 *   reason: string,
 *   resolution_source: string|null,
 *   person: object|null,
 *   surface: string|null,
 *   frame: string|null,
 * }}
 */
export const resolveQuoteSpeaker = ({ quote, pageText, people = [] }) => {
  const candidates = (people ?? []).filter((person) => !isRoleLabel(person?.name_en));
  if (!normalizeWs(quote)) {
    return {
      status: 'none', reason: 'empty_quote', resolution_source: null, person: null, surface: null, frame: null,
    };
  }

  const before = leftContextBeforeQuote(pageText, quote);
  const frames = collectFrameCandidates(before)
    .filter((frame) => looksLikePersonSurface(frame.surface) || isJointSpeakerSurface(frame.surface) || NON_PERSON_FRAME_RE.test(frame.surface));
  if (!frames.length) {
    return {
      status: 'none',
      reason: 'no_speech_frame',
      resolution_source: null,
      person: null,
      surface: null,
      frame: null,
    };
  }

  // Nearest frame to the quote wins for inspection.
  const nearest = frames.reduce((best, frame) => (!best || frame.index >= best.index ? frame : best), null);

  if (NON_PERSON_FRAME_RE.test(nearest.surface)) {
    return {
      status: 'none',
      reason: 'non_person_frame',
      resolution_source: 'speech_frame',
      person: null,
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }

  if (isJointSpeakerSurface(nearest.surface)) {
    return {
      status: 'ambiguous',
      reason: 'joint_speakers',
      resolution_source: 'speech_frame',
      person: null,
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }

  if (!looksLikePersonSurface(nearest.surface)) {
    return {
      status: 'none',
      reason: 'no_speech_frame',
      resolution_source: null,
      person: null,
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }

  // Apply possessive gloss stripping when matching aliases ("Vilmos’ recollections" → Vilmos).
  const matchSurface = stripTitles(String(nearest.surface ?? '').replace(POSSESSIVE_GLOSS_RE, '').replace(/\s+and$/iu, ''));

  const matches = [];
  for (const person of candidates) {
    const aliases = personAliases(person);
    if (aliasMatchesSpeaker(aliases, matchSurface || nearest.surface)) matches.push(person);
  }

  if (matches.length === 1) {
    return {
      status: 'resolved',
      reason: 'speech_frame_person',
      resolution_source: 'speech_frame',
      person: matches[0],
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'multiple_person_matches',
      resolution_source: 'speech_frame',
      person: null,
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }

  // Fail-closed page expansion: surname-only frame ("Székely") → unique fuller
  // name earlier on the page ("Professor Gábor Székely"), then rematch or mint.
  const expanded = expandSpeakerSurfaceFromPage(before, matchSurface || nearest.surface);
  if (expanded) {
    const expandedMatches = [];
    for (const person of candidates) {
      const aliases = personAliases(person);
      if (aliasMatchesSpeaker(aliases, expanded)) expandedMatches.push(person);
    }
    if (expandedMatches.length === 1) {
      return {
        status: 'resolved',
        reason: 'speech_frame_person',
        resolution_source: 'speech_frame_page',
        person: expandedMatches[0],
        surface: nearest.surface,
        frame: nearest.matched,
      };
    }
    if (expandedMatches.length > 1) {
      return {
        status: 'ambiguous',
        reason: 'multiple_person_matches',
        resolution_source: 'speech_frame_page',
        person: null,
        surface: nearest.surface,
        frame: nearest.matched,
      };
    }
    return {
      status: 'resolved',
      reason: 'speech_frame_page_name',
      resolution_source: 'speech_frame_page',
      person: {
        name_en: expanded,
        source_name: expanded,
        role_en: null,
        years_hint: null,
        quote: null,
      },
      surface: nearest.surface,
      frame: nearest.matched,
    };
  }

  return {
    status: 'none',
    reason: 'frame_person_unmatched',
    resolution_source: 'speech_frame',
    person: null,
    surface: nearest.surface,
    frame: nearest.matched,
  };
};

/**
 * Expand a short speech-frame surface using a unique fuller name in left context.
 * Only accepts multi-token names whose last token equals the surface surname.
 */
export const expandSpeakerSurfaceFromPage = (beforeText, surface) => {
  const surname = foldPersonKey(stripTitles(surface));
  if (!surname || /\s/.test(surname)) return null;
  const hay = String(beforeText ?? '');
  if (!hay) return null;
  const re = new RegExp(
    String.raw`(?:(?:Prof(?:essor)?|Dr|Mr|Mrs|Ms)\.?\s+)?([\p{L}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){1,2})`,
    'giu',
  );
  const hits = new Map();
  let match;
  while ((match = re.exec(hay)) != null) {
    const raw = stripTitles(match[1]);
    if (!looksLikePersonSurface(raw)) continue;
    const folded = foldPersonKey(raw);
    const parts = folded.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.at(-1) !== surname) continue;
    hits.set(folded, normalizeWs(raw));
  }
  if (hits.size !== 1) return null;
  return [...hits.values()][0];
};

const personPayload = (person) => ({
  name_en: person.name_en,
  source_name: person.source_name ?? null,
  role_en: person.role_en ?? null,
  years_hint: person.years_hint ?? null,
  quote: person.quote ?? null,
});

const lastNamedPersonBefore = (before, people) => {
  let antecedent = null;
  let bestPos = -1;
  let bestLen = 0;
  for (const person of people) {
    for (const alias of personAliases(person)) {
      const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'giu');
      let match;
      while ((match = re.exec(before)) != null) {
        const better = match.index > bestPos
          || (match.index === bestPos && alias.length > bestLen);
        if (better) {
          bestPos = match.index;
          bestLen = alias.length;
          antecedent = person;
        }
      }
    }
  }
  return antecedent;
};

/**
 * Build clickable entity spans for a quote (names + speaker first-person +
 * third-person from prior named person — never speaker-collapsed onto he/him).
 */
export const buildQuoteEntityLinks = ({ quote, pageText, people = [], speakerAttribution = null }) => {
  if (!normalizeWs(quote)) return [];
  const candidates = (people ?? []).filter((person) => !isRoleLabel(person?.name_en));
  if (!candidates.length) return [];

  const links = [];
  const occupied = [];
  const overlaps = (start, end) => occupied.some(([a, b]) => start < b && end > a);
  const claim = (start, end, link) => {
    if (start < 0 || end <= start || overlaps(start, end)) return;
    occupied.push([start, end]);
    links.push(link);
  };

  // 1) Explicit names in the quote.
  const aliasSpecs = [];
  for (const person of candidates) {
    for (const alias of personAliases(person)) aliasSpecs.push({ alias, person });
  }
  aliasSpecs.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, person } of aliasSpecs) {
    const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'giu');
    let match;
    while ((match = re.exec(quote)) != null) {
      claim(match.index, match.index + match[0].length, {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        kind: 'person_name',
        person: personPayload(person),
      });
    }
  }

  const attribution = speakerAttribution ?? resolveQuoteSpeaker({ quote, pageText, people: candidates });
  const before = leftContextBeforeQuote(pageText, quote);

  // 2) Speech-frame speaker → first-person only (fail-closed).
  if (attribution.status === 'resolved' && attribution.person) {
    FIRST_PERSON_RE.lastIndex = 0;
    let match;
    while ((match = FIRST_PERSON_RE.exec(quote)) != null) {
      claim(match.index, match.index + match[0].length, {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        kind: 'speaker_pronoun',
        person: personPayload(attribution.person),
      });
    }
    links.unshift({
      start: -1,
      end: -1,
      text: attribution.person.name_en,
      kind: 'speaker',
      person: personPayload(attribution.person),
      speaker_status: attribution.status,
      speaker_reason: attribution.reason,
      speaker_resolution_source: attribution.resolution_source,
      speaker_surface: attribution.surface,
    });
  }

  // 3) Third-person → last named person in left context.
  //    Never collapse he/him onto the speech-frame speaker.
  const antecedent = lastNamedPersonBefore(before, candidates);
  if (antecedent) {
    const speakerKey = attribution.status === 'resolved' ? foldPersonKey(attribution.person?.name_en) : null;
    const antecedentKey = foldPersonKey(antecedent.name_en);
    // If the only nearby name is the speaker, still do not map he/him to speaker
    // inside a first-person quote (speaker voice ≠ described third person).
    const skipThird = speakerKey && antecedentKey === speakerKey;
    if (!skipThird) {
      THIRD_PERSON_RE.lastIndex = 0;
      let match;
      while ((match = THIRD_PERSON_RE.exec(quote)) != null) {
        claim(match.index, match.index + match[0].length, {
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          kind: 'pronoun',
          person: personPayload(antecedent),
        });
      }
    }
  }

  return links.sort((a, b) => {
    if (a.kind === 'speaker' && b.kind !== 'speaker') return -1;
    if (b.kind === 'speaker' && a.kind !== 'speaker') return 1;
    return a.start - b.start;
  });
};
