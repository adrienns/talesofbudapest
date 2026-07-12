# Attribution backlog

Actionable checklist of every attribution/credit the app owes its data sources,
where it must appear in the UI, and current status. Companion to
[licensing.md](licensing.md) (which covers the license *posture*; this covers
the *obligations*). **Not legal advice** — confirm with rights holders before a
commercial launch.

Legend: ✅ done · ⬜ TODO · 🚫 blocked / must-not-surface · ➖ not required (courtesy only)

## Status table

| Source | License | Attribution required? | Exact credit | Where in UI | Status |
|---|---|---|---|---|---|
| Map tiles (CARTO + OSM) | ODbL / CARTO terms | **Yes** | `© OpenStreetMap contributors © CARTO` | Map attribution control | ✅ done |
| Nominatim geocoding | OSM usage policy | **Yes** (OSM credit) | covered by the map `© OpenStreetMap` credit | Map attribution control | ✅ done (via map) |
| Fortepan photos | CC BY-SA 3.0 | **Yes** + share-alike | `FORTEPAN / <donor name>` | Per image (gallery + any use) | ⬜ TODO |
| Budapest100 text | CC BY-NC-ND | **Yes** + NC + ND | `Historical text: Budapest100 / KÉK & contributors` | Landmark detail + player | ⬜ TODO (⚠ see NC/ND) |
| Wikipedia / Wikisource | CC BY-SA | **Yes** for prose reuse | `Source: Wikipedia (CC BY-SA)` + article link | Landmark detail / Sources screen | ⬜ TODO |
| Wikidata | CC0 | No (courtesy) | `Data: Wikidata (CC0)` | Sources screen | ➖ optional |
| MEK-15124 and MEK-04093 | Public domain (item-level records) | Courtesy + provenance | `Source: <title>, <author/editor>, <MEK ID> / OSZK` | Chronicle citation + Sources screen | ⬜ TODO |
| MEK-17520, Lux Terka's *Budapest* | CC BY-SA 4.0 (item-level record) | **Yes** + share-alike where applicable | `Lux Terka, Budapest, MEK-17520 / OSZK, CC BY-SA 4.0` | Chronicle citation + Sources screen | ⬜ TODO |
| Restricted local monographs | No public-use permission recorded | Internal provenance only; content is not publication-ready | Never expose raw text/quotes; keep the full citation in private review tooling | Private staging/admin only | 🚫 do-not-publish |
| MAPIRE / Budapest Time Machine (Arcanum + BFL) | RED / negotiated | Per future agreement | TBD by license | TBD | 🚫 blocked (not ingested) |
| muemlékem.hu | Unverified | Unknown | verify first | — | 🚫 hold until verified |

## Required UI surfaces (none built yet except the map)

1. **Map attribution control** — ✅ already renders `© OpenStreetMap contributors © CARTO`
   (`MAP_ATTRIBUTION` in [constants/map.ts](../talesofbudapest-frontend/src/constants/map.ts),
   wired in `MapView.tsx` and `RoutePreviewMap.tsx`). This also discharges the
   Nominatim geocoding OSM-credit obligation.
2. **Per-image credit** — ⬜ needed on the landmark image gallery
   ([LandmarkImageGallery.tsx](../talesofbudapest-frontend/src/components/ui/LandmarkImageGallery.tsx)):
   each Fortepan image shows `FORTEPAN / <donor>`. Requires storing the donor
   string alongside the image URL (today `locations.images` holds URLs only).
3. **Landmark-level text credit** — ⬜ on the landmark detail drawer and/or audio
   player: whichever source the narrative drew from (Budapest100, Wikipedia,
   book). The KG Chronicle already carries per-fact source citations — surface
   those.
4. **Dedicated Sources / Credits screen** — ⬜ an aggregate list of public
   sources and licenses. This helps with source-level credit, but does not
   replace per-image donor/creator credit or a link to the exact adapted work.

## Per-source detail

### Fortepan — CC BY-SA 3.0 ⬜
- Credit format: **`FORTEPAN / <donor name>`** (donor is per-photo, not a constant).
- Share-alike: any derivative image (crop, colorize, "then/now" composite) must
  carry the same/compatible license and credit.
- **Blocker:** the donor name isn't captured today — `ingest/src/enrich/fortepan.ts`
  stores URLs. Capture the donor field at ingest so the UI can render it.

### Budapest100 / KÉK — CC BY-NC-ND ⬜ ⚠
- Credit: **`Historical text: Budapest100 / KÉK & contributors`** + link to the
  house page.
- **The bigger issue is not attribution but the license terms:** **NC** blocks
  commercial use and **ND** blocks the LLM rewriting the pipeline does. For a
  commercial build this source needs a KÉK agreement (see licensing.md), or
  restrict it to a non-commercial build. Attribution alone does not make it safe.

### Wikipedia / Wikisource — CC BY-SA ⬜
- Only *verbatim or closely-adapted prose* triggers BY-SA. Credit
  **`Source: Wikipedia — <article> (CC BY-SA)`** with a link, and apply
  share-alike to distributed adaptations.
- **Facts extracted and re-paraphrased are not a licensed derivative of the
  prose** (facts aren't copyrightable) — those need only courtesy provenance,
  carried by the Chronicle citation, not a BY-SA obligation.

### Wikidata — CC0 ➖
- No legal attribution required. Courtesy line **`Data: Wikidata (CC0)`** on the
  Sources screen is good practice and cheap goodwill.

### MEK / OSZK books ⬜
- MEK is not one blanket license. Preserve the exact MEK ID and evidence URL
  from the reviewed allowlist for every title.
- For MEK-15124 and MEK-04093, show title, author/editor, MEK ID and OSZK as
  provenance even though the recorded item verdict is public domain.
- MEK-17520 is recorded as CC BY-SA 4.0, so its exact credit and license link
  belong on every public surface using adapted expression, not merely in a
  generic footer.

### Restricted local monographs 🚫
- No reusable-content permission is recorded. Raw files, page text, quotes and
  extraction evidence stay private; the full bibliographic citation remains in
  private review tooling so facts can be audited.
- Do not treat an English paraphrase as automatic publication permission.
  Publishing any derived fact set from a red source is a separate rights and
  database-boundary decision. Until that decision is documented, do not add the
  source or its content to public screens.

## Recommended order of work

1. **Capture the missing provenance fields at ingest** (Fortepan donor;
   source/file evidence; exact MEK item and license) — attribution cannot be
   rendered from data that was never stored.
2. **Build the Sources/Credits screen** — the highest-leverage aggregate
   surface; pair it with the per-work and per-image credits each license needs.
3. **Per-image Fortepan credit** in the gallery.
4. **Per-landmark text credit** on the detail drawer, sourced from the Chronicle
   citation.
5. **Resolve the Budapest100 NC/ND question** with KÉK before any commercial launch
   (it's a licensing decision, not a UI task).

## Related
- [licensing.md](licensing.md) — license posture per source
- [KG_APP_SYSTEM.md](KG_APP_SYSTEM.md) — Chronicle citations (the per-fact provenance vehicle)
- [DATA_MOAT_PLAN.md](DATA_MOAT_PLAN.md) — verified-source provenance as a trust product
