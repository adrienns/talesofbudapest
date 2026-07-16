import crypto from 'node:crypto';

export const HISTORICAL_V2_SCHEMA_VERSION = 'historical-items-v2';
export const HISTORICAL_V2_PROMPT_VERSION = 'historical-semi-open-v2.11';

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
    return { ...item, clause_ids: [best.clause.clause_id] };
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

const sentenceSpans = (readingText) => Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(readingText))
  .map((segment) => trimMappedSpan(readingText, segment.index, segment.index + segment.segment.length))
  .filter(([start, end]) => end - start >= 2);

const clauseBoundaries = (sentenceText) => {
  const cuts = [0];
  const chronologyLabel = /(?:^|\s)(?:c\.\s*)?(?:1[5-9]\d{2}|20\d{2})(?:\s*[–-]\s*\d{2,4})?\s*:/giu;
  const protectedColons = new Set([...sentenceText.matchAll(chronologyLabel)].map((match) => match.index + match[0].lastIndexOf(':')));
  const pattern = /[;:]\s+|\s+[—–]\s+|\s+(?=(?:but|while|whereas|although|however|therefore|nevertheless)\b)/giu;
  for (const match of sentenceText.matchAll(pattern)) {
    // A chronology label belongs to its event. Splitting `1827:` into a
    // standalone clause made the verifier reject otherwise grounded entries.
    if (match[0].startsWith(':') && protectedColons.has(match.index)) continue;
    cuts.push(match.index + match[0].length);
  }
  // OCR frequently collapses a timeline into one line: `1827: ... 1830: ...`.
  // Start a new clause at later labels, never between a label and its content.
  for (const match of sentenceText.matchAll(chronologyLabel)) {
    const start = match.index + (match[0].match(/^\s*/u)?.[0].length ?? 0);
    if (start > 0) cuts.push(start);
  }
  cuts.push(sentenceText.length);
  return [...new Set(cuts)].sort((a, b) => a - b);
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
      clauses.push({
        clause_id: `cl_${sha256(`${sourceId}\u001f${sourcePage.page}\u001f${startOffset}\u001f${endOffset}`).slice(0, 20)}`,
        page_ref: sourcePage.page,
        start_offset: startOffset,
        end_offset: endOffset,
        text,
        source_quote: sourceByPage.get(sourcePage.page).text.slice(startOffset, endOffset),
        mention_ids: clauseMentions.map((mention) => mention.mention_id),
        suggested_schemas: retrieveSchemas(text, clauseMentions),
        allow_other: true,
        risk_flags: localRiskFlags({ text, mentions: clauseMentions, first: index === 0, last: index === rawClauses.length - 1 }),
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
  const merge = (left, right) => ({
    ...left,
    clause_ids: [...new Set([...left.clause_ids, ...right.clause_ids])],
    participants: [...new Map([...left.participants, ...right.participants].map((participant) => [`${participant.mention_id}\u001f${participant.role}`, participant])).values()],
    evidence: [...new Map([...left.evidence, ...right.evidence].map((evidence) => [`${evidence.page_ref}\u001f${evidence.start_offset}\u001f${evidence.end_offset}`, evidence])).values()],
    corefers_with: [...new Set([...(left.corefers_with ?? []), ...(right.corefers_with ?? [])])],
    discovery_sources: [...new Set([...(left.discovery_sources ?? []), ...(right.discovery_sources ?? [])])],
  });
  const nearby = (left, right) => left.evidence.some((a) => right.evidence.some((b) => a.page_ref === b.page_ref && Math.abs(a.start_offset - b.start_offset) <= 420));
  for (const item of items) {
    const key = `${item.kind}\u001f${item.assertion_kind ?? ''}\u001f${item.open_type}\u001f${item.clause_ids.join(',')}\u001f${foldText(item.statement_en)}`;
    const previous = selected.get(key);
    if (previous) { selected.set(key, merge(previous, item)); continue; }
    const nearKey = [...selected.entries()].find(([, candidate]) => candidate.kind === item.kind
      && candidate.assertion_kind === item.assertion_kind
      && candidate.open_type === item.open_type
      && nearby(candidate, item)
      && semanticTokenOverlap(candidate.statement_en, item.statement_en) >= 0.82)?.[0];
    if (nearKey) selected.set(nearKey, merge(selected.get(nearKey), item));
    else selected.set(key, item);
  }
  return [...selected.values()];
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

export const needsQualityEscalation = (item, auditorVerdict, clauseById) => {
  if (auditorVerdict !== 'supported') return true;
  const flags = new Set(item.clause_ids.flatMap((id) => clauseById.get(id)?.risk_flags ?? []));
  return ['unresolved_reference', 'contextual_reference', 'cross_page_continuation', 'ocr_noise'].some((flag) => flags.has(flag));
};

export const itemHasResolvedReferences = (item, clauseById, mentionById) => {
  const riskyClauses = item.clause_ids.map((id) => clauseById.get(id)).filter((clause) => clause?.risk_flags?.some((flag) => flag === 'unresolved_reference' || flag === 'contextual_reference' || flag === 'cross_page_continuation'));
  if (!riskyClauses.length) return true;
  const participantTypes = new Set(item.participants.map((participant) => mentionById.get(participant.mention_id)?.type).filter(Boolean));
  return riskyClauses.every((clause) => {
    const text = clause.text.trim();
    if (/^(?:he|she|his|her)\b/iu.test(text)) return participantTypes.has('person');
    if (/^(?:they|their)\b/iu.test(text)) return ['person', 'family', 'group', 'organisation'].some((type) => participantTypes.has(type));
    return participantTypes.size > 0;
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
