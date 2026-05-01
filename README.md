# Content Resourcer (Gmail-only v1)

Monorepo: **Next.js** UI on Vercel, **Node worker** on Render (Gmail + optional OpenAI), **MongoDB Atlas** for configuration and signals.

## Structure

- `apps/web` — internal UI (verticals, Gmail signals, feed)
- `apps/worker` — health, Gmail OAuth, cron ingest, pipeline
- `packages/db` — Zod schemas, Mongo helpers, indexes

This repo uses **npm workspaces** so hosted builds (`npm install` at the repo root) resolve `@content-resourcer/db` correctly. You do not need to run installs locally to deploy.

## Vercel (Next.js)

### Required: Root Directory

In the Vercel project, set **Settings → General → Root Directory** to **`apps/web`** and redeploy.

If Root Directory stays at the **repository root** (`.`), the default `npm run build` compiles Next into **`apps/web/.next`**, but Vercel’s Next integration looks for **`.next` next to the project root** (e.g. `/vercel/path0/.next`). That mismatch produces:

`The Next.js output directory ".next" was not found at "/vercel/path0/.next"`.

With **Root Directory = `apps/web`**:

- The app root is where `next.config.ts` and `.next` are written.
- [`apps/web/vercel.json`](apps/web/vercel.json) applies: install from the monorepo root (`cd ../.. && npm install`), then build only **`@content-resourcer/db`** and **`@content-resourcer/web`** (not the Render worker).

Leave **Install Command** and **Build Command** empty in the dashboard unless you know you need overrides.

### Optional: monorepo root as Vercel root

Only if you cannot set Root Directory to `apps/web`: in the dashboard set **Build Command** to `npm run vercel-build` (web + db only) and **Output Directory** to `apps/web/.next`. Next.js on Vercel may still expect a subdirectory root; prefer **`apps/web`** as Root Directory when possible.

Environment variables for the web app are listed below.

### Two different Google OAuth clients (do not mix)

| Where | Purpose | Google Console redirect URI pattern |
|-------|---------|-------------------------------------|
| **Vercel (Next.js)** | Staff sign-in to the Content Resourcer UI ([Auth.js](https://authjs.dev)) | `https://<your-vercel-host>/api/auth/callback/google` |
| **Render (worker)** | Gmail API token for ingestion only | `https://<your-render-host>/oauth/google/callback` |

Use **separate** OAuth clients in Google Cloud (or the same client only if you add **both** redirect URIs to that client—usually clearer to keep two clients).

### Auth.js on Vercel (staff login)

Set on **Vercel** for `apps/web`:

| Variable | Description |
|----------|-------------|
| `AUTH_GOOGLE_ID` | Google OAuth Web client **Client ID** (Vercel app) |
| `AUTH_GOOGLE_SECRET` | Google OAuth **Client secret** |
| `AUTH_SECRET` | Random long string used to sign sessions (required in production) |
| `AUTH_URL` | Site origin, e.g. `https://contentintelligence-mu.vercel.app` (no trailing slash) |
| `AUTH_TRUST_HOST` | Set `true` on Vercel so callback URLs resolve correctly |

Google Cloud → **Authorized JavaScript origins:** your Vercel origin.  
**Authorized redirect URIs:** `https://<vercel-host>/api/auth/callback/google`.

First user **`ryanschumacher@themediashop.co`** receives **`admin`** on first Google sign-in; others default to **`member`** until promoted in **Admin → Users**.

## Prerequisites (optional local use)

- Node 20+
- MongoDB Atlas cluster

## Environment variables

**Vercel (`apps/web`)**

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB_NAME` | Optional database name (default `content_resourcer`) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID (Auth.js / staff login) |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_SECRET` | Session signing secret |
| `AUTH_URL` | Public site URL (see Auth.js section above) |
| `AUTH_TRUST_HOST` | `true` on Vercel |

**Render (`apps/worker`)**

If you create the web service manually (not from [`render.yaml`](render.yaml)), set **Build Command** to `npm install && npm run build:worker` and **Start Command** to `npm start` (or `yarn start`; the repo root defines `start`). Set **`NODE_VERSION`** to `20` in the service environment so Render does not pick a newer Node from defaults.

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Same as above |
| `GMAIL_CLIENT_ID` | OAuth client ID (**Gmail worker**; not `AUTH_GOOGLE_*`) |
| `GMAIL_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_REDIRECT_URI` | Must match Google console (Render service URL + `/oauth/google/callback`) |
| `OPENAI_API_KEY` | Optional; summaries skipped if unset |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `INGEST_CRON` | Cron expression (default `*/15 * * * *`) |
| `INGEST_SECRET` | Optional; required header `x-ingest-secret` for `POST /ingest` |
| `PORT` | Default `8787` |

## Local development (optional)

```bash
npm install
npm run dev
```

Use `npm run dev:worker` in another terminal for the ingest service.

1. Point `GMAIL_REDIRECT_URI` to `http://localhost:8787/oauth/google/callback` for local OAuth.
2. Open `http://localhost:8787/oauth/google/start` to connect Gmail; tokens are stored in Mongo.
3. Create verticals and signals in the web UI (`http://localhost:3000`).
4. Trigger ingest: wait for cron or `POST http://localhost:8787/ingest` with optional `x-ingest-secret`.

## Seed example vertical

```bash
set SEED_GMAIL_ADDRESS=you@gmail.com
npm run seed
```

Creates the **Gambling** vertical and a sample Gmail signal (labels: `Casinos`). Adjust `SEED_GMAIL_ADDRESS` to your inbox.

## Production builds

```bash
npm install
npm run build
```

## OAuth notes

- **Vercel (Auth.js):** Web client redirect must be `…/api/auth/callback/google` on your Vercel domain.
- **Render (Gmail):** Redirect must exactly match `GMAIL_REDIRECT_URI` (worker `/oauth/google/callback`). The first successful consent should request offline access so a **refresh token** is returned for ingestion.
