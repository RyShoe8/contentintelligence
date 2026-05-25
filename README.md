# Content Resourcer (Gmail-only v1)

Monorepo: **Next.js** UI on Vercel, **Node worker** on Render (Gmail + optional OpenAI), **MongoDB Atlas** for configuration and signals.

## Structure

- `apps/web` — internal UI (content signals, sources, feed)
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

### Google OAuth: staff login vs Gmail ingestion

| Where | Purpose | Google Console redirect URI |
|-------|---------|-----------------------------|
| **Vercel (Next.js)** | Staff sign-in ([Auth.js](https://authjs.dev)) | `https://<your-vercel-host>/api/auth/callback/google` |
| **Vercel (Next.js)** | **In-app Gmail connect** (read-only mail for ingestion) | `https://<your-vercel-host>/api/gmail/oauth/callback` |
| **Render (worker)** | Legacy Gmail OAuth (optional; same Mongo tokens) | `https://<your-render-host>/oauth/google/callback` |

Use **one Gmail-capable OAuth client** with **both** Vercel Gmail redirect URIs if you use in-app connect, or separate clients—**do not** reuse `AUTH_GOOGLE_*` for Gmail API: Gmail needs its own client (or the same client ID with Gmail scopes and the correct redirect for that flow).

**Recommended:** Configure **Gmail** `GMAIL_*` on **Vercel** with redirect `…/api/gmail/oauth/callback` so users never visit the worker to connect. Keep worker `GMAIL_*` aligned with the **same** Google client if the worker still runs OAuth for debugging.

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
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID (in-app **Connect Gmail**; not `AUTH_GOOGLE_*`) |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret |
| `GMAIL_REDIRECT_URI` | Must exactly match Google console: `https://<vercel-host>/api/gmail/oauth/callback` |
| `WORKER_URL` | Render worker base URL, no trailing slash (e.g. `https://contentintelligence.onrender.com`) — enables **Sync now** in the UI and Vercel Cron scheduled ingest |
| `INGEST_SECRET` | Optional; if set on the worker, set the **same** value on Vercel so **Sync now** and cron can call worker ingest routes |
| `CRON_SECRET` | Required in production for **Feed sync schedule** automation; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to `/api/cron/ingest-due` every 15 minutes |
| `BREVO_API_KEY` | Optional; Brevo transactional API key for Team invite / member-added emails |
| `INVITE_EMAIL_FROM` | Verified sender, e.g. `Content Intelligence <noreply@yourdomain.com>` (required when `BREVO_API_KEY` is set) |

### Brevo (org invite emails)

Used when an org owner adds a member on **Team**, or when a platform admin creates an org with a pending owner invite. If `BREVO_API_KEY` is unset, invites and membership still work; the UI notes that email was skipped.

1. In [Brevo](https://www.brevo.com), verify your sending domain and add a sender address matching `INVITE_EMAIL_FROM`.
2. Create an API key with permission to send transactional email.
3. Set `BREVO_API_KEY`, `INVITE_EMAIL_FROM`, and `AUTH_URL` on Vercel, then redeploy the web app.

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
| `INGEST_CRON` | Cron expression (default `*/15 * * * *`) — global ingest of all enabled sources |
| `SIGNAL_SCHEDULE_CRON` | Per-signal schedule poll (default `* * * * *`) — ingests signals whose **Feed sync schedule** is due on the Posts page |
| `INGEST_SECRET` | Optional; required header `x-ingest-secret` for ingest and posts API routes |
| `MAX_TOKENS_SOCIAL_POST` | Max tokens for LLM social post copy (default `300`) |
| `INGEST_LOG_VERBOSE` | Optional; set to `true` or `1` for per-message `[ingest]` JSON logs (noisy; unset in steady state) |
| `PORT` | Default `8787` |

### Posts (social drafts)

The **Posts** page auto-creates social-ready copy from feed deals that meet a per-signal **min deal strength** threshold (one post per deal tier). Requires **`OPENAI_API_KEY`** on the worker for LLM copy; without it, template fallback text is used.

- Set threshold and **Feed sync schedule** per content signal on **Posts**.
- After each signal ingest (Sync now or schedule), the worker runs `POST /posts/sync` logic automatically.
- Manual **Add to Posts** on the feed calls worker `POST /posts/add`.

### Feed sync schedule (Posts page)

Per-signal schedules are stored in Mongo (`ingest_interval_minutes`). The worker also runs an in-process poll (`SIGNAL_SCHEDULE_CRON`, default every minute), but **that only runs while the Render worker process is awake**.

On **Render Free**, the web service spins down after idle; internal cron stops until something HTTP-wakes the worker. **Manual Sync/Refresh works** because it calls the worker; **automatic hourly sync does not** unless you add an external scheduler.

**Recommended:** Vercel Cron (configured in [`apps/web/vercel.json`](apps/web/vercel.json)) calls `GET /api/cron/ingest-due` every 15 minutes, which POSTs to the worker `POST /schedule/tick` and starts ingest for the oldest due feed. Set `CRON_SECRET`, `WORKER_URL`, and matching `INGEST_SECRET` on Vercel.

**Alternative:** Render **Cron Job** that curls `POST $WORKER_URL/schedule/tick` with `x-ingest-secret`, or use a paid always-on Render web instance.

## Local development (optional)

```bash
npm install
npm run dev
```

Use `npm run dev:worker` in another terminal for the ingest service.

1. For **in-app Gmail connect** locally, set `GMAIL_REDIRECT_URI` to `http://localhost:3000/api/gmail/oauth/callback` (Next dev port) and add it in Google Cloud. Alternatively use the worker: `http://localhost:8787/oauth/google/callback` with worker `GMAIL_REDIRECT_URI`.
2. Create **content signals** and **email sources** in the web UI (`http://localhost:3000/content-signals`).
3. Connect Gmail on each source editor (`Connect Gmail`); tokens are stored in Mongo.
4. Trigger ingest: **Sync now** on the **Feed** (select a content signal; requires `WORKER_URL` on `.env.local`), wait for worker cron, or `POST http://localhost:8787/ingest?content_signal_id=<uuid>` with optional `x-ingest-secret`.

On first deploy, `ensureIndexes` migrates legacy `verticals` / `input_signals` collections to `content_signals` / `sources`.

## Seed example content signal

```bash
set SEED_GMAIL_ADDRESS=you@gmail.com
npm run seed
```

Creates the **Gambling** content signal and a sample email source (labels: `Casinos`). Set `SEED_GMAIL_ADDRESS` before seeding if you want the source pre-filled with an inbox address.

## Production builds

```bash
npm install
npm run build
```

## Troubleshooting ingest

- **`invalid_grant` in Render logs:** Gmail refresh token is revoked, expired, or was issued by a different OAuth client than Render’s `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`. On the **source editor**, check OAuth alignment (Vercel vs Render client ID suffix), fix env vars if mismatched, then **Re-connect Gmail**.
- **Sync says success but feed is empty:** Check sync result counts; widen signal lookback or confirm Gmail has mail matching labels/filters in the lookback window.
- **Posts shows “Due now” but nothing syncs for hours:** The UI is correct; scheduled ingest did not run. Confirm `CRON_SECRET` and `WORKER_URL` on Vercel, redeploy the web app so [`vercel.json`](apps/web/vercel.json) crons are active, and check Render logs for `signal_schedule_start` or `ingest_request` after a cron tick. On Render Free, rely on Vercel Cron (or an external ping) to wake the worker — not in-process cron alone.
- **Deal link shows `w3.org/1999/xhtml`:** Re-sync the feed after deploy so `original_url` is recomputed. New ingests filter namespace and asset URLs; the UI also hides known junk links on old rows until re-synced.
- **Key Points missing on Feed or Posts:** Run **Sync feed** (or **Refresh posts**) after deploy so existing `signal_items` rows get `key_points` populated. The Feed detail page shows a hint until a full ingest refreshes the item.

## OAuth notes

- **Vercel (Auth.js):** Redirect must be `…/api/auth/callback/google` on your Vercel domain.
- **Vercel (Gmail in app):** Redirect must be `…/api/gmail/oauth/callback` and match `GMAIL_REDIRECT_URI`. Users connect from each **source editor**; scope is read-only Gmail.
- **Render (Gmail, optional):** Redirect `…/oauth/google/callback` if you still use worker-hosted OAuth. First consent should use **offline** access so a **refresh token** is stored.
