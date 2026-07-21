import crypto from 'node:crypto';

export const HISTORICAL_V2_SCHEMA_VERSION = 'historical-items-v2';
export const HISTORICAL_V2_PROMPT_VERSION = 'historical-semi-open-v2.12';

export const ASSERTION_KINDS = new Set(['state', 'rule_custom', 'relationship', 'belief_report', 'description']);
export const ITEM_KINDS = new Set(['event', 'assertion']);
export const POLARITIES = new Set(['affirmed', 'negated']);
export const MODALITIES = new Set(['asserted', 'reported', 'believed', 'planned', 'hypothetical', 'uncertain']);
export const DISPOSITIONS = new Set(['covered', 'background_only', 'reference_only', 'ambiguous']);
export const VERDICTS = new Set(['supported', 'partially_supported', 'unsupported', 'ambiguous', 'contradicted_by_evidence']);

export const SCHEMA_REGISTRY = {
  construction: { description: 'construction, opening, design, commissioning of a building', keywords: ['built', 'constructed', 'designed', 'opened', 'commissioned'], types: ['building', 'work', 'person', 'organisation'] },
  alteration_or_demolition: { description: 'alteration, rebuilding, destruction, closure, relocation', keywords: ['altered', 'renovated', 'rebuilt', 'demolished', 'destroyed', 'closed', 'moved'], types: ['building', 'place'] },
  ownership_or_tenancy_change: { description: 'purchase, sale, inheritance, lease, tenancy or takeover', keywords: ['owned', 'bought', 'sold', 'rented', 'leased', 'inherited', 'took over'], types: ['person', 'family', 'business', 'building'] },
  business_operation: { description: 'business opening, operation, closure, trade or commercial activity', keywords: ['business', 'shop', 'café', 'cafe', 'factory', 'traded', 'operated'], types: ['business', 'person', 'organisation', 'building'] },
  residence: { description: 'a person or family residing or dwelling at a place', keywords: ['resided', 'dwelt', 'lived', 'home', 'residence'], types: ['person', 'family', 'place', 'building'] },
  birth_or_death: { description: 'birth, death, killing or burial', keywords: ['born', 'died', 'death', 'killed', 'buried'], types: ['person', 'date', 'place'] },
  appointment_or_employment: { description: 'appointment, election, employment, office or professional role', keywords: ['appointed', 'elected', 'employed', 'worked', 'served', 'became', 'professor', 'rabbi'], types: ['person', 'organisation', 'business'] },
  invitation_or_acceptance: { description: 'invitation, acceptance, rejection or refusal', keywords: ['invited', 'invitation', 'accepted', 'rejected', 'refused'], types: ['person', 'organisation', 'place'] },
  organisation_founding_or_dissolution: { description: 'founding, formation, reorganisation or dissolution of an organisation', keywords: ['founded', 'established', 'formed', 'organized', 'organised', 'reorganized', 'dissolved'], types: ['organisation', 'person', 'place'] },
  publication_or_creation: { description: 'writing, publication, printing, composition, artwork or performance creation', keywords: ['wrote', 'printed', 'published', 'created', 'composed', 'painted', 'book'], types: ['work', 'person', 'organisation', 'date'] },
  migration_or_journey: { description: 'physical travel, migration, arrival, departure or return', keywords: ['travelled', 'traveled', 'journey', 'arrived', 'left', 'returned', 'fled', 'settled'], types: ['person', 'family', 'group', 'place'] },
  law_prohibition_or_permission: { description: 'law, prohibition, permission, restriction or official licence', keywords: ['law', 'prohibited', 'forbidden', 'allowed', 'permitted', 'licence', 'license', 'customary'], types: ['organisation', 'group', 'place'] },
  attack_persecution_or_rescue: { description: 'attack, persecution, deportation, killing, protection or rescue', keywords: ['attacked', 'persecuted', 'deported', 'killed', 'rescued', 'saved', 'protected'], types: ['person', 'family', 'group', 'organisation', 'event'] },
  commemoration: { description: 'commemoration, memorial, dedication, naming or remembrance', keywords: ['commemorated', 'memorial', 'dedicated', 'named after', 'tomb'], types: ['person', 'group', 'place', 'building', 'work'] },
  religious_conversion_or_affiliation: { description: 'religious conversion, affiliation, following or opposition to a movement', keywords: ['converted', 'conversion', 'follower', 'followed', 'joined', 'opponent', 'messiah'], types: ['person', 'group', 'movement', 'organisation'] },
  religious_practice_or_transgression: { description: 'religious observance, prayer, ritual, custom or transgression', keywords: ['prayed', 'prayers', 'worshipped', 'fasted', 'sabbath', 'ritual', 'custom', 'precepts'], types: ['person', 'group', 'movement', 'place'] },
  disaster_or_rescue: { description: 'flood, epidemic, fire or other disaster and associated rescue', keywords: ['flood', 'epidemic', 'cholera', 'fire', 'disaster', 'rescue'], types: ['event', 'person', 'group', 'place', 'date'] },
  civic_decision_or_legislation: { description: 'petition, civic decision, parliamentary act, decree or rights change', keywords: ['petition', 'diet', 'parliament', 'act', 'decree', 'decision', 'rights'], types: ['organisation', 'group', 'place', 'date'] },
  performance_or_exhibition: { description: 'performance, concert, play, exhibition or premiere', keywords: ['performed', 'play', 'concert', 'exhibited', 'staged', 'premiere'], types: ['person', 'organisation', 'work', 'place'] },
};

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const foldText = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const normalizeOpenType = (value) => foldText(value).replace(/\s+/g, '_').slice(0, 80);

