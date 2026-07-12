# Vector DB Improvements — Events and Entities

Companion to [KG_APP_SYSTEM.md](KG_APP_SYSTEM.md) and
[EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md). Research-backed upgrades to
retrieval quality over `kg_entities`/`kg_entity_aliases`/`kg_claims`,
selected for **maximum result at low build effort and near-zero running
cost**. The governing principle: pay compute once at pipeline time, store the
result, serve with plain SQL. Never pay per user query.

Why embeddings alone are not enough here: 1536 dimensions is plenty of
space, but our corpus is self-similar ("X built by Y at Z in year W" over and
over), embedding models barely register dates and numbers, and Hungarian↔
English/OCR variants of proper nouns drift apart in vector space. Every item
below attacks one of those gaps. Vector similarity stays what it already is
in the resolver: a shortlist generator, never a decision-maker.

## The six techniques

| # | Technique | Effort | Run cost | Status |
|---|---|---|---|---|
| 1 | Enriched claim embedding text | S | none (one-time, ≈$1/corpus) | **implemented** (`kgEmbeddings.js`) |
| 2 | Hybrid search: FTS + trigram + vector, RRF fusion | S–M | none (SQL only) | **implemented** (migration 016) |
| 3 | Era taxonomy column | S | none | **implemented** (migration 017) |
| 4 | Adjudication memo table | S | negative (saves repeat calls) | queued — KG-14 |
| 5 | Pipeline-time reranking, stored | S | cents per book, once | queued — KG-15 |
| 6 | Resolution matching golden set | S (half day, human) | none | **implemented for entity matching** — KG-16; claim dedup fixtures remain open |

### 1. Enriched claim embedding text

Embed `"<entity name> — <claim_type>, <era/years>: <statement_en>"`, never
the bare statement. Anthropic's contextual-retrieval evals cut top-20
retrieval failures by ~49% with this family of technique; our
`stagingLocationEmbeddingText` already does it for locations. The same
enriched string feeds the keyword index (technique 2) so both retrieval arms
benefit. Cost: identical embedding volume ±10%.

### 2. Hybrid search — Postgres FTS + pg_trgm + vector, fused with RRF

Keyword search catches exactly what embeddings blur: proper nouns
("Förster"), dates ("1859"), addresses ("Kazinczy utca 29"). Trigram
similarity additionally survives OCR-mangled Hungarian. Recipe: over-fetch
~50 candidates from each arm (tsvector full-text, pg_trgm similarity,
pgvector cosine), merge by reciprocal rank fusion — rank-based, so
incompatible score scales never need reconciling — take top-k. No new
infrastructure, no per-query model calls; published benchmarks show ~7%+
NDCG lift over either arm alone. True BM25 (ParadeDB) only if FTS proves
insufficient on the golden set.

### 3. Era taxonomy

A `year → era` config map (Reform Era 1825–1848, Absolutism 1849–1867,
Golden Age 1867–1914, WWI 1914–1918, interwar 1919–1938, WWII/Holocaust
1939–1945, socialism 1945/1949–1989, post-1989) backfilled onto claims as a
filterable column. Temporal-RAG research (TG-RAG, IA-RAG) is unanimous:
"same fact, different time" is indistinguishable in vector space — encode
time as explicit structure and filter/boost by it BEFORE semantic ranking.
Also feeds narrative structure ("this building in the Golden Age") and the
admin panel's review filters. Era boundaries are config, not schema.

### 4. Adjudication memo table (queued: KG-14)

Every "same entity?"/"duplicate claim?" verdict — whether from an LLM (P4)
or from the historian — is stored keyed by the normalized pair. No judgment
is ever paid for twice; full pipeline re-runs become free; every decision
leaves reusable residue (the compounding rule from
[DATA_MOAT_PLAN.md](DATA_MOAT_PLAN.md)). Same cache-first pattern already
used for embeddings and geocoding.

### 5. Pipeline-time reranking, stored (queued: KG-15)

