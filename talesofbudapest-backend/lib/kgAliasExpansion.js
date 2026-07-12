// Pure planner for cli/expand-kg-aliases.js: deterministically derives new
// alias rows from a canonical entity's OWN already-approved 'name'-kind
// aliases, run through the curated Hungarian<->English lexicon
// (lib/kgNameLexicon.js's expandNameVariants). This never invents a
// translation from scratch -- expandNameVariants only ever returns variants
// explicitly enumerated in FULL_NAME_GROUPS / GIVEN_NAMES / CONCEPT_WORDS (or
// straightforward combinatorics of them), so every row this planner proposes
// traces back to a human-curated lexicon entry, not a model guess. That's
// also why every planned row is born `review_status: 'approved'`: the design
// rule is that this is a deterministic derivation of an alias a human already
// approved, under a lexicon a human already curated -- not a new judgment
// call that needs its own review pass.
//
// A planned row's `alias` and `normalized_alias` are always the same string.
// expandNameVariants only ever produces already-normalized text (lowercase,
// diacritics folded), so there is no "properly spelled" form to recover for
// the `alias` column -- unlike lib/kgPublicLocationSeeder.js's rows, which
// come from a real database column with real casing/diacritics.
//
// `language_code` is left null: a lexicon-derived variant's language isn't
// reliably knowable (CONCEPT_WORDS/GIVEN_NAMES entries translate in both
// directions, and FULL_NAME_GROUPS mixes historical/foreign-language forms
// freely -- see e.g. the "castle of ofen" German-historical entry).
import { expandNameVariants } from './kgNameLexicon.js';

export const planLexiconExpansion = (entities, aliases) => {
  const aliasesByEntity = new Map();
  for (const alias of aliases) {
    if (!alias?.entity_id) continue;
    if (!aliasesByEntity.has(alias.entity_id)) aliasesByEntity.set(alias.entity_id, []);
    aliasesByEntity.get(alias.entity_id).push(alias);
  }

  const planned = [];
  for (const entity of entities) {
    if (!entity?.id) continue;
    const entityAliases = aliasesByEntity.get(entity.id) ?? [];
    // Dedup target: skip a variant that's identical to ANY existing alias's
    // normalized form for this entity, regardless of that alias's own kind
    // -- not just other 'translated_name' rows -- so this planner never
    // proposes a near-duplicate of a 'name', 'former_name', or 'address'
    // alias that already carries the same normalized text.
    const existingNormalized = new Set(entityAliases.map((row) => row.normalized_alias));
    const seedAliases = entityAliases.filter((row) => row.alias_kind === 'name' && row.review_status === 'approved');
    const plannedThisEntity = new Set(); // two seed aliases producing the same variant must only emit it once
    const entityKind = entity.entity_kind === 'person' ? 'person' : 'location';

    for (const seed of seedAliases) {
      if (!seed.normalized_alias) continue;
      const variants = expandNameVariants(seed.normalized_alias, { entityKind });
      for (const variant of variants) {
        if (variant === seed.normalized_alias) continue;
        if (existingNormalized.has(variant) || plannedThisEntity.has(variant)) continue;
        plannedThisEntity.add(variant);
        planned.push({
          entity_id: entity.id,
          alias: variant,
          normalized_alias: variant,
          language_code: null,
          alias_kind: 'translated_name',
          review_status: 'approved',
          source: 'lexicon',
        });
      }
    }
  }
  return planned;
};
