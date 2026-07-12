# Viral Features — Tales of Budapest

Companion to [PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md) (strategy) and
[COMPETITOR_LANDSCAPE.md](COMPETITOR_LANDSCAPE.md) (the empty position we
occupy). This document answers one question: **which features make a
stranger film their phone on the street and send the clip to a friend?**

Ground rules for everything below:

1. Every feature must exploit an asset only we have: the cited knowledge
   graph, person↔person edges, the 1880–1928 address directories mapping
   real named residents to real doors, Fortepan photos, georeferenced old
   maps, or the faithfulness-audited fact pipeline. Generic app mechanics
   (points, badges, "share to social") are banned from this list.
2. Every feature names its **viral moment** — the exact second someone
   reaches for the record button. If we can't name it, the feature isn't
   viral, it's furniture.
3. The respect doctrine (blueprint §13, rule 10) is not suspended for
   growth. The corpus includes Holocaust-era material and Jewish heritage
   sites; features are flagged below where dark-tourism framing would be
   wrong and reverence is structurally required, not just tonally.
4. Build costs (S/M/L) assume what already exists: the map app, audio
   player, chronicle API, extraction pipeline, interestingness ranking,
   address-book vision path (P3), media workstream plans (M-05 slider,
   M-09 animated portraits, M-11 camera overlay), and proximity guide
   plans (W-01…W-05).

---

## Tier list at a glance

| Tier | Feature | Unique asset exploited | Cost |
|---|---|---|---|
| 🔥 | 1. Behind This Door | address books → named residents at real doors | M |
| 🔥 | 2. Find Your Name in 1913 | address books, full-corpus surname index | M |
| 🔥 | 3. The Time Portal Clip | Fortepan + camera overlay + cited fact | S–M |
| 🔥 | 4. Six Degrees of the Dead | person↔person graph edges | M |
| 🚀 | 5. The Coincidence Engine | person-location edges with date ranges | S–M |
| 🚀 | 6. Ask the Resident | audited facts + monologue pipeline + TTS | M–L |
| 🚀 | 7. Street Whispers | interestingness ranking + geofencing | M |
| 🚀 | 8. The Receipts Button | page-level provenance, scanned sources | S |
| 🌱 | 9. Your Address, 1913 (postcard) | address books + Fortepan + chronicle | S–M |
| 🌱 | 10. Streetline | year-by-year address-book churn | M |
| 🌱 | 11. The Gasp Map | interestingness-5 facts, citywide | S |
| 🌱 | 12. The Names Return | Holocaust-era resident records, partner-led | L |

🔥 = would carry the app alone · 🚀 = strong amplifier · 🌱 = retention/depth

---

## 🔥 Game-changers

### 1. Behind This Door

Stand at any door in the covered districts and the app tells you, by name,
who lived behind it — "1912: Weisz Adolf, glazier. 1908: özv. Kovács
Istvánné, seamstress." — straight from the address directories, year by
year, with the directory page as citation. Not "this building was built in
1897" (every competitor can fake that); *named strangers with jobs and
widowhoods*, which no LLM can hallucinate credibly and no competitor has
digitized. This is the consumer packaging of the single dataset Budapest
Time Machine proved valuable but left on desktop.

- **The viral moment:** a tourist films the door of their Airbnb, taps it,
  and reads out the name of the person who lived there 110 years ago.
- **Powered by:** VISION-STRUCTURED path (P3) on the FSZEK directories,
  location resolver (address → mapped door), `kg_location_chronicle`
  people array, attribution component.
- **Cost:** M — the pipeline path exists on paper; the work is running P3
  over enough directory pages for 2–3 dense districts and tuning the
  address resolver.
- **Risks:** District VII resident lists shade into Holocaust memory — for
  Jewish-quarter addresses the framing must be presence and life
  ("who lived here"), never spectacle, and the 1944–45 period is *not*
  inferred or narrated from directory data (the directories end in 1928;
  keep it that way in copy too). Occupation abbreviations mis-expanded by
  the vision model are a factuality risk — the golden-set gate applies.
  Hungaricana database rights: green license per WS-L before any of this
  ships.

### 2. Find Your Name in 1913

Type your surname; see every Kovács, Weisz, Steiner, or Szabó in the
1880–1928 directories, on the map, with address and occupation. The
audience is not tourists on the street — it is the Hungarian and
Hungarian-Jewish diaspora (millions of people in the US, Israel,
Argentina, Australia), for whom "my great-grandfather's actual front door"
is an emotional payload no travel app has ever delivered. This feature
recruits users who have never been to Budapest and gives them a reason to
book a flight — and it works in the PWA, before the App Store, as the
acquisition funnel the blueprint already wants.

