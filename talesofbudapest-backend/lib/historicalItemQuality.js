const words = (value) => String(value ?? '').trim().split(/\s+/u).filter(Boolean);
const evidencePrefixBefore = (item, reference) => (item.evidence ?? []).flatMap((entry) => {
  if (reference.page_ref != null && entry.page_ref !== reference.page_ref) return [];
  const relative = Number(reference.start_offset) - Number(entry.start_offset);
  if (!Number.isFinite(relative) || relative < 0 || relative > String(entry.quote ?? '').length) return [];
  return [String(entry.quote ?? '').slice(0, relative)];
});
const leadingReference = (item, reference) => evidencePrefixBefore(item, reference).some((prefix) => /^(?:(?:and|but|however|then|later|also)\s+|(?:in|on|at|by|after|before|during|from|until|around|about)\b[^,;]{0,100},\s*)?$/iu.test(prefix.trim()));

const hasTemporalAnchor = (statement) => /\b(?:1[5-9]\d{2}|20[0-2]\d)\b/u.test(statement);
const hasPlaceOrNameAnchor = (statement) => (
  /\b(?:Buda|Pest|Budapest|Óbuda|Obuda|Jerusalem|Prague|Safed|Ottoman|synagogue|temple|cemetery|Cemetery|utca|tér|Street|Church|Castle|Danube|Hungary|Turkish|Maimonides|Ashkenazi|Sephard)\b/u.test(statement)
  || /(?:^|\s)(?:R\.|[A-Z][\p{L}'’-]+)(?:\s+[A-Z][\p{L}'’-]+)+/u.test(statement)
  || /\b(?:Jews?|Jewish)\b/u.test(statement)
);
// Bare vague agents only ("Architects designed houses.") — not "People in black kaftans…".
const vagueAgentLead = /^(?:Architects|Artisans|Neighborhood|Street|Omnibus|Houses|Buildings)\b/u;

/**
 * When subject memory resolved a leading pronoun, put the name in the
 * statement so app paraphrases and gold matching are not pronoun-only.
 */
export const groundPronominalStatement = (item) => {
  const statement = String(item.statement_en ?? '').trim();
  const label = String(item.literal_subject ?? item.subject_attribution?.literal_subject ?? '').trim();
  if (!label || item.subject_attribution?.status !== 'resolved') return item;
  if (!/^(?:He|She|They|His|Her|Their)\b/u.test(statement)) return item;
  const grounded = statement.replace(/^(He|She|They|His|Her|Their)\b/u, (match) => (
    match === 'His' || match === 'Her' || match === 'Their' ? `${label}'s` : label
  ));
  if (grounded === statement) return item;
  return { ...item, statement_en: grounded, statement_grounded_from_pronoun: true };
};

