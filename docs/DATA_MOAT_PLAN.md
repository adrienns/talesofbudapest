# Data Moat Plan — Tales of Budapest

Companion to [PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md) §2 (why this wins),
[COMPETITOR_LANDSCAPE.md](COMPETITOR_LANDSCAPE.md) (the threat is
commoditization, not competitors), [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md)
(how facts are made), [VIRAL_FEATURES.md](VIRAL_FEATURES.md) (how the moat is
surfaced), and the schema ground truth in
`supabase/migrations/014_knowledge_graph_staging.sql` +
`015_knowledge_graph_canonical.sql`. Task IDs reference
[KILLER_APP_PLAN.md](KILLER_APP_PLAN.md).

**One-line thesis:** the moat is not the facts — it is the *verification,
resolution, and access infrastructure* wrapped around the facts, which gets
cheaper for us and stays expensive for everyone else with every source added.

---

## 1. Brutal honesty: what is NOT a moat

Start by killing comfortable illusions, because a well-funded clone will test
every one of them:

| Illusion | Why it fails |
|---|---|
| "We have N facts" | Raw facts are not copyrightable (blueprint §licensing). A competitor points GPT at Wikipedia + MEK and has 50,000 uncited facts in a weekend. Fact *count* is the vanity metric of this domain. |
| "We extracted public-domain books" | The same books sit on MEK for anyone. Our extraction prompts are good, but prompts leak, and frontier models keep making extraction cheaper for everyone — extraction cost is a *melting* advantage, not a moat. |
| "Our UI/UX" | Copyable in a month, stated in the blueprint itself. |
| "We were first" | First-mover in an app store is worth roughly one press cycle. |
| "LLMs hallucinate, we don't" | Only a moat if verification is *visible, branded, and auditable*. A claim of accuracy without a checkable trail is exactly what Summer AI's "proprietary fact-checking algorithm" is — marketing, indistinguishable from ours to a user. |
| "The graph schema" | Schemas are readable from any published API response. Structure without the data and the resolution history behind it is a diagram. |

What survives this audit: things that are **cumulative** (each unit of work
makes the next cheaper for us only), **contractual** (negotiated access others
must renegotiate from zero), **reputational** (trust compounds and transfers
poorly), and **legally protected as a compilation** (§7). Everything below is
one of those four.

Two non-obvious assets *are* protectable and worth naming now:

- **The English paraphrases are copyrightable expression** even though the
  underlying facts are not. `kg_claims.statement_en` — thousands of carefully
  re-expressed, historian-toned sentences — is a copyrighted text corpus. A
  scraper who republishes our statements verbatim infringes; one who
  re-paraphrases pays the full editorial cost we already paid.
- **The database as a compilation is protected by the EU sui generis database
  right** (§7) — precisely because of the verification investment, not despite
  the facts being free.

---

## 2. Moat layer 1 — provenance depth as a consumer trust product

Every AI-tour competitor's known weakness is hallucination, and none shows
sources (COMPETITOR_LANDSCAPE §2). We already require page-level citation on
every claim (`kg_evidence.page_numbers`, `public_citation_en`, NOT NULL
`source_id`), cross-family faithfulness audits (Prompt P7, T8), and human
review gates (`review_status`, `reviewed_by`, `reviewed_at` on entities,
edges, and claims). That is hygiene. The moat move is turning hygiene into a
**branded, visible, auditable trust tier**.

### The verification ladder (make it explicit, then make it visible)

| Tier | Meaning | Backed by (already in schema) | Shown to user as |
|---|---|---|---|
| **T0 Extracted** | machine-extracted, cited, unaudited | `kg_facts` staging, `mention_id`, quote in payload | never shown publicly |
| **T1 Audited** | passed cross-family faithfulness audit (P7) | audit verdict logged in `kg_evidence.metadata` / run log | citation chip only |
| **T2 Cross-checked** | ≥2 independent sources agree | 2+ `kg_evidence` rows on one claim, different `source_id` | "2 sources" chip |
| **T3 Historian-verified** | reviewed against the source page by the historian founder | `review_status='approved'`, `reviewed_by`, `reviewed_at` | **"Verified" badge + audit trail** |