- **The viral moment:** a diaspora user posts a screen recording — typing
  their family name, watching pins appear across Pest — captioned "found
  my great-grandmother's building."
- **Powered by:** the same P3 directory extraction as feature 1, plus a
  normalized surname index (Hungarian orthography variants: Weisz/Weiss,
  Kohn/Kún) and a public search endpoint over the safe projection.
- **Cost:** M — the index and one search page; the corpus work is shared
  with feature 1, so build them together.
- **Risks:** genealogy invites over-claiming — the UI must say "a person
  of this name," never "your ancestor." All persons are pre-1928 records
  of people long dead, so the ten-years-dead rule holds, but §2:50
  respect applies to how occupations and widow notations are phrased.
  Rate-limit and cache the search; it is the one endpoint traffic could
  hammer.

### 3. The Time Portal Clip

Hold your phone up at a landmark: camera feed underneath, the Fortepan
photo of the same view overlaid with gyroscope parallax (M-11's honest
theater), one gasp-ranked fact as a caption, the citation in the corner.
Then the killer addition: **one tap exports a 10-second vertical clip** —
present wipes to past and back, fact and credit baked in. We don't ask
users to be good at filming; the app manufactures the TikTok for them,
watermarked with the app name and the CC BY-SA credit line.

- **The viral moment:** the wipe itself — 2026 dissolving into 1913 on the
  exact spot you're standing — posted straight from the share sheet.
- **Powered by:** M-05 slider assets (Fortepan hero pairs, restored
  variants), M-11 camera overlay, M-13 labeling, interestingness ranking
  for the caption fact. Export is canvas/WebCodecs capture of the overlay
  — no server rendering, $0 marginal cost, on-brand with the
  cache-everything economics.
- **Cost:** S–M — the overlay is already planned; the delta is the clip
  exporter and the caption/credit template.
- **Risks:** ShareAlike propagates into the exported clip — the baked-in
  credit is the compliance mechanism, keep it non-removable. At memorial
  sites (Danube shoes, synagogue courtyards) the caption template must
  switch to the hand-written reverent register; no "gasp" captions there.

### 4. Six Degrees of the Dead

Tap a resident, and the city rearranges itself around their life: the
flat, the café where they held court, the mistress's salon, the rival's
office — each hop a cited edge, each hop a fly-to on the map. Then the
share format: **the relationship path itself.** "The doorman of the New
York Café → served → the editor → who published → the poet → who lived
above → this pastry shop." Nobody else has person↔person edges at all;
this turns the graph from infrastructure into the product, and every
scandal, feud, or love affair in the corpus becomes a walkable, citable
thread.

- **The viral moment:** screen-recording the map flying hop by hop through
  a real 1910s love triangle, every stop a real address.
- **Powered by:** person-person and person-location edge tables
  (KG_APP_SYSTEM §canonical graph), Wikidata anchoring for famous nodes,
  the map's existing fly-to, chronicle citations.
- **Cost:** M — UI is a path view over queries the schema already
  supports; the real cost is corpus density (needs WS-X promotion runs to
  have produced enough edges to make hops reliably interesting).
- **Risks:** relationship claims (affairs especially) are exactly where
  precision-over-recall matters most — surface only `active` edges,
  show the quote's source on tap, and keep the hedged confidence
  (P1 rule 5b) visible in phrasing ("reportedly"). Living-descendant
  sensitivity is highest here; the §2:50 playbook must be one tap away.

---

## 🚀 Strong amplifiers

### 5. The Coincidence Engine

A nightly graph query, not a feature build: find pairs of notable people
whose person-location edges overlap in space and time. "For six years,
X composed two floors above the café where Y wrote his reviews — there is
no evidence they ever spoke." Each hit becomes a card: two portraits, one
map, the overlap dates, two citations. This is content marketing generated
*from the graph itself* — an inexhaustible feed of screenshot-native
posts that no competitor can copy without our edges.

- **The viral moment:** the card is the share; posted by us or
  discovered in-app and screenshotted ("wait, THEY were neighbors?").
- **Powered by:** person-location edges with date ranges, Wikidata
  notability, geocoded locations; one SQL view plus a card renderer.
- **Cost:** S–M — a query, a ranking pass, a card template. Runs in the
  nightly batch like everything else.
