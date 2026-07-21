# Design: Hungarian OCR gazetteer identity repair

Date: 2026-07-21  
Status: approved (Sol + user)  
Repo: talesofbudapest (historical extraction V3 / tour KG)

## Problem

Hungarian place names in the Jewish Budapest OCR stream are polluted by
character confusion (`Dohány` / `Dohany` / `Dohdny` / `Dohdany`). That forks
one street or landmark into many provisional entities and weakens the
evidence-backed knowledge graph. Re-OCR or rewriting immutable `pages.txt` is
forbidden.

## Goals

- Merge **identity** of location-like mentions that differ only by OCR damage.
- Show **canonical display labels** (modern gazetteer spelling with diacritics
  where known).
- Never rewrite immutable OCR evidence text or character offsets.
- Prefer under-merge; fail closed when gazetteer match is ambiguous.

## Non-goals

- **C forbidden**: no re-OCR, no rewrite of source pages / reading-view text.
- No free edit-distance repair over ordinary English prose (2026-07-17 policy).
- No person-name auto-repair against the street gazetteer.
- No full-book re-extract solely for this fix.

## Decision summary

| Topic | Choice |
|-------|--------|
| Identity vs evidence | **B**: identity merge + canonical display labels; label ≠ quoted evidence |
| Gazetteer layers | Streets (A) + landmarks (B) + address points (C: `addr:street`+`addr:housenumber`) |
| Repair rule | Corpus-derived confusion candidates; repair only on a **unique** gazetteer hit; stamp `repaired` provenance |
| Lexicon pattern | Extend `historicalOcrLexicon` (curated/closed-set spirit). Unique-hit confusion vs gazetteer is the allowed bend of 2026-07-17 |
| Integration | Feed existing alias / `kgNameLexicon` / `historicalAddresses` paths — no parallel normalizer that casually breaks entity IDs |
| Page scope | Exclude index pp.580–615 from provisional browser/KG (already configured); bibliography may remain |

## Architecture

```
OSM Overpass + landmark seeds
        │
        ▼
ingest/gazetteer/
  budapest-streets.json
  budapest-landmarks.json
  budapest-addresses.jsonl(.gz)
  budapest-places-index.json   ← compact name→unique target index
        │
        ▼
lib/hungarianOcrGazetteer.js   ← unique-hit confusion repair
        │
        ▼
historicalOcrLexicon + historicalSubjectMemory
  (identity key + display label; raw surface stays alias)
```

### Layer schemas (summary)

- **Streets**: existing `budapest-streets.json` (`modern`, `key`, `center`,
  `historical[]`, ODbL attribution).
- **Landmarks**: `id`, `name`, `key`, `aliases[]` (HU/EN/`alt_name`),
  `center`, `sources[]`, `landmark_type`.
- **Addresses**: NDJSON rows `{ street, housenumber, key, lat, lon, osm_type,
  osm_id }`; large file may be gzipped; load path documented in
  `ingest/gazetteer/README.md`.
- **Places index**: folded keys → `{ layer, id, display, unique: true }` or
  ambiguous markers. Repair consults only unique entries.

### Repair semantics

1. Apply only to **location-like** tokens/phrases (place / building / business /
   organisation, or a clear street-type head such as `utca` / `út` / `tér`).
2. Never apply street/landmark gazetteer repair to **person** / **family**
   mentions.
3. Candidate generation: curated corpus confusion siblings + bounded edit
   distance against gazetteer keys (fail closed unless exactly one target).
4. On unique hit: fold identity key and display label; keep damaged surface as
   searchable alias; append a row to the repair log with
   `{ from, to, matched_via: "confusion_unique_hit", layer, gazetteer_id }`.
5. Under-merge: zero or multiple hits → leave token unchanged.

### Evidence immutability

Quoted evidence, reading offsets, and layout text remain exactly as extracted.
Canonical labels are a presentation / identity layer only.

## Build / load

- `npm run build:gazetteer` — streets (existing Overpass path).
- `npm run build:places-gazetteer` — landmarks + addresses + places index;
  falls back to cached streets on Overpass rate-limit; resume script under
  `cli/`.
- Extract / browser / subject-memory load the places index by default when
  present.

## Verification

- Unit tests: `Dohány` / `Dohany` / `Dohdny` → same location key; false-merge
  cases stay distinct.
- Phase-0 damage report JSON under `ingest/corpus/restricted/extractions/`.
- Rebuild provisional facts browser `--pages 1-579` with
  `fullbook-v2.12,fullbook-v2.12-retry` and provisional KG plan excluding index.
- Report before/after distinct `dohdny`-class entities, top locations, gazetteer
  counts, tests passed.

## Licensing

Street geometry, landmark OSM tags, and address points: © OpenStreetMap
contributors, **ODbL 1.0**. Keep attribution in gazetteer artifacts and any
public map display. Budapest100 / műemlék / Wikidata seed merges carry their
own source stamps; do not strip provenance.
