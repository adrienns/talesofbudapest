# Historical Book Knowledge Extraction

Research summary and architecture decision for turning narrative history books
into reusable, evidence-grounded knowledge.

This document records:

- what we learned from the Jewish Budapest page experiment;
- how comparable digital-history projects approach the problem;
- what current information-extraction research suggests;
- the architecture selected for Tales of Budapest; and
- which artifacts must be stored so a book never needs to be scanned or OCRed
  again merely because an extraction prompt or JSON schema changes.

This is the target architecture for narrative history books. The current
[extraction pipeline](EXTRACTION_PIPELINE.md) remains the operating manual for
the implemented pipeline while this design is introduced incrementally.

## 1. The problem

The first approach attempted to turn a page directly into entities, facts,
events, and relations. That makes the expensive source-reading step depend on
the final database schema.

It has three important weaknesses:

1. Changing the output schema appears to require reading the book again.
2. Open-ended relation extraction creates many plausible but unsupported
   relations between entities that merely occur near each other.
3. Flat triples fragment one historical event into overlapping claims such as
   `took over`, `owned`, `worked at`, and `related to`, even when the source
   explicitly states only one of them.

The architecture must separate durable source evidence from replaceable model
interpretations.

## 2. What the experiment showed

We compared two approaches on the same small sample of pages.

### Reviewed extraction

The reviewed pass produced 15 claims. Its semantic quality was much better
than the local automatic pass, but only 1 of 15 stored evidence quotations
matched the saved source text exactly. The main problem was evidence
normalization rather than claim meaning.

Lesson: a correct-looking quotation is not a reliable evidence pointer. Store
the exact source span and character offsets from the immutable page text.

### GLiNER2 extraction

The broad GLiNER2 relation pass produced 212 candidates:

- 212 of 212 had evidence text that matched the source;
- 198 of 212 had a recognized subject type;
- 191 of 212 had a recognized object type;
- none had a useful normalized confidence value; and
- many relations were false, redundant, self-referential, or inferred only
  from proximity.

Examples included claims equivalent to `Jews attended the coffee guild` when
the source described a prohibition, `Szevera owned salami`, and generic
relations that duplicated a more specific event.

Lesson: local NER is useful for finding and typing mentions. Unconstrained,
multi-label relation extraction is not reliable enough to create canonical
historical facts directly.

### The containment problem

Many generated claims were contained in other claims. This is partly a
deduplication problem, but primarily a representation problem.

For example, a source sentence may state that a family took over a cafe in a
given year and retained it for a duration. Flattening that sentence can create
separate claims for takeover, ownership, date, duration, employment, and a
generic association. Most are not independent historical facts. They are
roles and qualifiers belonging to one event.

## 3. Recent historical-text projects, 2025-2026

No 2025-2026 project reviewed here converts arbitrary narrative history books
into a complete, perfectly deduplicated knowledge graph without human review.
The most relevant current work is listed newest first.

### Chronology at a glance

| Year | Project | Source material | Most relevant contribution |
|---|---|---|---|
| 2026 | Historical Diaries Knowledge Graph | Historical diaries and scholarly editions | Stable segment-level evidence, text versions, annotations, and citations |
| 2026 | HIPE-2026 | Noisy multilingual historical texts | Narrow, temporally defined person-place relation extraction |
| 2026 | Graphilosophy | The Four Books in Chinese and Vietnamese | Ontology-guided, multilayer representation that preserves interpretation |
| 2025-2026 | TRIFECTA, active project | Maritime-history and food-history texts | Entity identity, semantic change, long-tail concepts, and competing narratives over time |
| 2025 | First Four Histories GraphRAG | Classical Chinese history books | Book-derived character relations and graph-assisted retrieval |
| 2025 | HistoLens | Yantie Lun, a Western Han historical text | Dynamic knowledge graphs, entity extraction, and geo-temporal analysis |
| 2025 | ATR4CH | Cultural-heritage texts about disputed objects | Ontology-constrained LLM extraction of entities, hypotheses, and evidence |

### 2026: Historical Diaries Knowledge Graph

This work represents manuscripts, pages, exact textual regions,
transcriptions, translations, and annotations as a multi-granular RDF graph.
Its stable, timestamped segment citations are directly relevant to our
immutable page-text versions and exact evidence offsets. It focuses on durable
scholarly representation rather than fully automatic claim extraction.

