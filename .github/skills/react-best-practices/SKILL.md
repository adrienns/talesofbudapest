---
name: react-best-practices
description: "Use for React and Next.js frontend code. Enforces component patterns, hook conventions, and React Native migration readiness."
user-invocable: true
---

# React Best Practices & React Native Readiness

## When to Use
- Writing or updating React/Next.js components, hooks, or frontend services code
- Reviewing frontend architecture in `talesofbudapest-frontend/`
- Ensuring code stays portable for a future React Native app

## React Best Practices

### Component architecture
- **Smart vs dumb**: hooks and page containers own state and data fetching; UI components receive props only
- Colocate feature logic under `src/features/<feature>/hooks/`
- Async data hooks expose `{ data, isLoading, error }` — never fetch inside presentational components
- Use arrow functions for all components and handlers
- Avoid comments unless explaining non-obvious business logic

### File layout
```
src/
├── app/              # Next.js routes only
├── features/         # feature hooks (smart layer)
├── stores/           # Zustand global state
├── components/       # dumb UI components
├── services/         # pure TS — Supabase, mappers, repositories
├── adapters/         # platform-specific code (web audio, etc.)
├── styles/           # design system CSS (tokens, theme, typography)
├── constants/        # design tokens, map config, mock data
├── types/            # shared TypeScript types (domain, props, stores)
├── utils/            # pure helper functions (formatTime, env)
└── data/             # mock/fixture data for dev only
```

### Types, constants, and utilities
- **`types/`** — domain models (`Landmark`), DB rows (`LocationRow`), component props, store interfaces; re-export from `types/index.ts`
- **`constants/`** — design tokens (`designTokens.ts`), map config, env flags; no React imports
- **`utils/`** — pure functions used across features; no side effects, no React
- Never inline prop types or magic strings in components when they belong in `types/` or `constants/`

### Design system
- **CSS tokens** live in `src/styles/tokens.css` (`--color-surface`, etc.)
- **Tailwind utilities** are mapped in `src/styles/theme.css` via `@theme` (Tailwind v4)
- **Typography scale** in `src/styles/typography.css` (headline, body, label)
- **TypeScript mirror** in `src/constants/designTokens.ts` for Leaflet pins and non-CSS contexts
- **Components** use semantic classes (`bg-surface`, `text-on-surface`, `text-accent`) — never raw hex in JSX
- **New tokens**: add to `tokens.css` first, mirror in `designTokens.ts`, expose via `@theme`

| Token | Usage |
|-------|-------|
| `primary` | Brand base `#2d1b14` |
| `accent` | Warm orange — active markers, CTAs |
| `surface` | Archival paper background |
| `surface-dim` | Borders, secondary panels |
| `on-surface` | Body/headline text |
| `outline-variant` | Separators, inactive markers |

### Icons
- **Always use [`lucide-react`](https://lucide.dev)** for UI icons — never inline `<svg>` in components
- Import named icons only: `import { Search, X } from 'lucide-react'`
- Size and color via Tailwind on the icon: `className="h-5 w-5 text-accent"`
- Decorative icons: `aria-hidden="true"`; icon-only buttons: `aria-label` on the button, not the icon
- RN migration: swap to `lucide-react-native` — same icon names, same import pattern

### Data fetching
- Supabase reads go through `src/services/repositories/`
- DB rows are mapped to app types in `src/services/mappers/` (e.g. `latitude`/`longitude` → `lat`/`lng`)

## React Native Migration Readiness

### Keep platform-specific code isolated
| Concern | Web location | RN replacement |
|---------|-------------|----------------|
| Map | `components/map/` (Leaflet) | `react-native-maps` |
| Audio | `adapters/audio/webAudioPlayer.ts` | `expo-av` adapter |
| Styling | Tailwind + `styles/` | NativeWind or StyleSheet |
| Design tokens | `constants/designTokens.ts` | copy as-is into RN app |
| Data | `src/services/` | copy as-is into RN app |

### Rules for portable code
- **No DOM APIs in hooks or services/** — `document`, `window`, `HTMLAudioElement` belong in `src/adapters/` only
- **No Leaflet imports outside `components/map/`**
- **Pure TypeScript in `src/services/`, `src/types/`, `src/constants/`, `src/utils/`** — zero React imports
- **Platform-agnostic props** — use `lat`/`lng`, not web-specific coordinate types
- **Styling isolation** — business logic must not depend on CSS class names
- **Supabase client** — env-var + `createClient` pattern works identically in RN with `@supabase/supabase-js`

### Adapter pattern
Define typed interfaces in `src/types/audio.ts`. Hooks consume the interface; swap the implementation per platform.

## Practical Checklist
1. Is this component dumb (props only) or smart (hook/container)?
2. Does new logic belong in `services/`, `features/`, `stores/`, or `adapters/`?
3. Are types, constants, and utilities extracted to their folders?
4. Are design tokens used instead of hardcoded colors?
5. Are icons from `lucide-react` (not inline SVG)?
6. Would this code run unchanged in React Native? If not, move web-specific parts to `adapters/` or `components/map/`.
7. Are DB field names mapped at the repository/mapper boundary?