Concrete work this implies:

1. **A verification ledger, not just a status flag.** Add an append-only
   `kg_review_events` table (claim/edge/entity id, reviewer, action,
   note, timestamp). `reviewed_by`/`reviewed_at` capture the latest state;
   the ledger captures the *history* — which is both the audit trail users
   can see ("verified by a historian on 2026-08-02 against p. 214") and the
   legal evidence of substantial verification investment (§7). Cheap to add
   now, impossible to reconstruct later.
2. **Badge + provenance drawer in the UI** (extends A-04 and VIRAL_FEATURES
   feature 8, "The Receipts Button"): tap "Verified" → source title, page
   ref, review date, and — where the license is green — the scanned page.
   The badge is the consumer-facing artifact; the drawer is the proof.
3. **Brand it.** One name, used everywhere ("Verified against the archive"),
   with a stated public standard: *every verified fact names a source and a
   page; anyone can check us.* Competitors can claim accuracy; they cannot
   claim page-level checkability without rebuilding our entire pipeline and
   review history. Market the standard itself (press loves a falsifiable
   promise).
4. **Publish the error policy.** The A-18 report-a-fact flow plus a public
   pledge ("disputed facts come down within a week, corrections are logged")
   turns even *mistakes* into trust capital. LLM-slop apps cannot run this
   loop because they have no fact identity to dispute.

Why this compounds: trust is the one asset that transfers across features,
sources, and years. Every verified fact raises the cost of competing on
accuracy, because the comparison is no longer claim-vs-claim but
audit-trail-vs-nothing.

---

## 3. Moat layer 2 — cross-source entity resolution as the compounding asset

The graph's economics change when the same person is linked across an
address-book row, a book chapter, a Fortepan photo, and a cemetery record.
Each new source doesn't add value linearly — it multiplies the value of every
source already integrated (a directory row is trivia; a directory row that
identifies the "Weisz A." in a memoir photo caption is a story). **The moat is
the declining marginal cost curve of integration, and that curve is produced
by infrastructure a competitor starting today does not have:**

| Accumulating asset | Where it lives | Why source #10 costs 10× less than source #1 |
|---|---|---|
| **Alias corpus** | `kg_entity_aliases` (name, former_name, translated_name, **address**, identifier kinds; normalized + embedded) | every resolved mention deposits new spellings (Weisz/Weiss/Vejsz), name orders, abbreviations; the next source's mentions hit existing aliases instead of needing adjudication |
| **Resolution golden sets** | `docs/golden-set/` (X-03, §5 of pipeline doc) | threshold tuning (auto-link ≥0.90, review 0.65–0.90) is calibrated per source-*type* once; new address-book years reuse the address-book calibration wholesale |
| **Wikidata anchor layer** | `kg_people.wikidata_id`, C-11 pre-seed | famous people arrive pre-deduped forever; each source only spends review effort on the non-famous |
| **Historical→modern address concordance** | today implicit in resolver decisions; must be reified (§6) | geocoding "Csengery utcza 17, VI. ker., 1907" is expensive once, free every time after |
| **Embedding + candidate infrastructure** | `match_kg_entity_candidates()` RPC, HNSW indexes | already built; competitors rebuild and re-tune it |
| **Review-decision memory** | resolver decisions + the proposed `kg_review_events` | every human "same person: yes" is a labeled training example; over time the gray zone (0.65–0.90) shrinks because past adjudications resolve future ones |

Two rules to make the curve real rather than hoped-for:

1. **Every resolution decision must leave a reusable residue.** No throwaway
   matching. A human merge writes an alias row; a geocoded address writes a
   concordance row; an LLM adjudication (P4) logs its verdict keyed to the
   normalized pair so it is never asked twice. Audit this in code review: if
   a resolver run ends and only the *links* were saved, the run wasted its
   most valuable output.
2. **Measure marginal integration cost per source** (hours of human review +
   $ of model spend per 1,000 promoted claims) and watch it fall (§8). If it
   isn't falling, the moat isn't forming — that metric is the early-warning
   system.

