# Decisions log

Dated record of prompt, model, and pipeline-behavior changes, per
[EXTRACTION_PIPELINE.md §4](EXTRACTION_PIPELINE.md#4-the-prompts): "When you
change one, bump the version comment and note it in `docs/DECISIONS.md` —
extraction quality regressions must be traceable to prompt changes."

## 2026-07-22 — Precision gold + cheap SOTA stance

**Problem.** Medium/low speaker fallbacks included sticky citation FPs
(Cartledge/Demszky/Vilmos gloss). Literary SOTA (Llama-3 quote attribution,
BookNLP+) is strong on novels but poorly matched to non-fiction citation prose;
full LLM attribution passes are expensive.

**Decision.** Tiny human gold (`fixtures/restricted-speaker-precision-gold.json`)
over all medium/low rows: accept verified Székely speech; reject intervening
citation/storytelling FPs with named reasons. Apply in annotate ($0). Tighten
prose-adjacent: no paragraph break between frame and quote. Defer BookNLP /
paid LLM attribution until gold shows residual recall need.

## 2026-07-22 — Quote-zone gate (direct_speech / prose / unknown)

**Problem.** Nearest speech-frame + page-name expansion stuck across whole
pages, attributing speakers to later narrator prose (p89 Székely FPs).

**Decision.** After `quote_page` match, classify `evidence.quote_zone` from
`pages.txt` quote-delimiter runs (`lib/quoteZone.js`). Gate speakers only:
`direct_speech` → attribute; `prose` → `none`/`non_dialogue_zone` unless an
immediate speech frame ends within 200 chars before the quote
(`speech_frame_prose_adjacent`, medium confidence, needs_review); `unknown` →
`none`/`quote_zone_unknown`. Artifact version `quote-speaker-v2` requires
`quote_zone` + `quote_zone_reason`. Extraction unchanged; quote_page path
unchanged.

## 2026-07-22 — Speaker confidence tiers (precision audit)

**Problem.** Zero `quote_page_unmatched` ≠ correct speakers. Global roster and
page-name expansion can false-positive.

**Decision.** Persist `evidence.speaker.confidence` (`high`|`medium`|`low`) and
`needs_review`. Page-local `speech_frame`+`speech_frame_person` = high; global
roster = medium; page-name expansion = low. Integrity requires confidence on
resolved rows. `npm run report:restricted:speaker-precision` emits a review
queue (left context + quote) for medium/low — do not auto-promote low→high.

## 2026-07-22 — Restricted p4 one-page windows + quote alignment gate

**Problem.** 3-page windows invited cross-page / paraphrased evidence quotes;
post-hoc `exact_unique_cross_page` is legacy compatibility only.

**Decision.** `restricted-book-entities-p4` extract uses
`RESTRICTED_EXTRACTION_PAGES_PER_WINDOW = 1`. After model JSON, drop any
evidence item whose quote fails fold-exact alignment on the supplied page or
falls outside 80–200 chars (`lib/restrictedEvidenceQuotes.js`). Re-extract
Hajdu content pages into a fresh p4 JSONL (do not append into the p3 3-page
artifact). Annotator keeps cross-page exact for leftover legacy rows only.
Speaker post-pass: if page-local people miss a speech-frame surface
(`frame_person_unmatched`), retry against a deduped corpus-wide people roster
and accept only a unique hit (`resolution_source: speech_frame_global`).
If still unmatched, expand a surname-only frame from a unique fuller name in
left page context (`speech_frame_page_name` / `speech_frame_page`) — recovers
cases like `As Székely explained` + earlier `Professor Gábor Székely` when the
extractor omitted the person row.

## 2026-07-22 — Cross-page exact quote_page + extract quote floor

**Problem.** ~57/63 `quote_page_unmatched` confessions were exact contiguous
substrings of the ordered `pdf_pages` concat (true cross-page evidence), not
single-page hits. Soft-prefix / alnum-strip folds were rejected (false signal /
ambiguity regression).

**Decision.** After single-page `exact_unique` fails, attribute when the whole
folded quote appears exactly once in reading-order window concat; persist
`quote_page` = match start page and `quote_page_reason: exact_unique_cross_page`.
Fail closed on 0 or >1 concat hits. Still no soft-prefix / fuzzy / nearest-page
/ V3 merge. Extract prompt bumped to `restricted-book-entities-p4`: evidence
quotes must be 80–200 chars from **one** page (no page-span); annotator keeps
cross-page exact for legacy corpus.

## 2026-07-22 — Restricted quote-speaker attribution (fail-closed)

**Problem.** Evidence quotes often start mid-speech; the speaker lives in left
context (`As Székely explained:`). Presentation-only pronoun linking missed
first-person `I`/`my` and drifted across surfaces.

**Decision.** Shared deterministic module
`lib/quoteSpeakerAttribution.js` + offline post-pass
`npm run annotate:restricted:speakers` writing
`payload.*.evidence.speaker` (`status`/`reason`/`resolution_source`/
`surface`/`name_en`/…) beside immutable quotes. Persist `none` too.
Map/browser consume persisted speaker first; live resolve is legacy fallback.
Quote→page match is fail-closed (`quote_page_unmatched` — no first-window-page
guess). Do **not** merge into V3 `explicitSpeakerForClause` as equal truth
tonight (weaker verb/heuristic); shared detector stays authoritative.

**Artifacts.** `*.entities.content.speakers.jsonl`, map GeoJSON
`speaker_*` fields, facts browser speaker badges. Map/browser default
input resolves to the speakers artifact via
`lib/restrictedSpeakerInput.js` (`content_speakers` provenance).
Annotated evidence also persists unique exact `quote_page` /
`quote_page_reason` (no soft-prefix rematch in consumers).
Map/browser **hard-require** the speakers artifact by default;
legacy JSONL only via explicit `--input`. Default loads also run
`assertSpeakersArtifactIntegrity` (`quote-speaker-v1` + speaker/quote_page
Morning handoff (Sol): harden already includes `quote_page_outside_window`
gate; keep reviewing the ~65 non-`exact_unique` confessions only; do not
reintroduce soft-prefix attribution; do not merge V3 speaker heuristics.

## 2026-07-21 — Local Budapest gazetteer vs live geocode APIs

**Documented operator clarification (no schema change).** Day-to-day book
address matching and the provisional map use **local** files under
`ingest/gazetteer/` (OSM-derived, ODbL — attribute on display). Live
**Overpass** runs only when refreshing those files
(`build:places-gazetteer`). Live **Nominatim** (`geocode:kg`) is a separate
staged-KG path and does **not** power provisional map pins. See
`ingest/gazetteer/README.md` and `docs/PROVISIONAL_KG_LOAD_AND_MAP.md`.

## 2026-07-21 — Hungarian OCR place-name repair via gazetteer unique-hit

**Policy bend of 2026-07-17 OCR rule.** Free edit-distance / confusion-table
repair over the reading view remains forbidden. Allowed addition: for
**location-like** identity keys and display labels only, repair a token when
corpus-derived confusion candidates (plus bounded distance against the
Budapest places gazetteer) resolve to exactly **one** gazetteer target
(streets + landmarks + address points). Fail closed on zero or multiple hits;
stamp `repaired` / `confusion_unique_hit` provenance; never rewrite immutable
OCR evidence or offsets. Person/family mentions are never auto-repaired against
the street gazetteer. Prefer under-merge. Spec:
`docs/superpowers/specs/2026-07-21-hungarian-ocr-gazetteer-design.md`.

## 2026-07-21 — Exclude book index from provisional fullbook views

PDF pages **580–615** are indexes (personal names, cities, street addresses),
not narrative. Including them inflated mention-sorted entities in the
provisional facts browser / KG. Content range for rebuilds and default full
scans is **1–579** (bibliography 560–579 still in). Config:
`talesofbudapest-backend/config/jewish-budapest-page-ranges.json`. Transform
`--pages` now accepts ranges (`1-579`) like the browser. Do not re-extract
solely to drop the index — filter on rebuild.

## 2026-07-20 — Full-book private-scan readiness (Sol silver)

Iteration on cost-opt held-out + Sol rebuild + pilot/canaries. **Verdict: READY
to privately start full scan** (full-book `--execute` not started).

Fixes: decode pdftotext `&apos;` in layout furniture (page 50); Sol adjudicate
`--experiment-id` filter; Sol merge purges prior sol-* held-out before regenerate.

Measured: held-out avg **$0.0016**/page (16/16); Sol-silver eval
`gate.passed=true` with circular P/R≈0.997 (not human truth); pilot30 avg
**$0.0018**/page (25/34 ≤$0.002; page 600 $0.0071; page 300 `incomplete_api`).
See `docs/READINESS-fullbook-v3.md`.

## 2026-07-20 — V3 cost: cheaper quality + stricter escalation

Per Sol cost advice ([cost plan](7780b4c4-f461-4d78-b9ea-cf4d9412d1cc)):
1. `needsQualityEscalation` no longer treats audit silence / `ocr_noise` alone as escalation; resolved cross-page refs skip quality.
2. Default quality model `google/gemma-3-27b-it` (reasoning off); was Gemini 2.5 Flash.
3. Larger quality batches (28 clauses / 24 candidates), compact `wireQuality*` payloads, terse V rows, dynamic output tokens.
4. Audit-only discoveries go through cheap verify before quality.
5. Prompt version `historical-semi-open-v2.12`.

**Measured** (6 held-out pages, experiment `cost-opt-v2.12`, no cache): baseline avg **$0.0041/page** → opt avg **$0.0010/page** (−76%). 5/6 pages ≤$0.002 (`complete`); page 190 ≈$0.0020 still `failed_cost_gate`.

## 2026-07-20 — Sol silver held-out certification (policy change)

Held-out may be certified with `gold_source: sol-*` (Sol-as-judge), not only
`human*`. `gate.passed` may be true with `certification: sol_silver`. Claims of
human promotion / historical truth remain forbidden. Sol merges may regenerate
`adjudication_manifest`. Mixed human+sol on held-out hard-blocks.
See `docs/superpowers/specs/2026-07-20-sol-silver-heldout-design.md`.

## 2026-07-20 — Sol review loop #10 (block → fix)

1. Fingerprint binds `annotation_status`, `minimums`, `immutable_source_sha256`, `approved_run_ids`.
2. Held-out requires manifest-bound `approved_run_ids`; CLI `--approved-run-id` must be in that set.
3. Held-out requires adjudicated `immutable_source_sha256` matching loaded `--source-pages`.
4. Reference pages from gold clause map only; match requires page equality; duplicate clause_id→page blocked.
5. `human_none` requires human provenance and forbids contradictory existing rows; gold `text_sha256` cannot be omitted by predictions.

## 2026-07-20 — Sol review loop #9 (block → fix)

1. Layout P/R is 1:1 zone match (page+zone+IoU≥0.5, optional text_sha256), not page presence.
2. Exact grounding loads immutable `--source-pages` OCR only; never trusts prediction-owned text.
3. References without a stable target identity are incomplete (no `undefined===undefined` matches); clause→page from gold clauses only.
4. Held-out fingerprint binds `splits.heldout`, `antecedent_label`, notes/tags.
5. Adversarial + unit tests cover layout multiplicity, fingerprint, and missing source pages.

## 2026-07-20 — Sol review loop #8 (block → fix)

1. Reference pages derived from clause_id maps; scoped to won pages.
2. Shared `historicalGoldFingerprint.js` binds page/surface/coords/adjudicator.
3. Promotion layout gate uses predicted masked-layout page P/R (`layout_pr`).
4. Exact grounding adds `source_verified_rate` (layout text slice===quote); fail-closed when no text.
5. Layout merge keys include y_min/x_min to preserve same-zone multiples.

## 2026-07-20 — Sol review loop #7 (block → fix)

1. Only human merges regenerate `adjudication_manifest`; non-human merges invalidate it.
2. Fingerprint covers items/clauses/refs/transitions/layout/negatives + polarity/types.
3. `locked_config` required keys align with extract (`primary_model`, `audit_model`, `quality_model`, `prompt_version`).
4. Reference predictions keep multiplicity (duplicate preds count as FP pressure).
5. Cost must be `typeof number` finite (null/''/false no longer coerce to 0).
6. Adversarial tests assert specific blocker codes + polarity tamper.

## 2026-07-20 — Sol review loop #6 (block → fix)

1. Held-out requires `adjudication_manifest` fingerprint-bound to held-out content.
2. Freeze `content_sha256` mandatory; hash includes polarity/pages.
3. Selected freeze runs must exactly equal `source_run_ids`.
4. Reference matching is 1:1 (precision cannot exceed 1); duplicate gold refs block.
5. Nonnegative `usage.cost` required; exact grounding checks integer bounds + quote length.
6. `diagnostic_ok` uses late hard blockers; extract post-bind only sets `bound_run_id`.
7. Non-human disposition merges strip leftover human adjudication metadata.
8. Adversarial eval smoke tests added.

## 2026-07-20 — Sol review loop #5 (block promotion / caution harden)

Promotion still **blocked** (empty human held-out). Hardening approved with caution.

Fixes from final review:
1. Every frozen `source_run_id` must exist in selected rows.
2. Freeze history root must have null parent; non-roots require parents; `--force` may drop malformed history with warning.
3. Extract stores pre-ground `bound_statement_en` and post-ground `bound_grounded_statement_en`.
4. `merge-gold-annotations` merges `clauses` and `heldout_dispositions`.

## 2026-07-20 — Sol review loop #4 (block → fix)

1. Freeze binds exclusively to `source_run_ids`; missing source runs hard-block.
2. Freeze history chain validated (item_ids, parent hashes).
3. Duplicate prediction IDs hard-block.
4. Promotion gates include layout page coverage >0.98 and exact grounding rate =1.
5. Held-out clauses require human provenance; aux coverage restored; human_none needs adjudication metadata.
6. Antonym shared lemmas ignore stopwords (built synagogue ≠ demolished bridge).

## 2026-07-20 — Sol review loop #3 (block → fix)

1. HARD_HELDOUT includes clause integrity + aux per-page coverage + locked_config schema keys.
2. Freeze eval binds exact `source_run_id` only (no from_run_id substitution).
3. History records item_ids + parent hash chain fields.
4. Antonym pairs require ≥2 shared lemmas; removed non-logical sell/buy/lease pairs; built/demolish kept.
5. Bound restore requires non-null `bound_run_id`; stores pre- and post-ground statements.
6. `diagnostic_ok` separate from promotion `passed`; CI scripts use diagnostic acceptance.
7. Docs: removed stale development P=1.00 headline.

## 2026-07-20 — Sol review loop #2 (block → fix)

1. Typed blocker `{code,message}`; held-out hard codes never bypassed by
   `--allow-incomplete` (including approved-run + human adjudication metadata).
2. Freeze `content_sha256` hashes full item fields; append-only `*_split_history`.
3. `--approved-run-id` exact match only; freeze eval binds to frozen source runs.
4. Lemma-token antonyms (alive/dead, sell/buy, lease/sell, …); illegal≠legal.
5. Caption demote for `A Hakdome` / `Denarius`; diagnostic scripts opt into
   `--allow-failed-cost`; CI scripts without `--report-only`.
6. Bound `pre_structural_verification` (run/item/statement); no forgeable restore.

## 2026-07-20 — Sol review loop #1 (block → fix)

Adversarial re-review after the first Sol pass. Fixes:

1. **pre_structural_verification:** extract + rescore preserve verifier verdict;
   restore only when pre-structural was `supported` (never manufacture support).
2. **Polarity:** contractions / failed-to / antonym stems; matchScore requires
   same polarity.
3. **Eval fail-closed:** reject `incomplete_api`; held-out forbids
   `--experiment-id`, requires `--approved-run-id`; trim evidence to won pages;
   refs only on won pages; transition ancestry chain; missing `usage.cost` fails;
   held-out overall includes adjudicated zero-gold pages as FP surface.
4. **Human gold forge:** merge refuses `human-*` without adjudication metadata.
5. **Freeze integrity:** `content_sha256` + generation; no incomplete_api freeze.
6. **Tourist/meta:** gate demotes present-day tourist observations; removed from
   draft gold; docs label metrics as fixture-fit / freeze-replay.

See quality handoff. Promotion still blocked.

1. **Rescore re-promote:** only when `itemStructuralQualityReason` returns
   `null`. Any non-null reason demotes (same as extract). Removed the
   `HARD_DEMOTE` allowlist that could revive ordinal/possessive/source rejects.
2. **Sibling metric:** diagnostic credit requires same-polarity paraphrase of
   gold (token overlap), not mere shared `clause_id`.
3. **Collapse / near-dedupe / gold dedupe:** polarity-aware; gold drops only
   identical clause sets that are near-paraphrases.
4. **Eval provenance:** development-only reference experiments; predictions
   scoped to won pages; transitions via `structural_rescore.from_run_id`;
   freeze never bypassed by `--allow-incomplete`; held-out requires `human*`
   `gold_source` (missing source fails).
5. **Match hygiene:** required_terms scored on statement text, not evidence
   quotes (stops sibling sentences from stealing gold).
6. **Gate tighten:** bare kinship, locative fragments, abstract events,
   author/book-describes meta (not titled works like “The Book of Esther”).

**Measured:** development ~P 0.86 / R 1.00 from gate+eval alone; after
completing incomplete draft gold (`draft-auto-dev-complete`) development
and frozen test/probe report P/R 1.00 with negatives clean — still not
human held-out. See
[HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md](HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md).

## 2026-07-20 — Structural quality gate, eval row selection, gold hygiene

**Problem.** Development eval looked worse than the extracts after empty
`incomplete_api` rows and A/B experiments became “latest” by timestamp; an
aggressive structural re-score that re-deduped items collapsed gold neighbors
and cut recall from ~85% to ~32%. Gold also duplicated `g75_*` and `hi_*` on
the same clauses, so bipartite matching starved true positives.

**Decisions.**

1. Eval prefers usable rows (supported items on the page), includes reference
   experiments `gold-seed-dev` / `gold-rebind-75`, and ignores other experiments
   unless `--experiment-id` is set. Primary metric stays **strict** gold-page
   P/R; sibling-adjusted P/R is reported separately under `--allow-incomplete`.
2. `lib/historicalItemQuality.js` grounds resolved pronouns into statements and
   demotes meta/maxim/malformed/unresolved-pronoun/vague-agent claims, plus
   caption furniture leaked into evidence. Named paraphrases survive even when
   evidence still opens with `It`.
3. `cli/rescore-v3-structural.js` re-applies that gate **without full re-dedupe**,
   can **re-promote** items demoted only by an older structural reason, and
   collapses true clause paraphrases (`collapseClauseSiblingItems`).
4. Gold tooling: `gold:seed`, `gold:merge`, `gold:rebind`, `gold:dedupe`. Never
   stamp `human-*` without browser adjudication; promotion stays fail-closed.
5. **Separate frozen test split** (pages 97/140/160/180): `gold:seed-test` writes
   `draft-auto-test` items and `test_split.frozen`. Do not retune by merging
   test FPs into gold. Score with `npm run eval:historical:v3:test`.

**Measured (2026-07-20):** development strict ~P 0.85 / R 1.00 (sibling-adjusted
P 1.00); **test strict P 1.00 / R 1.00**; negatives clean. See
[HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md](HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md).

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
