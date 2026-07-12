# Tales of Budapest — Project Blueprint

This is the plan in words. It is meant to be enough to steer the project
from today until launch and beyond, including what to do when things go
wrong. The day-to-day work lives in the checkbox backlog
([KILLER_APP_PLAN.md](KILLER_APP_PLAN.md), ~280 tasks with stable IDs);
the technical details of prompts, models, and file processing live in
[EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md). When this document and
the backlog disagree, this document wins — fix the backlog.

---

## 1. What we are building

A mobile app (iOS first) that turns Budapest into a walkable, talkable
history machine. Under the hood it is a **knowledge graph**: thousands of
facts about buildings, the people who lived in them, the events that
happened in them, and the connections between all of these — every single
fact carrying a citation to the real archival page it came from. On top of
that graph sit the experiences:

- **Chronicle** — stand at a building, see its timeline and its residents.
- **Graph-hop** — tap a resident, discover the other buildings in his life,
  fly there on the map. The city becomes a browsable social network of
  the dead. Nobody has built this.
- **Audio walks** — themed, dramatized, geo-triggered stories in your
  headphones ("On your left, the window someone watched from in 1951…").
- **Time-warp media** — then/now photo sliders, AI-restored portraits,
  residents who speak, streets that come alive as they were in 1910.

## 2. Why this wins

Anyone can wrap an LLM around Wikipedia and read it aloud. A 2026 market
sweep ([COMPETITOR_LANDSCAPE.md](COMPETITOR_LANDSCAPE.md)) confirms it:
the AI-tour cohort (SmartGuide, StoryHunt, Narrativ) generates generic,
citation-free narration for any city, VoiceMap owns quality-but-static
audio walks, and the archival content for Budapest sits in desktop
research platforms nobody has packaged for consumers. No product anywhere
combines a cited knowledge graph, resident-network navigation, and the
walking experience — that position is empty. Our moat is
slower and deeper: a graph grown night after night from digitized books,
address directories, and photo archives, where every claim is checkable.
The citation is not a legal chore — it is the brand. "Historically
bulletproof, presented like a thriller." A competitor can copy the UI in a
month; they cannot copy a thousand nights of free batch processing and a
network of Hungarian archives that answer our emails.

## 3. The one economic idea

Every expensive operation — LLM extraction, OCR, photo restoration, video
generation, speech synthesis — runs **once, at night, in batch, on free
infrastructure**, and its output is cached forever. Users only ever
download files that already exist. This means user growth costs us almost
nothing, and our costs scale with the *corpus* (bounded, one-time), not
with *traffic* (unbounded, recurring). Every architecture decision in this
document follows from this idea.

## 4. Free-first stack policy

**The rule:** we use free tools and free tiers everywhere. We pay only
when (a) real user demand hits a defined trigger, or (b) there is
genuinely no free way (LLM inference beyond free tiers, Apple's $99
developer fee, a domain). When a free tier runs out, the first response
is *migrate to self-hosted free* (our Oracle VM), not "add a credit card."

