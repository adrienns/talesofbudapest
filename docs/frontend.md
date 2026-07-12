# Frontend

Next.js 15 App Router application with TypeScript, Tailwind CSS, Leaflet map, and Zustand state.

**Path:** `talesofbudapest-frontend/`

## Tech stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + custom design tokens (`src/styles/`)
- Leaflet + clustering for map pins
- Zustand for client state
- next-intl for `en` / `hu` i18n
- Supabase JS client (read) + server admin client (API routes)

## Routes

Locales: `en`, `hu` — configured in `src/i18n/routing.ts`, enforced by `src/middleware.ts`.

| URL | Page | File |
|-----|------|------|
| `/[locale]` | Map home | `src/app/[locale]/page.tsx` → `HomePage.tsx` |
| `/[locale]/archives` | Saved tours | `src/app/[locale]/archives/ArchivesPage.tsx` |
| `/[locale]/settings` | Tour style, locale, map options | `src/app/[locale]/settings/SettingsPage.tsx` |

Bottom navigation tabs: `map`, `narrative`, `archives`, `settings` (`src/constants/navigation.ts`).

## API routes

| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/api/landmarks/map` | `app/api/landmarks/map/route.ts` | Bbox-filtered map pins with translations |
| POST | `/api/landmarks/[id]/audio` | `app/api/landmarks/[id]/audio/route.ts` | Generate or return cached landmark audio |
| GET | `/api/narratives` | `app/api/narratives/route.ts` | List saved narratives |
| GET | `/api/narratives/[id]` | `app/api/narratives/[id]/route.ts` | Single narrative with chapters |
| POST | `/api/narratives/plan` | `app/api/narratives/plan/route.ts` | Plan draft walking tour |
| POST | `/api/narratives/plan/replace` | `app/api/narratives/plan/replace/route.ts` | Replace one stop in draft |
| POST | `/api/narratives/generate` | `app/api/narratives/generate/route.ts` | Synthesize full tour audio |
| POST | `/api/narratives/suggestions` | `app/api/narratives/suggestions/route.ts` | Contextual tour prompt ideas |

API routes delegate to backend libs (`@backend/lib/...`) for LLM and TTS.

## Key components

### Map (`src/components/map/`)

| Component | Role |
|-----------|------|
| `MapView` | Main Leaflet map container |
| `LandmarkMarker` | Individual pin |
| `LandmarkClusterLayer` | Clustered pins at low zoom |
| `MapViewportTracker` | Tracks bbox for on-demand fetch |
| `MapZoomHint` | Explains tier filtering at zoom levels |
| `ChapterMarker` | Narrative tour stop markers |
| `RoutePreviewMap` | Draft route preview |

### Narrative (`src/components/narrative/`)

| Component | Role |
|-----------|------|
| `NarrativeQuestionnaire` | Time, style, topic picker |
| `NarrativeRoutePreview` | Review planned stops |
| `NarrativeGeneratingOverlay` | Loading state during synthesis |
| `ResumeTourBanner` | Resume in-progress tour |

### Player (`src/components/ui/player/`)

| Component | Role |
|-----------|------|
| `FullScreenPlayer` | Full-screen audio UI |
| `PlayerScrubber` | Progress bar |
| `PlayerTransport` | Play/pause/skip controls |
| `Marquee` | Scrolling title |

### Shell (`src/components/ui/`)

`AudioDrawer`, `BottomNav`, `PromptBar`, `MiniPlayerControls`, `LandmarkImageGallery`, `SearchBar`

## Zustand stores (`src/stores/`)

| Store | Purpose |
|-------|---------|
| `useLandmarksStore` | Full landmark list (legacy) |
| `useLandmarksCacheStore` | On-demand detail cache |
| `useLandmarkSelectionStore` | Selected map pin |
| `useAudioPlayerStore` | Playback state |
| `useNarrativeStore` | Tour flow state machine |
| `useTourPreferencesStore` | Persisted style/topic (localStorage) |
| `useMapSettingsStore` | Show all buildings, zoom hint dismissed |
| `useLocaleStore` | Locale preference |

## Feature hooks (`src/features/<domain>/hooks/`)

Domain hooks live next to their feature — not in a top-level `src/hooks/` folder.

**Landmarks:** `useAudioPlayer`, `usePlaybackAudio`, `useMapPins`, `useVisibleLandmarks`, `useResolveLandmark`, `useLocationChronicle`

**Narrative:** `useNarrativeContext`, `usePlanNarrative`, `useConfirmNarrative`, `useGenerateNarrative`, `useReplaceStop`, `useNarratives`

## Services (`src/services/`)

| File | Role |
|------|------|
| `mapLandmarksService.ts` | Fetch bbox pins from API |
| `landmarkAudioService.ts` | Request landmark audio generation |
| `repositories/landmarksRepository.ts` | Supabase landmark queries |
| `mappers/locationMapper.ts` | DB row → `MapPin` / `Landmark` |
| `supabase.ts` | Browser Supabase client |

## Server libs (`src/lib/server/`)

| File | Role |
|------|------|
| `supabaseAdmin.ts` | Service-role Supabase for API writes |
| `mapLandmarksQuery.ts` | Bbox parsing, importance tier filtering |
| `narrativePool.ts` | Landmark pool for LLM route planning |
| `loadBackendEnv.ts` | Load sibling backend `.env` |
| `audioEnv.ts` | Assert OpenRouter key present |

## Types (`src/types/`)

| File | Key types |
|------|-----------|
| `landmark.ts` | `MapPin`, `Landmark`, `LandmarkSource`, `ImportanceTier` |
| `narrative.ts` | `NarrativeRoute`, `DraftNarrative`, `NarrativeFlowState` |
| `location.ts` | `LocationRow` (Supabase shape) |
| `audio.ts` | Player adapter interfaces |
| `locale.ts` | `AppLocale` (`en` \| `hu`) |

## Map tier filtering

At low zoom, only high-priority sources (`wikipedia`, `iconic`) and `featured` tier pins show. At higher zoom, `standard` budapest100 houses appear. Logic in `src/lib/map/mapTierFilter.ts` and `src/lib/server/mapLandmarksQuery.ts`.

## Development

```bash
npm run dev:frontend    # from repo root
# or
cd talesofbudapest-frontend && npm run dev
```

Env is loaded from `../talesofbudapest-backend/.env` automatically (`next.config.ts`).

## Related

- [Backend](backend.md) — audio pipeline called from API routes
- [Database](database.md) — tables the frontend reads
- [Environment](environment.md) — required env vars