/** Reject only structurally empty extractions; substantive judgments stay with review. */
export const itemStructuralQualityReason = (item) => {
  const statement = String(item.statement_en ?? '').trim();
  const unresolvedSubject = item.subject_attribution?.status !== 'resolved';
  const clauseReferences = item.clause_references ?? [];
  const unresolvedReferences = item.clause_unresolved_references ?? [];
  if (!statement) return 'empty_statement';
  if (/\b(?:is|was) mentioned\.?$/iu.test(statement)) return 'meta_mention_not_historical_claim';
  if (/^(?:the authors?|this book)\b/iu.test(statement)) return 'meta_mention_not_historical_claim';
  if (/^the book\s+(?:describes|mentions|discusses|covers|explains)\b/iu.test(statement)) return 'meta_mention_not_historical_claim';
  if (/^(?:occasionally|often|sometimes)\s+called\b/iu.test(statement)) return 'fragment_without_subject';
  if (unresolvedSubject && /^(?:there|this|that|such|one|several|today|building)\b/iu.test(statement)) return 'unbound_deictic_or_existential_claim';
  if (/^[^A-Za-z]/u.test(statement)) return 'malformed_statement_prefix';
  if ((item.evidence ?? []).some((entry) => /[“”"']/u.test(String(entry.quote ?? '')) && /\b(?:proverb|aphorism|maxim)\b/iu.test(String(entry.quote ?? '')))) return 'quoted_maxim_not_historical_claim';
  // Caption/title furniture leaked into evidence offsets (layout mask miss or
  // clause spanning a figure). Not a body fact even if the paraphrase looks fine.
  if ((item.evidence ?? []).some((entry) => /(?:^|\n)\s*(?:\d+\.\s+)?(?:Portrait of\b|Denarius\b)|(?:^|\n)\s*[A-Z]\s+Hakdome\b|\bon his seal\b|^\s*Hakdome\b/imu.test(String(entry.quote ?? '')))) {
    return 'caption_or_title_furniture_in_evidence';
  }
  // Also demote when the statement itself is caption/title furniture.
  if (/^(?:[A-Z]\s+)?Hakdome\b/u.test(statement) || /^Denarius\b/u.test(statement) || /^\d+\.\s+Portrait of\b/u.test(statement)) {
    return 'caption_or_title_furniture_in_evidence';
  }
  // Bare kinship/role leads without a named person are not tour-safe subjects.
  if (/^(?:Mother|Father|Son|Daughter|Wife|Husband|Brother|Sister)\b/u.test(statement)
    && !/\bR\./u.test(statement)
    && !/(?:^|\s)(?:[A-Z][\p{L}'’-]+)(?:\s+[A-Z][\p{L}'’-]+)+/u.test(statement)) {
    return 'bare_kinship_subject';
  }
  // Locative fragments and abstract "The relocation/killing…" without a year
  // or named actor are not grounded historical claims.
  if (/^(?:Space|Plot|Area|Place)\s+(?:next|near|beside|for)\b/iu.test(statement)) {
    return 'fragment_without_historical_claim';
  }
  if (/^The marker states\b/iu.test(statement)) return 'meta_mention_not_historical_claim';
  if (/^The\s+(?:relocation|killing|construction|destruction|demolition)\b/iu.test(statement)
    && !hasTemporalAnchor(statement)
    && !/\bR\./u.test(statement)
    && !/(?:^|\s)(?:[A-Z][\p{L}'’-]+)(?:\s+[A-Z][\p{L}'’-]+)+/u.test(statement)) {
    return 'underspecified_abstract_event';
  }
  // Present-tense tourist / guidebook observation without a historical anchor year.
  if (/\b(?:tourists?|guidebook)\b/iu.test(statement)
    && /\bare\b/iu.test(statement)
    && !hasTemporalAnchor(statement)) {
    return 'present_day_observation_not_historical_claim';
  }
  const leading = words(statement)[0]?.toLowerCase();
  const pronounLead = ['it', 'they', 'he', 'she', 'his', 'her', 'their'].includes(leading);
  // Statement already names a place/person/year — keep it even if evidence still
  // opens with a pronoun or a possessive the subject-memory pass left unresolved.
  const statementGrounded = !pronounLead && (hasTemporalAnchor(statement) || hasPlaceOrNameAnchor(statement));
  if (pronounLead && unresolvedSubject) return 'unresolved_pronominal_subject';
  if (!statementGrounded && unresolvedSubject && (item.evidence ?? []).some((entry) => /\bthe\s+(?:former|latter)\b/iu.test(String(entry.quote ?? '')))) return 'unresolved_ordinal_anaphor_subject';
  if (!statementGrounded && unresolvedSubject && clauseReferences.some((reference) => /^(?:its|his|her|their)\b/iu.test(String(reference.surface ?? '').trim()))) return 'possessive_owner_not_safe_fact_subject';
  if (!statementGrounded && unresolvedSubject && unresolvedReferences.some((reference) => leadingReference(item, reference))) return 'unresolved_source_reference_subject';
  if (!statementGrounded && unresolvedSubject && (item.evidence ?? []).some((entry) => /^(?:(?:and|but|however|then|later|also)\s+)?(?:he|she|they|it|his|her|their|its)\b/iu.test(String(entry.quote ?? '').trim()))) return 'unresolved_source_pronominal_subject';
  // Vague agent with no year/place/name ("Architects designed houses.") is not
  // tour-usable. Resolved pronoun claims are allowed (grounding names them).
  const resolvedPronounLead = !unresolvedSubject && pronounLead;
  if (!resolvedPronounLead && !hasTemporalAnchor(statement) && !hasPlaceOrNameAnchor(statement)
    && vagueAgentLead.test(statement)) {
    return 'underspecified_without_anchor';
  }
  return null;
};
