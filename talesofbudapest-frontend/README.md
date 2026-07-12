# Tales of Budapest — Frontend

Next.js (App Router) + TypeScript + Tailwind CSS mobile-first map app.

## Structure

```
src/
├── app/                         # Next.js routes only
├── features/
│   ├── landmarks/hooks/         # map, audio, chronicle hooks
│   └── narrative/hooks/         # tour planning & generation hooks
├── stores/                      # Zustand global state
├── components/
│   ├── map/                     # web-only (Leaflet)
│   └── ui/                      # dumb UI (AudioDrawer, PlayerControls)
├── services/                    # Supabase, mappers, repositories
├── adapters/audio/              # web audio adapter
├── styles/                        # design system
│   ├── tokens.css               # CSS custom properties
│   ├── theme.css                # Tailwind v4 @theme mapping
│   ├── typography.css           # headline, body, label scale
│   ├── map-markers.css          # Leaflet pin styles
│   ├── glass.css                # glassmorphism surfaces
│   ├── bottom-nav.css           # floating nav capsule
│   ├── audio-player.css         # scrubbers, CTA glow
│   ├── ai-orb.css               # AI orb animations
│   └── narrative.css            # questionnaire, marquee, overlays
├── constants/
│   ├── designTokens.ts          # TS mirror of color/typography tokens
│   └── map.ts                   # map center, zoom, tile URLs
├── types/                       # domain, props, store interfaces
├── utils/                       # pure helpers (formatTime)
└── data/                        # mock landmarks (dev fallback)
```

## Design system

Vintage-modern palette with Source Serif 4 typography. See [`constants/designTokens.ts`](src/constants/designTokens.ts) and [`styles/tokens.css`](src/styles/tokens.css).

Use semantic Tailwind classes in components: `bg-surface`, `text-on-surface`, `text-accent`, `text-headline`, `text-label`.

## Coding standards

Follow [.github/skills/react-best-practices/SKILL.md](../.github/skills/react-best-practices/SKILL.md) for component patterns, design system usage, and React Native migration readiness.

## Run

From the monorepo root:

```bash
cp talesofbudapest-frontend/.env.local.example talesofbudapest-frontend/.env.local
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

## Data source

- **Production/dev with Supabase**: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
