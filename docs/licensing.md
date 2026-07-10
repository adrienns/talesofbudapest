# Licensing and data sources

This document summarizes the licensing posture of external data used by Tales of Budapest. **This is not legal advice.** Confirm production use with the rights holders before shipping a commercial app.

## Overview

| Source | What we use | Stated license | Documented in repo? |
|--------|-------------|----------------|---------------------|
| Budapest100 | Building text, metadata, page images | **CC BY-NC-ND** (archival docs) | This doc |
| Fortepan | Optional historical photos (`--fortepan`) | **CC BY-SA 3.0** | This doc |
| Wikipedia / Wikidata | Flagship sights | **CC BY-SA** (text) | This doc |
| muemlekem.hu | Monuments, protected buildings | Site-specific — check terms | Not verified |
| MEK books (planned RAG) | Public-domain Hungarian texts | Varies by work | Not yet ingested |

The ingest pipeline does not currently store license metadata per row. Consider adding `license` / `attribution` columns if you need compliance at scale.

---

## Budapest100

**Website:** [budapest100.hu](https://budapest100.hu)
**Organizer:** KÉK – Kortárs Építészeti Központ (Contemporary Architecture Centre), in partnership with Blinken OSA Archivum / Budapest City Archives
**Contact (from site):** `budapest100@kek.org.hu`

### What we scrape

From [`ingest/src/scraper/parseHousePage.ts`](../ingest/src/scraper/parseHousePage.ts):

- Address, architect, construction year
- Historical narratives under “Adatok és leírás” / “Data and description”
- Image URLs from building pages
- Optional Fortepan image URLs when `--fortepan` is passed

This becomes `story_prompt`, `source_material`, and map metadata in `locations`.

### Stated license

The clearest public license statement is in a Budapest City Archives research paper on the project:

> *“Digital content is usable without direct licencing from BCA and KÉK in accordance with **CC BY-NC-ND** rules.”*
> — [Data Circulation between Archives and Citizen Science: Case of Budapest100](https://bparchiv.hu/wp-content/uploads/2024/08/D3_5_Archival_Data_Circulation_and_Citizen_Science-_Case_of_Budapest100.pdf)

The same paper describes house “data sheets” on budapest100.hu as **open-access** research materials contributed by volunteers.

License: **[Creative Commons Attribution–NonCommercial–NoDerivatives (CC BY-NC-ND)](https://creativecommons.org/licenses/by-nc-nd/4.0/)**

| Condition | Requirement |
|-----------|-------------|
| **BY** (Attribution) | Credit Budapest100, KÉK, and contributors |
| **NC** (NonCommercial) | No commercial use without separate permission |
| **ND** (NoDerivatives) | No remixing, adapting, or transforming the material |

**Note:** A CC badge is not prominently visible on every budapest100.hu page. The CC BY-NC-ND reference comes from archival partnership documentation. Confirm with KÉK/BCA for your specific use case.

### Implications for this app

Our pipeline transforms Budapest100 text in ways that may conflict with CC BY-NC-ND:

1. **Derivative works** — `historianNarrative.js` and `landmarkAudioPipeline.js` rewrite source text via LLM into new narratives and spoken scripts (likely **ND** concern).
2. **Commercial use** — A paid or ad-supported public audio tour app may fall under **NC**.
3. **Attribution** — The app does not yet display per-landmark Budapest100 attribution in the UI.

**Before production:** contact KÉK to ask whether map display, attributed excerpts, LLM narration, and TTS audio are permitted, or whether a data partnership / different license applies.

---

## Fortepan

**Website:** [fortepan.hu](https://fortepan.hu)
**Used when:** `npm run scrape:budapest100 -- --fortepan`
**Code:** [`ingest/src/enrich/fortepan.ts`](../ingest/src/enrich/fortepan.ts)

Fortepan states photos are freely usable with attribution:

> *“A képek FORTEPAN / X.Y. adományozó megjelöléssel bármilyen célra szabadon közölhetők.”*
> — [fortepan.hu/about-us](https://fortepan.hu/hu/about-us/)

License: **[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)** (per Fortepan and [Wikipedia](https://en.wikipedia.org/wiki/Fortepan))

| Condition | Requirement |
|-----------|-------------|
| **BY** | Credit as `FORTEPAN / [donor name]` |
| **SA** | Derivatives must use the same or compatible license |
| Commercial | Generally allowed under CC BY-SA |

Fortepan image URLs may be stored in `locations.images` when `--fortepan` is enabled. Attribution is not yet surfaced in the app UI.

---

## Wikipedia / Wikidata

**Used when:** `npm run ingest:wikipedia`
**Curated list:** [`ingest/src/sources/wikipedia/curatedLandmarks.ts`](../ingest/src/sources/wikipedia/curatedLandmarks.ts)

Wikipedia article text is typically under **[CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/)**. If you republish or adapt Wikipedia text (including LLM-paraphrased scripts derived from it), you generally need:

- Attribution to Wikipedia and the article authors
- Share-alike on adapted content, if distributed

Wikidata metadata may be under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) for structured data; images have per-file licenses on Wikimedia Commons.

---

## muemlekem.hu

**Used when:** `npm run ingest:muemlekem`
**Code:** [`ingest/src/sources/muemlekem/`](../ingest/src/sources/muemlekem/)

Monument descriptions and images are scraped from [muemlekem.hu](https://muemlekem.hu). **License terms have not been verified** for this project. Check the site’s terms of use before commercial redistribution or derivative audio narration.

---

## MEK books (planned RAG)

Hungarian National Library ([mek.oszk.hu](https://mek.oszk.hu)) hosts many public-domain works. License varies by publication age and digitization policy. The planned RAG pipeline ([rag/ingest.py](../rag/ingest.py)) should record `source_id` and attribution per book before embedding into `document_chunks`.

---

## Recommended compliance steps

1. **Contact KÉK** (`budapest100@kek.org.hu`) about Budapest100 text + LLM audio for a public/commercial tour app.
2. **Add attribution in the UI** — e.g. “Historical text: Budapest100 / KÉK” on landmark detail or player screen; `FORTEPAN / donor` for Fortepan images.
3. **Store license metadata** — optional `locations` columns: `license`, `attribution_text`, `source_url`.
4. **Separate tiers** — use Budapest100 only for non-commercial / research builds until permission is granted; rely on Wikipedia + public-domain MEK for commercial MVP if needed.
5. **Document permissions** — if KÉK grants a license, save the email/agreement and reference it here.

---

## Related

- [Ingest](ingest.md) — scrape pipeline and data sources
- [Architecture](architecture.md) — how source text flows into audio generation
- [Backend](backend.md) — historian narrative and TTS pipeline