Why a competitor can't shortcut this: the alias corpus, adjudication memory,
and concordance are *not in any API response*. The public Chronicle projection
exposes conclusions, never the resolution evidence
(`get_location_chronicle` returns no aliases, no embeddings, no raw excerpts —
by design, keep it that way). Scraping our app yields facts; it does not yield
the machine that makes the next 100,000 facts cheap.

---

## 4. Moat layer 3 — hard-to-get sources (friction × value inventory)

Commodity sources (anyone scrapes them in a week) build the floor; friction
sources build the moat. Prioritize acquisition by **friction × value**, and
treat every negotiated access as a contract a clone must renegotiate from
zero — against an institution we already have a relationship with.

Friction 1–5 (5 = hardest for a competitor to replicate), Value 1–5
(5 = highest tour/graph value). Priority = work the top of Friction×Value
first *once the commodity floor exists*.

| Source | Friction | Why it's hard | Value | F×V | Status / task |
|---|---|---|---|---|---|
| **Oral histories recorded by us** (elderly locals, building communities, café owners) | 5 | doesn't exist until *we* create it; Hungarian-language fieldwork; consent workflow; historian credibility opens doors | 4 | 20 | new — §5 UGC track; we own recordings outright |
| **1880–1928 address books** (FSZEK via Hungaricana) | 4 | Hungarian-only, scan-only, agate two-column print, abbreviation-dense; needs vision pipeline (P3) + negotiated bulk access + massive resolution effort | 5 | 20 | L-13/L-14 pending — **the single highest-priority negotiation** |
| **District archives (BFL + district VII/V/VI collections)** | 5 | in-person/negotiated access, uncatalogued, Hungarian archival literacy required — a historian's home turf, unreachable to a growth-hacker clone | 4 | 20 | L-14/L-15, P-12 |
| **Parish / Jewish community records (Mazsihisz, congregational archives)** | 5 | trust-based access, maximal sensitivity, partnership prerequisite (VIRAL_FEATURES feature 12 doctrine) | 4 | 20 | new L-task; only under formal partnership |
| **Cemetery registries (Kozma utca, Fiumei úti sírkert)** | 4 | on-site, Hungarian, partial digitization; death years unlock the F-06 living-persons gate *and* close person timelines | 4 | 16 | new L-task |
| **Arcanum ADT newspapers** | 5 | commercial paywall, red verdict; only a negotiated partnership opens it | 4 | 20 (blocked) | L-19..L-21 — long-shot partnership, park |
| **Hungaricana postcards/maps (owning institutions)** | 3 | rights sit with member institutions; email-and-wait | 3 | 9 | L-16..L-18 |
| **Fortepan** | 2 | open CC BY-SA, but *relationship* is exclusive-ish: their blessing + joint announcements are non-replicable marketing | 4 | 8 | L-05..L-08, P-14 |
| **Budapest100 house histories** | 2 | scrapeable, but the KÉK partnership and festival channel are relationship assets | 3 | 6 | L-30, P-11 |
| **MEK books** | 1 | public, digital, anyone's | 4 | 4 | commodity floor — extract, but expect no defensibility |
| **Wikipedia/Wikidata** | 1 | commodity | 3 | 3 | anchor layer only |

Reading of the table:

- **The address books are the crown jewel** — high friction AND the substrate
  of the four strongest viral features (Behind This Door, Find Your Name,
  Streetline, Your Address 1913). The friction is exactly threefold: access
  (negotiation), extraction (vision pipeline), and resolution (linking rows
  to doors and people) — and we have infrastructure for all three while a
  clone has none. Send L-14 **now**; the 4-week institutional clock is the
  one schedule item that cannot be parallelized later.
- **Contractual moats:** every institutional email (Fortepan, FSZEK, OSZK DH
  Lab, BFL, KÉK) should ask not just for access but for a *written
  cooperation* — attribution, usage stats back to them, a named contact. A
  letter of support (P-34) is grant fuel; a data-cooperation agreement is a
  moat. An "official partner of Fortepan / Budapest100" line in the App
  Store listing makes the RAG-copycat route awkward (COMPETITOR_LANDSCAPE
  already notes this) and is free.
