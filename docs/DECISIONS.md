# Decisions log

Dated record of prompt, model, and pipeline-behavior changes, per
[EXTRACTION_PIPELINE.md §4](EXTRACTION_PIPELINE.md#4-the-prompts): "When you
change one, bump the version comment and note it in `docs/DECISIONS.md` —
extraction quality regressions must be traceable to prompt changes."

## 2026-07-17 — V3 model freeze, address/geography layer, OCR policy

**Model configuration frozen for the book pass.** A bounded A/B on pages
75/97/140/160/180 (`CLAUDE_HANDOFF_MODEL_COMPARISON_2026-07-16.md`) settled it:
DeepSeek V4 Flash primary with `--primary-reasoning off`, Qwen 30B audit,
Gemini Flash quality judge, `OPENROUTER_TIMEOUT_MS=300000`. DeepSeek beat
Gemini Flash-Lite on supported items *and* cost (140/205 at $0.0029/page vs
134/200 at $0.0034) with zero protocol failures. **GPT-OSS-20B is rejected for
the audit role**: its endpoint cannot disable reasoning (400 "Reasoning is
mandatory") and it truncates the TSV protocol even at low effort. Reasoning
must be off for the extractor: reasoning tokens consume the output cap and
truncate the protocol mid-item.

**Verification sees what the resolver knows.** The deterministic subject memory
resolved `he → R. Efraim`, but verification payloads never showed it, so the
judge rejected every cross-clause subject ("the clause does not mention who
returned to Prague"). Clause rows now carry authoritative
`[[surface, antecedent]]` resolutions into the primary, audit, verify, and
quality payloads, and the reference gate accepts resolver-linked antecedents
instead of demanding an in-clause participant mention. Combined with
abbreviation-safe segmentation (a single-capital `R.` no longer ends a
sentence, in a corpus where every rabbi is `R. Somebody`) and equivalence
rules (paraphrase, double negation, presupposition, and facts asserted jointly
by adjacent clauses all count as support), supported items on pages 46-50 rose
from 71% to 91%; page 49 reached 97%. Leniency has a hard limit: a candidate
that ADDS anything absent from the clauses (names, dates, verse numbers,
places) is unsupported even when plausible — that rule was added after the
first lenient pass admitted an invented "I Samuel 2:4" citation.

**Ambiguous street locations: proximity only, never a prior.** 21% of Budapest
street names repeat across districts. Averaging their coordinates put
`Táncsics Mihály utca` ~4km from the Castle district, so the gazetteer
clusters ways by proximity and gives a multi-cluster name **no centre at all**:
a confident wrong pin is worse than no pin. Such streets are placed only from
unambiguous addresses on the same page (`Hess András tér` ⇒ Castle district ⇒
Táncsics resolves to within ~60m), else the batch, else they stay unlocated.
Every placement records `disambiguated_by` and `disambiguation_distance_km`.
A "assume the city centre" default was considered and **rejected**.

**Buildings are entities at an address, not a class bucket.** A building
mention followed by an address is anchored, and entity identity is keyed by
head + street + house number, so `synagogue (Táncsics Mihály utca 23)` and
`(26)` are different buildings. House numbers parse in both Hungarian
(`Király utca 77`) and English (`26 Táncsics Mihály utca`) order.

**OCR: no repair by similarity, ever.** Page 21's great synagogue vanished
because OCR wrote `syna-\ngoque`. A book-wide scan found 27 tokens within edit
distance 1 of a domain word (330 occurrences) but only ~18 were real damage:
`schools`/`prayers`/`streets` are plurals, `horse`/`player`/`Prater` are
ordinary words, `yeshivah` is a variant spelling. Similarity repair would
corrupt 300+ correct words to fix 18. Instead: the building detector tolerates
the damaged forms the scan actually found, entity identity folds those exact
curated forms (`lib/historicalOcrLexicon.js`), and `ocr_damage_log` reports
every damaged word with exact offsets. **Do not add a confusion-table or
edit-distance repair pass over the reading view.**

**Failures must confess.** Every reference that resolves to nothing records
`{surface, clause, expected, why}` in `unresolved_references_log`. The first
confession run immediately diagnosed a real bug (`candidate_without_mention`:
a focus reached via resolution pointed at an entity whose last explicit mention
was never set). Keep this property in anything added: silent failure is
unfixable failure.

**Gold provenance is enforced.** `gold_source` is stamped per item; the eval
harness blocks promotion when held-out gold is not human-adjudicated. Fable-5
pilot gold exists for page 75 only and is development-use. No promotion gate
(precision/recall >0.95, cost ≤$0.002/page) has passed; actual cost is
$0.003-0.005/page and runs report `failed_cost_gate` honestly.

**Hungaricana is a lookup assist, not a scraper.** Browsing is free, but scans
and curated databases carry provider rights and the EU sui generis database
right. `cli/hungaricana-lookup.js` prints targeted search URLs for a human and
records confirmed facts to a provenance ledger. Facts are free; do not
bulk-harvest. Street geometry comes from OpenStreetMap under ODbL with
attribution embedded in the artifacts.

## 2026-07-15 — Constrained historical reference resolution

Historical-book pilots now use a noun-complete, candidate-constrained
discourse-reference design instead of trusting a model's free-form resolved
subject. Raw OCR offsets remain immutable while all NLP/model input uses a
reversible reading view that joins line-broken words.

The local stage records every noun phrase, reference kind, coarse type,
singular/plural hint, explicit lexical gender, and dependency role. Flash-Lite
and Qwen receive one compact shared discourse prompt with short temporary IDs;
Flash adjudicates only canonical disagreements. Missing model rows are treated
as disagreements. Possessive noun phrases keep the owned entity distinct from
the owner, so `His tomb` links to a person without turning the tomb into that
person, and a later `them` can still refer to `Its former students`.

Cost controls: merged source blocks, tiny distant-candidate snippets, maximum
eight cheap candidates, compact quality choices, Gemini reasoning disabled,
OpenRouter providers sorted by price, and a versioned content-addressed cache.
Fresh regression measurements: USD 0.000306 for 16 page-46 references and USD
0.001134 for 21 page-301 references; an identical cache replay cost USD 0.
The complete selective page-301 pipeline measured USD 0.001394/page, down from
USD 0.002136 with the same 41 valid items and grounding/schema checks.

This does not promote the pilot. The two development regressions pass, but the
locked untouched >0.95 precision/recall evaluation is still required. An
always-on exhaustive remote resolver would exceed the total cost gate on the
hard page; production must reuse extraction votes and audit only risky chains.
See [HISTORICAL_REFERENCE_RESOLUTION.md](HISTORICAL_REFERENCE_RESOLUTION.md).

The sequential revision persists a compact three-page subject memory and loads
it only for the exactly next page. Previous-page context can inform extraction
but cannot suppress a target fact that was never emitted. The omission audit
now checks every clause, routes real page continuations to strong Flash, and
ignores caption/page-number adjacency. Direct-object salience prevents
`set up a school in the Orczy House. It...` from linking `It` to the house;
role aliases can canonicalize to grounded names; earlier pronouns are no
longer antecedent candidates. Exact predicates and source-zone/OCR duplicate
guards reduce both false rejection and needless quality calls.

Page 89 recovered the cross-page Szapáry, Boráros, Wahrmann, school-location,
and Nationalschule facts. Page 90 demonstrably loaded 48 page-89 memory items.
Fresh costs were USD 0.002896 and USD 0.002201 respectively before removing a
USD 0.000196 false caption-boundary escalation. The representative cost and
held-out accuracy gates therefore remain unproven/failed; no production
promotion is authorized by these regressions.

Dense page 91 is the recorded hard counterexample: 65 facts, 32 reference
requests, 93.4% clause grounding, and USD 0.004928 total. Local unambiguous
full-name/surname alias collapse lowered its focused reference stage from USD
0.001841 to USD 0.001528. Lone OCR tokens such as `T` are now invalid
antecedents. The remaining dense-page cost/grounding failure is explicit and
must not be bypassed by dropping references or lowering verification quality.

## 2026-07-12 — Restricted-book prompt p2 → p3 (truncation fix)

**Bumped `restricted-book-entities-p2` → `-p3`.** The p2 prompt (no
per-array cap + bilingual `{quote_source, quote_en}` evidence on every item)
truncated JSON on dense pages — a live run over pages 106–165 failed ~75% of
windows with "invalid JSON" (one over-long response loses the whole window).

State-of-the-art check (Microsoft GraphRAG, LlamaIndex, 2026 structured-output
guidance): production KG extractors cap items per chunk (`max_knowledge_triplets`)
and keep one compact description per item, not bilingual evidence. Applied the
low-risk subset: reinstated a **20-item-per-array cap** and collapsed evidence
to a single `{quote}` (source-language verbatim only — `text_en`/`statement_en`/
`name_en` already carry the English rendering). Re-run failure rate dropped
~75% → ~23%; residual failures are content-specific (dense/tabular pages), not
length. Evidence stayed a nested object so `load-restricted-kg.js` (which reads
`evidence` schema-agnostically) needs no change; p1/p2/p3 all load. Deferred the
heavier GraphRAG delimited-record format unless truncation recurs at corpus scale.

## 2026-07-11 — Restricted-book prompt p1 → p2, auto-link rule goes live

**Restricted-book extraction prompt (`cli/extract-restricted-book.js`)
bumped `restricted-book-entities-p1` → `restricted-book-entities-p2`.**

What changed:
- Locations and people now record the as-written source text
  (`source_name`, `address_source`) alongside an English gloss (`name_en`,
  `address_en`), instead of forcing everything into English at extraction
  time.
- New top-level `facts[]` array (separate from `events`/`relations`), each
  with `interestingness` (1-5) and `confidence`.
- `partial_name: true` on people when only a surname is recorded.
- The 15-item-per-array cap from earlier revisions is removed; `max_tokens`
  raised to 12000.
- New `--source <id>` flag (default `jewish-budapest`) so the CLI handles
  any restricted book, not just one hardcoded source.

Why:
- **Schema drift from Prompt P1.** P1-R had quietly diverged from the
  canonical P1 hard rules (docs/EXTRACTION_PIPELINE.md §4) it's supposed to
  follow; p2 realigns it — verbatim source-language quotes
  (`evidence.quote_source`/`quote_en`) on every item, never sharpening vague
  dates, and the same interestingness/confidence scales as P1.
- **English-forced names hurt entity resolution.** Discarding the
  as-written Hungarian/German name at extraction time threw away the exact
  string most likely to match a mapped landmark's name or alias — the
  resolver's strongest signal.
- **Silent 15-item cap.** Dense pages were losing facts/locations/people
  past the 15th item in an array with no error or flag; removing the cap
  (and raising `max_tokens`) fixes recall on rich pages without a
  visible failure mode.

`cli/load-restricted-kg.js` now validates records by payload shape rather
than gating on a Qwen model name (extraction has moved off Qwen), and accepts
both p1 and p2 records so already-staged p1 data doesn't need re-extraction.

**Auto-link rule went live** (`lib/kgLocationResolver.js`,
`lib/kgPromotion.js`, `cli/resolve-kg-locations.js`, `npm run resolve:kg`):

- Rule: score >= 0.90 (`--auto-match-threshold` to override) AND (exact
  normalized alias/name match OR distance <= 50m). Vector similarity alone
  can never satisfy either arm and so can never auto-link by itself.
- Normalization now folds diacritics and maps Hungarian<->English generic
  terms (utca<->street, tér<->square, zsinagóga<->synagogue, körút<->boulevard,
  etc.), strips district prefixes and a leading "the", and ignores junk
  `source_name` values left over from older extractions (e.g. "PDF Page 15")
  so they can't produce a false exact-name match.
- `resolve:kg --commit` creates a **private** canonical identity link only
  (`review_status: 'approved'`, `publication_status: 'private'`,
  `metadata.auto_link = {matched_via, score, linked_at}`); it hard-refuses
  `--publish`/`--allow-restricted-public`. Facts, relations, events, and
  people still require a human running `promote-kg-location.js`.
- The distance arm only fires when coordinates are supplied via the new
  `cli/geocode-kg.js` (free Nominatim) and `resolve:kg --geocoded <path>` —
  staged `kg_locations` carry no coordinates of their own.
- Review tier (score >= 0.65, auto-link requirements not met) is unchanged:
  stays manual via `promote-kg-location.js`.

## 2026-07-12 — Hungarian<->English name-matching overhaul

**Normalizer unification.** The resolver (`lib/kgLocationResolver.js`) and
the alias writer (`lib/kgPromotion.js`) had drifted onto two different
normalization functions. That meant a promoted alias's stored
`normalized_alias` and the resolver's own normalization of the same string
could disagree, so a stored alias could silently never match anything —
this was a latent, unnoticed gap: the resolver had never actually read
stored `kg_entity_aliases` rows back at match time either. Fixed by moving
normalization into one shared module, `lib/kgNormalize.js`
(`normalizeLocationName`), used on both the mention side and the candidate
side. `kgPromotion.js` keeps a separate, deliberately-frozen simple fold
(`simpleFold`, via `normalizePredicate`) but only for edge-signature
hashing — an existing edge's id must never change just because the
normalizer improves. `npm run backfill:kg-alias-normalization` re-normalizes
existing alias rows under the unified function, with collision handling.

**Write-time lexicon expansion, not normalization-time token translation.**
Considered folding Hungarian<->English vocabulary translation directly into
the normalizer (translate every token at match time). Rejected: it makes
`normalized_alias` values depend on the lexicon's current contents, so the
same alias row's meaning silently shifts whenever the lexicon is edited, and
it produces no reviewable audit trail. Chose instead to expand variants at
write time — `lib/kgNameLexicon.js`'s curated lexicon (17 `FULL_NAME_GROUPS`,
11 `GIVEN_NAMES`, 12 `CONCEPT_WORDS`) drives `expandNameVariants`, which
`cli/expand-kg-aliases.js` (`npm run expand:kg-aliases`) uses to materialize
concrete, versioned `translated_name` alias rows (always born `approved`,
since each is a deterministic derivation of an alias a human already
approved). `normalized_alias` values stay lexicon-version-independent; the
lexicon only ever adds new alias rows, never reinterprets existing ones. The
same `expandNameVariants` also runs live in the resolver on both mention and
candidate sides, capped at ~16 variants, with whole-token/phrase-only
substitution so compound words (e.g. "Erzsébetváros") never expand.

**Ambiguity-guard rule.** An exact alias approved on more than one canonical
location entity (e.g. two landmarks both carrying the approved alias
"Citadella") must never auto-link, even though it's an exact match — the
resolver cannot tell which candidate is meant. Enforced post-scoring by
`lib/kgAliasGuard.js`'s `suppressAmbiguousExactMatches`, which flips
`autoMatch: false` with `reason: 'ambiguous_exact_alias'` rather than
re-scoring or re-ordering anything.

**Measured before/after** (`fixtures/kg-matching-golden.json`, 53 cases;
`npm run eval:kg-matching`): before this layer landed, vector-only top-1 was
78% and translation-pair exact matches were 0/20. After: exact_hit_rate
20/20, system top-1 accuracy 35/35 (100%), negatives_clean 18/18, vector-only
top-1 63% (diagnostic only — vector similarity still never decides a match).
All 220 backend tests (`node --test`) pass.

Also landed alongside the normalizer/lexicon work: migration
`018_kg_alias_exact_match.sql` (deterministic `match_kg_entity_exact` RPC,
checked before the vector shortlist; `kg_entity_aliases.source` provenance
column: `promotion`, `public_seed`, `lexicon`, `wikidata`,
`llm_translation`); public-location seeding now also seeds
`location_translations` as approved aliases; a Wikidata anchor pass
(`load:wikidata:aliases`) that links onto existing landmarks only, never
importing new ones; and an LLM tail backfill
(`backfill:kg-alias-translations`) for landmarks the deterministic layers
still miss, always born `needs_review`.

## 2026-07-11 — Restricted-book extraction cost-control overhaul

**No prompt-schema change; `restricted-book-entities-p3` is unchanged.**
This is a cost/defaults/model-selection change to `cli/extract-restricted-book.js`,
not a prompt version bump.

The incident: a run that hardcoded `google/gemini-2.5-flash` with
`max_tokens: 12000` and a 2-attempt retry on invalid JSON, combined with an
accidental unbounded `--from-page 1` run with no `--limit`, cost roughly
$8-10 when it should have cost ~$1-2. 88 of ~200 windows failed, each
burning up to 24000 output tokens (12000 x 2 retries) for zero usable
output.

The fix, five changes to `cli/extract-restricted-book.js`:
- `max_tokens` cut 12000 -> 5000.
- `MAX_ITEMS_PER_ARRAY` cut 20 -> 10.
- Retry-on-invalid-JSON removed: was up to 2 attempts per window, now 1
  attempt — a truncated/invalid response wastes no further tokens retrying
  itself.
- New unbounded-run guard: invoking without `--limit` (including the exact
  incident shape, `--from-page` without `--limit`) and without
  `--confirm-full-book` now throws before any API call, instead of silently
  re-extracting the rest of the book.
  `--confirm-full-book` opts back into an intentional unbounded run.
- The single hardcoded model is replaced with a 3-rung cost-ordered
  ladder — `qwen/qwen3-coder:free` -> `deepseek/deepseek-v4-flash` ->
  `google/gemini-2.5-flash-lite` — each rung tried once, escalating to the
  next only on invalid JSON or a thrown API error. `KG_RESTRICTED_EXTRACT_MODEL`
  still overrides and disables the ladder entirely (one model, one attempt).
- The shared OpenRouter client's compatibility resend without JSON mode is
  explicitly disabled for extraction. One rung now means exactly one HTTP
  request, including transport/API failures.
- Every run performs a fail-closed live catalog preflight. It rejects missing
  models, missing/invalid prompt, completion, or per-request prices, and a
  `:free` model that gained a price; reserves all rungs and full
  output allowance for every pending window, and refuses a conservative
  estimate above $1 unless the operator explicitly raises the ceiling.
  `--preflight-only` shows this estimate without making a paid request.
- `--limit` must be a positive integer, so `--limit 0` cannot bypass the
  unbounded-run confirmation. The only full-book form is an omitted `--limit`
  together with `--confirm-full-book`.

See [OPENROUTER.md](OPENROUTER.md) for the full operating manual on the
model ladder, pricing, prompt caching, and cost-control tooling this entry
summarizes — not duplicated here.
