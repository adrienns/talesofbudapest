# Canonical landmark architecture

`public.locations` is the canonical place registry. Every map pin, landmark
audio variant, tour chapter, media record, translation, external identifier,
and knowledge-graph location bridge refers to the same location UUID.

## Identity and publication

- `locations.id` is the internal identity; `locations.slug` is the stable,
  human-readable identity used by curated manifests.
- Names are display data. Alternative, former, and multilingual names live in
  `location_aliases`; provider IDs live in `location_identifiers`.
- `publication_status` controls regular map/search visibility.
- `tour_eligible` independently controls whether generated tours may select a
  published place.
- `place_kind` and `lifecycle_status` describe what a place is and whether it
  still exists. A demolished site can remain canonical and searchable.
- Scalar latitude/longitude remain the compatibility coordinates. `map_point`
  is the synchronized PostGIS routing point and has a GiST index.

## Tour stops

`narrative_chapters.location_id` is authoritative. During the compatibility
release, writers store the same UUID in deprecated `landmark_id` and readers
return both `locationId` and `landmarkId`. Chapter `lat`/`lng` are meeting
points; they never overwrite the canonical location point.

Curated manifests must provide `locationSlug` for every stop. The curated
seeder resolves every slug before writing a narrative and then persists both
UUID fields. Existing scripts and audio are reused.

Dynamic tours use only published, tour-eligible locations. Reviewed
`location_tour_facets` take precedence over keyword heuristics. A confirmed
tour may contain at most one unmatched custom stop. It creates a private
`location_candidates` row only after confirmation; candidates never appear on
the public map until reviewed and promoted.

## Media

`location_media` owns media provenance and review state. Runtime selection is:

1. chapter override;
2. approved, commercial-use location media by `sort_order`;
3. the existing neutral UI fallback.

Approved media responses include author, licence, source URL, and licence URL.
Legacy image fields remain available but imported legacy records are not
automatically approved.

## Operations

Apply schema migrations, seed the canonical catalog, then safely reseed current
curated manifests without touching audio:

```sh
npm run db:migrate
npm run seed:canonical-locations --workspace=talesofbudapest-backend
npm run seed:curated-tours -- --skip-audio
```

The canonical seed is idempotent and deterministically links every stored
curated version by tour slug and chapter index. To review a candidate, either
match it to an existing place or promote it as a new canonical place:

```sh
npm run promote:location-candidate --workspace=talesofbudapest-backend -- \
  --id CANDIDATE_UUID --location-slug existing-place-slug

npm run promote:location-candidate --workspace=talesofbudapest-backend -- \
  --id CANDIDATE_UUID --slug new-place-slug --place-kind historical_site
```

Do not remove `narrative_chapters.landmark_id` until a stable release confirms
all deployed readers and writers use `location_id`.