- **Oral histories are the sleeper.** Friction 5 because the source doesn't
  exist until recorded; the historian founder is uniquely equipped
  (language, method, consent handling, institutional trust). Ten recorded
  building histories in District VII is a dataset with literally one copy
  in the world — ours.

---

## 5. Moat layer 4 — the historian-in-the-loop flywheel

The founder's expert hours are the scarcest resource in the system. The
flywheel design question is: **where does one historian-hour create the most
permanent moat?** Ranked:

1. **Verifying gasp-tier facts that ship in tours** (interestingness ≥4,
   headed for narratives and viral features). These are the facts users
   screenshot, journalists check, and competitors would kill to have — they
   must be T3-verified before any narrative uses them. Rule: **no fact
   enters a generated narrative or share card above T1 unless it is T3.**
   The A-09 grounding step should filter on `review_status='approved'`.
2. **Golden sets** (extraction §5, plus a *resolution* golden set of
   hand-adjudicated person matches). One day of annotation gates every
   future model/prompt/threshold change forever — the highest-leverage hours
   in the whole project.
3. **Adjudicating the resolver's gray zone** (0.65–0.90 candidates in the
   separate admin app's `/reviews` queue, X-15) — because every decision
   deposits reusable residue (§3).
4. **Dispute resolution** (A-18 reports) — publicly logged corrections
   (§2.4) convert errors into trust.
5. ~~Reviewing dry T0 facts nobody will ever hear~~ — never. Bulk facts ride
   on the automated audit (T1) until a feature needs them.

### UGC with editorial verification — the second moat layer

Locals' family stories, building lore, and photo identifications are a source
class competitors cannot scrape *and* cannot fake — but only if verification
is structural:

- **Submission → staging, never → graph.** User submissions land as
  `kg_mentions` rows with a `source_id` like `community-submissions`
  (verdict: yellow by default), flowing through the same
  resolution/review gates as any book. The pipeline already enforces this
  shape; reuse it rather than building a parallel UGC path.
- **Three verification outcomes:** corroborated (an archival source
  confirms it → T2/T3, contributor credited), plausible-uncorroborated
  (published only in a clearly labeled "neighborhood memory" register,
  never as a verified fact), rejected (kept privately as a lead).
- **Credit is the incentive.** "Story contributed by a Kazinczy utca
  resident, verified against the 1913 directory" is both attribution and
  advertising for the verification brand. No points, no badges
  (VIRAL_FEATURES ground rule 1) — being *believed and cited* is the reward.
- **The flywheel:** viral features recruit diaspora and locals → they submit
  names, photos, corrections → historian verifies the best → verified local
  stories deepen exactly the content no competitor can generate → more
  sharing. Each turn adds facts with acquisition friction 5.
- Guardrails: F-06 living-persons rule and Civil Code §2:50 respect doctrine
  apply with full force; consent capture for oral material; GDPR basis
  documented for contributor contact data.

---

## 6. Moat layer 5 — structural and technical moats (the graph's shape)

Datasets nobody else has assembled, all falling out of work already planned —
*if* they are reified as first-class assets instead of left implicit:

1. **Historical→modern street-name concordance.** Budapest renamed streets
   in waves (1890s magyarization, 1920, 1945–53, 1990s, 2011–13). Every
   resolver run already solves instances of "Csengery utcza = Csengery utca;
   Vilmos császár út = Bajcsy-Zsilinszky út (this segment, those years)."
   Reify it: a `kg_street_concordance` table (historical name, modern name,
   segment geometry where needed, valid_from/valid_to years, evidence). The
   alias table (`alias_kind='address'|'former_name'`) already stores the raw
   material — the concordance is a curated projection of it. **This alone is
   a dataset nobody else has assembled**, it makes every future
   address-bearing source (directories, newspapers, letters, memoirs)
   cheaply geocodable, and it is independently publishable/citable (§7).
