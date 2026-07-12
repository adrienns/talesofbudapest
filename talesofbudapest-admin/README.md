# Tales of Budapest Admin

Private review console for the Tales of Budapest research and knowledge-graph pipeline. It is a separate Next.js app and defaults to <http://localhost:3100>.

The console provides a database overview, a coverage/quality Insights workspace, question-shaped human review, and a multi-view knowledge-graph workbench. Approval does not publish private records. Full architecture, API, security, decision behavior, and troubleshooting documentation is in [`docs/ADMIN_SITE.md`](../docs/ADMIN_SITE.md).

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set a strong `ADMIN_PASSWORD` and a random `ADMIN_SESSION_SECRET` of at least 32 characters.
3. Add the server-side Supabase URL and service-role key when database views are enabled.
4. Run `npm run dev:admin` from the repository root, or `npm run dev` from this directory.

From the repository root, `npm run typecheck:admin`, `npm run test:admin`, and `npm run build:admin` verify the console.

All routes and API endpoints are authentication-protected except `/login` and `/api/auth/login`. Successful login creates a signed, expiring, `httpOnly`, `SameSite=Strict` cookie. Privileged Supabase values use server-only environment names; never expose a service-role key through a `NEXT_PUBLIC_` variable or client component.

The lightweight in-process login throttle is intended as defense in depth. A public deployment should also apply rate limits at its proxy or hosting platform.