| Component | Free tool | Its limit | Trigger to act | First response (free) | Paid fallback (only on demand) |
|---|---|---|---|---|---|
| Web hosting | Cloudflare Pages (static) — the Next 15 App Router API needs the OpenNext adapter or lives on the Oracle VM behind Cloudflare (backlog F-16) | effectively none for us | — | — | — |
| Files/CDN (audio, images, video) | Cloudflare R2 | 10 GB storage; egress is always free | >8 GB stored | compress harder (Opus audio, WebP/AVIF images), prune unused variants | ~$0.015/GB/mo — pennies |
| Database | Supabase cloud free | 500 MB DB, project pauses after 1 week inactivity | >400 MB | move the **entire kg_* schema** to self-hosted Postgres on the Oracle VM (`infra/` stack exists) and expose serving data back via postgres_fdw or synced views — never split kg_pages away from kg_facts, they're FK-joined (backlog O-06) | Supabase Pro $25/mo — only if the app itself outgrows free |
| Batch compute | Oracle Free Tier ARM VM (4 cores, 24 GB) | reclaimed when "idle" — Oracle's bar is 95th-percentile CPU < 20% over 7 days, which a short nightly job does NOT clear | — | heavy batch weeks are safe; between phases assume reclaim can happen — the VM is disposable by design (see §12 edge case) | any $5/mo VPS |
| CI / schedulers | GitHub Actions | 2,000 min/mo on private repos (public repos: standard runners free); scheduled workflows auto-disable after 60 days of repo inactivity | >1,500 min used | make the repo (or a jobs-only mirror repo) public, or move heavy jobs to the Oracle VM's cron | — |
| Map tiles | OpenFreeMap + MapLibre | none published | — | self-host Protomaps tiles on R2 | — |
| LLM inference | OpenRouter free models, Gemini free tier | small per-day request caps on free models | throttled mid-batch | the plan of record: one-time $10 OpenRouter credit purchase raises the free-model daily cap ~20× (the credit stays spendable) + Gemini AI Studio's separate daily quota as a second lane | pay per token — **unavoidable category**; typically $0–5, worst case < $25 one-time for the whole corpus |
| Embeddings | OpenAI small model | none (paid but ~$1 total) | — | — | unavoidable, ~$1 |
| OCR | Tesseract on VM | quality on old print | quality gate fails | vision-LLM free tiers | vision-LLM paid, cents/page |
| TTS | Kokoro on VM, Gemini TTS free | voice quality | hero content sounds flat | — | ElevenLabs for hero voices only |
| Photo restore/colorize | Real-ESRGAN, GFPGAN, DeOldify on VM | slow on CPU | too slow ≠ a problem (nightly) | — | one spot-GPU hour ~$0.30 |
| Video generation | none good enough free | — | — | — | unavoidable: ~$10 one-time for ~30 clips |
| Talking heads | SadTalker/LivePortrait on VM/GPU-hour | slow | — | — | ~$3 one-time |
| Crash reporting | Sentry free tier | 5k events/mo | exceeded | sample errors | — |
| Analytics | Cloudflare Web Analytics + own events table | none | — | — | — |
| App distribution | PWA (free forever) | no background audio, no store presence | — | — | **unavoidable**: Apple $99/yr at the very end; Google $25 once, later |

**Scaling doctrine:** if the app suddenly succeeds, the stack above holds
to roughly tens of thousands of monthly users without paying anything but
R2 pennies, because everything users touch is a cached file behind
Cloudflare. The first real paid upgrade under demand would be Supabase Pro
(if API traffic outgrows the free instance) — and by then demand justifies
it. We never pre-pay for scale we don't have.

## 5. Architecture in words

Five layers, from the street up:

1. **The app** (Next.js, wrapped in Capacitor for iOS): map, chronicle
   drawers, audio player, walking mode, camera overlays. It talks to a
   thin API and downloads media straight from R2 via Cloudflare's CDN.
2. **The API** (Next.js routes, already in `src/app/api/`): serves
   chronicle data, routes, and narratives. Responses are cacheable because
   the data only changes when a nightly batch runs.
3. **The database** (Supabase Postgres + pgvector): the app tables that
   exist today (locations, narratives, audio variants) plus the knowledge
   graph — sources, pages, persons, events, facts, media, and the edge
   tables connecting people to places, people to people, people to events.
   Every graph row cites the page it came from. Raw page text is private;
   only verified, green-licensed content is publicly readable.
4. **The nightly factory** (GitHub Actions + Oracle VM): scrapers pull new
   raw material into R2; the intake router turns files into pages (text
   extraction or OCR per the decision tree in the pipeline doc); LLMs
   extract structured mentions; resolvers merge duplicate people and match
   locations; a promoter writes verified facts and edges into the graph;
   rankers, translators, and auditors polish it. Every step is idempotent
   and resumable — a crash means "run it again," never "start over."
5. **The media factory** (same infrastructure, different jobs): restores
   and colorizes archival photos, georeferences old maps, renders talking
   residents and street-life clips, uploads everything to R2 with license
   attribution attached.

The knowledge flows one direction: archives → R2 → pages → mentions →
graph → app. Users never trigger generation; they browse the accumulated
result.

## 6. Data strategy

**Sources, in order of value:** Wikidata (pre-structured people and
places, fully free), MEK/OSZK digitized books (the narrative gold —
city histories, memoirs), the 1880–1928 Budapest address directories
(an FSZEK collection hosted on Hungaricana — who lived at which address,
year by year, the backbone of the resident graph), Fortepan (photos,
**CC BY-SA 3.0** — ShareAlike: our restored/colorized derivatives must
carry the same license and become freely reusable with credit; commercial
use stays allowed), Budapest100 house histories (already scraped),
Hungaricana postcards, Europeana, műemlékem.hu, public-domain map scans.

**Licensing doctrine — the non-negotiable loop:** no source is ingested
before its license verdict is green in `docs/LICENSING.md`. Unclear terms
mean we email the institution (bilingual template ready), wait, and nudge
once; no answer after four weeks means red, and we move on. Attribution
is implemented once as a UI component and shown everywhere. Evidence
(emails, screenshots of terms pages) is archived in the repo.

