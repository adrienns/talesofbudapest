# Admin site

The admin site is the private operations console for Tales of Budapest. It gives a curator a readable view of the extraction database and canonical knowledge graph, then asks for explicit approval when the pipeline cannot safely make a decision by itself.

It is a separate Next.js application in `talesofbudapest-admin/`. It runs on port `3100`; the public visitor application remains separate and does not receive the Supabase service-role key.

## What the site is for

The extraction pipeline produces candidate places, people, events, facts, and relations. Some candidates are promoted into the canonical knowledge graph, but uncertain identities and content must be reviewed by a person. The admin site is the human layer between those stages.

The current site provides four views:

- **Overview** reports database availability, table counts, source coverage, extraction progress, and pending-review totals.
- **Insights** explains corpus coverage, pipeline pressure, evidence quality, historical eras, publication state, and the most common relationship types.
- **Review inbox** presents one plain-language decision at a time for entities, aliases, claims, edges, and staged-to-map location connections.
- **Graph explorer** provides complementary Network, Relations, and Ledger views over canonical or private staging data, plus bounded entity details and citations. It is an inspection workspace, not the promotion workflow.

The site connects to one Supabase instance at a time. `SUPABASE_URL` determines whether the console shows the local Docker database or a hosted Supabase project; it does not merge or compare both databases.

## Where it fits

```text
Books and public sources
        │
        ▼
Extraction files and loaders
        │
        ▼
Private staging tables ────────┐
                               │ pending questions
Public map locations ──────────┤
                               ▼
                         Admin review site
                               │ approve/reject
                               ▼
                    Canonical private KG records
                               │ separate publication step
                               ▼
                    Public Chronicle/API surfaces
```

The admin site is not an extraction runner, migration UI, bulk loader, or publication console. Those operations continue to use the preview-first commands in [Scripts](scripts.md). A review approval does not run a bulk pipeline and does not automatically make private book-derived content public.

## Local setup

From the repository root:

```bash
cp talesofbudapest-admin/.env.example talesofbudapest-admin/.env.local
```

Set these four values in `talesofbudapest-admin/.env.local`:

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Password for the private console. Use a long, unique value. |
| `ADMIN_SESSION_SECRET` | Signs session cookies. It must contain at least 32 characters. |
| `SUPABASE_URL` | Supabase API URL, such as `http://127.0.0.1:8000` for the local stack. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used to read and review protected KG records. |

Never prefix the service-role key with `NEXT_PUBLIC_`, put it in client code, or commit `.env.local`.

Start the site:

```bash
npm run dev:admin
```

Open <http://localhost:3100>. The main routes are:

| Route | Screen |
|---|---|
| `/` | Overview |
| `/insights` | Coverage, quality, pipeline, and historical-distribution analysis |
| `/reviews` | Review inbox |
| `/graph` | Graph explorer |
| `/login` | Password login |

## Overview

The overview checks these tables without downloading their contents:

- Public map: `locations`
- Source and extraction staging: `kg_sources`, `kg_pages`, `kg_mentions`, `kg_locations`, `kg_people`, `kg_events`, `kg_facts`, `kg_staged_relations`
- Canonical graph: `kg_entities`, `kg_entity_aliases`, `kg_claims`, `kg_edges`, `kg_evidence`

Health has three states:

- `healthy`: every expected table responded.
- `degraded`: the database responded, but one or more expected tables did not. This usually means migrations are behind the code or permissions are incomplete.
- `unavailable`: none of the expected tables responded. Check the URL, key, and database process.

Source coverage is capped at 50 sources. It reports total registered pages, pages with `status = extracted`, and approved claims connected through evidence. A dash means that a particular count could not be calculated; it does not mean zero.

## Insights

Insights is the read-only curator dashboard. It answers questions that the graph itself cannot answer efficiently:

- How large are staging and canonical storage layers?
- Which sources have been extracted, failed, or only partially covered?
- How many entities, aliases, claims, and edges are waiting for review?
- Which staging entities and relation endpoints remain unresolved?
- How many canonical or staging records are missing evidence?
- Which entity kinds, predicates, historical eras, and decades dominate the corpus?
- How much canonical content is private versus public?

