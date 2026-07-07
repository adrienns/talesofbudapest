# Tales of Budapest — Frontend

Next.js (App Router) + TypeScript + Tailwind CSS mobile-first map app.

## Structure

```
src/
├── app/                         # Next.js routes only
├── features/
│   └── landmarks/hooks/         # feature hooks
├── stores/                      # Zustand global state
├── components/
│   ├── map/                     # web-only (Leaflet)
│   └── ui/                      # dumb UI (AudioDrawer, PlayerControls)
├── services/                    # Supabase, mappers, repositories
├── adapters/audio/              # web audio adapter
├── styles/                        # design system
│   ├── tokens.css               # CSS custom properties
│   ├── theme.css                # Tailwind v4 @theme mapping
│   └── typography.css           # headline, body, label scale
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
cp frontend/.env.local.example frontend/.env.local
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

## Data source

- **Production/dev with Supabase**: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Offline dev**: set `NEXT_PUBLIC_USE_MOCKS=true`
