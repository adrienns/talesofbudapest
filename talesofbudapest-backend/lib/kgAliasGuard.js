// Post-filter for lib/kgLocationResolver.js's rankLocationCandidates output.
// scoreLocationCandidate treats an exact normalized name/alias match
// (signals.exactName) as strong enough to clear the auto-link bar on its
// own. But an alias that is approved on more than one canonical location
// entity -- e.g. two different landmarks both carry the approved alias
// "Citadella" -- makes an exact match to either of them genuinely
// ambiguous: the resolver cannot tell which candidate the mention actually
// names. suppressAmbiguousExactMatches is a pure post-filter applied after
// rankLocationCandidates has already scored and sorted candidates; it never
// re-scores or re-orders anything, it only vetoes autoMatch on the results
// whose exact match is unsafe to trust.
//
// aliasOwnership: Map<normalizedAlias, Set<candidateId>> built by the caller
// from every public location candidate's name plus its approved
// kg_entity_aliases rows, independent of any single mention -- see
// cli/resolve-kg-locations.js, which builds it once per run from the same
// `aliases` arrays it attaches to each candidate.
import { normalizeLocationName } from './kgLocationResolver.js';

const AMBIGUOUS_EXACT_ALIAS = 'ambiguous_exact_alias';

const candidateIdentitySet = (candidate) => {
  const values = [candidate?.name, ...(Array.isArray(candidate?.aliases) ? candidate.aliases : [])];
  return new Set(values.map(normalizeLocationName).filter(Boolean));
};

const isAmbiguous = (candidate, aliasOwnership) => {
  if (!aliasOwnership || aliasOwnership.size === 0) return false;
  for (const alias of candidateIdentitySet(candidate)) {
    if ((aliasOwnership.get(alias)?.size ?? 0) > 1) return true;
  }
  return false;
};

export const suppressAmbiguousExactMatches = (rankedResults, aliasOwnership) => (rankedResults ?? []).map((result) => {
  if (!result?.signals?.exactName) return result;
  if (!isAmbiguous(result.candidate, aliasOwnership)) return result;
  return { ...result, autoMatch: false, reason: AMBIGUOUS_EXACT_ALIAS };
});