const MATCH_STOPWORDS = new Set(['the', 'and', 'that', 'this', 'his', 'her', 'was', 'were', 'with', 'from', 'into', 'during', 'after', 'before', 'their', 'they', 'him', 'had', 'has', 'have', 'for', 'but']);
const contentTokens = (text) => new Set((String(text).toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [])
  .filter((token) => !MATCH_STOPWORDS.has(token))
  .map((token) => token.length > 5 ? token.replace(/(?:ing|ed|es|s)$/u, '') : token));

export const semanticTokenOverlap = (left, right) => {
  const leftTokens = contentTokens(left);
  const rightTokens = contentTokens(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
};

/** Negation / polarity cues — check raw text so apostrophe folding cannot hide n't. */
export const statementHasNegation = (text) => {
  const raw = String(text ?? '');
  if (/\b(?:not|never|no|without|neither|nor|cannot|can't|didn't|don't|doesn't|isn't|wasn't|weren't|hasn't|haven't|hadn't|won't|wouldn't|couldn't|shouldn't|failed\s+to|unable\s+to|no\s+longer)\b/iu.test(raw)) return true;
  if (/\b\w+n't\b/iu.test(raw)) return true;
  const folded = foldText(raw);
  return /\b(?:not|never|no|without|neither|nor|cannot|cant|didn|don|doesn|isn|wasn|weren|hasn|haven|hadn|won|wouldn|couldn|shouldn|failed to|unable to|no longer)\b/iu.test(folded);
};

/** Token-boundary antonym lemmas (not substring regex — avoids illegal⊃legal). */
const ANTONYM_LEMMAS = [
  ['permit', 'prohibit'],
  ['allow', 'forbid'],
  ['open', 'close'],
  ['settle', 'expel'],
  ['include', 'exclude'],
  ['accept', 'reject'],
  ['build', 'demolish'],
  ['create', 'destroy'],
  ['arrive', 'leave'],
  ['enter', 'exit'],
  ['rise', 'fall'],
  ['gain', 'lose'],
  ['alive', 'dead'],
  ['public', 'private'],
  ['legal', 'illegal'],
  ['build', 'demolish'],
  ['create', 'destroy'],
];

const lemmaTokens = (text) => {
  const raw = foldText(text).split(/\s+/u).filter(Boolean);
  return new Set(raw.map((token) => {
    if (token === 'opened' || token === 'opening') return 'open';
    if (token === 'closed' || token === 'closing') return 'close';
    if (token === 'entered' || token === 'entering') return 'enter';
    if (token === 'exited' || token === 'exiting') return 'exit';
    if (token === 'permitted' || token === 'permitting') return 'permit';
    if (token === 'prohibited' || token === 'prohibiting') return 'prohibit';
    if (token === 'allowed' || token === 'allowing') return 'allow';
    if (token === 'forbidden' || token === 'forbidding') return 'forbid';
    if (token === 'settled' || token === 'settling') return 'settle';
    if (token === 'expelled' || token === 'expelling') return 'expel';
    if (token === 'built' || token === 'building') return 'build';
    if (token === 'demolished' || token === 'demolishing') return 'demolish';
    if (token === 'created' || token === 'creating') return 'create';
    if (token === 'destroyed' || token === 'destroying') return 'destroy';
    if (token.length > 5) return token.replace(/(?:ing|ed|es|s)$/u, '');
    return token;
  }));
};

export const statementsContradictPredicates = (left, right) => {
  const a = lemmaTokens(left);
  const b = lemmaTokens(right);
  const stop = new Set(['the', 'and', 'that', 'this', 'was', 'were', 'with', 'from', 'into', 'they', 'them', 'their', 'for', 'but', 'not', 'are', 'who', 'which', 'had', 'has', 'have']);
  const sharedContent = [...a].filter((token) => b.has(token) && !stop.has(token) && token.length >= 3);
  for (const [pos, neg] of ANTONYM_LEMMAS) {
    if (((a.has(pos) && b.has(neg)) || (a.has(neg) && b.has(pos))) && sharedContent.length >= 1) return true;
  }
  return false;
};

export const statementsSamePolarity = (left, right) => {
  if (statementHasNegation(left) !== statementHasNegation(right)) return false;
  if (statementsContradictPredicates(left, right)) return false;
  return true;
};

export const realignModelItemsToClauses = ({ items, availableClauses, allClauses }) => {
  const clauseById = new Map(allClauses.map((clause) => [clause.clause_id, clause]));
  return items.map((item) => {
    const originalPage = clauseById.get(item.clause_ids?.[0])?.page_ref;
    const candidates = availableClauses.filter((clause) => originalPage === undefined || clause.page_ref === originalPage);
    const ranked = candidates.map((clause) => ({ clause, score: semanticTokenOverlap(item.statement_en, clause.text) }))
      .sort((left, right) => right.score - left.score || left.clause.start_offset - right.clause.start_offset);
    const originalScore = Math.max(0, ...(item.clause_ids ?? []).map((id) => semanticTokenOverlap(item.statement_en, clauseById.get(id)?.text ?? '')));
    const best = ranked[0];
    if (!best || best.score < 0.45 || best.score < originalScore + 0.15) return item;
    // A fact often straddles two adjacent clauses (name in one, predicate in
    // the next); keep the neighbor when it also carries real overlap.
    const ordered = candidates.slice().sort((left, right) => left.start_offset - right.start_offset);
    const bestIndex = ordered.findIndex((clause) => clause.clause_id === best.clause.clause_id);
    const neighbor = [ordered[bestIndex - 1], ordered[bestIndex + 1]].filter(Boolean)
      .map((clause) => ({ clause, score: semanticTokenOverlap(item.statement_en, clause.text) }))
      .filter((entry) => entry.score >= 0.3)
      .sort((left, right) => right.score - left.score)[0];
    return { ...item, clause_ids: neighbor ? [best.clause.clause_id, neighbor.clause.clause_id] : [best.clause.clause_id] };
  });
};

export const parseHistoricalPages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const trimMappedSpan = (readingText, start, end) => {
  let left = start;
  let right = end;
  while (left < right && /\s/u.test(readingText[left])) left += 1;
  while (right > left && /\s/u.test(readingText[right - 1])) right -= 1;
  return [left, right];
};

// Single-capital initials ("R." before almost every rabbi name in this
// corpus) and common abbreviations are not sentence ends; splitting there
// fragmented names mid-clause ("His son, R." | "Judah...").
const ABBREVIATION_END = /(?:\b[A-Z]|\b(?:Dr|Mr|Mrs|Ms|St|Prof|ca|cf|vs|Jr|Sr))\.$/u;
const QUOTE_SPAN_PATTERN = /[“"][^”"]*[”"]|[‘'][^’']*[’']/gu;

/** Inclusive [start, end) ranges for quoted spans in a sentence. */
export const quoteSpansInText = (text) => [...String(text).matchAll(QUOTE_SPAN_PATTERN)]
  .map((match) => [match.index, match.index + match[0].length]);

const indexInsideQuote = (index, spans) => spans.some(([start, end]) => index >= start && index < end);

const sentenceSpans = (readingText) => {
  const raw = Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(readingText))
    .map((segment) => trimMappedSpan(readingText, segment.index, segment.index + segment.segment.length))
    .filter(([start, end]) => end - start >= 2);
  const merged = [];
  for (const span of raw) {
    const previous = merged.at(-1);
    if (previous && ABBREVIATION_END.test(readingText.slice(previous[0], previous[1]))) previous[1] = span[1];
    else merged.push([...span]);
  }
  return merged;
};

const clauseBoundaries = (sentenceText) => {
  const cuts = [0];
  const quoteSpans = quoteSpansInText(sentenceText);
  const chronologyLabel = /(?:^|\s)(?:c\.\s*)?(?:1[5-9]\d{2}|20\d{2})(?:\s*[–-]\s*\d{2,4})?\s*:/giu;
  const protectedColons = new Set([...sentenceText.matchAll(chronologyLabel)].map((match) => match.index + match[0].lastIndexOf(':')));
  const pattern = /[;:]\s+|\s+[—–]\s+|\s+(?=(?:but|while|whereas|although|however|therefore|nevertheless)\b)/giu;
  for (const match of sentenceText.matchAll(pattern)) {
    // A chronology label belongs to its event. Splitting `1827:` into a
    // standalone clause made the verifier reject otherwise grounded entries.
    if (match[0].startsWith(':') && protectedColons.has(match.index)) continue;
    // Never split inside a quotation (Maimonides exhortations became five
    // one-line "events" when colons/semicolons inside quotes were cuts).
    if (indexInsideQuote(match.index, quoteSpans)) continue;
    cuts.push(match.index + match[0].length);
  }
  // OCR frequently collapses a timeline into one line: `1827: ... 1830: ...`.
  // Start a new clause at later labels, never between a label and its content.
  for (const match of sentenceText.matchAll(chronologyLabel)) {
    const start = match.index + (match[0].match(/^\s*/u)?.[0].length ?? 0);
    if (start > 0 && !indexInsideQuote(start, quoteSpans)) cuts.push(start);
  }
  cuts.push(sentenceText.length);
  return [...new Set(cuts)].sort((a, b) => a - b);
};

const clauseZone = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return 'body';
  const quoted = quoteSpansInText(trimmed).reduce((sum, [start, end]) => sum + (end - start), 0);
  return quoted / trimmed.length >= 0.5 ? 'quote' : 'body';
};

const explicitSpeakerFromPrior = (priorText, mentions) => {
  if (!priorText || !/\b(?:said|says|wrote|writes|exclaimed|declared|according to)\b/iu.test(priorText)) return null;
  const people = mentions.filter((mention) => mention.type === 'person' || mention.type === 'family');
  return people.at(-1)?.mention_id ?? null;
};

const explicitSpeakerForClause = ({ text, startOffset, priorText, pageMentions }) => {
  const spans = quoteSpansInText(text);
  if (!spans.length) return null;
  const fromPrior = explicitSpeakerFromPrior(priorText, pageMentions.filter((mention) => mention.end_offset <= startOffset));
  if (fromPrior) return fromPrior;
  // Inline attribution in the same clause: `R. Efraim said “Return…”`.
  if (!/\b(?:said|says|wrote|writes|exclaimed|declared|according to)\b/iu.test(text.slice(0, spans[0][0]))) return null;
  const quoteStart = startOffset + spans[0][0];
  const people = pageMentions.filter((mention) => (mention.type === 'person' || mention.type === 'family')
    && mention.end_offset <= quoteStart);
  return people.at(-1)?.mention_id ?? null;
};

const ocrNoise = (text) => {
  const visible = [...text].filter((char) => !/\s/u.test(char));
  if (visible.length < 12) return false;
  const odd = visible.filter((char) => !/[\p{L}\p{N}.,;:'’"“”!?()\[\]\/\-–—]/u.test(char)).length;
  return odd / visible.length > 0.08 || /(?:\b\w{1,2}-\s+\w{1,2}\b|[|]{2,}|[_]{2,}|\p{L}{2,}\d+\p{L}*\b)/u.test(text);
};

export const localRiskFlags = ({ text, mentions, first, last }) => {
  const flags = [];
  const types = new Set(mentions.map((mention) => mention.type));
  if (types.has('event')) flags.push('local_event_nugget');
  if (types.has('date') && [...types].some((type) => type !== 'date')) flags.push('date_with_entity');
  if (/\b(?:not|never|no longer|without|forbid|prohibit|refus|reject|could not|did not)\b/iu.test(text)) flags.push('negation');
  if (/\b(?:might|may|could|would|planned|prepared|intended|probably|perhaps|alleged)\b/iu.test(text)) flags.push('modality');
  if (/\b(?:said|reported|claimed|believed|according to|tradition|legend|recalled)\b/iu.test(text)) flags.push('attribution');
  if (/^(?:he|she|they|his|her|their|this|that|the former|the latter)\b/iu.test(text.trim())) flags.push('unresolved_reference');
  if (/\b(?:but|although)\s+he\b|\bfor instance,\s+he\b|^in his\b/iu.test(text.trim())) flags.push('contextual_reference');
  if (first && /^\p{Ll}/u.test(text.trim())) flags.push('cross_page_continuation');
  if (text.length > 350) flags.push('long_clause');
  if (ocrNoise(text)) flags.push('ocr_noise');
  if (first || last) flags.push('page_boundary');
  return flags;
};

export const retrieveSchemas = (text, mentions, limit = 8) => {
  const folded = foldText(text);
  const types = new Set(mentions.map((mention) => mention.type));
  return Object.entries(SCHEMA_REGISTRY).map(([name, schema]) => {
    const keywordScore = schema.keywords.reduce((score, keyword) => score + (folded.includes(foldText(keyword)) ? 4 : 0), 0);
    const typeScore = schema.types.reduce((score, type) => score + (types.has(type) ? 1 : 0), 0);
    return { name, score: keywordScore + typeScore };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit).map((item) => item.name);
};

export const assignMentionIds = (sourceId, mentions) => mentions.map((mention) => ({
  ...mention,
  mention_id: mention.mention_id ?? `m_${sha256(`${sourceId}\u001f${mention.page}\u001f${mention.start_offset}\u001f${mention.end_offset}\u001f${mention.type}\u001f${mention.text}`).slice(0, 20)}`,
}));

export const buildClauseLedger = ({ sourceId, targetPages, readingPages, mentions }) => {
  const sourceByPage = new Map(targetPages.map((page) => [page.page, page]));
  const readingByPage = new Map(readingPages.map((page) => [page.page, page]));
  const clauses = [];
  for (const sourcePage of targetPages) {
    const readingPage = readingByPage.get(sourcePage.page);
    if (!readingPage?.text || !Array.isArray(readingPage.raw_starts) || !Array.isArray(readingPage.raw_ends)) continue;
    const rawClauses = [];
    for (const [sentenceStart, sentenceEnd] of sentenceSpans(readingPage.text)) {
      const sentenceText = readingPage.text.slice(sentenceStart, sentenceEnd);
      const cuts = clauseBoundaries(sentenceText);
      for (let index = 0; index < cuts.length - 1; index += 1) {
        const [localStart, localEnd] = trimMappedSpan(sentenceText, cuts[index], cuts[index + 1]);
        const readingStart = sentenceStart + localStart;
        const readingEnd = sentenceStart + localEnd;
        if (readingEnd - readingStart < 2 || readingEnd > readingPage.raw_ends.length) continue;
        rawClauses.push({ readingStart, readingEnd });
      }
    }
    rawClauses.forEach(({ readingStart, readingEnd }, index) => {
      const startOffset = readingPage.raw_starts[readingStart];
      const endOffset = readingPage.raw_ends[readingEnd - 1];
      const clauseMentions = mentions.filter((mention) => mention.page === sourcePage.page
        && mention.start_offset < endOffset && mention.end_offset > startOffset);
      const text = readingPage.text.slice(readingStart, readingEnd);
      const priorText = index > 0
        ? readingPage.text.slice(rawClauses[index - 1].readingStart, rawClauses[index - 1].readingEnd)
        : '';
      const zone = clauseZone(text);
      const pageMentions = mentions.filter((mention) => mention.page === sourcePage.page);
      const speakerMentionId = (zone === 'quote' || quoteSpansInText(text).length)
        ? explicitSpeakerForClause({ text, startOffset, priorText, pageMentions })
        : null;
      const riskFlags = localRiskFlags({ text, mentions: clauseMentions, first: index === 0, last: index === rawClauses.length - 1 });
      if (zone === 'quote' || quoteSpansInText(text).length) riskFlags.push('quoted_span');
      clauses.push({
        clause_id: `cl_${sha256(`${sourceId}\u001f${sourcePage.page}\u001f${startOffset}\u001f${endOffset}`).slice(0, 20)}`,
        page_ref: sourcePage.page,
        start_offset: startOffset,
        end_offset: endOffset,
        text,
        source_quote: sourceByPage.get(sourcePage.page).text.slice(startOffset, endOffset),
        zone: zone === 'body' && quoteSpansInText(text).length ? 'quote' : zone,
        speaker_mention_id: speakerMentionId,
        mention_ids: clauseMentions.map((mention) => mention.mention_id),
        suggested_schemas: retrieveSchemas(text, clauseMentions),
        allow_other: true,
        risk_flags: riskFlags,
        item_ids: [],
        disposition: 'ambiguous',
        audit_status: 'pending',
      });
    });
  }
  return clauses;
};

export const boundaryContextForPage = (allPages, pageNumber) => {
  const byPage = new Map(allPages.map((page) => [page.page, page.text]));
  const previous = byPage.get(pageNumber - 1) ?? '';
  const next = byPage.get(pageNumber + 1) ?? '';
  const paragraphs = (text) => text.split(/\n\s*\n/u).map((value) => value.trim()).filter(Boolean);
  const previousParagraph = paragraphs(previous).at(-1) ?? null;
  const nextParagraph = paragraphs(next)[0] ?? null;
  return {
    previous_page_last_paragraph: previousParagraph ? previousParagraph.slice(-700) : null,
    next_page_first_paragraph: nextParagraph ? nextParagraph.slice(0, 700) : null,
  };
};

const cleanString = (value, maximum = 500) => typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
const cleanNullableString = (value, maximum = 300) => value === null || value === undefined ? null : cleanString(value, maximum);

export const normalizeModelItems = ({ rawItems, clauses, mentions, sourceId, discoverySource }) => {
  const byClause = new Map(clauses.map((clause) => [clause.clause_id, clause]));
  const byMention = new Map(mentions.map((mention) => [mention.mention_id, mention]));
  return (Array.isArray(rawItems) ? rawItems : []).flatMap((raw) => {
    const kind = ITEM_KINDS.has(raw?.kind) ? raw.kind : null;
    const assertionKind = kind === 'assertion' && ASSERTION_KINDS.has(raw?.assertion_kind) ? raw.assertion_kind : null;
    const clauseIds = [...new Set((Array.isArray(raw?.clause_ids) ? raw.clause_ids : []).filter((id) => byClause.has(id)))];
    const openType = normalizeOpenType(raw?.open_type);
    const statement = cleanString(raw?.statement_en);
    if (!kind || (kind === 'assertion' && !assertionKind) || !clauseIds.length || !openType || !statement) return [];
    const canonicalType = typeof raw?.canonical_type === 'string' && SCHEMA_REGISTRY[raw.canonical_type] ? raw.canonical_type : null;
    const evidencePages = new Set(clauseIds.map((id) => byClause.get(id).page_ref));
    const allowedMentionIds = new Set([
      ...clauseIds.flatMap((id) => byClause.get(id).mention_ids),
      ...mentions.filter((mention) => [...evidencePages].some((page) => Math.abs(mention.page - page) <= 1)).map((mention) => mention.mention_id),
    ]);
    const participants = (Array.isArray(raw?.participants) ? raw.participants : []).flatMap((participant) => {
      const mention = byMention.get(participant?.mention_id);
      const role = cleanString(participant?.role, 80);
      if (!mention || !role || !allowedMentionIds.has(mention.mention_id)) return [];
      return [{ mention_id: mention.mention_id, role: normalizeOpenType(role), resolved_entity_id: cleanNullableString(participant?.resolved_entity_id, 160) }];
    });
    const dynamicAttributes = (Array.isArray(raw?.dynamic_attributes) ? raw.dynamic_attributes : []).flatMap((attribute) => {
      const name = normalizeOpenType(attribute?.name);
      const value = cleanString(attribute?.value, 300);
      const evidenceClauseIds = [...new Set((Array.isArray(attribute?.evidence_clause_ids) ? attribute.evidence_clause_ids : []).filter((id) => clauseIds.includes(id)))];
      return name && value && evidenceClauseIds.length ? [{ name, value, evidence_clause_ids: evidenceClauseIds }] : [];
    });
    const evidence = clauseIds.map((id) => {
      const clause = byClause.get(id);
      return { page_ref: clause.page_ref, start_offset: clause.start_offset, end_offset: clause.end_offset, quote: clause.source_quote };
    });
    const normalized = {
      kind,
      assertion_kind: assertionKind,
      open_type: openType,
      canonical_type: canonicalType,
      statement_en: statement,
      clause_ids: clauseIds,
      participants,
      time: cleanNullableString(raw?.time),
      place: cleanNullableString(raw?.place),
      polarity: POLARITIES.has(raw?.polarity) ? raw.polarity : 'affirmed',
      modality: MODALITIES.has(raw?.modality) ? raw.modality : 'asserted',
      attribution: cleanNullableString(raw?.attribution),
      dynamic_attributes: dynamicAttributes,
      evidence,
      corefers_with: [],
      relations: [],
      discovery_sources: [discoverySource],
      publication_status: 'private',
    };
    return [{ item_id: `hi_${sha256(`${sourceId}\u001f${JSON.stringify(normalized)}`).slice(0, 20)}`, ...normalized }];
  });
};

export const dedupeHistoricalItems = (items) => {
  const selected = new Map();
  const merge = (left, right) => {
    // Prefer the more specific statement when one clearly contains the other.
    const leftText = String(left.statement_en ?? '');
    const rightText = String(right.statement_en ?? '');
    const preferRight = rightText.length > leftText.length + 12
      && semanticTokenOverlap(leftText, rightText) >= 0.7;
    const base = preferRight ? right : left;
    const other = preferRight ? left : right;
    return {
      ...base,
      clause_ids: [...new Set([...base.clause_ids, ...other.clause_ids])],
      participants: [...new Map([...base.participants, ...other.participants].map((participant) => [`${participant.mention_id}\u001f${participant.role}`, participant])).values()],
      evidence: [...new Map([...base.evidence, ...other.evidence].map((evidence) => [`${evidence.page_ref}\u001f${evidence.start_offset}\u001f${evidence.end_offset}`, evidence])).values()],
      corefers_with: [...new Set([...(base.corefers_with ?? []), ...(other.corefers_with ?? [])])],
      discovery_sources: [...new Set([...(base.discovery_sources ?? []), ...(other.discovery_sources ?? [])])],
    };
  };
  const nearby = (left, right) => left.evidence.some((a) => right.evidence.some((b) => a.page_ref === b.page_ref && Math.abs(a.start_offset - b.start_offset) <= 420));
  const contained = (left, right) => {
    const leftTokens = contentTokens(left.statement_en);
    const rightTokens = contentTokens(right.statement_en);
    if (!leftTokens.size || !rightTokens.size) return false;
    const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
    const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
    if (smaller.size < 2) return false;
    return [...smaller].every((token) => larger.has(token));
  };
  for (const item of items) {
    const key = `${item.kind}\u001f${item.assertion_kind ?? ''}\u001f${item.open_type}\u001f${item.clause_ids.join(',')}\u001f${foldText(item.statement_en)}`;
    const previous = selected.get(key);
    if (previous) { selected.set(key, merge(previous, item)); continue; }
    const nearKey = [...selected.entries()].find(([, candidate]) => candidate.kind === item.kind
      && candidate.assertion_kind === item.assertion_kind
      && statementsSamePolarity(candidate.statement_en, item.statement_en)
      && nearby(candidate, item)
      && (
        semanticTokenOverlap(candidate.statement_en, item.statement_en) >= 0.75
        || contained(candidate, item)
      ))?.[0];
    if (nearKey) selected.set(nearKey, merge(selected.get(nearKey), item));
    else selected.set(key, item);
  }
  return [...selected.values()];
};

/**
 * Keep one item per identical (kind, assertion_kind, open/canonical type,
 * clause_id set) when statements are near-paraphrases with the same polarity.
 * Opposite polarity ("settled" vs "did not settle") and distinct facts that
 * only share a clause id are kept separate.
 */
export const collapseClauseSiblingItems = (items, { supportedOnly = true, minOverlap = 0.68 } = {}) => {
  const score = (item) => {
    const statement = String(item.statement_en ?? '');
    const year = /\b(?:1[5-9]\d{2}|20[0-2]\d)\b/u.test(statement) ? 20 : 0;
    const place = /\b(?:Buda|Pest|Budapest|Óbuda|Obuda|Jews?|Jewish|R\.)\b/u.test(statement) ? 10 : 0;
    return statement.length + year + place;
  };
  const contained = (left, right) => {
    const leftTokens = contentTokens(left);
    const rightTokens = contentTokens(right);
    if (!leftTokens.size || !rightTokens.size) return false;
    const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
    const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
    if (smaller.size < 2) return false;
    return [...smaller].every((token) => larger.has(token));
  };
  const isParaphrase = (left, right) => statementsSamePolarity(left, right)
    && (semanticTokenOverlap(left, right) >= minOverlap || contained(left, right));
  const keyFor = (item) => {
    const clauseKey = [...(item.clause_ids ?? [])].sort().join('\u001f');
    if (!clauseKey) return null;
    return [
      item.kind,
      item.assertion_kind ?? '',
      item.open_type ?? '',
      item.canonical_type ?? '',
      clauseKey,
    ].join('\u001f');
  };
  const groups = new Map();
  const passthrough = [];
  for (const item of items) {
    if (supportedOnly && item.verification?.verdict !== 'supported') {
      passthrough.push(item);
      continue;
    }
    const key = keyFor(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const kept = [];
  for (const group of groups.values()) {
    const selected = [];
    for (const item of group) {
      const twinIndex = selected.findIndex((other) => isParaphrase(other.statement_en, item.statement_en));
      if (twinIndex === -1) {
        selected.push(item);
        continue;
      }
      if (score(item) > score(selected[twinIndex])) selected[twinIndex] = item;
    }
    kept.push(...selected);
  }
  return [...passthrough, ...kept];
};

export const applyCoverage = ({ clauses, items, coverageRows = [], auditStatus = 'agreed' }) => {
  const dispositions = new Map((Array.isArray(coverageRows) ? coverageRows : [])
    .filter((row) => typeof row?.clause_id === 'string' && DISPOSITIONS.has(row?.disposition))
    .map((row) => [row.clause_id, row.disposition]));
  return clauses.map((clause) => {
    const itemIds = items.filter((item) => item.clause_ids.includes(clause.clause_id)).map((item) => item.item_id);
    return {
      ...clause,
      item_ids: itemIds,
      disposition: itemIds.length ? 'covered' : dispositions.get(clause.clause_id) ?? clause.disposition,
      audit_status: auditStatus,
    };
  });
};

export const needsQualityEscalation = (item, auditorVerdict, clauseById, mentionById = new Map(), resolvedReferences = []) => {
  // Explicit auditor/verifier failure always escalates.
  if (auditorVerdict && auditorVerdict !== 'supported') return true;
  const flags = new Set((item.clause_ids ?? []).flatMap((id) => clauseById.get(id)?.risk_flags ?? []));
  const risky = flags.has('unresolved_reference') || flags.has('contextual_reference') || flags.has('cross_page_continuation');
  // ocr_noise alone is not a quality trigger. Audit silence is not disagreement.
  if (!risky) return false;
  return !itemHasResolvedReferences(item, clauseById, mentionById, resolvedReferences);
};

export const itemHasResolvedReferences = (item, clauseById, mentionById, resolvedReferences = []) => {
  const riskyClauses = item.clause_ids.map((id) => clauseById.get(id)).filter((clause) => clause?.risk_flags?.some((flag) => flag === 'unresolved_reference' || flag === 'contextual_reference' || flag === 'cross_page_continuation'));
  if (!riskyClauses.length) return true;
  const participantTypes = new Set(item.participants.map((participant) => mentionById.get(participant.mention_id)?.type).filter(Boolean));
  const resolvedByClause = new Map();
  for (const reference of resolvedReferences) {
    if (!reference.resolved_entity_id && !reference.antecedent_mention_id) continue;
    const list = resolvedByClause.get(reference.clause_id) ?? [];
    list.push(reference);
    resolvedByClause.set(reference.clause_id, list);
  }
  const resolverCovered = (clause, expectedPattern) => (resolvedByClause.get(clause.clause_id) ?? [])
    .some((reference) => !expectedPattern || expectedPattern.test(String(reference.surface ?? '')));
  return riskyClauses.every((clause) => {
    const text = clause.text.trim();
    // A deterministic subject-memory resolution for this clause counts: the
    // antecedent lives in an earlier clause by design, not by omission.
    if (/^(?:he|she|his|her)\b/iu.test(text)) return participantTypes.has('person') || resolverCovered(clause, /^(?:he|she|his|her)\b/iu);
    if (/^(?:they|their)\b/iu.test(text)) return ['person', 'family', 'group', 'organisation'].some((type) => participantTypes.has(type)) || resolverCovered(clause, /^(?:they|their)\b/iu);
    return participantTypes.size > 0 || resolverCovered(clause, null);
  });
};

export const applyResolvedReferences = ({ items, references, mentions, sourceId }) => {
  const mentionById = new Map(mentions.map((mention) => [mention.mention_id, mention]));
  const referencesByClause = new Map();
  for (const reference of references) {
    if (!mentionById.has(reference.antecedent_mention_id)) continue;
    const rows = referencesByClause.get(reference.clause_id) ?? [];
    rows.push(reference);
    referencesByClause.set(reference.clause_id, rows);
  }
  return items.map((item) => {
    const linked = item.clause_ids.flatMap((id) => referencesByClause.get(id) ?? []);
    if (!linked.length) return item;
    const participants = [...item.participants];
    for (const reference of linked) {
      if (!participants.some((participant) => participant.mention_id === reference.antecedent_mention_id)) {
        participants.push({ mention_id: reference.antecedent_mention_id, role: 'resolved_reference', resolved_entity_id: reference.resolved_entity_id ?? null });
      }
    }
    const normalized = {
      ...item,
      participants,
      corefers_with: [...new Set([...(item.corefers_with ?? []), ...linked.map((reference) => reference.antecedent_mention_id)])],
    };
    delete normalized.item_id;
    return { item_id: `hi_${sha256(`${sourceId}\u001f${JSON.stringify(normalized)}`).slice(0, 20)}`, ...normalized };
  });
};

export const aggregateUsage = (calls) => {
  const paid = calls.filter((call) => !call.cache_hit);
  const cached = calls.filter((call) => call.cache_hit);
  return {
    prompt_tokens: paid.reduce((sum, call) => sum + Number(call.usage?.prompt_tokens ?? 0), 0),
    completion_tokens: paid.reduce((sum, call) => sum + Number(call.usage?.completion_tokens ?? 0), 0),
    total_tokens: paid.reduce((sum, call) => sum + Number(call.usage?.total_tokens ?? 0), 0),
    cost: paid.reduce((sum, call) => sum + Number(call.usage?.cost ?? 0), 0),
    saved_prompt_tokens: cached.reduce((sum, call) => sum + Number(call.usage?.prompt_tokens ?? 0), 0),
    saved_completion_tokens: cached.reduce((sum, call) => sum + Number(call.usage?.completion_tokens ?? 0), 0),
    saved_cost: cached.reduce((sum, call) => sum + Number(call.usage?.cost ?? 0), 0),
    call_count: paid.length,
    cache_hits: cached.length,
  };
};

export const batchesOf = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/** True when audit short-form rows should not default to kind=event. */
export const looksLikeQuotedMaterial = (statement, clauses = []) => {
  const text = String(statement ?? '');
  if (/[“"][^”"]*[”"]|[‘'][^’']*[’']/u.test(text)) return true;
  if (clauses.some((clause) => clause.zone === 'quote' || clause.risk_flags?.includes('quoted_span'))) return true;
  return /^(?:let |may |blessed |hear,? o israel|thou |thee )/iu.test(text.trim());
};

/**
 * Group supported grounded claims into schema-constrained event frames.
 * Only assembles when canonical_type (or a retrieved schema) is in SCHEMA_REGISTRY.
 * Derived relations are projections, not new source claims.
 */
export const assembleCanonicalEvents = (items) => {
  const events = [];
  for (const item of items) {
    if (item.verification?.verdict && item.verification.verdict !== 'supported') continue;
    const eventType = item.canonical_type
      && SCHEMA_REGISTRY[item.canonical_type]
      ? item.canonical_type
      : (item.kind === 'event' && item.open_type && SCHEMA_REGISTRY[item.open_type] ? item.open_type : null);
    if (!eventType) continue;
    const yearHints = [...new Set((String(item.statement_en ?? '').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/gu) ?? []).map(Number))];
    const subject = item.subject_entity_id ?? null;
    const participants = [
      ...(subject ? [{ entity_id: subject, role: 'subject' }] : []),
      ...[...new Set((item.participants ?? []).map((participant) => participant.resolved_entity_id).filter(Boolean))]
        .filter((entityId) => entityId !== subject)
        .map((entityId) => ({ entity_id: entityId, role: 'participant' })),
    ];
    const key = `${eventType}\u001f${subject ?? ''}\u001f${yearHints[0] ?? ''}\u001f${foldText(item.statement_en).slice(0, 80)}`;
    const existing = events.find((event) => event.merge_key === key);
    if (existing) {
      existing.evidence_claim_ids.push(item.item_id);
      for (const participant of participants) {
        if (!existing.participants.some((row) => row.entity_id === participant.entity_id && row.role === participant.role)) {
          existing.participants.push(participant);
        }
      }
      continue;
    }
    events.push({
      event_id: `ev_${sha256(key).slice(0, 20)}`,
      merge_key: key,
      event_type: eventType,
      participants,
      time: item.time ?? (yearHints[0] ? String(yearHints[0]) : null),
      place: item.place ?? null,
      evidence_claim_ids: [item.item_id],
      derived_relations: participants.flatMap((participant) => (subject && participant.entity_id !== subject
        ? [{ from_entity_id: subject, relation: `event_${eventType}`, to_entity_id: participant.entity_id, projection: true }]
        : [])),
      review_status: 'needs_review',
      publication_status: 'private',
    });
  }
  return events.map(({ merge_key, ...event }) => event);
};