**Why the graph itself is legally safe (text):** facts are not
copyrightable — only expression is. Our pipeline extracts atomic facts
from (mostly Hungarian) sources and stores them re-expressed in English,
so none of the protected formulation survives into the graph.
(Translating whole passages would be a derivative work; fact extraction
is not.) The EU text-and-data-mining exception (DSM Directive Art. 4)
additionally covers the processing of lawfully accessible content, unless
a source has opted out machine-readably — we check per source. What
survives even for facts, and is why the institution loop above still
exists: the EU *database right* protects a digitized collection as an
investment for 15 years, and a site's terms of use bind contractually —
so bulk extraction needs the collection owner's green light even though
every individual fact is free.

**Why photos are different:** age is not the test — the photographer's
death year is (life + 70; anonymous works 70 years from publication).
Pre-~1900 photos are safely public domain; a 1935 photo can be protected
into the 2040s. And the "communist era = free" assumption is explicitly
rejected: socialist Hungary had copyright law throughout (the 1921 and
1969 Acts), EU accession *revived* the era's lapsed short photo terms to
life + 70, and state archives like MTI are owned, commercial, and
actively licensed today. Therefore every 20th-century photo enters the
app through an explicit license (Fortepan CC BY-SA) or an institutional
agreement — never through an age assumption. One rule in our favor:
a faithful scan of a genuinely public-domain work gains no new copyright
(DSM Art. 14).

**Quality doctrine:** the LLM writes only to a staging table, never to the
graph. A resolver promotes mentions after entity resolution (Hungarian
surname-first names, Wikidata anchoring, embedding similarity, LLM
adjudication for the gray zone). A golden set of 20 hand-annotated pages
gates every model and prompt change: precision ≥95%, recall ≥80%,
precision always favored — a missed fact is invisible, an invented fact
breaks the core promise. A cross-family audit model spot-checks promoted
facts; anything unsupported is auto-quarantined for human review in a
deliberately ugly admin page.

**People and privacy:** the graph only contains people who died ten or
more years ago or are clearly public historical figures. GDPR does not
protect the dead, but Hungarian law does more than GDPR: the Civil Code
(§2:50) protects the *memory of the deceased* — relatives can sue over
disrespectful portrayal, with no time limit. So the real rule is twofold:
the ten-years-dead gate keeps us out of GDPR entirely, and the
respect-and-citations doctrine (facts only, era-appropriate dignity,
especially in the talking-resident monologues) keeps us on the right side
of §2:50. The descendant-objection playbook in §12 exists because of this
law, not as mere courtesy.

## 7. GenAI media strategy

Media follows a strict honesty policy: every AI-touched asset is labeled
("AI-colorized — original: Fortepan / donor, CC BY-SA 3.0" — ShareAlike
means the license notice is part of the label), every asset traces to its
source and license, and Fortepan sees derivative styles before we publish
them. Technically: restoration and colorization run free on the VM;
talking residents are animated portraits with era-appropriate scripted
monologues generated *only* from cited facts (the one place we pay for a
top-tier LLM, because these ~10 residents' short scripts of character
writing ARE the product); street-life clips are one-time image-to-video
renders (~$10 total). "AR" in v1 is honest theater: camera feed underneath, media
overlaid with slight gyroscope parallax — it films like magic on TikTok
without fragile WebXR anchoring. Real tracking can come later; nobody will
miss it meanwhile.

## 8. Distribution strategy

**iOS first**, because Budapest's tourists skew iPhone and because the
walking guide needs what only a native wrapper gives: background audio
with the screen locked, offline route packs, reliable geofencing. One
honest v1 boundary: when the screen locks, the WebView's JavaScript
suspends — audio keeps playing but new stops can't trigger. So v1 walking
mode is screen-on (wake lock, dimmed, touch-locked, in hand or pocket);
true screen-locked triggering is a v1.1 native background-location
upgrade with its own App Review justification. The
sequence is designed around the $99 Apple fee: everything buildable and
testable for free happens first (Capacitor wrapping, on-device dev builds
with a free Apple ID, the whole feature set, screenshots, metadata); the
fee is paid at a single explicit gate only when external testers say
"ship it." A **PWA stays live forever** at the domain as the free
acquisition funnel — QR codes on the street open it instantly, and it
upsells the App Store install. **Android follows later** ($25 once) after
iOS retention numbers prove the product; its main extra risks are
aggressive battery managers on cheap phones and WebView fragmentation,
both handled in the backlog.

