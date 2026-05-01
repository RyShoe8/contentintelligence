# Content Resourcer (Gmail-only v1)

Monorepo: **Next.js** UI on Vercel, **Node worker** on Render (Gmail + optional OpenAI), **MongoDB Atlas** for configuration and signals.

## Structure

- `apps/web` — internal UI (verticals, Gmail signals, feed)
- `apps/worker` — health, Gmail OAuth, cron ingest, pipeline
- `packages/db` — Zod schemas, Mongo helpers, indexes

This repo uses **npm workspaces** so hosted builds (`npm install` at the repo root) resolve `@content-resourcer/db` correctly. You do not need to run installs locally to deploy.

## Vercel (Next.js)

Configure the Vercel project **once**:

1. **Root Directory** → `apps/web` (required so Next.js and `apps/web/vercel.json` are used).
2. Leave install/build empty in the dashboard so `apps/web/vercel.json` runs (`npm install` from repo root, then builds `@content-resourcer/db` and `@content-resourcer/web`).

Environment variables for the web app are listed below.

## Prerequisites (optional local use)

- Node 20+
- MongoDB Atlas cluster

## Environment variables

**Vercel (`apps/web`)**

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB_NAME` | Optional database name (default `content_resourcer`) |
| `INTERNAL_UI_SECRET` | Optional; if set, cookie login at `/login` |

**Render (`apps/worker`)**

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Same as above |
| `GMAIL_CLIENT_ID` | OAuth client ID |
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

Use a Google Cloud **OAuth Web** client. Authorized redirect URI must exactly match `GMAIL_REDIRECT_URI`. The first successful consent must request offline access so a **refresh token** is returned.
