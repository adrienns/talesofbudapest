# Licensing and data sources

This document summarizes the licensing posture of external data used by Tales of Budapest. **This is not legal advice.** Confirm production use with the rights holders before shipping a commercial app.

## Operating rule and current source register

`green` means the recorded terms allow the intended use, `yellow` means that
permission or a use-specific review is still needed, and `red` means private
research only or do not ingest. A source being publicly reachable is not a
license. Every downloaded item needs its own evidence URL and verdict; a portal's
general description is not enough.

| Source | Current use | Rights record | Verdict / publication rule |
|---|---|---|---|
| MEK-15124, *Budapest képes lexicona* | Local PDF/text and extraction pilots | `Public-Domain`; item evidence in `ingest/src/sources/mek/books.ts` | **Green**; preserve title, author, MEK ID and OSZK provenance |
| MEK-17520, Lux Terka's *Budapest* | Local scan/text | `CC-BY-SA-4.0`; item evidence in the MEK allowlist | **Green with obligations**; attribute and apply the license to adaptations as required |
| MEK-04093, *Magyar zsidó lexikon* | Local A-section PDF and extraction | `Public-Domain`; item evidence in the MEK allowlist | **Green**; preserve bibliographic provenance |
| Restricted local monographs, including *Jewish Budapest* | Private extraction and KG staging | No reusable-content permission recorded | **Red**; raw pages, quotes and derived staging stay private unless separately cleared |
| Budapest100 | Building text, metadata and page images | CC BY-NC-ND stated in archival project documentation; confirm scope with KÉK/BCA | **Yellow**; no commercial or transformed public narrative without permission |
| Fortepan | Optional historical photos | CC BY-SA 3.0, with per-photo donor credit | **Green with obligations**, once donor and file-level provenance are captured |
| Wikipedia / Wikisource | Article or transcription text | CC BY-SA; version and page history matter | **Green with obligations** for reused/adapted prose; facts still retain provenance |
| Wikidata | Structured statements | CC0 | **Green**; courtesy credit recommended |
| Wikimedia Commons | Media | Per-file rights statement only | **Per-file gate**; the poller accepts only explicitly open files |
| muemlekem.hu | Monument descriptions and images | Site-specific terms not verified | **Red/hold** |
| MAPIRE / Budapest Time Machine (Arcanum + BFL) | Discovery and partnership target only | Commercial/collection-specific terms | **Red/negotiated**; not ingested |

The KG schema does store source-level `license`, `license_verdict`,
`attribution`, and `license_evidence_url` in `kg_sources`. Media still needs
file-level licensing because one collection can contain files under different
terms. The local corpus contract is documented in
[`ingest/corpus/README.md`](../ingest/corpus/README.md).

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

## MEK / OSZK books

Hungarian National Library ([mek.oszk.hu](https://mek.oszk.hu)) hosts works
under different rights statements. MEK is therefore a delivery platform, not
a blanket public-domain corpus. The reviewed allowlist is
[`ingest/src/sources/mek/books.ts`](../ingest/src/sources/mek/books.ts); it
currently contains the three items in the source register above.

`npm run fetch:mek` records the item page, original file URL, SHA-256, byte
count, retrieval time, license identifier, attribution and evidence URL. Treat
the item record page as the evidence for that edition. Do not infer a verdict
from publication year alone, and do not add an OSZK title until its item-level
record has been reviewed.

The current `ingest/corpus/mek/manifest.json` is only the receipt from the most
recent fetch invocation: the fetcher overwrites it rather than merging older
entries. It is therefore **not yet a complete inventory** of the MEK files on
disk. Until append/merge behavior is implemented, verify the raw directory
against the allowlist and retain prior manifest history before fetching another
book.

Before loading or embedding a title, create/update its `kg_sources` row and
carry `source_id` through every page, mention, fact and evidence row. Green
does not mean provenance is optional.

---

## Budapest Time Machine / MAPIRE — partnership target (RED)

**Portal:** [timemachine.eu/ltms/budapest](https://www.timemachine.eu/ltms/budapest/)
**Maps:** [maps.arcanum.com](https://maps.arcanum.com/en/) (MAPIRE) · **Platform:** [Budapest Time Machine](https://www.hungaricana.hu/en/databases/budapest-time-machine/)
**Rights holders:** **Budapest City Archives (BFL)** owns the historical maps; **Arcanum Adatbázis Kft.** is the developer/operator; **Fortepan** (photos) and **Hungaricana** (underlying database) also feature.

The Budapest Local Time Machine page is an **aggregator/portal** — a Horizon 2020 initiative that talks about open science, but the underlying datasets are **not open**. Treat this as a discovery + partnership lead, **not** a source to ingest.

### What is genuinely here

- **MAPIRE georeferenced historical maps** (1686–2000) — directly valuable for then/now visuals and the historical→modern street-name concordance ([DATA_MOAT_PLAN.md](DATA_MOAT_PLAN.md)).
- **Budapest Time Machine platform** — plot/house-level person and archival data. This is the same territory as the "Behind This Door" viral feature ([VIRAL_FEATURES.md](VIRAL_FEATURES.md)); its existence both validates that concept and argues for partnering rather than rebuilding.

### License posture — RED (commercial / negotiated)

- **Arcanum's georeferenced map tiles** are a commercial product: WMTS API is **€50–150/month**, and Arcanum's terms explicitly state the subscription **"does not automatically grant a license from the copyright holder"** — reuse beyond copyright's free-use exceptions requires a **separate negotiated license**. Same RED bucket as Arcanum newspapers (ADT).
- **The underlying pre-~1945 maps** are out of copyright / public domain — but that applies to *original scans we source and georeference ourselves*, not to Arcanum's digital georeferenced layer.
- **Fortepan** photos remain **CC BY-SA 3.0** (see above) — the one openly reusable piece.
- **BFL archival documents** — case by case, negotiated.

### Recommended action

Do **not** ingest anything from this without a license. Add to the partnership track (aligns with [BIZDEV_FUNDING_PLAN.md](BIZDEV_FUNDING_PLAN.md)'s "meet Arcanum / BFL / Fortepan" move): approach BFL and Arcanum about a data cooperation for georeferenced maps and plot-level records. The out-of-copyright maps are usable only if we georeference our own scans.

---

## Recommended compliance steps

1. **Contact KÉK** (`budapest100@kek.org.hu`) about Budapest100 text + LLM audio for a public/commercial tour app.
2. **Add attribution in the UI** — e.g. “Historical text: Budapest100 / KÉK” on landmark detail or player screen; `FORTEPAN / donor` for Fortepan images.
3. **Keep source and file provenance separate** — `kg_sources` holds the
   source-level verdict; every media file needs its own license, creator/donor,
   source URL and original URL.
4. **Separate tiers** — use Budapest100 only for non-commercial / research builds until permission is granted; rely on Wikipedia + public-domain MEK for commercial MVP if needed.
5. **Document permissions** — if KÉK grants a license, save the email/agreement and reference it here.
6. **Fail closed at publication** — missing/unknown verdicts are not public;
   `red` sources remain private even if extraction succeeded.

---

## Related

- [Ingest](ingest.md) — scrape pipeline and data sources
- [Architecture](architecture.md) — how source text flows into audio generation
- [Backend](backend.md) — historian narrative and TTS pipeline
