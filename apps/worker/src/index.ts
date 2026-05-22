import "./env.js";
import { closeDb, getDb, ensureIndexes, saveGmailOAuth } from "@content-resourcer/db";
import Fastify from "fastify";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "./env.js";
import { ingestLog } from "./ingest-log.js";
import { runIngest, type IngestStats } from "./ingest.js";
import { createOAuthState, consumeOAuthState } from "./oauth-state.js";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => {
    const id = env.gmailClientId;
    return {
      ok: true,
      gmail: {
        configured: Boolean(id && env.gmailClientSecret),
        clientIdSuffix: id && id.length >= 6 ? id.slice(-6) : null,
      },
    };
  });

  app.get("/oauth/google/start", async (req, reply) => {
    if (!env.gmailClientId || !env.gmailRedirectUri) {
      return reply.code(500).send({ error: "Gmail OAuth not configured" });
    }
    const state = createOAuthState();
    const oauth2 = new google.auth.OAuth2(
      env.gmailClientId,
      env.gmailClientSecret,
      env.gmailRedirectUri,
    );
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state,
    });
    return reply.redirect(url);
  });

  app.get("/oauth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) {
      return reply.code(400).send({ error: q.error });
    }
    if (!consumeOAuthState(q.state)) {
      return reply.code(400).send({ error: "invalid_state" });
    }
    if (!q.code) {
      return reply.code(400).send({ error: "missing_code" });
    }
    const oauth2 = new google.auth.OAuth2(
      env.gmailClientId,
      env.gmailClientSecret,
      env.gmailRedirectUri,
    );
    const { tokens } = await oauth2.getToken(q.code);
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;
    if (!email || !tokens.refresh_token) {
      return reply.code(400).send({ error: "missing_refresh_or_email" });
    }
    const db = await getDb();
    await ensureIndexes(db);
    await saveGmailOAuth(db, {
      email_address: email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? undefined,
      access_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    });
    return { ok: true, email_address: email };
  });

  /** Avoid overlapping manual/cron ingests (long runs exceed HTTP gateway timeouts). */
  let ingestInFlight: Promise<IngestStats> | null = null;

  type IngestStatusSnapshot = {
    running: boolean;
    content_signal_id: string | null;
    started_at: string | null;
    finished_at: string | null;
    stats: IngestStats | null;
    error: string | null;
  };

  let ingestStatus: IngestStatusSnapshot = {
    running: false,
    content_signal_id: null,
    started_at: null,
    finished_at: null,
    stats: null,
    error: null,
  };

  const ingestSecretOk = (header: string | string[] | undefined): boolean =>
    !env.ingestSecret || header === env.ingestSecret;

  const startIngest = (contentSignalId: string | undefined, source: "http_post" | "cron") => {
    ingestStatus = {
      running: true,
      content_signal_id: contentSignalId ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
      stats: null,
      error: null,
    };
    ingestInFlight = runIngest(contentSignalId)
      .then((stats) => {
        ingestLog("ingest_response", { source, contentSignalId: contentSignalId ?? null, ...stats });
        ingestStatus = {
          running: false,
          content_signal_id: contentSignalId ?? null,
          started_at: ingestStatus.started_at,
          finished_at: new Date().toISOString(),
          stats,
          error: null,
        };
        return stats;
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        ingestLog("ingest_fatal", { source, message });
        app.log.error(e);
        ingestStatus = {
          running: false,
          content_signal_id: contentSignalId ?? null,
          started_at: ingestStatus.started_at,
          finished_at: new Date().toISOString(),
          stats: null,
          error: message,
        };
        throw e;
      })
      .finally(() => {
        ingestInFlight = null;
      });
    return ingestInFlight;
  };

  app.get("/ingest/status", async (req, reply) => {
    const secretHeader = req.headers["x-ingest-secret"];
    if (!ingestSecretOk(secretHeader)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return ingestStatus;
  });

  app.post("/ingest", async (req, reply) => {
    const body = req.headers["x-ingest-secret"];
    const secretRequired = Boolean(env.ingestSecret);
    const secretMatched = ingestSecretOk(body);
    ingestLog("ingest_request", {
      source: "http_post",
      secretRequired,
      secretHeaderPresent: body !== undefined && body !== "",
      secretMatched,
    });
    if (!ingestSecretOk(body)) {
      ingestLog("ingest_reject", { reason: "unauthorized" });
      return reply.code(401).send({ error: "unauthorized" });
    }
    const q = req.query as { content_signal_id?: string };
    const bodyJson = req.body as { content_signal_id?: string } | undefined;
    const contentSignalId =
      (typeof q.content_signal_id === "string" && q.content_signal_id.trim()) ||
      (typeof bodyJson?.content_signal_id === "string" && bodyJson.content_signal_id.trim()) ||
      undefined;

    if (ingestInFlight) {
      return reply.code(409).send({
        error: "ingest_already_running",
        message: "A sync is already running. Wait a minute and refresh the feed.",
      });
    }

    void startIngest(contentSignalId, "http_post");
    return reply.code(202).send({
      accepted: true,
      content_signal_id: contentSignalId ?? null,
      message: "Sync started — feed will update when finished.",
    });
  });

  const port = env.port;
  await app.listen({ port, host: "0.0.0.0" });

  cron.schedule(env.ingestCron, () => {
    ingestLog("ingest_cron_tick", { cron: env.ingestCron });
    if (ingestInFlight) {
      ingestLog("ingest_cron_skip", { reason: "ingest_already_running" });
      return;
    }
    void startIngest(undefined, "cron");
  });

  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
