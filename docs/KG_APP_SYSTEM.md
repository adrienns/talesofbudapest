# Knowledge Graph to App System

## Outcome

Turn private, page-window extraction JSON into cited, reviewable historical
Chronicles attached to mapped Budapest locations. PostgreSQL is the source of
truth. `pgvector` helps retrieve candidates; it never establishes identity by
itself.

Restricted-book extraction currently produces schema **p3** (`prompt_version:
restricted-book-entities-p3`): locations and people carry both the
as-written source text (`source_name`, `address_source`) and an English
gloss (`name_en`, `address_en`); a top-level `facts` array carries
`interestingness` (1-5) and `confidence` per fact. See
[EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md#prompt-p1-r--restricted-book-cli-cliextract-restricted-bookjs)
for the full schema. `load:restricted:kg` accepts p1, p2, and p3 records.

## Data boundary

```text
private corpus + page text
        |
        v
kg_pages / kg_mentions (private staging)
        |
        v
candidate generation (name, alias, address, distance, vector)
        |
        v
human review for uncertain matches
        |
        v
canonical people, events, facts, edges (source/page provenance)
        |
        v
kg_location_chronicle (safe public projection)
        |
        v
Chronicle API -> landmark drawer -> grounded narrative generation
```

Geocoding sits alongside candidate generation, not in the main line: `geocode:kg`
sends only staged place names/addresses to the free Nominatim API and writes a
`<source>.geocoded.json` file; `resolve:kg --geocoded <path>` reads it to attach
coordinates to staged locations before scoring. Without it, staged
`kg_locations` carry no coordinates and only the exact-alias arm of auto-link
can fire.

Raw page text, extraction payloads, model usage, and verbatim quotations stay
private. The public projection contains English paraphrases and compact source
citations only. Restricted sources are never promoted automatically.

## Entity resolution

Candidate generation is deliberately broad. Candidate acceptance is strict.

1. Normalize Unicode, accents, punctuation, and known aliases through one
   shared normalizer, `lib/kgNormalize.js normalizeLocationName` (re-exported
   by `lib/kgLocationResolver.js`, used on both the mention side and the
   candidate side). Normalization folds diacritics, maps Hungarian<->English
   generic terms in both directions (utca<->street, tér<->square,
   zsinagóga<->synagogue, körút<->boulevard, and similar), strips district
   prefixes ("VII.", "7th district", "7. kerület") and a leading "the".
   Junk `source_name` values left over from older extractions (e.g. "PDF
   Page 15", a bare page number) are recognized and never treated as a
   usable alias, so they can't produce a false exact-name auto-link. This
   used to be two divergent normalizers (one in the resolver, one in
   `lib/kgPromotion.js`'s alias writer), so a promoted alias's
   `normalized_alias` and the resolver's own normalization of the same
   string could disagree and never match; `kgPromotion.js` keeps a separate,
   deliberately-frozen simple fold (`simpleFold`, wired through
   `normalizePredicate`) but only for edge-signature hashing, so an
   existing edge's id never changes underneath a normalizer improvement.
2. Retrieve exact/alias matches. The resolver fetches every *approved*
   `kg_entity_aliases` row via `kg_entities.public_location_id` and attaches
   it to the matching candidate (`cli/resolve-kg-locations.js`) — closing a
   latent gap where stored aliases were written but never read back during
   matching. Both the mention and each candidate's name plus its attached
   aliases are additionally expanded through `lib/kgNameLexicon.js`'s
   `expandNameVariants`: a curated, hand-editable Hungarian<->English
   lexicon (17 `FULL_NAME_GROUPS` whole-name equivalences, e.g. "Ferencz
   József híd" <-> "Franz Joseph Bridge" <-> "Liberty Bridge"; 11
   `GIVEN_NAMES`, e.g. Erzsébet<->Elisabeth; 12 `CONCEPT_WORDS`, e.g.
   szabadság<->liberty). Substitution is whole-token/whole-phrase only, so
   compound words like "Erzsébetváros" never expand into "Elisabeth Town"
   and collide with "Elisabeth Bridge"; output is capped at ~16 variants per
   input, plus a person name-order swap.
3. Where a usable street address exists, geocode it with `geocode:kg`
   (free Nominatim/OpenStreetMap; see
   [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md#geocoding-restricted-book-locations-cligeocode-kgjs))
   and feed the result into `resolve:kg --geocoded <path>` to retrieve
   locations within 50 metres.
4. Retrieve semantic candidates through `pgvector` when embeddings exist.
5. Score each candidate using independent evidence:
   - exact normalized name or alias;
   - address agreement and geographic distance;
   - compatible entity kind;
   - vector similarity;
   - contextual agreement from related people, dates, and events.
6. Auto-link only when a strong deterministic signal corroborates the score.
   Vector-only matches always remain review candidates — vector similarity
   alone can never satisfy the auto-link gate below, no matter how high the
   overall score is. An ambiguity guard runs after scoring
   (`lib/kgAliasGuard.js suppressAmbiguousExactMatches`): if an exact alias
   is approved on more than one landmark (e.g. two candidates both carry
   the approved alias "Citadella"), the match can never auto-link, even
   though it's an exact match — it's suppressed to review with reason
   `ambiguous_exact_alias`.

Locations are additionally classified into street name / house number /
district (`lib/hungarianAddress.js parseBudapestAddress`, merged in
`cli/geocode-kg.js` with `addressdetails=1` from Nominatim and a
postcode->district derivation). Street name and house-number agreement is
positive evidence toward the review-tier score; district agreement is a
smaller positive signal; but a district disagreement between two otherwise
plausible candidates is a strong negative that vetoes auto-link outright,
even over an exact name match, since the same street name commonly recurs
across several districts.

**Implemented** (`lib/kgLocationResolver.js scoreLocationCandidate`,
`cli/resolve-kg-locations.js`):

| Decision | Rule |
|---|---|
| Auto-link | score >= 0.90 (`--auto-match-threshold` to override) AND (exact normalized alias/name match OR distance <= 50m) AND no district conflict AND alias not ambiguously owned |
| Review | score >= 0.65 but auto-link requirements not met — stays manual via `promote-kg-location.js` |
| New candidate | no plausible mapped location, Budapest-specific evidence |
| Reject | publication/front matter, non-Budapest place, or generic city/street |

### Exact-first matching, alias provenance, and the golden-set eval

Migration `018_kg_alias_exact_match.sql` gives the resolver a deterministic
exact-lookup RPC, `match_kg_entity_exact`, checked before (and independently
of) the vector shortlist in `match_kg_entity_candidates`: a btree lookup by
`normalized_alias`, approved-rows-only, that also reports `ambiguous` when
the same normalized alias is approved on more than one entity. The RPC never
re-implements normalization — the caller computes `query_normalized` with
`lib/kgNormalize.js` and passes it in; normalization logic lives in exactly
one place.

`kg_entity_aliases.source` (also added in 018) tags where each alias row
came from: `promotion` (the extraction/promotion pipeline), `public_seed`
(`kgPublicLocationSeeder.js`, including `location_translations`),
`lexicon` (`expand:kg-aliases`), `wikidata` (`load:wikidata:aliases`), or
`llm_translation` (`backfill:kg-alias-translations`, always born
`needs_review`). Only `review_status: 'approved'` aliases are ever matched
by `match_kg_entity_exact` or attached to resolver candidates, regardless of
source — an `llm_translation` row is inert for auto-linking until a human
approves it.

`fixtures/kg-matching-golden.json` (53 hand-authored cases: 20
Hungarian/German/historical-name translation pairs, e.g. Erzsébet
híd -> Elisabeth Bridge, Ferencz József híd -> Liberty Bridge; 18 negatives
including the Erzsébetváros trap — a district name sharing the
Erzsébet/Elisabeth root with Elisabeth Bridge that must never match it; the
rest positive English/Hungarian/mined-mention cases) plus `eval:kg-matching`
(`--offline` by default, `--embed-missing`, `--db`) measure the real
production code path — `scoreLocationCandidate` and the `match_kg_entity_*`
RPCs, never a reimplementation. Measured results: before this layer landed,
vector-only top-1 was 78% and translation-pair exact matches were 0/20;
after, exact_hit_rate is 20/20, system top-1 accuracy is 35/35 (100%),
negatives_clean is 18/18, and vector-only top-1 is 63% as a diagnostic
figure only — vector similarity is informational and never decides a
match. Safety invariants held throughout: vector alone never auto-links,
the district-conflict veto, the approved-only alias rule, and the
ambiguity guard.

`resolve:kg` previews by default and writes `kg-auto-link-report.json`;
`--commit` creates the private canonical identity link (`review_status:
'approved'`, `publication_status: 'private'`, `metadata.auto_link =
{matched_via: 'exact_alias'|'distance', score, linked_at}`). It hard-refuses
`--publish`/`--allow-restricted-public` — auto-link can never publish.
Thresholds are configuration, not database constraints; tune them against a
hand-reviewed golden set.

## Canonical graph

The graph needs four useful shapes, each carrying source/page provenance:

- location facts: short, ranked Chronicle statements;
- person-location edges: lived, worked, designed, owned, performed, and similar;
- event-location and person-event edges;
- person-person edges for later graph-hop navigation.

Staging facts use `pending`, `active`, `disputed`, `quarantined`, or `rejected`;
staged entities and relations use their own pending/resolved/rejected/
quarantined resolution states. Canonical entities, claims, and edges instead
use `draft`, `needs_review`, `approved`, or `rejected`, plus an independent
`private`/`public` publication status. The database prevents a non-approved
canonical row from being public. The promotion CLI enforces the additional
source-licence gate; the Chronicle projection itself selects only rows already
marked both approved and public.

### Organisations and relation-endpoint placeholders

Migration 019 adds source-scoped `kg_organisations`, organisation foreign keys
on `kg_staged_relations`, and placeholder metadata on staged entities. The
`create:kg-placeholders` pass conservatively turns unresolved, specific named
relation endpoints into pending rows tagged `auto_created` and
`needs_research`, then links the staged relation to them. This improves the
private admin graph without asserting canonical identity: no canonical entity
or edge is created and nothing is approved or published.

`research:kg-placeholders` is a separate paid, cache-backed enrichment pass.
It rejects non-real endpoints or attaches research metadata to plausible ones;
confirmed rows still remain pending for human review. Run its preview before
authorizing calls. Neither placeholder command accepts publication flags.

## Chronicle contract

`kg_location_chronicle` exposes one row per public location:

- `location_id`
- `facts` JSON array
- `events` JSON array
- `people` JSON array
- `relations` JSON array
- `updated_at`

Every item has a stable ID. Attached citations contain source title, page
reference, source URL, and licence; the Chronicle does not expose raw page
text or verbatim evidence from restricted material. Promotion is expected to
attach evidence, but the database schema does not require every canonical
claim or edge to have an evidence row, so citation coverage must remain a
review/admin quality check.

The app endpoint is `GET /api/locations/{id}/chronicle`. Responses are cached
because publication changes only after a promotion/review run. Missing graph
data returns an empty Chronicle rather than breaking landmark details.

## First vertical slice

Use the Jewish Budapest extraction to build one complete Chronicle for the
Dohány Street Synagogue, followed by Kazinczy Street Synagogue, Óbuda
Synagogue, and well-resolved cemeteries. This slice validates the full path:

1. import restricted-book extraction JSONL into private staging
   (`load:restricted:kg`; extraction itself runs via `extract:restricted:deep`
   with the cost-ordered Qwen -> DeepSeek -> Gemini Flash-Lite ladder and an
   explicit run budget; see [OPENROUTER.md](OPENROUTER.md));
2. resolve places (auto-link where eligible, `resolve:kg`) and people;
3. review candidates and citations;
4. promote selected paraphrased claims;
5. display the Chronicle;
6. inject its top facts into generated narratives.

Do not resume full-book extraction until the first slice demonstrates that the
schema and resolver preserve useful, faithful content.

## Implemented commands

All commands are safe previews unless they explicitly include `--commit`.

```bash
# Extract a bounded sample into private JSONL. First print the live-price
# ceiling without model calls, then run the same sample. Omitting --limit is
# refused unless --confirm-full-book is explicitly supplied.
npm run extract:restricted:deep -- --source jewish-budapest --limit 3 --preflight-only
npm run extract:restricted:deep -- --source jewish-budapest --limit 3

# Import extraction JSONL into private migration-014 staging. Accepts p1, p2,
# and p3 records; load:restricted:kg does not yet read --source, point it at
# a different book's files with --input/--pages.
npm run load:restricted:kg
npm run load:restricted:kg -- --commit

# Represent existing map landmarks as private canonical vector candidates.
npm run embed:kg -- --seed-public-locations --commit

# Backfill canonical vectors, then create a vector-assisted staging report.
npm run embed:kg -- --target canonical --commit
npm run embed:kg -- --target staging --source-id jewish-budapest-private

# Optional: geocode staged locations (free Nominatim) so the distance arm of
# auto-link has coordinates to work with; writes <source>.geocoded.json.
npm run geocode:kg -- --dry-run
npm run geocode:kg

# Preview which pending staged locations meet the auto-link rule
# (score >= 0.90 and exact normalized alias/name match, or distance <= 50m).
npm run resolve:kg -- --source-id jewish-budapest-private
npm run resolve:kg -- --source-id jewish-budapest-private \
  --geocoded ../ingest/corpus/restricted/extractions/jewish-budapest.geocoded.json
npm run resolve:kg -- --source-id jewish-budapest-private --commit

# Preview one human-reviewed location link. IDs come from the candidate report.
npm run promote:kg-location -- \
  --source-id jewish-budapest-private \
  --staged-location-name "Dohány Street Synagogue" \
  --public-location-id UUID

# Re-normalize existing kg_entity_aliases rows with lib/kgNormalize.js after
# a normalizer change; handles collisions. Preview, then --commit.
npm run backfill:kg-alias-normalization
npm run backfill:kg-alias-normalization -- --commit

# Derive additional approved translated_name aliases from already-approved
# name aliases via the curated lexicon (lib/kgNameLexicon.js). Preview, then
# --commit.
npm run expand:kg-aliases
npm run expand:kg-aliases -- --commit

# Anchor Wikidata hu/en/de labels + altLabels onto EXISTING canonical
# entities only (never imports new landmarks); coords <=50m and an exact
# label become approved aliases, one arm matching alone goes to review.
npm run load:wikidata:aliases
npm run load:wikidata:aliases -- --commit

# LLM tail backfill: only for landmarks still lacking hu/en alias coverage
# and without wikidata aliases. Rows are always born needs_review.
npm run backfill:kg-alias-translations
npm run backfill:kg-alias-translations -- --commit

# Golden-set eval for the whole matching stack (offline by default).
npm run eval:kg-matching
npm run eval:kg-matching -- --embed-missing
npm run eval:kg-matching -- --db

# Preview/commit conservative pending placeholders for unresolved, named
# staging relation endpoints. This never creates canonical/public content.
npm run create:kg-placeholders
npm run create:kg-placeholders -- --commit

# Paid, cached research over flagged placeholders. Preview estimates the work;
# even confirmed results remain pending and private.
npm run research:kg-placeholders -- --limit 5
npm run research:kg-placeholders -- --limit 5 --commit
```

`resolve:kg --commit` creates only the private location <-> public location
identity link (a canonical `location` entity plus its aliases, always
`review_status: 'approved'` / `publication_status: 'private'`, never
`needs_review` and never public) for candidates that clear the auto-link bar.
Facts, relations, events, and people still require a human running
`promote:kg-location`. `resolve:kg` never accepts `--publish` or
`--allow-restricted-public`; those gates only exist on `promote:kg-location`.

Promotion with `--commit` remains private and `needs_review`. Public promotion
requires the additional `--publish` flag. A red/restricted source additionally
requires `--allow-restricted-public`, making accidental publication impossible.

The frontend reads only `kg_location_chronicle` through
`GET /api/locations/{id}/chronicle`. If a location has no reviewed public graph
data, it returns an empty Chronicle and the existing landmark experience keeps
working.