2. **Temporal address timelines** — who lived where *when*. The directory
   years (1880–1928 editions) give per-person, per-address year ranges
   (`kg_edges.start_year/end_year` already model this). The derived
   products: the Coincidence Engine (nightly overlap query), Streetline, and
   person-timeline completeness — a query surface ("everyone at this address
   in 1911") that no text corpus, RAG system, or LLM can answer without
   having done the same structured extraction + resolution.
3. **Geocoded historical addresses.** Historical house numbering shifted;
   mapping "Dob utca 16, 1907" to a modern door is concordance + archival
   plot maps + judgment. Each solved address is a permanent row; per §3,
   never let a geocoding decision evaporate after use.
4. **Person↔person edges.** Uniquely ours in the entire competitive
   landscape (COMPETITOR_LANDSCAPE §5). Their value is superlinear in graph
   density — which is why source integration order matters: sources about
   the *same* districts/people beat breadth (depth-over-breadth is already
   blueprint doctrine).
5. **Accumulated tooling calibration** — thresholds tuned per source type,
   prompts versioned against golden sets, Hungarian-specific normalization
   (surname order, orthography reforms, occupation abbreviations). Individually
   small; together, a year of Hungarian-specific tuning a general-purpose
   competitor must repeat.

---

## 7. Defense — legal, publication policy, and the big-player scenario

### The EU sui generis database right (use it deliberately)

Facts are free; **the database is not.** Directive 96/9/EC (implemented in
Hungary in the Copyright Act, 1999. évi LXXVI. tv., Chapter XI/A) grants the
*maker* of a database a 15-year right against extraction or re-utilization of
substantial parts, when there was **substantial investment in obtaining,
verifying, or presenting** the contents. Three concrete implications:

1. **Our verification IS the qualifying investment.** CJEU case law excludes
   investment in *creating* data but counts obtaining, **verifying**, and
   presenting it. The historian review ledger, faithfulness-audit logs,
   licensing files, and per-run cost/usage records (`extraction_usage`,
   model logs) are the evidence. Keep them; date them; back them up (C-26).
   Add one line to DECISIONS.md when the canonical DB reaches its first
   substantial state — the 15-year clock (which restarts on substantial
   updates, i.e. effectively rolls forward as long as we keep investing)
   runs from there.
2. **It protects against exactly the realistic attack:** a competitor
   scraping our API/app to bulk-copy the graph. Individual facts remain
   free; systematic extraction of a substantial part of *our compilation*
   is infringement in the EU — plus our API terms of use bind contractually
   (the same double lock institutions hold over us, per L-02, pointed the
   other way).
3. **We must respect it inbound, too** — which the WS-L loop already does.
   Licensing hygiene isn't only risk management; a clean, evidenced rights
   chain is a *sales asset* for B2B licensing and institutional partners,
   and the thing GPT-slop competitors conspicuously lack.

### What stays private vs. what we publish

| Asset | Policy | Rationale |
|---|---|---|
| Raw pages, quotes, extraction payloads, model metadata | **Private forever** (already enforced: RLS + `get_location_chronicle` exposes none of it) | licensing + this is the factory |
| Alias corpus, embeddings, adjudication memory, thresholds | **Private** | the compounding engine (§3) — never in any API response |
| Concordance + resolution golden sets | **Private now; publish curated versions later as citable datasets** (with DOI, via an academic partner — P-15/P-17) | academic citation = reputational moat + recruitment of scholarly contributors; publish on *our* timetable, after the app-side advantage is banked |
| Chronicle projection (facts + citations) | Public in-app; **no bulk/open API** | the product surface; per-location, cached, rate-limited |
| Open data subset | **Publish a small, attributed, CC BY-SA sample** (e.g. 500 verified facts, one district) | marketing + good-faith standing with the open-culture institutions we ask things of; ShareAlike license means a commercial cloner must share back |
| English paraphrase corpus (full) | Private as a corpus; individual statements visible in-app | copyrighted expression (§1); verbatim republication is actionable |

Anti-scrape posture: rate-limit and cache the public endpoints (already
planned, A-02), keep responses per-location rather than bulk, log access
patterns. Do **not** plant fictitious canary facts — poisoning our own data
contradicts the entire trust brand; the copyrighted paraphrase wording plus
stable fact IDs already make copied content identifiable.

### When a big player notices (Google Talking Tours, GetYourGuide, SmartGuide with funding)

Play the likely scenario forward: a big player ships "AI walking tours,
Budapest included" as a free feature. What they will have: distribution,
polish, breadth. What they won't have, at any budget, on any schedule:
FSZEK/BFL/Mazsihisz relationships, the verification ledger, the concordance,
the resolution corpus, the diaspora community, or a historian who answers
descendants' emails in Hungarian. The defensive plan is therefore:

1. **Be the licensor, not the casualty.** The graph is a B2B asset: a
   verified, cited Budapest history layer is worth licensing to exactly the
   players who might otherwise clone poorly (tour operators, publishers,
   museums, even the AI-tour apps whose known weakness is accuracy). Keep
   the rights chain clean (above) so licensing is possible on short notice.
2. **Institutional anchoring as pre-emption** (P-36): official partnerships
   make "the accurate Budapest layer" *us* in the eyes of press, city, and
   grant bodies — the entities a big player would need to displace, not
   just outspend.
3. **Depth over breadth stays the doctrine.** A platform ships 500 cities at
   Wikipedia depth; it cannot justify one city at directory-and-parish-record
   depth. Never compete on breadth; make Budapest depth the category proof
   (and the eventual "CityTales" expansion template — one moat playbook,
   repeated, with the tooling of §3/§6 amortized).

---

## 8. Metrics of moat — is it actually deepening?

Facts count is vanity. These are the real gauges; all derivable from the
existing schema plus the §2 review ledger. Review monthly (extend the
`kg_graph_status` view, X-18).

| Metric | Definition | Direction / target |
|---|---|---|
| **Verified-fact ratio** | T3 (historian-verified) claims ÷ published claims | rises; 100% for facts used in narratives/share surfaces (hard rule, §5.1) |
| **Cross-source entity ratio** | canonical entities with evidence from ≥2 distinct `source_id`s ÷ all published entities | rises steadily; the single best proxy for graph compounding |
| **Marginal integration cost** | historian-hours + model $ per 1,000 promoted claims, per newly integrated source | **falls with each source** — if flat, §3's residue rule is being violated |
| **Time-to-integrate** | calendar days from source green-light to first promoted claims | falls |
| **Exclusive-source share** | published facts whose evidence includes a friction ≥4 source (§4) ÷ all published facts | rises; this is the "un-copyable content" share |
| **Concordance coverage** | historical street names appearing in the corpus that resolve via `kg_street_concordance` ÷ all encountered | rises toward ~95% for covered districts |
| **Resolution automation rate** | mentions auto-linked (no human touch) ÷ all resolved mentions, at fixed golden-set precision ≥95% | rises (the flywheel converting past review into future automation) |
| **Correction rate** | user-disputed facts upheld as errors ÷ published facts, trailing 90 days | stays low (<0.5%) while volume grows; and 100% of disputes resolved <7 days |
| **Citation depth per narrative** | distinct cited sources per published tour stop | rises; a narrative citing 4 independent archives is unfakeable |
| **Partnership count** | institutions with written cooperation/permission on file (`docs/licensing-evidence/`) | rises; each is a contract a clone must replicate |
| **Verified UGC absorbed** | community submissions promoted to T2/T3 per month | rises after the UGC track opens (day 90+) |

One composite worth reporting to partners and grant bodies: **"% of published
content backed by page-level citation and human verification"** — a number no
competitor on the landscape can state at all.

---

## 9. Phased roadmap — 30 / 90 / 365 days

Sequenced so each phase compounds the previous; builds on the working
Dohány Street vertical slice (staging → resolution → chronicle).

### Days 0–30 — bank the trust asset, start the clocks

*Theme: make verification visible; start the negotiations that gate everything.*

- [ ] **M-30a** Send the FSZEK/Hungaricana address-book access request (L-14)
      and the Fortepan courtesy/partnership email (L-08) **in week 1** — the
      4-week institutional clock is the only thing on this roadmap that
      cannot be compressed later. *(Highest-leverage single move.)*
- [ ] **M-30b** Add the `kg_review_events` verification ledger (migration
      016) and record every review action on the Dohány slice through it.
      Backfill from existing `reviewed_by/reviewed_at`.
- [ ] **M-30c** Ship the Verified badge + provenance drawer on the Dohány
      Chronicle (extends A-04; VIRAL_FEATURES feature 8 data contract).
      Define the T0–T3 ladder in code (a derived `verification_tier`).
- [ ] **M-30d** Build both golden sets: extraction (20 pages, pipeline §5)
      and resolution (100 hand-adjudicated person-match pairs). One day of
      annotation; gates everything after.
- [ ] **M-30e** Enforce "only T3 facts enter narratives/share surfaces" in
      the A-09 grounding query.
- [ ] **M-30f** Sui generis paper trail: one DECISIONS.md entry dating the
      database's creation + investment evidence locations; confirm weekly
      pg_dump backup (C-26) is running.
- [ ] **M-30g** Instrument the §8 metrics view (extend X-18) so the baseline
      exists before the corpus grows.

### Days 30–90 — light the compounding engine

*Theme: address books in, resolution residue captured, corrections public.*

- [ ] **M-90a** On FSZEK green light: P3 vision extraction of Districts VI–VII
      for 3 sample years (C-15/C-16); resolve into `kg_edges` lived_in
      timelines. This is the substrate of the four strongest viral features.
- [ ] **M-90b** Reify `kg_street_concordance` (migration 017), seeded from
      resolver output and the alias table; require every resolver
      address-decision to write through it (§3 residue rule, enforced in
      code review).
- [ ] **M-90c** Ship the report-a-fact flow (A-18) with the public
      correction log — the error policy as trust capital.
- [ ] **M-90d** Second and third sources through the full pipeline (2 MEK
      books, Budapest100 text); **measure marginal integration cost** for
      each and record the trend — first real read on whether the moat curve
      is bending.
- [ ] **M-90e** First friction-5 acquisition: record 3 oral histories
      (District VII building communities) with consent workflow; stage them
      as a `community-*` source through the standard gates.
- [ ] **M-90f** Draft the data-cooperation one-pager used in all
      institutional meetings (access granted ↔ attribution + usage stats +
      named partnership); table it at the P-11/P-12/P-13 meetings.

### Days 90–365 — widen the gap

*Theme: exclusive share up, UGC flywheel on, the graph becomes a licensable asset.*

- [ ] **M-365a** 10+ sources integrated with marginal cost demonstrably
      falling; cross-source entity ratio and exclusive-source share
      reported monthly (§8).
- [ ] **M-365b** Open the verified-UGC funnel (submissions → staging →
      historian review → credited publication), timed to the diaspora
      feature launch (Find Your Name, VIRAL_FEATURES feature 2) so the
      audience arrives with the intake ready.
- [ ] **M-365c** Negotiated-archive expansion: BFL records, one cemetery
      registry, and the Mazsihisz conversation (partnership-first, feature
      12 doctrine). Target: ≥3 written cooperations on file.
- [ ] **M-365d** Publish the open subset (500 verified facts, CC BY-SA, one
      district) + the concordance as a citable dataset with an academic
      partner (P-15/P-17) — reputational moat, scholarly contributors, and
      good-faith standing, on our timetable.
- [ ] **M-365e** B2B licensing pilot: one museum/publisher/tour-operator
      deal for the verified layer — proves the graph is an asset with a
      price, which changes every future funding and partnership
      conversation.
- [ ] **M-365f** Moat review vs. this document: re-score §4's inventory,
      re-check §8 trends, and re-run the COMPETITOR_LANDSCAPE sweep (its
      own 6-month cadence). If marginal integration cost is not falling or
      exclusive-source share is flat, stop widening and fix the engine.

---

## Summary — the moat in one paragraph

Anyone can extract facts; nobody can cheaply replicate **(1)** a visible,
page-level, historian-signed verification trail, **(2)** a resolution engine
whose alias corpus, adjudication memory, and street-name concordance make
each new source an order of magnitude cheaper for us alone, and **(3)** a
portfolio of negotiated, Hungarian-only, scan-only, and self-recorded sources
held together by institutional relationships and protected as a compilation
by the EU database right. The facts are the product; the moat is the factory,
the receipts, and the friendships.