- **Risks:** date ranges from directories are yearly and fuzzy — phrase
  overlaps honestly ("both listed at these addresses in 1911"). Avoid
  manufactured pathos at tragedy-adjacent pairings.

### 6. Ask the Resident

The talking residents (M-07…M-10) get one upgrade that changes their
species: you can ask them things. Answers are generated **only** from that
person's cited fact set — and the character says so in period voice when
you step outside it: "That I could not tell you; I locked the shop for the
last time in 1921." The refusal is the feature: in a market where every AI
guide hallucinates, a ghost with epistemic humility and receipts is both
funnier and more trustworthy than any competitor's chatbot.

- **The viral moment:** a TikTok of someone asking a 1908 grocer about
  the wifi password and getting a dignified, in-character, historically
  grounded refusal.
- **Powered by:** audited per-person fact sets, monologue prompt P8's
  character register, existing TTS client, animated portrait (M-09).
  Constrained RAG over one person's facts — small context, cheap calls.
- **Cost:** M–L — the one feature here that breaks the "users never
  trigger generation" economics; mitigate with a heavily cached
  common-question layer, strict rate limits, and free-tier models, or
  ship v1 as pre-generated Q&A ("ask one of these") which stays $0.
- **Risks:** the flagship §2:50 surface — scripts strictly fact-based,
  era-appropriate dignity, no ventriloquizing opinions the person never
  recorded. Never build a conversational persona of a Holocaust victim;
  restrict v1 personas to the ~10 vetted hero residents.

### 7. Street Whispers

Not a tour — an ambient layer. Walking anywhere in covered districts with
headphones on, the phone stays silent until you cross a threshold near an
interestingness-5 fact, then murmurs one sentence: "The window above the
green door — in 1926, someone watched this street for three years and
wrote down everything." Serendipity is the product; the city becomes
haunted in the best sense, and it reuses the proximity engine the walking
guide already needs.

- **The viral moment:** the involuntary stop-and-look-up — filmed by the
  friend walking next to you; "this app just told me what happened at the
  building I was passing."
- **Powered by:** interestingness ranking (P1 scale, T6 re-ranking),
  geofencing and debounce rules (W-01/W-02), pre-rendered one-line audio
  (cached forever, per the economics).
- **Cost:** M — mostly W-workstream reuse plus a whisper-length narrative
  template and a citywide trigger set instead of a route.
- **Risks:** GPS drift in District VII (already playbooked); whisper tone
  at sensitive sites must drop the thriller register entirely — memorial
  geofences use the hand-written treatment or stay silent.

### 8. The Receipts Button

Every sentence in every narration gets a "show me" affordance: tap while
listening and the actual source surfaces — book title, page reference,
and where license allows, the scanned page itself with the supporting
line indicated. The anti-AI-slop flex, productized. In 2026's climate of
AI distrust this is not a footnote feature; "my tour guide shows the
actual 1896 page" is itself a shareable claim, and it weaponizes the one
thing (blueprint §2) competitors structurally cannot copy.

- **The viral moment:** a side-by-side screenshot — the dramatic narrated
  claim next to the century-old page that proves it.
- **Powered by:** page-level provenance already mandatory on every fact,
  narrative generation already grounded in chronicle facts; the delta is
  keeping fact-IDs attached through script generation into the player UI.
- **Cost:** S — plumbing and one drawer component; the data contract
  already exists.
- **Risks:** verbatim page display only where the source license is green
  for it (raw text is private by default — KG_APP_SYSTEM data boundary);
  fall back to title + page ref + link. This feature also raises the
  stakes of any extraction error, which is the point.

---

## 🌱 Retention / depth

### 9. Your Address, 1913 (the postcard)

Type any covered address — where you're staying, where you live — and get
a generated keepsake card: the street name as written then, the residents
of the door that year, one line of what the street was like, the nearest
Fortepan photo, citations in small print, vintage-modern design system
dressing. Free, beautiful, and personal: the user-generated shareable
artifact that markets the corpus. Works in the PWA; a natural QR-code
street poster ("What was this address in 1913?").

- **The viral moment:** the card itself, posted with "this is who lived
  in my building" — every share contains our name and a citation.
- **Powered by:** features 1–2's directory index, Fortepan geolocation,
  the design tokens, a static card renderer (server-side once, cached).
- **Cost:** S–M once Behind This Door exists.
- **Risks:** same directory sensitivities as feature 1; the card template
  must handle the no-data case gracefully ("still being researched").

### 10. Streetline