Every metric carries an availability flag. Failed queries display as unavailable rather than silently becoming zero. Large grouping scans are bounded and visibly marked when truncated. Quality alerts link to the Graph Explorer only when that screen can honestly help investigate them; failed extraction pages do not pretend to have a review screen yet.

Source rows include pages, extracted and failed pages, mentions, staging entities, facts, and relations. The source list is capped at 50. Insights never returns page text, evidence excerpts, mention payloads, or model payloads.

## Review inbox

The inbox reads up to 50 questions by default and never loads raw page text, raw excerpts, extraction payloads, or model payloads into the browser. It currently shows structured context such as names, entity type, language, years, importance, source ID, and proposed match scores. Source-title and page-level citation chips are a planned API extension; until those exist, claim approval should be conservative.

Questions come from these states:

| Review kind | Source table and state | Approve | Reject |
|---|---|---|---|
| `entity` | `kg_entities.review_status = needs_review` | Sets `review_status = approved` | Sets `review_status = rejected` and keeps it private |
| `alias` | `kg_entity_aliases.review_status = needs_review` | Approves the alias | Rejects the alias |
| `claim` | `kg_claims.review_status = needs_review` | Approves the claim but preserves its current publication state | Rejects the claim and keeps it private |
| `edge` | `kg_edges.review_status = needs_review` | Approves the relation but preserves its current publication state | Rejects the relation and keeps it private |
| `location_connection` | `kg_locations.resolution_status = pending` | Links the staged place to the selected public map location | Marks the staged place rejected without deleting it |

Every decision requires a second confirmation. The server accepts only explicit `approve` or `reject` values and uses the record's current status as a concurrency guard. If another process reviewed the record first, the request returns a conflict instead of silently overwriting the newer decision.

### Location connections

For a pending extracted place, the server reuses the production KG name matcher and returns at most three public-location suggestions. Suggestions can use normalized names, approved Hungarian or English aliases, landmark type, and coordinates when available.

The reviewer must select an existing map location before approving. Approval then:

1. Re-reads the staged place, source, selected public location, and existing canonical location.
2. Uses the shared `buildAutoLinkPlan` rules from the backend.
3. Upserts the canonical location entity and its deterministic aliases.
4. Sets the staged location's `public_location_id` and marks it `resolved`.

Newly connected canonical entities stay `private`. If the selected canonical entity was already public, approval preserves that existing state but does not publish anything new. Facts, people, events, evidence, and relations are not promoted as a side effect of connecting a place.

The identity plan uses stable IDs, so retrying after a partial network failure is designed to update the same canonical records rather than create duplicates. If the UI reports a conflict after a failed location approval, refresh the inbox and verify both the staged location and canonical entity before retrying.

## Graph explorer

The explorer can switch between **Canonical (promoted)** and **Private staging (extracted)** data. These are different database layers, not two visual styles for the same rows. The selected source is stored locally and can also be linked explicitly with `/graph?source=canonical` or `/graph?source=staging`.

It provides three displays:

- **Network** groups connected components, reduces collisions, draws directed relations, and highlights the selected entity's immediate neighborhood. Its layout is stable when a node is selected. An ego-network overlay adds that node's bounded detail connections even when its neighbors fell outside the initial graph sample. It supports buttons and mouse-wheel zoom, pointer panning, and reset.
- **Relations** ranks predicates and shows a directed subject → predicate → object ledger.
- **Ledger** lists the current entities and supports sorting by name, kind, review status, or visible degree.

All three displays share entity-name, entity-kind, review-status, predicate, and source filters. Status choices follow the selected layer: canonical uses `draft`, `needs_review`, `approved`, and `rejected`; staging uses `pending`, `resolved`, `rejected`, and `quarantined`.

The API remains bounded. Canonical reads start with at most 300 entities and hydrate the other endpoints of sampled edges so valid connections do not disappear at the page boundary. Staging reads up to 2,000 high-importance relation candidates, keeps only relations whose two endpoints have typed foreign keys, and loads the referenced people, locations, events, and organisations. The browser draws at most 120 filtered nodes at once and asks the curator to narrow filters when more match.

