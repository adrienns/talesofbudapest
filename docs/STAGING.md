# Staging beta: Cloudflare + Supabase

This guide creates an HTTPS, shareable test build for the ready-made Tales of
Budapest tours. It does not use Oracle, R2, an AI provider, or a production
domain. The resulting `workers.dev` address works with browser GPS after the
visitor grants permission.

The staging Worker intentionally exposes only fixed curated tours. It blocks
AI tour generation, guide chat, on-demand landmark audio, walking-route API
calls, and background generation jobs. It also sends `X-Robots-Tag: noindex,
nofollow` so the test site is not indexed.

## 1. Create an isolated Supabase project

1. Create a new project in [Supabase](https://supabase.com/dashboard). Pick a
   nearby European region and save its database password in a password manager.
2. In **Project Settings → API**, copy the **Project URL** and the
   server-side **service_role** key. Never put the service-role key in a
   `NEXT_PUBLIC_` variable or in a committed file.
3. Click **Connect**, copy the **Session pooler** URI (port `5432`), and
   replace its password placeholder.

Keep these three values available only in your terminal or password manager:

```text
STAGING_SUPABASE_URL
STAGING_SUPABASE_SERVICE_ROLE_KEY
STAGING_DATABASE_URL
```

## 2. Initialise the staging database and curated data

Run the following from the repository root. The first command changes only the
new hosted Supabase project; it never changes your local Docker database.

```bash
npm run db:migrate:staging

npm run seed:staging:canonical

npm run seed:staging:curated -- --skip-audio --slug how-budapest-became-budapest
```

Repeat the last command for each additional fixed tour you want in the beta.
`--skip-audio` is deliberate: it prevents a new paid TTS request.

Copy the already-approved audio files from the local/source Supabase instance
to the new staging project. The script reads source credentials from the local
`talesofbudapest-backend/.env` (or `SOURCE_SUPABASE_*`), and uses the target
credentials supplied for this command:

```bash
npm run copy:staging:curated-audio -- --slug how-budapest-became-budapest
```

The command reports every copied and skipped chapter. Do not deploy a tour that
reports a skipped chapter: create/copy its approved source audio first.

## 3. Create the free Cloudflare Worker

1. Sign in to [Cloudflare](https://dash.cloudflare.com/). A free account is
   enough for this beta.
2. In the repository, authenticate Wrangler once:

   ```bash
   npm exec wrangler login
   ```

3. Create the Worker by deploying from the frontend workspace:

   ```bash
   npm run cf:deploy --workspace=talesofbudapest-frontend
   ```

   Cloudflare will create a URL resembling
   `https://tales-of-budapest-staging.<your-subdomain>.workers.dev`.

The deployment command builds with the staging-only flag and does not import
the developer's local `.env` credentials.

## 4. Add runtime variables in Cloudflare

Open **Workers & Pages → tales-of-budapest-staging → Settings → Variables and
Secrets**. Add the following for the **Production** environment, then redeploy:

| Name | Type | Value |
|---|---|---|
| `SUPABASE_URL` | Plaintext variable | Your staging Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Your staging service-role key |

`NODE_ENV=production` and `TALES_CURATED_ONLY=true` are configured in
`talesofbudapest-frontend/wrangler.jsonc`; do not add OpenRouter, Gemini, or
other AI keys to this beta.

Run the deployment command again after setting the values:

```bash
npm run cf:deploy --workspace=talesofbudapest-frontend
```

## 5. Test on actual phones

1. Open the `https://…workers.dev` link in Chrome on Android or Safari on
   iPhone. Do not test GPS from an in-app social-media browser.
2. When prompted, allow **Precise Location**. On iPhone, Safari must remain in
   the foreground while the tour watches for arrivals.
3. Start every fixed tour, play every chapter, and use **Prepare offline**
   while on Wi-Fi.
4. Switch on Airplane Mode and confirm downloaded audio keeps playing and the
   tour still shows its saved progress.
5. Walk to a stop (or use a temporary location simulation) and confirm the
   manual “I’m here” fallback works when GPS is weak.

For this unlisted beta, share the exact URL only with testers you trust. Anyone
who receives it can open it; that is why it contains only approved public
tour data and no administration functions.

## Before a public launch

Move to a domain you control, add Cloudflare Access or application
authentication where appropriate, set a Supabase backup/retention plan, and
run a privacy/cookie review. Oracle is useful later for self-hosted Supabase or
long-running AI jobs, but it is not required for this staging setup.