Pick a street, drag a year slider 1880→1928, and watch the doors churn:
shops opening, widows appearing, families vanishing from one edition to
the next. The directories are the only dataset anywhere dense enough to
animate a street's population year by year. Quietly devastating in
Jewish-quarter streets even before the war — and a data-visualization
form nobody has seen from a phone on the actual street.

- **The viral moment:** the screen-recorded scrub — forty years of one
  street's life in eight seconds.
- **Powered by:** year-keyed directory extractions per address; a
  timeline view over the same index as features 1/2/9.
- **Cost:** M — needs multi-year coverage of the same streets, which is a
  corpus-depth decision more than an engineering one.
- **Risks:** the churn visual must never be extended past 1928 into
  implied deportation narratives; that story belongs to feature 12's
  partner-led register or not at all.

### 11. The Gasp Map

A citywide heat layer of interestingness-5 facts — the scandal-and-tragedy
topology of Budapest, every hotspot backed by citations. In-app it drives
"where should we walk?"; outside the app it generates rankable, pressable
content ("the most scandalous 100 meters in Budapest, with sources") that
journalists can verify — which is why they'll write about it.

- **The viral moment:** the map screenshot in a listicle or group chat:
  "our street is on the scandal map."
- **Powered by:** the interestingness field the extractor already
  produces, T6 ranking, the existing map clustering.
- **Cost:** S — a styled layer over data the pipeline already emits.
- **Risks:** the heat metaphor must exclude Holocaust/1956 sites by rule,
  not by taste — tragedy of that register is not "gasp content"
  (blueprint §12). Maintain an explicit exclusion list.

### 12. The Names Return

The gravest asset handled the gravest way: for buildings whose residents
were murdered in 1944–45, a mode developed **with** the Jewish community
and memorial institutions (in the spirit of Stolpersteine and Yom HaShoah
name readings) — stand at the door, and the app speaks the residents'
names, plainly, without music, without narrative. Not a growth feature
and never framed as one; it is the feature that makes the institutions,
the press, and the city take the app seriously, and it is the right thing
to build with this data.

- **The viral moment:** none is engineered, and the app never prompts
  sharing here. If it moves people to share, that is theirs.
- **Powered by:** directory records joined with memorial databases (only
  under formal partnership — e.g. Yad Vashem records have their own
  terms), the TTS pipeline in its plainest register, geofencing.
- **Cost:** L — the engineering is small; the partnership, review, and
  care are the cost, and they are non-negotiable prerequisites.
- **Risks:** maximal. Do not build without partners; no generated drama,
  no colorization, no talking portraits, no interestingness ranking
  anywhere near it. This is the feature where getting it wrong ends the
  project's credibility, and getting it right defines it.

---

## The first bet

**Build the Time Portal Clip (feature 3), anchored at the Dohány Street
Synagogue.**

Why this one, given the vertical slice that already exists:

1. **It's the shortest path from "works" to "filmed."** The Dohány slice
   already has reviewed, cited facts flowing through the chronicle API;
   Fortepan has strong photographs of the synagogue and Wesselényi utca;
   the camera overlay (M-11) and slider assets (M-05) are already planned
   pieces, not new inventions. The only new engineering is the clip
   exporter and caption template — S-sized on top of the existing plan.
2. **It manufactures its own distribution.** Every other 🔥 feature needs
   corpus density (directory coverage, edge density) before it impresses.
   The Time Portal is fully impressive with *one* location — and every
   use emits a watermarked, credited, citation-bearing vertical video,
   which is precisely the artifact TikTok and Reels reward. The demo IS
   the marketing asset for institutions (blueprint §9 wants a working
   demo before every meeting) and for the App Store screenshots.
3. **It's sensitivity-safe at this site.** A reverent then/now of the
   synagogue's facade is respectful by construction — no named victims,
   no dramatized suffering, a Fortepan credit and a cited caption. It
   proves the honest-theater AR and the labeling doctrine (M-13) in the
   one district where getting tone right matters most, before the
   riskier resident-name features ship.
4. **It sets up the graph features instead of competing with them.** The
   clip's cited caption trains users that this app shows receipts; when
   Behind This Door and Six Degrees arrive on the strength of the
   directory batches, the audience the clips recruited already trusts
   the brand's core claim: historically bulletproof, presented like a
   thriller.

Sequence: Time Portal Clip at Dohány first (proof + distribution),
directory extraction for Districts VI–VII in parallel nightly batches,
then Behind This Door + Find Your Name as the one-two punch that no
competitor on the landscape can answer.