- [Mapping Historical Diaries into Knowledge Graphs, 2026](https://doi.org/10.1007/s42803-026-00119-x)

### 2026: HIPE-2026

HIPE-2026 evaluates person-place relation extraction from noisy multilingual
historical texts. It limits the task to two carefully defined temporal
relations: whether a person was ever at a place and whether the person was
there around publication time. This is strong evidence for using a small,
precise relation schema instead of hundreds of open predicates.

- [CLEF HIPE-2026](https://arxiv.org/abs/2602.17663)

### 2026: Graphilosophy

Graphilosophy transforms a bilingual Chinese-Vietnamese corpus of The Four
Books into an ontology-guided, multilayer knowledge graph. It separates
linguistic, conceptual, and interpretive relationships and preserves
scholarly plurality instead of reducing every interpretation to a flat fact.
Its source is philosophical rather than urban history, so its representation
strategy matters more to us than its extraction domain.

- [Graphilosophy, 2026](https://arxiv.org/abs/2603.28755)

### 2025-2026: TRIFECTA

TRIFECTA is an active five-year ERC project combining language technology and
the Semantic Web to extract and relate information across texts over time. Its
maritime-history and food-history cases focus on identity, semantic change,
long-tail entities, context, and competing narratives. This is the closest
current project to our broader historical knowledge-graph problem.

- [TRIFECTA: Better Knowledge Graphs for Humanities Research](https://trifecta.dhlab.nl/)

### 2025: First Four Histories GraphRAG

This project creates a character-relationship dataset from the classical
Chinese First Four Histories and uses it in a graph-assisted retrieval system.
It reports relation-extraction F1 of about 0.68, which is useful evidence that
direct extraction from historical books remains imperfect even with modern
models. Its relationship scope is narrower than the event model we need.

- [Graph-RAG Based on Historical Text Knowledge Graphs, 2025](https://arxiv.org/abs/2506.15241)

### 2025: HistoLens

HistoLens uses Yantie Lun as a historical-text case study. It combines named
entity recognition, dynamic knowledge-graph construction, geo-temporal
visualization, and ideological-position analysis with LLM-assisted curation.
It is an exploratory framework rather than evidence of unattended,
production-scale book extraction.

- [HistoLens at ICML 2025](https://icml.cc/virtual/2025/50705)

### 2025: ATR4CH

ATR4CH coordinates LLM extraction with cultural-heritage ontologies through
domain analysis, annotation-schema design, extraction, integration, and
evaluation. Its case study extracts metadata, entities, hypotheses, and
supporting evidence about disputed cultural objects. The reported evidence
extraction result is particularly relevant, but its evaluated source is
Wikipedia rather than narrative books and it still requires human oversight.

- [ATR4CH, 2025](https://arxiv.org/abs/2511.10354)

### Lessons from the recent projects

- Preserve immutable source segments and stable evidence citations.
- Define a small ontology before extracting relationships.
- Model events, participant roles, time, and interpretation in separate
  layers.
- Treat identity and meaning as time-dependent historical problems.
- Keep human review for ambiguity, disagreement, and canonicalization.
- Do not interpret an exploratory demonstration as production accuracy.

## 4. Current technical direction, 2025-2026

The current direction is not unrestricted OpenIE followed by blind insertion
into a graph. It is constrained extraction followed by independent judgment,
dynamic decomposition, and canonicalization.

### Progressive relation extraction, 2026

ARETO reports strong 2026 results on fixed-schema relation benchmarks by
progressively resolving triple elements and explicitly addressing overlapping
triples.

- [ARETO, Knowledge-Based Systems 2026](https://www.sciencedirect.com/science/article/pii/S0950705125022129)

Its benchmark scores are not transferable directly to a Budapest history
book. They demonstrate the value of a fixed schema and supervised examples,
not that arbitrary historical extraction is solved.

### Constraint-based document extraction, 2026

Re2-DocRED combines LLM-assisted candidate generation with relation schemas,
entity-level constraints, and verification. It also shows that established
relation-extraction benchmarks can omit many valid facts, so benchmark scores
alone are not enough to validate our historical data.

- [Re2-DocRED, EACL 2026](https://aclanthology.org/2026.eacl-long.213/)

### Separate graph judgment, 2025

GraphJudge separates candidate graph construction from final judgment. This
matches our decision to use different extraction and verification stages
rather than asking one model to generate and approve its own claims.

- [GraphJudge, EMNLP 2025](https://aclanthology.org/2025.emnlp-main.554/)

### Dynamic decomposition, 2025

Splitting every sentence into the maximum number of atomic claims is not the
current best practice. Excessive decomposition adds noise. Current work uses
verification feedback to decide when a statement needs to be divided.

- [Optimizing Decomposition for Optimal Claim Verification, ACL 2025](https://aclanthology.org/2025.acl-long.254/)
- [Decomposition Dilemmas, NAACL 2025](https://aclanthology.org/2025.naacl-long.320/)

Lesson for us: decompose only when a compound statement cannot be verified or
represented clearly as one event.

## 5. Architecture decision

### Decision

Tales of Budapest will use an evidence-first, event-centered extraction
pipeline with a persistent canonical-claim intermediate layer.

The durable extraction unit is not a free-form triple. It is a grounded claim
candidate containing explicit semantic roles and exact evidence. Related claim
candidates are assembled into canonical event frames before promotion to the
knowledge graph.

```mermaid
flowchart LR
    A["Original file or page image"] --> B["Immutable page text"]
    B --> C["Mentions and entity types"]
    C --> D["Grounded claim candidates"]
    D --> E["Schema-constrained event assembly"]
    E --> F["Independent evidence verification"]
    F --> G["Canonicalization and subsumption"]
    G --> H["Private reviewed knowledge graph"]
    H --> I["Separate publication decision"]
```

### Why keep both claims and events?

The grounded claim layer preserves what a particular passage says in a simple,
reviewable form. The event layer represents the historical occurrence without
duplicating every qualifier as an unrelated edge.

Claims remain source-specific. Events may be supported by many claims from
different pages or books.

## 6. Durable source layer

The following artifacts are saved once and treated as immutable:

- original file identity, checksum, edition, rights record, and retrieval
  metadata;
- original page image when the source is scanned;
- extracted or OCRed page text;
- page number or stable page reference;
- text-layout mapping when available; and
- OCR engine, model, version, and processing timestamp.

A prompt change must never trigger a new scan or OCR pass. Downstream
extraction reruns from the stored page text.

If OCR itself is later improved, the new text is stored as a new version. Old
claims remain linked to the exact text version from which they were derived.

## 7. Grounded claim candidate

A claim candidate is richer than an array of strings because later processing
must know the subject, predicate, object, qualifiers, and evidence.

```json
{
  "claim_text": "The Strasser family took over the Orczy Cafe in 1870.",
  "subject": {
    "mention": "Strasser family",
    "type": "family"
  },
  "predicate": "took_over",
  "object": {
    "mention": "Orczy Cafe",
    "type": "building_or_business"
  },
  "qualifiers": {
    "time": "1870"
  },
  "evidence": {
    "page_ref": "101",
    "text_version": "sha256:...",
    "start_offset": 1234,
    "end_offset": 1308,
    "quote": "..."
  },
  "extraction": {
    "run_id": "...",
    "schema_version": "...",
    "model": "..."
  },
  "status": "candidate"
}
```

Rules:

- The evidence quote is copied by offsets, not rewritten by the model.
- Subject and object must refer to mentions in the evidence span unless the
  record explicitly identifies a resolved pronoun.
- Predicates come from a controlled schema.
- `NONE` is a valid extraction result.
- Negation, uncertainty, attribution, and time are explicit fields.
- A candidate is not a published fact.

## 8. Canonical event frame

Claim candidates that describe one occurrence are grouped into an event:

```json
{
  "event_type": "business_takeover",
  "participants": [
    {
      "entity_id": "strasser-family",
      "role": "acquirer"
    },
    {
      "entity_id": "orczy-cafe",
      "role": "acquired_business"
    }
  ],
  "time": {
    "start": "1870"
  },
  "duration": "more than 60 years",
  "evidence_claim_ids": ["claim-1", "claim-2"],
  "review_status": "needs_review",
  "publication_status": "private"
}
```

The event can later expose query-friendly derived relations, but those
relations must be marked as projections from the event rather than separately
extracted source assertions.

## 9. Initial historical schema

Start with a small ontology and expand it only when reviewed source material
demonstrates a recurring need.

Suggested first event families:

| Event family | Typical participant roles and qualifiers |
|---|---|
| Construction | architect, commissioner, building, start, completion |
| Alteration or demolition | actor, building, alteration type, date |
| Ownership or tenancy change | previous holder, new holder, property, date |
| Business operation | operator, business, premises, start, end |
| Residence | person or family, residence, start, end |
| Birth or death | person, place, date |
| Appointment or employment | person, organization, role, start, end |
| Organization founding or dissolution | founders, organization, place, date |
| Publication or creation | creator, work, publisher, date |
| Migration or journey | participant, origin, destination, date |
| Law, prohibition, or permission | authority, affected group, action, date |
| Attack, persecution, rescue, or commemoration | actors, affected entities, place, date |

This ontology is intentionally narrower than every relation a general model
could imagine.

## 10. Entity and relation constraints

Before relation extraction, the system determines which event schemas are
possible for the detected entity types.

Examples:

- `architect` requires a person or organization and a constructed work.
- `residence` requires a person or family and a place.
- `publication` requires a work and usually a creator or publisher.
- `ownership_transfer` requires an ownable entity and at least one holder.
- a food item cannot become the object of `owned_building`;
- two identical mention IDs cannot form a self-relation unless the schema
  explicitly permits it.

The extractor sees only plausible schemas for the passage and must be able to
return `NONE`. This is the primary defense against the GLiNER2 false-positive
pattern.

## 11. Verification

Candidate generation and verification must use separate prompts and,
preferably, different model families.

The verifier answers:

1. Does the evidence assert the event rather than merely mention both
   entities?
2. Are subject, object, and participant roles correct?
3. Are negation and modality preserved?
4. Were dates, quantities, or names sharpened beyond the source?
5. Does every qualifier belong to this event?

Possible verdicts:

- `supported`;
- `partially_supported`;
- `unsupported`;
- `ambiguous`; or
- `contradicted_by_evidence`.

Only supported candidates proceed automatically. All others remain private
and reviewable.

## 12. Canonicalization and containment

Canonicalization operates after verification.

| Relationship between candidates | Action |
|---|---|
| Same meaning and same event | Merge; retain all evidence records |
| One is a less specific restatement | Keep the specific event; mark the generic candidate as subsumed |
| Same event with complementary qualifiers | Merge qualifiers into the event, retaining qualifier-level evidence |
| Same entities but different occurrences | Keep separate events |
| Sources disagree | Keep separate source assertions; flag the event for review |
| Generic relation inferred from an event | Store as a derived projection, not a new source claim |

Equivalence and subsumption should use controlled predicates, normalized
entities, compatible times, event identity rules, and bidirectional entailment
checks. String similarity alone is insufficient.

The core invariant is:

> One canonical event may have many source assertions and evidence spans.

## 13. Model responsibilities

### GLiNER2

Use GLiNER2, or a comparable local model, for:

- mention detection;
- preliminary entity typing; and
- optionally proposing entity pairs for later constrained extraction.

Do not use its broad relation output as canonical facts.

### Schema-constrained extractor

Use a compact LLM or trained relation/event model to:

- select from allowed event schemas;
- assign participant roles;
- extract qualifiers;
- return `NONE` when unsupported; and
- emit evidence pointers rather than rewritten quotations.

### Verifier

Use a separate model or fine-tuned judge to assess support against the exact
evidence span.

### Human reviewer

Human review remains authoritative for:

- low-confidence or ambiguous cases;
- entity-resolution collisions;
- contradictory accounts;
- ontology expansion; and
- movement from private to public data.

## 14. Versioning and reprocessing

Every derived record must identify:

- source and edition;
- page-text version;
- extraction run;
- extractor model and prompt version;
- ontology or schema version;
- verifier model and prompt version; and
- canonicalization version.

Reprocessing rules:

| Change | What reruns |
|---|---|
| UI or API JSON changes | Projection only |
| Database projection changes | Projection from canonical events |
| Canonicalization improves | Canonicalization from verified candidates |
| Event schema changes | Event assembly from grounded candidates; source text only if required fields were never captured |
| Extraction prompt or model changes | Candidate extraction from stored page text |
| OCR improves | New page-text version, then downstream stages for that version |
| Physical source or edition changes | Full intake for the new source |

This is the practical answer to the rescanning concern: most changes rerun a
cheap downstream stage. Only a genuinely improved OCR layer revisits page
images, and the physical book does not need to be exported or scanned again.

## 15. Database boundary

The exact SQL schema is a separate implementation decision, but the database
must distinguish these conceptual records:

| Record | Purpose |
|---|---|
| Source | Bibliography, edition, rights, checksum |
| Source page | Immutable text/image version and page reference |
| Mention | Exact entity occurrence in a source span |
| Claim candidate | Source-specific semantic assertion |
| Evidence assertion | Link from a claim/event field to an exact source span |
| Canonical entity | Resolved person, place, organization, work, or object |
| Canonical event | Deduplicated event frame |
| Event participant | Entity role within an event |
| Derived relation | Query projection generated from an event |
| Extraction run | Model, prompt, schema, cost, and run status |
| Review decision | Human or automated verdict with provenance |

Existing `kg_pages` should remain the durable text boundary. Existing staged
mentions and graph records can be migrated incrementally; this document does
not imply that all conceptual records already have dedicated tables.

## 16. Evaluation plan

Build a reviewed golden set before selecting the production extractor.

The first set should contain approximately 100 to 300 claims across pages
with:

- ordinary narrative prose;
- multiple people and buildings in one sentence;
- negation and prohibitions;
- pronouns and partial names;
- uncertain or approximate dates;
- overlapping event descriptions;
- tables, captions, and footnotes; and
- claims repeated on multiple pages.

Measure separately:

- mention precision and recall;
- event detection precision and recall;
- participant-role accuracy;
- qualifier accuracy;
- exact evidence-span accuracy;
- unsupported-claim rate;
- duplicate-event rate;
- incorrect-merge rate; and
- verifier acceptance and rejection accuracy.

The existing production gate remains a useful minimum: precision at least
95 percent and recall at least 80 percent on the relevant source type.
Incorrect merges and unsupported published claims should have a stricter,
near-zero tolerance.

## 17. Implementation sequence

1. Preserve immutable page text and text versions.
2. Define the first small event ontology and its entity-type constraints.
3. Add the grounded claim-candidate artifact with exact evidence offsets.
4. Convert the current sample into a reviewed golden set.
5. Use GLiNER2 only for mentions and preliminary types.
6. Run schema-constrained event extraction with explicit `NONE`.
7. Add independent evidence verification.
8. Add canonical event assembly, equivalence, and subsumption.
9. Store multiple evidence assertions per canonical event.
10. Expose graph relations as projections from reviewed events.
11. Keep all restricted-book outputs private until a separate rights and
    review decision authorizes publication.

## 18. Final decision summary

### Implemented NLP-first pilot

The bounded private pilot is available as:

```bash
cd talesofbudapest-backend
npm run setup:historical:nlp
npm run extract:historical:nlp -- --source jewish-budapest --from-page 46 --page-count 3
```

It runs `fastino/gliner2-multi-v1` locally for exact-offset mentions, persists
the mention artifact, derives eligible event schemas from the detected types,
and then sends the pages plus mention IDs to a schema-constrained extractor.
Generated participants are rejected unless their local mention span lies
inside the exact evidence quote. A different model family verifies surviving
candidates. The command is capped at three pages, defaults to a conservative
USD 0.05 API ceiling, writes only private JSONL artifacts, and never writes to
the database. Use `--mentions-only` for a fully local run or `--preflight-only`
to store mentions and check live model pricing without an extraction request.

### Implemented LangExtract grounding pilot

The LangExtract pilot uses Qwen for compact historical items and Gemini only
for unresolved reference groups. Easy references are resolved locally first;
remaining questions are sent in batches of at most 12. Exact model requests
are cached by model, prompt, parameters, and response schema. A repeated run
therefore reuses only previously validated JSON and reports cached tokens and
cost as savings rather than charging them to the new run. Use `--no-cache` for
a deliberately fresh response or `--cache-file PATH` for an isolated cache.

The default 6,000-character Qwen chunk remains intentional. An 8,000-character
experiment reduced the nominal request count but returned invalid JSON twice,
so it was rejected rather than trading reliability for a smaller call count.

### Implemented semi-open V2

V2 runs beside the pilot and keeps the earlier commands unchanged:

```bash
cd talesofbudapest-backend
npm run extract:historical:v2 -- --source jewish-budapest --from-page 46 --page-count 3 --preflight-only
npm run extract:historical:v2 -- --source jewish-budapest --from-page 46 --page-count 3 --resume
npm run eval:historical:v2 -- --split heldout
```

The local stage ledgers every clause, preserves raw offsets, adds adjacent-page
boundary context, and treats retrieved schemas as hints with an open fallback.
The model wire format uses short temporary IDs and compact tab-separated rows;
stored artifacts expand them into stable item and coverage records. Flash-Lite
extracts, Qwen independently audits, and Flash adjudicates only unmatched or
risky items. Results remain private in `historical-items-v2.jsonl` and
`historical-coverage-v2.jsonl`.

The evaluator fails closed. It cannot pass until the 48-page gold fixture has
exhaustive human clause adjudication, at least 300 items (150 held out), and a
locked extraction configuration. Gates are strict precision and recall above
0.95 and average API cost at most USD 0.002 per source page.

We will not rescan or OCR a book when extraction logic changes. We will retain
an immutable source-text layer and version every downstream interpretation.

We will not treat broad zero-shot relation output as historical truth. Local
NER may propose mentions, but event extraction will be schema-constrained,
type-constrained, evidence-grounded, and independently verified.

We will not solve overlap by maximizing atomic triples. We will preserve
source-specific grounded claims, assemble them into canonical event frames,
and represent dates, durations, participants, and roles as parts of the event.

The resulting design is:

> immutable pages -> grounded claims -> verified canonical events -> derived
> graph projections