App Review risk is pre-empted, not reacted to: the app demonstrates
native functionality well beyond a wrapped website, permission strings are
written carefully, and a **demo mode simulating GPS along the spy route**
lets a reviewer in California experience the walk from a desk. That single
feature removes the most likely rejection.

## 9. Partnerships and funding

Institutions are approached in order of warmth, always with a working
demo: Fortepan and KÉK/Budapest100 first (natural allies), then the
archives and libraries (BFL, FSZEK — public engagement is their mandate;
we are their KPI), then one district municipality (VII, where the spy
route lives), then Budapest Brand and the Budapest Card catalog. We ask
for data access, letters of support, and promotion — never money at
first. Grant applications (NKA, Creative Europe, EIT Culture &
Creativity, Visegrad Fund for the multi-city future) go out only after
launch, carrying traction numbers and institutional letters, because
that is when cultural grants actually win. Partnership work is timeboxed
to a day a week so paperwork never blocks the build.

## 10. Money

**Costs to launch:** ~$165 total, of which $99 is Apple, ~$13 is one-time
media generation, and ~$10–15 is LLM work (a one-time $10 OpenRouter
credit unlock plus $0–5 of paid overflow). Monthly run cost: $0 plus
vigilance.

**Monetization (later, only after retention is proven):** the app stays
free; the candidates are premium themed routes (one-time purchase),
a city-pass partnership (Budapest Card), and licensing the graph/API to
tour operators and researchers. Nothing in the architecture blocks any of
these; nothing is built for them until demand exists. If we charge, the
licensing ledger is re-checked for non-commercial clauses first (the
backlog already forces institutions to be asked about modest commercial
use up front, so this is a lookup, not a renegotiation).

## 11. Sequencing (six months, honestly)

