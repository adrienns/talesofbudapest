# Tales of Budapest — Task Backlog (checkboxes)

This is the execution backlog. The strategy, architecture, free-first stack
policy, and edge-case playbooks live in
[PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md) — read that first; when the two
disagree, the blueprint wins. Prompts, model choices, and file-intake details
live in [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md).

**Vision:** a living historical knowledge graph of Budapest — every building knows
who lived there, what happened there, and can show and tell you on the street,
with generated media. Distributed as an iOS app first, Android later.

**Budget rules (apply to every task — full policy in blueprint §4):**
1. **Free first; self-host second; pay only at a written trigger or where no
   free path exists** (LLM inference, Apple's $99, a domain). If demand ever
   outgrows a free tier, the stack table in the blueprint names the response.
2. Expensive things (LLM, image restoration, video, TTS) run **once, in batch, at
   night, on free infrastructure**. Users only download cached files.
3. Paid commitments (Apple's $99/year is the big one) are delayed to the **last
   possible moment** in the sequence.
4. No data source enters the pipeline without its license documented. If the
   license is unclear → contact the institution → written answer → only then ingest.

**How to use this document:** it is a backlog. Work top to bottom inside each
workstream; workstreams marked ∥ can run in parallel. Check off tasks as you go.
Task IDs are stable — reference them in commits (`feat: KG-12 person resolver`).

**Workstreams:**
- [WS-0 — Foundation, legal entity, GDPR](#ws-0)
- [WS-L — Licensing and data rights (per database)](#ws-l) ∥
- [WS-P — Partnerships, municipality, funding](#ws-p) ∥
- [WS-KG — Knowledge graph schema](#ws-kg)
- [WS-C — Corpus acquisition](#ws-c)
- [WS-X — LLM extraction factory](#ws-x)
- [WS-A — App features (Chronicle, graph-hop)](#ws-a)
- [WS-M — GenAI media layer](#ws-m) ∥
- [WS-W — Proximity walking guide](#ws-w) ∥
- [WS-I — iOS App Store release](#ws-i)
- [WS-D — Android release (later)](#ws-d)
- [WS-Q — Quality, beta testing](#ws-q)
- [WS-G — Launch and growth](#ws-g)
- [WS-O — Operations and cost control](#ws-o)

**Current state (already built — do not rebuild):** multi-source ingest
(`ingest/src/`: Budapest100, Wikipedia/Wikidata, műemlékem.hu, Fortepan
enrichment, geocoding, dedup, importance scoring); Supabase schema migrations
001–013 (locations, provenance, translations, audio variants, RAG/pgvector);
narrative planning + generation APIs; OpenRouter LLM + TTS clients; Next.js
map app with clustering, questionnaire, full-screen player, hu/en i18n.

---

<a id="ws-0"></a>
## WS-0 — Foundation, legal entity, GDPR (16 tasks)

Needed before the App Store and before signing anything with institutions.

- [ ] **F-01** Decide publishing identity: individual Apple developer account
      (cheapest, your own name shows in the store) vs company. Start as
      individual; revisit if a grant or partner requires an entity.
- [ ] **F-02** Check Hungarian/home-country rules for app revenue as a private
      person (only matters when you charge money — free app = simpler).
- [ ] **F-03** Register the domain (~$10/yr) and a project email address
      (used for all institutional contact — looks serious, keeps inbox clean).
- [ ] **F-04** Write a plain-language privacy policy page. Key facts to state:
      location is processed on the device, no account required, no location
      history stored on servers.
- [ ] **F-05** GDPR check — you're operating in the EU. Confirm: no personal
      data of *living* people in the knowledge graph (see F-06), analytics is
      cookieless (Cloudflare Web Analytics), consent screen only if you later
      add anything that tracks.
- [ ] **F-06** Write the "living persons" rule into the extraction pipeline
      spec: the graph only stores people who died ≥10 years ago OR are clearly
      public historical figures. GDPR does not apply to the dead, but be safe.
- [ ] **F-07** Write a terms-of-use page (walking at your own risk, historical
      content may contain era-typical disturbing events, AI-generated media is
      labeled).
- [ ] **F-08** Create the attribution/credits page skeleton in the app —
      every data source gets a line here (several licenses require it).
- [ ] **F-09** Create `docs/DECISIONS.md` — one line per irreversible decision
      (licensing answers, naming, pricing). Future-you will thank you.
- [ ] **F-10** Create a tracking spreadsheet (or Notion/GitHub Project) with
      these task IDs — this file is the source of truth, the board is the
      daily driver.
- [ ] **F-11** Reserve app name: check App Store, Google Play, Instagram,
      TikTok for "Tales of Budapest" collisions. Decide fallback name now.
- [ ] **F-12** Design a simple logo/icon (1024×1024 master). Free route:
      generate candidates with AI, refine one manually. Needed for App Store,
      TestFlight, and institutional emails.
- [ ] **F-13** Set up the free infrastructure accounts: Cloudflare (Pages, R2,
      Web Analytics), GitHub (Actions), Supabase (free tier), OpenRouter,
      Google AI Studio (Gemini free tier). Store keys in a password manager.
      Note: enabling R2 requires putting a card on file with Cloudflare even
      for free-tier use — expected, not a cost.
- [ ] **F-14** Verify the Oracle Free Tier VM (`infra/`) is reachable, has the
      Supabase docker stack from your existing guide, and add a weekly
      `apt upgrade` + disk-space cron.
- [ ] **F-15** Hungarian personality-rights rule (beyond GDPR): the Civil
      Code (Act V of 2013) §2:50 protects the *memory of the deceased* —
      relatives can sue over disrespectful portrayal, with no time expiry.
      Write this into the content rules: talking-resident monologues and
      portrayals must be respectful and strictly fact-based; the
      descendant-objection playbook (blueprint §12) is grounded in §2:50,
      not GDPR. The ten-years-dead rule limits but does not remove this.
- [ ] **F-16** Web deploy audit: Next 15 App Router on Cloudflare Pages is
      NOT drop-in — it needs the OpenNext/next-on-pages adapter, and the
      API routes import Node-flavored backend code (`@backend` alias,
      dotenv in `next.config.ts`) that won't run on the edge unmodified.
      Decide now: adapt the API for Workers, or host the API on the Oracle
      VM behind Cloudflare and keep Pages for static assets only.

---

<a id="ws-l"></a>
## WS-L — Licensing and data rights, per database (37 tasks)

**The loop for every source:** ① research the published license → ② record
verdict in `kg_sources.license` + `docs/DECISIONS.md` → ③ if unclear, email the
institution (template L-03) → ④ wait for written answer, follow up after 2
weeks → ⑤ only ingest after a green verdict. Never ingest "meanwhile".

### Groundwork
- [ ] **L-01** Create `docs/LICENSING.md` — a table: source / what we take /
      license / verdict (green-yellow-red) / contact / date / evidence link.
- [ ] **L-02** Learn the 4 license classes you'll meet: public domain (PD),
      Creative Commons (CC-BY needs attribution; CC-BY-NC blocks you if you
      ever charge — treat NC as yellow), database rights (EU sui generis —
      applies to *collections* even of PD items), and "all rights reserved".
      Four doctrine points to record in LICENSING.md up front:
      (a) facts are never copyrightable — extracting facts from Hungarian
      text and storing them re-expressed in English keeps zero protected
      formulation (translating whole *passages* would be derivative;
      atomic fact extraction is not);
      (b) the EU TDM exception (DSM Directive Art. 4) permits mining
      lawfully accessible content unless the rights holder opted out
      machine-readably — check for opt-outs per source;
      (c) what survives even for facts: the *database* right on the
      digitized collection (15 years from creation/substantial update) +
      the site's contractual terms — this, not copyright, is why bulk
      access still needs the institution's green light;
      (d) photos: term is photographer's life + 70 (anonymous: 70 years
      from publication) — pre-~1900 is safely PD, but a 1935 photo can be
      protected until the 2040s, so 20th-century photos are used under
      *license* (Fortepan CC BY-SA), never under an "old = free"
      assumption; a faithful scan of a PD work gains no new copyright
      (DSM Art. 14). Explicitly rejected assumption: "communist-era =
      free". Socialist Hungary had copyright law throughout (1921 and
      1969 Acts); EU accession REVIVED lapsed short photo terms to
      life+70; and state archives (e.g. MTI) are owned, commercial, and
      actively licensed today. Communist-era photos come via Fortepan's
      license or an institutional agreement — never assumed PD.
- [ ] **L-03** Write the contact email template, in Hungarian and English:
      who you are, the cultural mission, exactly what data, exactly how used
      (mobile app, attribution shown), ask for written permission or their
      standard terms. Short, warm, specific.
- [ ] **L-04** Decide the commercial question NOW: will the app ever charge?
      Answer shapes every license verdict (NC clauses). Recommendation: plan
      for "free with optional paid premium routes" and ask every institution
      for permission *including* modest commercial use — asking twice is worse.

### Fortepan (photos — your most important media source)
- [ ] **L-05** Verify current terms: Fortepan photos are **CC BY-SA 3.0**
      (Attribution-ShareAlike, NOT plain CC-BY) — confirm on fortepan.hu,
      screenshot the terms page into `docs/licensing-evidence/`.
- [ ] **L-06** Implement the attribution format as a reusable UI component +
      in video credits: "Fortepan / Donor name, CC BY-SA 3.0" — ShareAlike
      requires naming the license, not just the source.
- [ ] **L-07** Accept the ShareAlike consequence and record it in
      DECISIONS.md: AI-modified versions (colorized, upscaled, animated) are
      derivative works and must themselves be released under CC BY-SA —
      meaning anyone may freely reuse your restored/colorized hero media
      with the same credit. Commercial use stays allowed, so monetization is
      unaffected. On-screen label: "AI-colorized. Original: Fortepan / X,
      CC BY-SA 3.0".
- [ ] **L-08** Email the Fortepan team anyway (courtesy + partnership seed,
      see P-14): tell them what you're building; ask if they object to
      AI-enhanced derivatives. Their blessing is marketing gold.

### MEK / OSZK — National Széchényi Library e-books (your #1 text source)
- [ ] **L-09** For each of the ~20 target books (C-05): check the MEK record
      page for its individual license (MEK items vary: PD, CC, or restricted).
- [ ] **L-10** Sort the book list into green (PD / permissive CC) and yellow.
- [ ] **L-11** For yellow books: email MEK/OSZK (info@mek.oszk.hu) with template
      L-03, listing exact titles. Note: *facts are not copyrightable* — only
      expression is. Extracting facts into your graph is likely fine even from
      copyrighted text, but get their position in writing; you also want to
      QUOTE short passages (that needs quotation-right compliance: named
      source, limited length).
- [ ] **L-12** Record the fact-vs-expression rule in `docs/LICENSING.md`:
      the graph stores facts + citations (safe); verbatim page text stays in
      the private staging DB, never shown to users unless the source is green.

### Address books + Budapest City Archives (BFL)
- [ ] **L-13** The 1880–1928 address books ("Budapesti Czím- és
      Lakásjegyzék") are an **FSZEK Budapest Gyűjtemény** collection hosted
      on Hungaricana (a parallel copy sits on Arcanum ADT — red per L-19,
      so FSZEK/Hungaricana is the only viable path). Content is PD (authors
      long dead), but the *scans and database* may carry usage terms
      (database right, L-02). Verify the collection terms on Hungaricana.
- [ ] **L-14** Email **FSZEK** (the rights owner — combine with L-29's
      thread): describe the project, ask for terms of programmatic access
      to the digitized address books and whether bulk/API options exist.
      Separately email BFL (bfl@bparchiv.hu) about the archival records
      *they* actually hold. Libraries and archives often LOVE projects
      like this — but ask the right owner, or the 4-week clock (L-35)
      burns against someone who can't say yes.
- [ ] **L-15** Ask BFL in their thread about historical photos, maps, and
      records they hold, and about a possible cooperation (feeds P-12).

### Hungaricana (aggregator: postcards, documents, maps)
- [ ] **L-16** Read Hungaricana's terms of use; determine if scraping metadata
      + images is permitted (likely restricted — expect yellow/red).
- [ ] **L-17** Identify which *member institution* owns each collection you
      want (postcards are often FSZEK or BFL) — rights sit with them, not the
      portal. Contact the owner, not the aggregator.
- [ ] **L-18** Email the owning institutions for the top-2 collections you
      actually need (postcards of District V–VII streets; old map scans).

### Arcanum ADT (newspapers) — expect RED
- [ ] **L-19** Confirm: Arcanum is a commercial subscription. Do not scrape.
      Record red verdict.
- [ ] **L-20** Check if your library card (FSZEK) gives legal personal access
      for *research* — reading to find leads is fine; bulk extraction is not.
- [ ] **L-21** Alternative: email Arcanum. They have partnered with cultural
      projects before; a "powered by Arcanum" deal for newspaper snippets is
      a long shot but free to ask. Park it as low priority.

### Wikimedia ecosystem (Wikipedia, Wikidata, Wikisource, Commons)
- [ ] **L-22** Record verdicts: Wikipedia text CC BY-SA **4.0** (since
      mid-2023 — record the version; 3.0/4.0 compatibility rules differ;
      attribution + share-alike for *text you reproduce*; facts are free),
      Wikidata CC0 (fully free), Commons per-file (check each), Wikisource
      mostly PD.
- [ ] **L-23** Note the CC-BY-SA trap: if you *display* Wikipedia-derived
      prose, that prose must stay share-alike. Your LLM-rewritten narratives
      grounded in facts are fine; verbatim reuse needs the license note.
- [ ] **L-24** Implement per-file license capture for every Commons image at
      download time (`kg_media.license` from the API, automated).

### OpenStreetMap + map tiles
- [ ] **L-25** Record: OSM data is ODbL — requires attribution ("©
      OpenStreetMap contributors") and share-alike for *derived databases*
      of geodata. Add the credit line to the map UI, AND note the open
      question in LICENSING.md: if OSM geodata is systematically extracted
      into your locations tables (the geocode enrichment does this), that
      derived geodatabase may itself need to be offered under ODbL when
      publicly used. Low practical risk for coordinates of named landmarks;
      revisit before licensing the graph commercially (§10 of blueprint).
- [ ] **L-26** OpenFreeMap tiles: confirm free use terms, add attribution.

### Europeana
- [ ] **L-27** Register for the free API key; note that every record carries
      an explicit rights statement — filter queries to open licenses ONLY
      (`REUSABILITY:open`) so nothing yellow ever enters the pipeline.

### Old maps
- [ ] **L-28** Verdict per map: Wikimedia Commons scans of 1873/1896/1908
      Budapest maps → check each file's PD status (pre-1900 government maps
      are PD). Mapire/Arcanum's *georeferenced* versions are their work —
      red, don't copy. You georeference the PD scans yourself (M-16).
- [ ] **L-29** Email FSZEK's Budapest Collection (Budapest Gyűjtemény) asking
      about their map scans and photo collection terms (also feeds P-13).

### Budapest100 / KÉK
- [ ] **L-30** You already scrape budapest100.hu. Check their site terms;
      the content is community-researched house histories — email KÉK
      (Contemporary Architecture Centre) for explicit permission + partnership
      (P-11). Their answer is probably enthusiastic yes-with-credit.

### műemlékem.hu (monument registry)
- [ ] **L-31** Check terms; the underlying monument registry is public-sector
      data (EU open data directive helps you here — cite it in the email if
      needed). Email the operator if unclear.

### Remaining sources + process hygiene
- [ ] **L-32** MTVA/Filmhíradó newsreels (1930s street footage): check
      filmhiradokonline.hu terms — likely view-only (red for reuse, green for
      inspiration/linking). Record verdict.
- [ ] **L-33** Kiscelli Museum / BTM photo collections: research terms, email
      if a specific collection matters to you.
- [ ] **L-34** Set a rule: any NEW source in the future gets an L-task before
      a C-task. Add this to the PR checklist.
- [ ] **L-35** Follow-up pass: 2 weeks after each email with no reply, send
      one polite nudge; after 4 weeks, mark "no answer = red" and move on.
- [ ] **L-36** When permissions arrive, save PDFs/emails to
      `docs/licensing-evidence/` and flip verdicts in `docs/LICENSING.md`.
- [ ] **L-37** Final gate before public launch (G-track): re-read
      `docs/LICENSING.md` top to bottom; every source feeding user-visible
      content must be green. Yellow → feature-flag off.

---

<a id="ws-p"></a>
## WS-P — Partnerships, municipality, funding (22 tasks)

Free help exists; you have to ask for it in the right order: credibility
first (a working demo), then institutions, then money.

### Prepare the ask
- [ ] **P-01** Build a 10-slide deck (Hungarian + English): the vision, one
      screenshot-worthy demo (then/now slider), what you ask for (data access,
      letter of support, promotion — NOT money at first), what they get
      (their collection reaching tourists, full attribution, usage stats).
- [ ] **P-02** Record a 90-second screen video of the working prototype —
      institutions respond to *seeing* their photos in the app.
- [ ] **P-03** Make a one-page PDF version of the deck for email attachments.
- [ ] **P-04** Order of contact rule: never cold-contact the municipality
      first. Sequence: Fortepan/KÉK (friendly, fast) → libraries/archives →
      district municipality → city level. Each yes strengthens the next email.

### Cultural institutions (data + credibility)
- [ ] **P-11** Meet KÉK / Budapest100 (see L-30): propose cross-promotion —
      their May festival visitors get your app; your app credits their house
      research. Ask for a letter of support.
- [ ] **P-12** Meet BFL (city archives, see L-14/L-15): propose "Archives
      on the street" framing around the records, photos, and maps BFL
      actually holds (the address books are FSZEK's — that pitch belongs
      in the P-13 meeting). Archives have public-engagement KPIs; you ARE
      their KPI.
- [ ] **P-13** Meet FSZEK Budapest Gyűjtemény (see L-29): the Budapest
      Collection librarians know the sources better than anyone. Ask for a
      1-hour consultation on the best books for your corpus (C-05) — free
      expert curation.
- [ ] **P-14** Meet/call the Fortepan team (see L-08): show colorized/animated
      derivatives BEFORE publishing them; invite them to flag concerns. They
      are media-beloved; a joint announcement is press coverage.
- [ ] **P-15** Contact OSZK Digital Humanities Lab (dh.oszk.hu) — they run
      projects on exactly this kind of text mining; potential technical ally
      and grant co-applicant.
- [ ] **P-16** Contact BTM (Budapest History Museum) + Kiscelli Museum:
      propose the app as a funnel to their exhibitions ("want more? The
      original is in Kiscelli, 20 min from here").
- [ ] **P-17** Contact one university history department (ELTE BTK) — offer
      the graph as a research/teaching tool; ask for a student volunteer or
      thesis project on fact-checking the corpus (free QA workforce, real
      academic credibility).

### Municipality and tourism
- [ ] **P-21** Research who does what: Budapest Brand Zrt. (city marketing +
      tourism), the Mayor's Office cultural department, and DISTRICT
      municipalities (Erzsébetváros/VII and Belváros/V have their own culture
      budgets and are far easier to reach than City Hall).
- [ ] **P-22** Start with ONE district (VII — your spy route lives there):
      email the cultural deputy with the one-pager; ask for: permission/
      support for QR plaques on buildings (G-07), inclusion in district
      newsletters, intro to Budapest Brand.
- [ ] **P-23** Meet Budapest Brand: ask for inclusion in official tourism
      channels (budapestinfo.hu, Budapest Card partner catalog). Budapest Card
      partnership = distribution to every cardholder; a free app is an easy
      yes for them.
- [ ] **P-24** Ask about the city's public wifi/info screens and BKK
      (transport) channels for launch promotion — long shot, free to ask.
- [ ] **P-25** Check district VII/V "settlement image" (településkép) rules
      for street stickers/plaques BEFORE printing any (illegal stickering
      would poison the municipal relationship).

### Money (only after a demo exists)
- [ ] **P-31** Map grant options and deadlines into the tracking board:
      NKA (National Cultural Fund — digital culture calls), EU **Creative
      Europe** (culture + tech), **EIT Culture & Creativity** (innovation
      calls), Visegrad Fund (if you later expand to Prague/Warsaw = perfect
      fit for "CityTales").
- [ ] **P-32** Hungarian startup support (free, no equity at this stage):
      Design Terminal mentoring programs, Hiventures pre-seed (state VC,
      smallest ticket), university incubators. Apply to one mentoring
      program — the network matters more than the money.
- [ ] **P-33** Competitions with cash prizes and press: check current-year
      cultural-heritage hackathons (Europeana runs them regularly —
      "Europeana challenges"), Hungarian innovation awards. One win pays for
      years of Apple fees.
- [ ] **P-34** Letters of support from P-11..P-17 → attach to every grant
      application. Institutions co-signing = the #1 predictor of cultural
      grant success.
- [ ] **P-35** Rule: grant paperwork never blocks the build. Timebox all of
      WS-P to ≤1 day/week.
- [ ] **P-36** **Milestone:** ≥3 institutions met with the demo, ≥2 written
      letters of support in hand, and 1 district contact who answers your
      emails. That's "institutionally anchored" — grants and QR plaques
      unlock from here.

---

<a id="ws-kg"></a>
## WS-KG — Knowledge graph schema (18 tasks)

> **Implementation note (2026-07-12):** this section began as a planning
> sketch, so some early table names below are historical. The implemented
> generic canonical model is `kg_entities` / `kg_entity_aliases` /
> `kg_claims` / `kg_edges` / `kg_evidence`; staging also includes
> `kg_organisations`. Migrations `014` through `019`,
> [KG_APP_SYSTEM.md](KG_APP_SYSTEM.md), and [ADMIN_SITE.md](ADMIN_SITE.md) are
> the current technical source of truth.

- [ ] **KG-01** Write migration `014_knowledge_graph.sql`: `kg_sources`
      (with mandatory `license` + `license_verdict` columns), `kg_pages`
      (source_id, page_ref, raw_text, status pending/extracted/failed/skipped,
      unique(source_id,page_ref)).
- [ ] **KG-02** Same migration: `kg_persons` (canonical_name, aliases[],
      birth_year, death_year, occupation, summary, wikidata_id unique,
      portrait_media_id, `is_public_figure` bool — the F-06 GDPR gate).
- [ ] **KG-03** Same migration: `kg_events` (title, description, year_start,
      year_end, event_type: crime/celebration/construction/war/scandal/
      daily_life/disaster/other — must match Prompt P1's enum exactly).
- [ ] **KG-04** Same migration: `kg_facts` (location_id → public.locations,
      fact_text, year, category: architecture/resident/crime/anecdote/
      commerce/culture/politics — matches P1, interestingness 1–5,
      confidence, **status** default 'active' check in
      ('active','disputed','quarantined') — powers the report-a-fact flow
      (A-18) and the audit auto-quarantine, **page_id NOT NULL** → kg_pages
      — no citation, no fact).
- [ ] **KG-05** Same migration: `kg_media` (location_id, person_id, kind:
      photo/portrait/map/postcard/video, year, source_url, license,
      source_id, original_url, restored_url, video_url,
      `approved` boolean default false — the M-04 QA gate,
      `generation_cost_cents` int default 0 — the M-19 cost ledger).
- [ ] **KG-06** Same migration, edge tables: `kg_person_location` (relation:
      lived_in/worked_in/built/owned/died_in/arrested_in/performed_in/
      frequented — must match Prompt P1's enum exactly, year_start/end,
      page_id), `kg_person_person` (relation, page_id,
      check person_a < person_b), `kg_event_location`, `kg_person_event`
      (role), each with page_id citation.
- [ ] **KG-07** Same migration: staging table `kg_mentions` (page_id, payload
      jsonb, status pending/resolved/rejected). The LLM writes ONLY here.
- [ ] **KG-08** Add `name_embedding vector(1536)` to `kg_persons` AND
      `fact_embedding vector(1536)` to `kg_facts` + HNSW indexes (copy the
      pattern from `008_rag_history.sql`). Person embeddings power entity
      resolution (X-08); fact embeddings power dedup (X-13).
- [ ] **KG-09** RLS: public read on persons/events/facts/media/edges (only
      rows whose source verdict is green — enforce via a view), no public
      read on kg_pages/kg_mentions (raw text stays private, per L-12).
- [ ] **KG-10** Register 014 in `talesofbudapest-backend/migrate.js`, run
      `npm run db:migrate`, verify `\dt kg_*`.
- [ ] **KG-11** Migration `015_kg_i18n.sql`: `fact_text_en`/`fact_text_hu`
      on kg_facts; summary translations on kg_persons.
- [ ] **KG-12** Seed `kg_sources` from `docs/LICENSING.md` — one row per
      source with verdict. Write the guard: ingest scripts abort on any
      source whose verdict isn't green.
- [ ] **KG-13** **Milestone:** migrations 014+015 applied on dev and prod,
      `\dt kg_*` shows all tables, RLS verified (anon key cannot read
      kg_pages/kg_mentions, can read the green-source views), guard from
      KG-12 proven by trying to ingest a red source and failing.

### Vector retrieval upgrades (added 2026-07-11, see [VECTOR_DB_IMPROVEMENTS.md](VECTOR_DB_IMPROVEMENTS.md))

Enriched claim embeddings, hybrid FTS+trigram+vector search (RRF), and the
era taxonomy are implemented (2026-07-11). Remaining queue:

- [ ] **KG-14** Adjudication memo table: every same-entity / duplicate-claim
      verdict (LLM P4 or human) stored keyed by normalized pair; checked
      cache-first before any adjudication call. No judgment paid for twice;
      re-runs free; every decision leaves reusable residue
      (DATA_MOAT_PLAN.md compounding rule).
- [ ] **KG-15** Pipeline-time reranking, stored (needs KG-14): on each new
      claim batch, run the hybrid-retrieval dedup shortlist through a cheap
      adjudicator (Flash-Lite class) ONCE; store verdicts in the memo table;
      merge/quarantine accordingly. Cents per book; never rerank live
      queries.
- [x] **KG-16** Resolution golden set: implemented with 53 cases covering
      positive, Hungarian↔English, historical-name, OCR/normalization, and
      dangerous-negative matches. Keep an unseen holdout separate before
      using it to justify a model switch. Claim-dedup evaluation can be added
      when KG-15 is implemented. Complements X-03 (extraction golden set — a
      different stage).
- [ ] **KG-17** Embedding model bake-off (gated on KG-16 evidence):
      multilingual models (Cohere, Jina v4, Gemini embedding) vs current
      `text-embedding-3-small`, scored on the golden set. Only switch if
      Hungarian recall is measurably hurting; switching means re-embedding
      everything (schema stays vector(1536) — prefer Matryoshka-capable).
- [ ] **KG-18** Admin review queue, **partially implemented**: the separate
      service-role admin app now has Insights, canonical/staging graph views,
      entity inspection, and review flows for entities, aliases, claims, edges,
      and location connections. Remaining data-contract work is one queue over
      the additional human-classification tasks —
      review-tier auto-link candidates (0.65–0.90), `unsure` adjudications,
      audit-quarantined facts, era boundary cases, junk-alias flags — each
      verdict written back to the KG-14 memo table. See `docs/ADMIN_SITE.md`.

---

<a id="ws-c"></a>
## WS-C — Corpus acquisition (30 tasks)

Raw data → R2 (`corpus/{source}/…` + `manifest.json` per source). Download
once, keep forever. Every C-task requires its L-task green first.

### Shared plumbing
- [ ] **C-01** Create the R2 bucket + a tiny `ingest/src/lib/r2.ts` upload
      helper (S3-compatible API).
- [ ] **C-02** Write `ingest/src/lib/corpusManifest.ts`: record every fetched
      file (url, sha256, date, license) — dedupe + audit trail.
- [ ] **C-03** Write the shared "text → kg_pages" loader: takes clean text +
      page/chapter boundaries → inserts kg_pages rows idempotently.
- [ ] **C-04** Politeness defaults for all scrapers: 1 req/2s, custom
      User-Agent with your project email, obey robots.txt, cache everything.

### MEK books (needs L-09..L-12 green)
- [ ] **C-05** Curate the book list: ~20 Budapest-history titles from MEK
      (use the FSZEK consultation P-13 if it happened). Store list + MEK IDs
      in `ingest/src/sources/mek/books.ts`.
- [ ] **C-06** Write `fetchMek.ts`: download text/HTML versions, archive
      originals to R2.
- [ ] **C-07** Write the chapter splitter (MEK HTML has usable headings;
      fallback: split every ~1,500 words at paragraph boundaries).
- [ ] **C-08** Load 2 books end-to-end into kg_pages. Read 5 random pages —
      verify encoding (Hungarian accents!) and clean text.
- [ ] **C-09** Load the remaining books. Milestone: ≥3,000 pages pending.

### Wikipedia/Wikidata deep pull (L-22 green — CC0/facts)
- [ ] **C-10** Extend `ingest/src/cli/ingest-wikipedia.ts`: full article text
      (hu + en) for all ~500 locations → kg_pages (page_ref = section title).
- [ ] **C-11** Wikidata sweep for PEOPLE: query all persons with a Budapest
      connection (born/died/worked-in properties) → pre-seed kg_persons with
      wikidata_id, birth/death years, occupation. This makes entity
      resolution (X-07) dramatically easier — famous people arrive pre-deduped.
- [ ] **C-12** Wikidata images: for pre-seeded persons, fetch Commons portrait
      filenames + per-file licenses (L-24) → kg_media rows + R2 archive.

### Fortepan (L-05..L-07 green)
- [ ] **C-13** Extend `ingest/src/enrich/fortepan.ts`: write kg_media rows
      (year, license CC BY-SA 3.0, donor for attribution) + archive full-res
      images to R2 for all matched locations. Optional caption pass uses
      Prompt P9 (pipeline doc §4).
- [ ] **C-14** Coverage report: which top-100 locations still lack a dated
      photo → manual Fortepan search session for the gaps (an evening).

### Address books / FSZEK via Hungaricana (needs L-13/L-14 answer)
- [ ] **C-15** IF green: fetch address-book page **images** for Districts V,
      VI, VII for 3 sample years (1900, 1910, 1928) → R2 + kg_pages rows
      (raw_text empty; these pages take the VISION-STRUCTURED path).
- [ ] **C-16** Address books skip OCR entirely: page image → vision LLM →
      structured JSON in one call (Prompt P3, model tier T4 in the pipeline
      doc — worth the mid-tier; pipeline Rule 2: never OCR-then-parse a
      structured layout). Output lands in kg_mentions directly and becomes
      high-confidence person_location edges ("lived_in", year known).
- [ ] **C-17** IF FSZEK says no or is slow: fall back to Budapest100 house
      histories (already scraped) as the resident source; revisit later.

### Postcards, maps, Europeana
- [ ] **C-18** (needs L-16..L-18) Postcard metadata + images for top-100
      locations → kg_media.
- [ ] **C-19** (needs L-28) Download the 2–3 chosen PD map scans at max
      resolution → R2 → kg_media (kind='map').
- [ ] **C-20** (needs L-27) Europeana harvest with `REUSABILITY:open` for
      Budapest → kg_media + kg_pages for text records.

### Document intake: PDFs, scans, OCR (see [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md) §1)
- [ ] **C-27** Build the intake router: file type → TEXT / OCR / VISION-
      STRUCTURED / DIRECT path, per the §1 decision tree. Includes the
      per-page PDF text-layer test (`pdftotext` yield ≥200 chars/page,
      junk-character check for garbage embedded OCR).
- [ ] **C-28** Install the OCR toolchain on the Oracle VM: poppler
      (`pdftotext`, `pdftoppm -r 300`), Tesseract with `hun+eng` language
      packs, `ddjvu` for DJVU conversion.
- [ ] **C-29** Per-source OCR bench: run Tesseract on 10 sample pages of
      each scanned source; if hand-fixing >2 lines/page, flip that source to
      vision-LLM OCR (Prompt P2). Record the choice per source in
      `docs/DECISIONS.md`.
- [ ] **C-30** Wire the OCR cleanup pass (Prompt P2b) to run only on pages
      with >2% junk-character ratio.

### Status + hygiene
- [ ] **C-21** SQL view `kg_corpus_status`: pages per source × status +
      media per kind. Check it daily during WS-X.
- [ ] **C-22** Budapest100 text: route your already-scraped house histories
      into kg_pages too (they're extraction input, not just display text).
- [ ] **C-23** műemlékem.hu descriptions → kg_pages (needs L-31).
- [ ] **C-24** Every C-script gets a `--dry-run` flag and a row-count summary
      printout. Non-negotiable, saves you from silent corruption.
- [ ] **C-25** Milestone gate: ≥5,000 kg_pages pending, ≥500 kg_media rows,
      manifest complete, zero non-green sources ingested.
- [ ] **C-26** Back up the Supabase DB (pg_dump to R2, weekly cron on the
      Oracle VM). Your graph is about to become irreplaceable.

---

<a id="ws-x"></a>
## WS-X — LLM extraction factory (24 tasks)

Models: free tiers first (Gemma 3 27B free on OpenRouter; Gemini Flash via
AI Studio), with `deepseek-chat-v3-*` as the cheapest **paid** fallback.
Throughput reality: OpenRouter free models carry small per-day request caps
(historically ~50/day, ~1000/day after a one-time $10 credit purchase —
verify current numbers). The plan of record for extraction throughput is
therefore: **Gemini AI Studio free-tier daily quota + the one-time $10
OpenRouter credit unlock** — still inside the budget envelope; "pure $0" is
the slow path, not the schedule assumption. Nightly on GitHub Actions
(2,000 free min/mo on private repos; unlimited standard-runner minutes if
the repo is public) or the Oracle VM.

**The verbatim prompts, the task→model matrix with prices and the escalation
ladder, and the golden-set quality gates all live in
[EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md).** Prompt map: P1 →
X-01..X-05; P2/P2b → C-29/C-30; P3 → C-16/X-20; P4 → X-09; P5 → X-14;
P6 → X-16; P7 → X-19; P8 → M-07; P9 → C-13.

### Extraction
- [ ] **X-01** `talesofbudapest-backend/lib/kg/extractPage.js` reusing
      `openRouterClient.js`: one page in → strict JSON out (locations,
      persons, events, facts w/ interestingness, relations). Schema in
      this repo's earlier draft; JSON-schema-validate the response, retry
      once on invalid.
- [ ] **X-02** The anti-hallucination prompt contract: "Extract ONLY what
      this page states. Empty arrays are correct. Every fact must be
      quotable from the page. interestingness 5 = a tourist would gasp."
      Answer in the page's language.
- [ ] **X-03** Test on 20 hand-picked pages (mix: book chapter, Wikipedia,
      Budapest100, address book). READ every output. Iterate the prompt
      until you'd sign your name under the results.
- [ ] **X-04** Model bake-off on those 20 pages: Gemma 3 27B free vs
      Gemini Flash (free tier) vs the paid fallback DeepSeek V3. Pick by
      faithfulness first, JSON discipline second. Record in DECISIONS.md.
- [ ] **X-05** `kg/runExtraction.js` worker: claim N pending pages
      (`FOR UPDATE SKIP LOCKED`), extract → kg_mentions, mark page
      extracted/failed. Idempotent, rate-limited, resumable. Cap via env var
      (`PAGES_PER_RUN=300`).
- [ ] **X-06** Run on 200 pages. Inspect 20 random mentions. Fix. Re-run
      (failed/skipped pages re-enter the queue automatically).

### Resolution (the hard, valuable part)
- [ ] **X-07** `kg/resolvePersons.js` layer 1 — blocking: normalize names
      (lowercase, strip accents, **handle Hungarian surname-first order**:
      "Krúdy Gyula" = "Gyula Krúdy"), group candidates.
- [ ] **X-08** Layer 2 — embeddings: FIRST backfill `name_embedding` for
      every existing kg_persons row (including the C-11 Wikidata pre-seeds —
      nothing else populates it); then per mention: name+occupation+years →
      embed → cosine vs kg_persons.name_embedding. >0.92 auto-merge,
      <0.75 new person.
- [ ] **X-09** Layer 3 — LLM adjudication for 0.75–0.92: "Same person?
      yes/no/unsure + reason." Unsure → new row + review flag.
- [ ] **X-10** Wikidata anchoring: if the mention matches a C-11 pre-seeded
      person, merge onto the wikidata_id row. Famous people = solved.
- [ ] **X-11** `kg/resolveLocations.js`: exact name → translation/alias →
      geocode address hint (reuse `ingest/src/enrich/geocode.ts`) and match
      within 50m → else create *candidate* location (hidden from map until
      approved in X-15).
- [ ] **X-12** `kg/promote.js`: resolved mentions → upsert persons/events/
      facts/edges, page_id carried everywhere, mention → resolved.
      Apply the F-06 living-persons gate here (death_year check).
- [ ] **X-13** Dedup pass for facts: same location + near-identical embedding
      → keep the better-cited one, merge interestingness.
- [ ] **X-14** Comparative re-ranking: per location, one LLM call ranks all
      its facts for tourist interest (cheap, transforms the UX).
- [ ] **X-15** Review UI, **partially implemented as a separate app on port
      3100**: `/reviews` handles entities, aliases, claims, edges, and staged
      location connections; `/graph` provides bounded canonical/staging
      inspection; `/insights` shows coverage and quality pressure. Remaining:
      person/event/organisation endpoint resolution, merge/split actions,
      safe source/page chips on questions, failed-page/evidence repair, and a
      durable audit trail. Publication intentionally remains outside the UI.

### Automation + quality
- [ ] **X-16** Translation pass → fact_text_en/_hu, person summaries (batch,
      free tier), into the KG-11 columns.
- [ ] **X-17** `.github/workflows/kg-nightly.yml`: extraction → resolvers →
      promoter → dedup → ranking → translation, capped for free tiers;
      one-line summary posted where you'll see it (email or Telegram bot).
- [ ] **X-18** Metrics view `kg_graph_status`: persons, facts, edges,
      citations per source, unresolved queue depth.
- [ ] **X-19** Quality gate: sample 50 promoted facts, verify against source
      pages. >90% faithful required; below → tighten X-02, re-extract
      affected sources (checkpointing makes this cheap).
- [ ] **X-20** Special path for address books (C-16): Prompt P3 vision
      output (already structured entries in kg_mentions) skips extraction
      AND resolution layers 2–3 — exact address match is stronger evidence
      than embeddings; promote entries straight to high-confidence lived_in
      edges.
- [ ] **X-21** Store a per-fact `quote` field (the supporting sentence) in
      kg_mentions payload — powers the review UI and future "show source"
      feature without exposing full pages.
- [ ] **X-22** Cost guard: daily token counter; alert if any day exceeds
      free-tier quotas (means a bug is looping).
- [ ] **X-23** Run the factory until: all Wikipedia + Budapest100 + 5 MEK
      books processed.
- [ ] **X-24** **Milestone — "the graph is alive":** these SQL queries return
      good answers: (a) everyone who lived on Andrássy út with years+sources;
      (b) two people at different buildings who knew each other; (c) top-10
      most interesting facts within 300m of the Opera. Demo-record it — this
      is the video for P-02.

---

<a id="ws-a"></a>
## WS-A — App features: surface the graph (20 tasks)

- [ ] **A-01** API `src/app/api/locations/[id]/chronicle/route.ts`: ranked
      facts, persons (relation, years, portrait), events, media. Follow the
      existing repository/service pattern.
- [ ] **A-02** API caching: chronicle responses are static between nightly
      runs — cache headers + CDN cache, zero DB load from browsing.
- [ ] **A-03** "Chronicle" panel in the landmark drawer (`BottomDrawer.tsx`):
      vertical timeline of facts with year badges.
- [ ] **A-04** Source chips on every fact ("Budapesti Czím- és Lakásjegyzék,
      1907") — the citation IS the design; tap → source detail + credits.
- [ ] **A-05** "People of this house" cards: portrait (restored if available),
      name, one-liner, relation + years.
- [ ] **A-06** Person profile drawer: summary, timeline, "places on this map"
      list from kg_person_location.
- [ ] **A-07** **Graph-hop navigation:** tap a place in the person profile →
      map flies there (existing fly-to) → that building's chronicle opens.
      The city becomes a browsable social network of the dead. This is THE
      demo feature.
- [ ] **A-08** "Connections" strip: 2-hop query (person_location →
      person_person → person_location) — "Residents here knew people at
      ▸ New York Café ▸ Japán Kávéház."
- [ ] **A-09** Ground the narrative generator: `historianNarrative.js` /
      `narrativePipeline.js` fetch top-8 facts+persons per stop, inject with
      "use only these facts; weave, don't invent"; lead with the top
      interestingness fact.
- [ ] **A-10** Persons in search: extend `SearchBar.tsx` — searching "Krúdy"
      shows his buildings on the map.
- [ ] **A-11** Events layer: chronicle shows events; optional map filter
      "show me 1956 sites" / "show me crime scenes" (event_type filter).
- [ ] **A-12** "Fact of the day" surface on the home screen (rotates from
      top-interestingness facts near the user) — daily-return hook.
- [ ] **A-13** Empty-state design: locations with thin graphs show their
      best single fact + "this building's story is still being researched"
      (honest + sets up the flywheel narrative).
- [ ] **A-14** i18n pass: chronicle/person UI strings hu+en through the
      existing next-intl setup.
- [ ] **A-15** Perf pass: chronicle payloads <50KB, images lazy+sized from
      R2, map stays 60fps with the new drawers.
- [ ] **A-16** Credits screen (F-08) now lists all green sources dynamically
      from kg_sources.
- [ ] **A-17** Share: long-press a fact → share card image (fact + year +
      building photo + app name) via native share sheet.
- [ ] **A-18** Report-a-fact flow (implements blueprint §12): a small
      "something wrong?" affordance on each fact → sets kg_facts.status to
      'disputed' → hidden at next cache refresh → appears in the separate
      admin `/reviews` queue (X-15) beside its source page. Resolved within a
      week.
- [ ] **A-19** Author launch routes 2 and 3 (Royal Buda; Bohemian Quarter)
      through the graph-grounded narrative pipeline (A-09). Route 1 (spy,
      District VII) is authored here too and later hardened by the WS-W
      field tests (W-11/W-12). Q-02/G-01 assume three routes; this is
      where they get made.
- [ ] **A-20** **Milestone:** browsing the map, opening chronicles, hopping
      between people/places feels like a product nobody else has; three
      launch routes exist. Update P-02 demo video.

---

<a id="ws-m"></a>
## WS-M — GenAI media layer (22 tasks)

All batch, hero locations first (top ~30 by your existing importance score).
Cached in R2 forever. Every asset traces to kg_media.source_id → license.

- [ ] **M-01** `kg/mediaWorker.js` skeleton: find kg_media rows missing a
      variant → run model → upload R2 → write URL back. Same idempotent
      pattern as X-05.
- [ ] **M-02** Install Real-ESRGAN + GFPGAN on the Oracle VM (CPU, slow, $0,
      nightly). Upscale/restore the hero photos → restored_url.
- [ ] **M-03** Colorize selected heroes; store as variant; UI label
      "AI colorized" (honesty rule). DeOldify's pinned old fastai/torch
      stack is NOT a sure install on ARM Linux — sanity-check it on the VM
      in the first hour; fallback: a colorization model on a free HF Space,
      or fold colorization into the same rented GPU hour as M-09.
- [ ] **M-04** QA gallery page in /admin: original vs restored side-by-side;
      approve flag before anything shows to users.
- [ ] **M-05** `TimeWarpSlider.tsx`: drag-wipe between today's photo and the
      restored archival photo (CSS clip-path + touch). Ship in chronicle
      wherever a dated photo exists. **Most shareable screen in the app —
      build before any AR.**
- [ ] **M-06** "Today" photos for heroes: shoot them yourself, one afternoon,
      from the archival photo's viewpoint (frame-matching matters more than
      camera quality).
- [ ] **M-16** Old-map overlay: georeference the PD scans in QGIS (free,
      manual, one weekend) → `gdal2tiles` → R2 → MapLibre raster layer with
      opacity slider ("map time machine" toggle in `MapView.tsx`).
- [ ] **M-07** Talking residents v1 — script: 45-second first-person
      monologue per person, generated ONLY from their kg_facts (cited), in
      the tone of their era. 10 famous residents with good portraits.
- [ ] **M-08** Character voices via existing `ttsClient.js`. Hungarian
      reality check FIRST: Kokoro does not speak Hungarian, and Gemini
      TTS's hu support must be verified before anything depends on it.
      Free Hungarian path: **Piper** (open source, runs on the VM, has
      hu_HU voices). English: Kokoro/Piper/Gemini free tiers. ElevenLabs
      only if a hero clip deserves it. Blocker rule: no W/M audio task
      assumes an engine until a 10-second hu sample passes Q-04's native
      listener.
- [ ] **M-09** Animate portraits: SadTalker or LivePortrait (open source).
      CPU is painful — rent one spot-GPU hour (~$0.30) or fal.ai per-clip
      (cents) to batch all ten → mp4 → R2.
- [ ] **M-10** "Meet the resident" button on person cards → full-screen
      video with captions (hu/en).
- [ ] **M-11** Talking residents v2 — camera-overlay "AR": getUserMedia
      camera background + the talking head in a ghost frame with slight
      deviceorientation parallax. Reads as AR on video; no fragile WebXR.
- [ ] **M-12** Street-life videos: best archival street photo per hero →
      image-to-video (Kling/Hailuo credits, ~$0.2–0.4/clip, ~30 clips ≈ $10
      one-time) → R2. "View 1910" button: camera fades into the clip.
- [ ] **M-13** Watermark/label every generated clip: "AI animation of a real
      1910 photograph — Fortepan / donor, CC BY-SA 3.0" (ShareAlike requires
      the license notice on derivatives, per L-06/L-07).
- [ ] **M-14** Attribution component (L-06) wired into slider, videos,
      galleries, share cards.
- [ ] **M-15** Preload strategy: media only downloads on wifi or on explicit
      tap (tourists, roaming data).
- [ ] **M-17** iOS Safari/WebView quirks pass: camera permission flow, video
      autoplay policies (muted+playsinline), memory limits on long sessions.
- [ ] **M-18** Fallbacks: no camera permission → still show the clip
      full-screen; old device → skip parallax.
- [ ] **M-19** Per-asset cost ledger in kg_media (generation_cost_cents) —
      keeps the "under $20 total" promise measurable.
- [ ] **M-20** Show Fortepan the derivatives (P-14 promise) before launch.
- [ ] **M-21** A/B the wow: 5 test users — slider vs talking resident vs
      street video; whichever gets grabbed-phone reactions becomes the
      onboarding demo and store screenshots.
- [ ] **M-22** **Milestone:** 30 heroes with restored photo + slider; 10
      talking residents; 10 street videos; total generation spend < $20.

---

<a id="ws-w"></a>
## WS-W — Proximity walking guide (15 tasks)

**v1 walking-mode reality (drives W-01/W-05/W-15 and I-06/I-07):** when the
iPhone screen locks, the WebView's JavaScript is suspended — audio keeps
playing but geolocation callbacks STOP, so no new stop can trigger. v1 is
therefore a **screen-on** mode: wake lock keeps the dimmed screen alive
(in hand or pocket), JS and GPS keep running, and a touch-lock overlay
prevents pocket taps. True screen-locked triggering needs native background
location (`@capacitor-community/background-geolocation` or native region
monitoring) — that is the v1.1 upgrade in I-06, with its App Review
justification, not a v1 assumption.

- [ ] **W-01** `src/features/proximity/useProximityGuide.ts`:
      watchPosition → haversine vs nearby landmarks (reuse
      `useVisibleLandmarks.ts` data) → 60m geofence trigger.
- [ ] **W-02** Debounce rules: 30s cooldown per location, never interrupt
      playing audio, max 1 auto-trigger per 90 seconds.
- [ ] **W-03** Pre-render directional intro variants per hero location:
      left/right/ahead × close/far (6 short clips) — recombined at play time,
      no live TTS.
- [ ] **W-04** Bearing math: compass heading vs user→building bearing →
      pick the right intro ("On your left, the building with the green
      dome…"). iOS reality: `deviceorientationabsolute` does NOT exist in
      iOS Safari/WKWebView — use `deviceorientation` +
      `webkitCompassHeading` (or a Capacitor heading plugin), gated behind
      `DeviceOrientationEvent.requestPermission()` which MUST be called
      from a user tap — wire it into the "Start walking" button (W-05).
- [ ] **W-05** Walking mode UX: "Start walking" → minimal compass+distance
      screen, auto-play triggers, screen wake lock + dimmed UI + touch-lock
      overlay (see the v1 reality note above); the start tap also requests
      the compass permission (W-04); triggers feed the existing
      `audioPlayerStore.ts`.
- [ ] **W-06** Background audio on iOS (critical, native-app territory —
      see I-track: Capacitor gives you real background audio the PWA can't).
- [ ] **W-07** Offline route packs: "Download this walk" = route JSON + mp3s
      + images to device storage (Capacitor Filesystem on iOS; Cache API on
      web).
- [ ] **W-08** GPS reality tuning: urban-canyon drift in District VII —
      require 2 consecutive fixes inside the fence; reduce GPS frequency
      until within 150m of nearest pin (battery).
- [ ] **W-09** Route logistics polish: reuse `routeLogistics.ts` — walking
      times between stops, "you're walking away from stop 3" gentle nudge.
- [ ] **W-10** Safety text: "eyes up while crossing" voice line at route
      start (also a liability checkbox, F-07).
- [ ] **W-11** Field test 1: you + the full spy route. Log every mis-trigger.
- [ ] **W-12** Fix list from W-11; field test 2 with someone who's never
      seen the app.
- [ ] **W-13** Battery benchmark: full 90-min walk must cost <25% battery on
      a mid-range iPhone.
- [ ] **W-14** Audio interruption handling: a phone call pauses the tour;
      on resume, offer "replay the last 15 seconds" (implements the
      blueprint §12 playbook).
- [ ] **W-15** **Milestone:** a stranger completes a walk guided by voice
      alone — screen dimmed and touch-locked, phone in hand or pocket
      (screen-on per the v1 reality note).

---

<a id="ws-i"></a>
## WS-I — iOS App Store release (34 tasks)

Strategy for the $99/year problem: build and test everything possible for
free FIRST (Capacitor + local device install via free Xcode signing works for
7-day test builds), pay the $99 only when the app is truly submission-ready.
Sequence I-01..I-19 are all $0.

### Wrap the app (all free)
- [ ] **I-01** Decide the wrapper: **Capacitor** (fits your Next.js/TS stack).
      Add `@capacitor/core`, `@capacitor/ios` to the frontend.
- [ ] **I-02** Architecture decision — plan the DUAL BUILD honestly (this
      is real work, not a one-liner): Capacitor needs static assets (a
      remote-URL wrapper is rejected under guideline 4.2). But Next static
      export (`output: 'export'` — `next export` no longer exists in
      Next 15) is app-wide: it cannot coexist with the API routes in
      `src/app/api/`, and `src/middleware.ts` (next-intl locale routing)
      is incompatible with static export. So: build 1 = static app shell
      (middleware-free next-intl config, client-side locale) bundled into
      Capacitor; build 2 = the API deployed separately (per F-16). Document
      in DECISIONS.md.
- [ ] **I-03** Apple guideline 4.2 (minimum functionality) defense: list the
      native features that make this "a real app": background audio walking
      guide, offline route packs, geofencing, camera time-warp, haptics.
      Build I-06..I-09 BEFORE submission, not after rejection.
- [ ] **I-04** Xcode setup on your Mac (free Apple ID): build to your own
      iPhone with a development certificate (7-day expiry — fine for dev).
- [ ] **I-05** iOS WebView reality pass: test the whole app in the Capacitor
      WKWebView — geolocation permission flow, getUserMedia camera, audio
      focus, safe-area insets, dark mode.
- [ ] **I-06** Geolocation: `@capacitor/geolocation` foreground watch for
      the v1 screen-on walking mode (see the WS-W reality note — WebView JS
      suspends when the screen locks, so foreground-only is a real
      constraint, not a choice). v1.1 upgrade, as its own release:
      `@capacitor-community/background-geolocation` (or native
      CLLocationManager region monitoring) with the iOS "location"
      background mode + the App Review justification written in I-11 style.
      Note: plain `@capacitor/geolocation` does NOT expose iOS
      significant-change monitoring.
- [ ] **I-07** Native background AUDIO: enable the audio background
      capability AND set the AVAudioSession category to `playback` in
      native code, plus MediaSession/Now Playing metadata for lock-screen
      controls — the capability checkbox alone is not enough. Result: audio
      keeps playing with the screen locked (triggering new stops while
      locked is v1.1 — see I-06).
- [ ] **I-08** Offline packs via `@capacitor/filesystem` (W-07).
- [ ] **I-09** Haptics on geofence trigger (`@capacitor/haptics`) — tiny
      touch, very "native-feeling" in review.
- [ ] **I-10** App icon set + splash screens from the F-12 master
      (capacitor-assets generates all sizes).
- [ ] **I-11** Permission strings (Info.plist) — Apple rejects vague ones.
      Location: "Your position triggers the right story as you walk past
      historic buildings." Camera: "Point your camera at a landmark to see
      its past." Write them carefully once.
- [ ] **I-12** Performance on a real old iPhone (borrow an iPhone SE/8):
      map pans, drawer animations, video playback. Fix jank now.
- [ ] **I-13** Test plan checklist doc: cold start, airplane mode, denied
      permissions, interrupted audio (phone call), low battery mode.
- [ ] **I-14** Crash/error reporting: Sentry free tier, wired to the
      WebView + native layer.
- [ ] **I-15** App Store metadata drafts (free to write): title (30 chars),
      subtitle, description, keywords (think like a tourist typing:
      "budapest walking tour audio guide history"), promo text.
- [ ] **I-16** Screenshots: 6.7" and 6.1" sets. Content: map, chronicle,
      then/now slider mid-wipe, talking resident, walking mode. Use the
      real app, minimal caption overlays.
- [ ] **I-17** App preview video (optional but powerful): 20s screen capture
      of slider + graph-hop. You already have the M-21 material.
- [ ] **I-18** Age rating questionnaire dry-run: historical violence
      references → likely 12+. No user-generated content = simpler.
- [ ] **I-19** Privacy "nutrition label" prep: location (not linked to
      identity, not tracking), no accounts, cookieless analytics. Matches
      F-04/F-05.

### Pay and ship (the $99 moment)
- [ ] **I-20** GATE: only proceed when X-24, C-25, W-15, A-20, M-22 and the
      Q-track are done, and 5 external testers **from the Q-06 street beta
      (run on the PWA — TestFlight doesn't exist yet at this point)** say
      "ship it". THEN pay the $99 Apple Developer Program fee (this is also
      the P-33 competition-prize use case).
- [ ] **I-21** Enroll (individual), wait for approval (1–2 days).
- [ ] **I-22** App Store Connect: create the app record, bundle ID, upload
      metadata from I-15.
- [ ] **I-23** Distribution certificate + provisioning via Xcode automatic
      signing; archive; upload first build.
- [ ] **I-24** TestFlight internal testing: you + friends (no review needed,
      instant).
- [ ] **I-25** TestFlight external beta (needs a light "beta review"): recruit
      15–25 testers — hostel noticeboards, r/budapest, tourism Facebook
      groups. This replaces the paid beta tools you can't afford.
- [ ] **I-26** Two-week beta cycle: crash-free rate >99%, fix the top-5
      feedback items.
- [ ] **I-27** Fill the final privacy labels + age rating + export
      compliance (uses standard HTTPS encryption → exempt).
- [ ] **I-28** App Review notes: explain the geolocation use, the historical
      content, include a 60-second demo video link and a test route
      REACHABLE FROM CUPERTINO? No — reviewers test remotely: include a
      "demo mode" toggle that simulates GPS along the spy route so a
      reviewer in California can experience the walk. **Build the demo-mode
      toggle — this prevents the most likely rejection.**
- [ ] **I-29** Submit. Expect 24–72h. If rejected: read the exact guideline
      cited, fix, resubmit with a polite note (rejections are normal, not
      fatal).
- [ ] **I-30** Release strategy: manual release after approval, timed with
      the G-track launch day.
- [ ] **I-31** Post-launch: monitor crash reports + reviews daily for the
      first 2 weeks; reply to every review (small apps that reply rank
      better and convert better).
- [ ] **I-32** Set up App Store Connect analytics baseline: impressions →
      product page views → installs conversion.
- [ ] **I-33** ASO iteration 1 (a month after launch): test a new subtitle/
      keyword set based on search terms that actually converted.
- [ ] **I-34** Keep the PWA alive at the domain as the free acquisition
      funnel (QR stickers open the web version instantly; it upsells the
      App Store install for background audio + offline).

---

<a id="ws-d"></a>
## WS-D — Android release, later (10 tasks)

- [ ] **D-01** GATE: iOS stable, retention known, feature set frozen for a
      cycle. Android is a $25 ONE-TIME fee (much kinder than Apple).
- [ ] **D-02** Add `@capacitor/android`; build in Android Studio.
- [ ] **D-03** Device pass on 2–3 cheap Androids (tourists carry mid-range
      Samsungs/Xiaomis, not Pixels) — WebView versions differ; test map perf.
- [ ] **D-04** Android-specific: background location/audio policies,
      battery-optimizer kill lists (Xiaomi!), notification permission for
      the walking guide.
- [ ] **D-05** Google Play Console account ($25), data-safety form (mirror
      of I-19), content rating questionnaire.
- [ ] **D-06** Closed testing track (Google requires 12+ testers for 14 days
      for new personal accounts — recruit from the I-25 beta pool).
- [ ] **D-07** Play Store listing: adapt I-15/I-16 assets (feature graphic
      1024×500 extra).
- [ ] **D-08** Submit for review; production rollout at 20% → 100%.
- [ ] **D-09** Deep links/app links work from QR stickers on both platforms.
- [ ] **D-10** Update the QR/landing page to auto-detect platform.

---

<a id="ws-q"></a>
## WS-Q — Quality and beta (10 tasks)

- [ ] **Q-01** Content QA: X-19's 90% faithfulness gate passed and logged.
- [ ] **Q-02** History-expert pass: one historian (P-17 student or FSZEK
      librarian) reads the 3 launch routes' scripts. Fix everything they flag.
- [ ] **Q-03** Sensitivity pass: WWII, Holocaust, and 1956 content reviewed
      for tone (the Danube shoes memorial is NOT a "thriller" stop —
      hand-write the respectful treatment rules into the narrative prompts).
- [ ] **Q-04** Hungarian-language QA by a native speaker (both UI and TTS
      pronunciation of names/streets).
- [ ] **Q-05** Accessibility pass: dynamic type, VoiceOver labels on the
      player and map controls, transcript view for all audio (deaf users +
      it's indexable content).
- [ ] **Q-06** Street beta (10 strangers, W-15 style) with a feedback form:
      task completion, favorite moment, confusion points.
- [ ] **Q-07** Bug triage board: crash > data-wrong > UX > polish. Fix in
      that order only.
- [ ] **Q-08** Load sanity: simulate 200 concurrent users hitting cached
      chronicle endpoints (should be trivially fine — verify, don't assume).
- [ ] **Q-09** Restore-from-backup drill: nuke a staging DB, restore from
      C-26 backup, verify counts. Do this ONCE before launch.
- [ ] **Q-10** Freeze: 1 week before submission, features stop, only fixes.

---

<a id="ws-g"></a>
## WS-G — Launch and growth (16 tasks)

- [ ] **G-01** Landing page on the domain: 90-sec video, App Store badge,
      the three routes, institutional logos (with permission from P-track).
- [ ] **G-02** Launch timing: 2 weeks before Sziget Festival (mid-August),
      or Budapest100 weekend (spring) if the KÉK partnership (P-11) landed —
      whichever is nearer when Q-10 passes.
- [ ] **G-03** Press kit: one-pager, screenshots, the Fortepan-derivative
      story angle ("AI brings Budapest's archive photos to life — with the
      archive's blessing"), founder photo, contact.
- [ ] **G-04** Hungarian tech/culture press list (Telex, 444, Index tech,
      We Love Budapest, Budapest Times) + 3 international travel-tech
      newsletters. Personal emails, not blasts.
- [ ] **G-05** We Love Budapest specifically: pitch a "we tested it" walk
      with a journalist — their audience IS your audience.
- [ ] **G-06** TikTok/IG content engine: 2 clips/week from M-assets
      (slider wipes, talking residents). Batch-record 10 before launch.
- [ ] **G-07** QR plaques at hero locations — ONLY via the district
      permission path (P-22/P-25). 10 locations, weatherproof, "Someone was
      arrested on this exact spot in 1951. Hear why →".
- [ ] **G-08** Hostel/hotel partnerships: 5 hostels get a lobby poster + the
      app is a free amenity they can offer. Hostels churn 100% of their
      audience weekly — perfect distribution.
- [ ] **G-09** Free walking-tour guides: they're not competitors — offer the
      app as their "between tours" upsell; they're also your best content
      critics.
- [ ] **G-10** Budapest Card catalog listing (from P-23) live on launch day.
- [ ] **G-11** Reddit/forum seeding: r/budapest, r/travel "I built this"
      post on launch day (genuine builder posts do well; write it yourself,
      honestly).
- [ ] **G-12** Product Hunt (optional, low effort): schedule, don't obsess.
- [ ] **G-13** Metrics that matter (wire into O-03): installs, walk starts,
      walk completions, chronicle opens, person-hops, share taps, D7 return.
- [ ] **G-14** Week-2 retro: what's the ONE feature users show each other?
      Double down on it; cut the roadmap accordingly.
- [ ] **G-15** Grant applications (P-31) now go out WITH launch traction
      numbers + institutional letters — this is when they actually win.
- [ ] **G-16** "CityTales" expansion memo (one page only): what generalizes
      (pipeline, schema, app) vs what's Budapest-specific (sources,
      partnerships). Write it, file it, get back to Budapest.

---

<a id="ws-o"></a>
## WS-O — Operations and cost control (11 tasks)

- [ ] **O-01** Uptime monitoring: free tier of UptimeRobot on the API +
      landing page; alerts to your phone.
- [ ] **O-02** Cost dashboard ritual: 1st of each month check Cloudflare,
      Supabase usage, OpenRouter spend, Oracle VM. Alarm thresholds: R2 >8GB,
      Supabase DB >400MB, any LLM spend >$5/mo.
- [ ] **O-03** Tiny `events` analytics table + the G-13 queries as a saved
      dashboard (Supabase SQL snippets are enough).
- [ ] **O-04** Nightly job health: the X-17 summary line; if it's silent 2
      days in a row, investigate.
- [ ] **O-05** Weekly pg_dump → R2 (C-26) + monthly restore-test reminder.
- [ ] **O-06** Supabase free-tier growth plan: when DB nears 500MB, DON'T
      naively move kg_pages alone — kg_facts.page_id is NOT NULL against
      it, and the audit/"show source" flows join facts→pages. Split at a
      joinable boundary instead: move the ENTIRE kg_* schema to the Oracle
      self-hosted Postgres and expose the serving data to Supabase via
      `postgres_fdw` or synced serving views/tables.
- [ ] **O-07** Dependency updates: monthly `npm audit` + Capacitor/Next
      minor bumps; never upgrade majors the week before a release.
- [ ] **O-08** Apple fee renewal reminder ($99/yr) 1 month ahead — decide
      renewal based on G-13 numbers.
- [ ] **O-09** Secrets rotation checklist (API keys) every 6 months.
- [ ] **O-10** A `docs/RUNBOOK.md`: how to restart the VM jobs, re-run a
      failed nightly, roll back a bad migration. Written for tired-you at
      midnight.
- [ ] **O-11** Yearly "street reality" pass over hero locations: does the
      on-street situation still match (renovation scaffolding, renamed
      streets, demolished/closed buildings, moved viewpoint markers)?
      Implements the blueprint §12 playbook.

---

## Sequencing at a glance

```
Month 1   F-track → KG-track → C-01..C-12          L-track + P-01..P-04 start (parallel)
Month 2   X-track → X-24 milestone (graph alive)    L answers arrive → more C-tasks unlock
Month 3   A-track → A-20 milestone (product demo)   P-11..P-17 meetings (with demo!)
Month 4   M-track + W-track (parallel)              P-21..P-25 municipality (with demo!)
Month 5   I-01..I-19 (free iOS prep) + Q-track      G-01..G-06 prep
Month 6   I-20 pay $99 → TestFlight → submit → G-launch
Later     D-track (Android), P-31 grants with traction, CityTales memo
```

## Total cash to launch

| Item | Cost |
|---|---|
| Domain | ~$10/yr |
| Hosting/DB/CDN/CI (all free tiers + Oracle VM) | $0 |
| OpenRouter one-time $10 credit unlock (raises free-model daily caps; the credit itself stays spendable) | ~$10 |
| LLM extraction + embeddings on top of free tiers | $0–5 |
| Photo restore/colorize (open source, CPU) | $0 |
| Talking heads (GPU hour or fal.ai) | ~$3 |
| Street videos (~30 clips) | ~$10 |
| Apple Developer Program (the unavoidable one) | $99/yr |
| QR plaques print run (10) | ~$30 |
| Google Play (later, one-time) | $25 |
| **Total to iOS launch** | **≈ $165** |

The $99 is the single biggest line — which is why it sits at gate I-20,
after everything testable for free has been tested, and why P-33
(competition prize money) exists in the plan.