This explains why the staging graph can show far fewer lines than the relation count on Overview or Insights. A staged relation is drawable only when both its subject and object have been resolved to rows such as `subject_person_id` and `object_location_id`. Relations that still contain only extracted text are real staging work, but they do not yet have safe node IDs to draw. Creating placeholders can make more endpoints explicit; resolving and promoting them is what turns those provisional connections into canonical graph edges.

Selecting a node does not promote it. The graph inspector is read-only. Review decisions happen in `/reviews`, while bulk resolution and promotion still use the preview-first backend commands.

Selecting an entity opens a safe inspector with identity status, translated/source names, aliases, claims or facts, direct connections, and citation metadata. Canonical citations contain public citation text and source/page references; staging citations are reconstructed from mention-to-page links. Raw excerpts, page text, and extraction payloads are never returned. The inspector and ledger controls are keyboard operable.

## API

All admin APIs require a valid admin session cookie. Responses use `Cache-Control: no-store`.

### `GET /api/admin/overview`

Returns health, per-table counts, pending-review totals, source coverage, pipeline totals, and unavailable-table details. It makes no database changes.

### `GET /api/admin/insights`

Returns safe bounded aggregates for totals, entity kinds, page statuses, review and publication states, canonical/staging predicates, claim eras and decades, source coverage, and quality diagnostics. Each value uses `{ "value": ..., "available": true|false, "truncated"?: true, "note"?: string }` so the UI can distinguish zero from unknown.

### `GET /api/admin/entity`

Required parameters are `id`, `source=canonical|staging`, and—when staging—`kind=location|person|event|organisation`. It returns a bounded safe detail projection containing identity, aliases, claims/facts, named neighbors, and citation metadata. Invalid IDs or source/kind combinations return `400`; missing entities return `404`.

### `GET /api/admin/graph`

Optional query parameters:

| Parameter | Meaning |
|---|---|
| `source` | `canonical` by default, or `staging` for the private extracted graph. |
| `limit` | Canonical default `100`, maximum `300`; staging relation default `800`, maximum `2,000`. |
| `kind` | Entity kind: `location`, `person`, `event`, or `organisation`. |
| `reviewStatus` | Canonical-only API filter for entity, edge, and claim review status. |
| `publicationStatus` | Canonical-only API filter by `private` or `public`. |

Example:

```text
/api/admin/graph?kind=location&reviewStatus=approved&publicationStatus=private&limit=100
```

### `GET /api/admin/reviews`

Optional query parameters:

- `limit`: default `50`, maximum `100`.
- `kind`: `entity`, `alias`, `claim`, `edge`, or `location_connection`.

The response is `{ "items": [...], "count": number }`.

### `POST /api/admin/reviews/decision`

Canonical decision:

```json
{
  "kind": "claim",
  "id": "11111111-1111-4111-8111-111111111111",
  "decision": "approve"
}
```

Location approval:

```json
{
  "kind": "location_connection",
  "id": "11111111-1111-4111-8111-111111111111",
  "decision": "approve",
  "publicLocationId": "22222222-2222-4222-8222-222222222222"
}
```

`publicLocationId` is required only when approving a location connection. Decision requests must come from the same origin as the admin site. Common responses are `400` for invalid input, `401` for no session, `403` for a cross-origin request, `404` for a missing record, `409` for an already-reviewed/concurrent record, and `422` when the requested database change cannot be applied safely.

## Authentication and security

Login compares the submitted password using a timing-safe HMAC digest. Successful login creates a signed `tob_admin_session` cookie with these properties:

- 12-hour maximum lifetime
- `httpOnly`
- `SameSite=Strict`
- `Secure` in production
- available only on this site's path

Middleware protects all pages and APIs except `/login` and `/api/auth/login`. API requests without a valid session receive JSON `401`; page requests redirect to login. Login has a lightweight in-process throttle of eight failed attempts per client address in 15 minutes.

