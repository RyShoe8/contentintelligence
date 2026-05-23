import "./env.js";
import {
  closeDb,
  ensureIndexes,
  getDb,
  isContentSignalIngestDue,
  listScheduledContentSignals,
  saveGmailOAuth,
} from "@content-resourcer/db";
import Fastify from "fastify";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "./env.js";
import { ingestLog } from "./ingest-log.js";
import { runIngest, type IngestStats } from "./ingest.js";
import { createOAuthState, consumeOAuthState } from "./oauth-state.js";
import { addPostsForSignalItem, syncPostsForContentSignal } from "./posts-sync.js";

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

  const startIngest = (
    contentSignalId: string | undefined,
    source: "http_post" | "cron" | "schedule",
  ) => {
    ingestStatus = {
      running: true,
      content_signal_id: contentSignalId ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
      stats: null,
      error: null,
    };
    ingestInFlight = runIngest(contentSignalId)
      .then(async (stats) => {
        ingestLog("ingest_response", { source, contentSignalId: contentSignalId ?? null, ...stats });
        if (contentSignalId) {
          try {
            const db = await getDb();
            await ensureIndexes(db);
            const postStats = await syncPostsForContentSignal(db, contentSignalId);
            ingestLog("posts_sync_after_ingest", { contentSignalId, ...postStats });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            ingestLog("posts_sync_error", { contentSignalId, message });
            app.log.error(e);
          }
        }
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

  app.post("/posts/sync", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const q = req.query as { content_signal_id?: string };
    const contentSignalId = q.content_signal_id?.trim();
    if (!contentSignalId) {
      return reply.code(400).send({ error: "content_signal_id is required" });
    }
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await syncPostsForContentSignal(db, contentSignalId);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ error: message });
    }
  });

  app.post("/posts/add", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const q = req.query as { signal_item_id?: string; deal_index?: string };
    const signalItemId = q.signal_item_id?.trim();
    if (!signalItemId) {
      return reply.code(400).send({ error: "signal_item_id is required" });
    }
    const dealIndexRaw = q.deal_index?.trim();
    const dealIndex =
      dealIndexRaw != null && dealIndexRaw !== "" && Number.isFinite(Number(dealIndexRaw))
        ? Number(dealIndexRaw)
        : undefined;
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await addPostsForSignalItem(db, signalItemId, dealIndex);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ error: message });
    }
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

  cron.schedule(env.signalScheduleCron, () => {
    void (async () => {
      if (ingestInFlight) {
        ingestLog("signal_schedule_skip", { reason: "ingest_already_running" });
        return;
      }
      try {
        const db = await getDb();
        await ensureIndexes(db);
        const signals = await listScheduledContentSignals(db);
        const due = signals.filter((s) => isContentSignalIngestDue(s));
        if (!due.length) return;
        const next = due.sort((a, b) => {
          const aT = a.last_ingest_completed_at?.getTime() ?? 0;
          const bT = b.last_ingest_completed_at?.getTime() ?? 0;
          return aT - bT;
        })[0];
        if (next) {
          ingestLog("signal_schedule_start", {
            contentSignalId: next.id,
            intervalMinutes: next.ingest_interval_minutes,
          });
          void startIngest(next.id, "schedule");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        ingestLog("signal_schedule_error", { message });
        app.log.error(e);
      }
    })();
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