Never rerank live queries. When a batch of new claims lands, run the
hybrid-retrieval dedup shortlist through a cheap adjudicator
(Gemini Flash-Lite class, or a cross-encoder if we ever self-host) ONCE,
store verdicts in the memo table (KG-14), quarantine/merge accordingly. Cost
is cents per book. The app serves precomputed results — consistent with the
cached-Chronicle architecture.

### 6. Resolution/dedup golden set (partially implemented: KG-16)

The entity-resolution portion exists as 53 hand-authored cases in
`fixtures/kg-matching-golden.json`, exercised by `eval:kg-matching`. It covers
same/different entities, Hungarian/English/German names, historical names,
name-order variants, and hard negatives. A separate duplicate/distinct-claim
fixture set is still needed before claim reranking or automatic merging.
Together these are the measuring stick for the deliberately deferred embedding
model switch: adopt a multilingual model only if measured Hungarian recall
warrants the re-embedding cost (KG-17). This complements the extraction golden
set (X-03), which measures a different stage.

## Deliberately skipped (fail the effort/cost filter)

- **Embedding model switch now** — re-embed everything + eval effort; gated
  behind KG-16/KG-17 evidence.
- **halfvec / binary quantization** — storage is not a problem at 10⁴–10⁵
  rows; revisit at ~10⁶.
- **ColBERT / late interaction, GNN entity matchers** — real techniques,
  wrong scale; hybrid + rerank matches their quality at our corpus size.
- **Live LLM reranking** — recurring per-query cost, against the
  precompute-and-store principle.

## Admin panel (separate application; foundation implemented)

Many of these produce **classification tasks for a human**: review-tier
auto-link candidates (0.65–0.90), adjudication verdicts flagged `unsure`,
quarantined facts from faithfulness audits, era assignments that fall on
boundaries, junk-alias flags. The private `talesofbudapest-admin` application
now provides the authenticated shell, Insights analytics, canonical/staging
graph workbench, entity inspector, and the first review kinds (entities,
aliases, claims, edges, and location connections). It runs separately on port
3100 and is never bundled with the public app.

KG-18 remains partially open: adjudication-memo, faithfulness-audit, era-boundary,
and junk-alias task types still need to join the common review contract, with
verdicts written back to the KG-14 memo table so decisions compound. See
[ADMIN_SITE.md](ADMIN_SITE.md) for the implemented boundary.

## Name matching (2026-07-12)

KG-16's golden set now exists: `fixtures/kg-matching-golden.json` (53 cases)
plus `npm run eval:kg-matching` (`--offline` default, `--embed-missing`,
`--db`), measuring the real `scoreLocationCandidate` and `match_kg_entity_*`
code paths, never a reimplementation. The bridge-failure cases surfaced by
the earlier live eval — Erzsébet híd -> Elisabeth Bridge, Szabadság híd ->
Liberty Bridge, Margit híd -> Margaret Bridge, Franz Joseph Bridge/Ferencz
József híd -> Liberty Bridge — are now covered deterministically by
`lib/kgNameLexicon.js`'s curated Hungarian<->English lexicon
(`expandNameVariants`) plus the shared normalizer in `lib/kgNormalize.js`,
rather than depending on vector similarity. Measured: translation-pair exact
matches went 0/20 -> 20/20, system top-1 accuracy is 35/35 (100%), negatives
(including the Erzsébetváros/Elisabeth Bridge trap) stay clean at 18/18, and
raw vector-only top-1 sits at 63% as a diagnostic figure only — it still
never decides a match on its own. See
[KG_APP_SYSTEM.md](KG_APP_SYSTEM.md#entity-resolution) and
[DECISIONS.md](DECISIONS.md) (2026-07-12 entry) for the full writeup.

## Rollout order

1. Techniques 1+2 together (shared enriched text) + 3 — implemented in
   `kgEmbeddings.js` and migrations 016-017.
2. KG-14 memo table → KG-15 stored reranking (needs 14).
3. Extend KG-16 with claim-dedup fixtures, then decide KG-17 (model switch)
   with numbers, not leaderboards.
4. Extend the implemented KG-18 admin foundation with memo/audit/era/junk-alias task types.