The application also sends no-index, no-frame, MIME-sniffing, referrer, and browser-permission security headers. Supabase access is created only in server modules with session persistence and token refresh disabled.

For any internet-accessible deployment, use HTTPS and put the site behind a VPN or identity-aware access proxy. Add platform-level rate limiting and centralized logs. The application password is appropriate for private/local operation, but it should not be the only perimeter protecting a remotely reachable service-role application.

## Development and verification

Run from the repository root:

```bash
npm run test:admin
npm run typecheck:admin
npm run build:admin
```

The unit tests cover decision validation, request limits, and safe mapping of database rows into question-shaped responses. A production build verifies all pages and route handlers. Tests must never call the live decision endpoint or approve real records.

Important implementation locations:

| Area | Path |
|---|---|
| Pages | `talesofbudapest-admin/src/app/(dashboard)/` |
| UI components | `talesofbudapest-admin/src/components/admin/` |
| Admin APIs | `talesofbudapest-admin/src/app/api/admin/` |
| Database queries | `talesofbudapest-admin/src/lib/db/` |
| Review rules | `talesofbudapest-admin/src/lib/reviews/` |
| Authentication | `talesofbudapest-admin/src/lib/session.ts`, `password.ts`, and `middleware.ts` |
| Shared matching/promotion rules | `talesofbudapest-backend/lib/kgLocationResolver.js` and `kgPromotion.js` |

## Troubleshooting

### The site redirects to `/login`

The session is absent, expired, or was signed with a different `ADMIN_SESSION_SECRET`. Log in again. Changing the secret intentionally invalidates all existing sessions.

### Login says it is unavailable

Confirm that `ADMIN_PASSWORD` exists and that `ADMIN_SESSION_SECRET` contains at least 32 characters. Restart the development server after changing `.env.local`.

### Overview says `unavailable`

Check that the selected Supabase instance is running and reachable, then verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. For local Docker, the usual URL is `http://127.0.0.1:8000`.

### Overview says `degraded`

Look at the unavailable-table count. The most common cause is that migrations `014` through `018` have not all been applied to the selected database. See [Database](database.md) and [Scripts](scripts.md).

### The inbox is empty unexpectedly

The queue includes only the exact pending states described above. Confirm that data has been loaded into the selected database and inspect the overview counts. Also verify that the admin site and the loader point at the same Supabase instance.

### A location has no suggested match

The extracted name may not correspond to an existing public map landmark, or the map location may lack useful aliases/coordinates. Add or improve the public location through the normal data workflow, run alias expansion/embedding if appropriate, then refresh the inbox. The current admin site deliberately does not create a brand-new public map location during approval.

## Current limitations and next improvements

- Review questions do not yet show safe source-title/page citation chips. Add these before treating the inbox as a complete factual-review interface.
- Overview's expected-table counts and `stagedRecords` total do not yet include `kg_organisations`; the Graph Explorer and entity inspector do support organisations.
- There is no dedicated review-audit table; canonical entities, claims, and edges record `reviewed_at` and `reviewed_by`, while aliases and staged rejection states retain only their status.
- Location approval consists of several idempotent writes rather than one database transaction.
- The graph is a bounded operational projection, not a geographic map. It does not yet provide coordinate plotting, arbitrary server-side pagination, merge/split operations, or unrestricted multi-hop expansion.
- Unresolved text-only relation endpoints cannot be drawn. The most valuable graph improvement is an endpoint-resolution workspace that shows the source evidence, candidate identities, confidence signals, and an approve/create-placeholder/reject decision.
- The Insights quality checks identify failed pages and missing evidence, but there is not yet a dedicated failed-page/evidence-repair workspace.
- The console targets one configured Supabase instance at a time and does not compare local versus cloud data.
- Publication remains intentionally outside this console.

After endpoint resolution, the next highest-value improvements are: safe source/page chips in every review question; a durable review-audit log; merge and split workflows; a failed-page/evidence repair queue; and a deliberate publication screen that previews exactly what would become public before requiring a second approval.

These constraints preserve the first version's main safety promise: the console helps a person understand and connect the knowledge graph, but it does not silently publish extracted history.