Month 1: legal/GDPR foundation, knowledge-graph schema, first corpus
(Wikidata, Wikipedia, two MEK books); licensing emails go out.
Month 2: the extraction factory runs nightly; the graph comes alive
(the milestone: SQL alone can answer "who lived on Andrássy út, with
sources?"). Month 3: Chronicle, person profiles, graph-hop in the app —
the demo exists; institution meetings begin. Month 4: media layer and
walking guide in parallel; municipality meetings with the demo.
Month 5: free iOS preparation, quality passes (historian review,
sensitivity review of WWII/1956 content, Hungarian-native QA,
accessibility). Month 6: pay Apple, TestFlight beta, submit, launch —
timed to Sziget Festival or Budapest100 weekend, whichever lands nearer.
Android, grants, and the CityTales expansion memo come after.

## 12. Edge cases and playbooks

The point of this section: when one of these happens, the answer is
already written down.

### Infrastructure
- **Oracle reclaims the idle VM.** Always Free instances get reclaimed
  when "idle" — and Oracle's bar is high: 95th-percentile CPU under 20%
  over 7 days counts as idle, which a short nightly job does NOT clear.
  During heavy batch weeks (OCR, restoration) we're safe; between phases,
  assume reclaim can happen. The real mitigation: the VM is disposable —
  everything on it is reproducible from a setup script in `infra/`, all
  state lives in R2/Postgres, weekly `pg_dump` to R2. Losing the VM costs
  one evening, not data.
- **A free tier changes its terms** (Supabase has before; free LLM pools
  rotate weekly). Response: the stack table in §4 lists the migration path
  for every component; nothing in the system has only one home. Monthly
  cost-dashboard ritual catches drift early.
- **Supabase free project pauses from inactivity** (pre-launch risk).
  A weekly keep-alive query in the nightly job prevents it.
- **R2 approaches 10 GB.** Audio to Opus (~half the size of MP3), images
  to AVIF, delete superseded media variants. Paid overflow is pennies —
  this is the one place paying early is rational.
- **An OpenRouter free model disappears mid-batch.** Model IDs are env
  vars, not code; the runbook lists the substitution order; the batch
  resumes where it stopped because every worker is checkpointed.
- **Traffic spike (something goes viral).** Media and map tiles are on
  Cloudflare — they hold. The only pressure point is the API; chronicle
  responses are CDN-cacheable, so the fix is cache headers we already
  planned, not servers.

### Data and legal
- **An institution says no, or demands a takedown.** Every fact and asset
  carries `source_id`; one SQL statement quarantines everything from a
  source; the app shows the "still being researched" empty state.
  Feature-flag off, reply politely same week, keep the relationship.
- **A licensing answer never comes.** Four-week rule: mark red, ship
  without it. The plan is designed so no single source is load-bearing:
  Wikidata + Wikipedia + Fortepan + Budapest100 alone make a launchable
  product.
- **A user reports a wrong fact.** Report button → fact status
  `disputed` → hidden from the app at the next cache refresh → appears in
  the admin review queue with its source page beside it. Wrong = deleted;
  right = restored with a note. Target: resolved within a week.
- **A descendant objects to how an ancestor is portrayed.** This is a
  legal risk in Hungary, not just a courtesy: Civil Code §2:50 protects
  the memory of the deceased and lets relatives sue over disrespectful
  portrayal, with no time limit. Response: same quarantine flow, human
  answer within days, benefit of the doubt to the family. The
  ten-years-dead rule plus strict citation plus the respect doctrine
  makes this rare; taking §2:50 seriously makes it survivable.
- **The extractor hallucinates systematically on some source.** The
  runtime tripwires (facts-per-page drift, audit failures) quarantine
  automatically; the golden set localizes the regression to a prompt or
  model change; re-extraction is cheap because pages are checkpointed.
- **GDPR complaint.** We store no user accounts, no location history, and
  no living persons in the graph; analytics is cookieless. The honest
  answer is one paragraph long, and the privacy policy already says it.

### Product and street reality
- **GPS drifts in the narrow streets of District VII.** Geofences need two
  consecutive fixes; radius tuned per stop; the walking mode gracefully
  says "when you reach the corner…" rather than snapping. Field-tested
  twice in the backlog before anyone else touches it.
- **Tourist has no data plan.** Offline route packs (route + audio +
  images downloaded on wifi); the PWA and the app both nudge downloads
  before the walk starts.
- **Battery anxiety.** GPS polling is reduced until near a stop; the
  benchmark is a 90-minute walk under 25% battery on a mid-range iPhone,
  enforced before release.
- **Phone call interrupts a story.** Audio session handling: pause,
  offer "replay last 15 seconds" on resume.
- **A building is renovated/demolished, a street renamed.** Locations
  carry historical names as written in sources plus modern mapping; a
  yearly "does the on-street reality still match" pass over hero
  locations is in operations.
- **Sensitive history handled clumsily.** WWII, the Holocaust, and 1956
  are not "thriller content." The narrative prompts carry explicit tone
  rules per era; a historian reviews the launch routes; the Danube shoes
  memorial and similar sites get hand-written treatment, not generated
  drama.
- **Night/weather/safety.** Routes are marked with lighting notes;
  scripts never direct users across traffic mid-sentence; a safety line
  opens every walk.

### Apple and release
- **App Review rejects.** Most likely causes are pre-empted (minimum
  functionality, location justification, demo mode for remote reviewers).
  If rejected anyway: read the cited guideline, fix, resubmit with a
  polite note — rejections are a normal loop, not a crisis. The PWA
  means users are never blocked while we iterate.
- **The $99 renewal question.** Decided yearly by the retention numbers,
  one month before renewal; the PWA remains the fallback distribution if
  the store ever stops being worth it.

### The human one
- **Solo-developer burnout / life happens.** The system is designed to be
  pausable: nightly jobs keep enriching the graph unattended; nothing
  rots in a week or a month. (One footnote: GitHub disables scheduled
  workflows after 60 days without repo activity — a pause longer than
  that means re-enabling one toggle when you return, or hosting the cron
  on the VM.) The runbook (`docs/RUNBOOK.md`) is written
  for tired-future-you; decisions live in `docs/DECISIONS.md` so context
  is never only in your head. The scope weapon: any feature can be cut
  except the graph, the chronicle, and one great walk.

## 13. Decision rules (the constitution)

1. Nothing user-visible without a green license; no exceptions, no
   "meanwhile."
2. Expensive things run once, at night, and are cached forever.
3. Free first; self-host second; pay only at a written trigger or where
   no free path exists.
4. Precision over recall: better a thin, true chronicle than a rich,
   doubtful one.
5. Every fact carries its citation; every AI-touched image carries its
   label.
6. The LLM never writes directly to the graph.
7. The dead only, ten years gone, or clearly public figures.
8. Paperwork (grants, partnerships) never blocks the build; one day a
   week, maximum.
9. When a step fails, it re-runs; nothing is ever "start over."
10. When in doubt about tone: it is history about real people — respect
    first, thrill second.

## 14. What "done" means

Version 1 is done when: a stranger with no explanation completes a
guided walk by voice alone — screen dimmed and touch-locked, phone in
hand or pocket; every fact they heard can be
traced to a page; at least one moment made them hand their phone to a
friend; the App Store listing is live; the monthly bill is a domain name
and an Apple fee; and the graph grew last night without anyone touching
it. Everything after that — Android, more routes, more cities, revenue —
is expansion, and the same three documents keep governing it.
