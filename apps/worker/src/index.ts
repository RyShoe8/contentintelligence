import "./env.js";
import {
  closeDb,
  ensureIndexes,
  getDb,
  isContentSignalIngestDue,
  listScheduledContentSignals,
  getGmailOAuth,
  saveGmailOAuth,
  updateVoicePersonaStatus,
} from "@content-resourcer/db";
import Fastify from "fastify";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "./env.js";
import { ingestLog } from "./ingest-log.js";
import { runIngest, type IngestStats } from "./ingest.js";
import { createOAuthState, consumeOAuthState } from "./oauth-state.js";
import { addPostsForSignalItem, syncPostsForContentSignal } from "./posts-sync.js";
import { runGeneratePostImage } from "./jobs/generate-post-image.js";
import { runVoicePersonaGeneration } from "./voice-generate.js";
import {
  isVoicePersonaGenerateInFlight,
  runVoicePersonaGenerateExclusive,
} from "./voice-generate-lock.js";
import { runWriterFingerprintsExtract } from "./writer-fingerprints.js";
import { runWriterRewrite } from "./writer-rewrite.js";
import { startWriterComposeJob } from "./writer-compose-job.js";
import type { WriterComposeBody } from "./writer-compose.js";

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
    if (!email) {
      return reply.code(400).send({ error: "missing_email" });
    }
    const db = await getDb();
    await ensureIndexes(db);
    const existing = await getGmailOAuth(db, email);
    if (existing?.refresh_token && !tokens.refresh_token) {
      return reply.code(400).send({ error: "no_new_refresh_token" });
    }
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token;
    if (!refreshToken) {
      return reply.code(400).send({ error: "missing_refresh_or_email" });
    }
    await saveGmailOAuth(db, {
      email_address: email,
      refresh_token: refreshToken,
      access_token: tokens.access_token ?? undefined,
      access_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      issuedNewRefreshToken: Boolean(tokens.refresh_token),
      userReconnect: true,
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
    regeneratePosts = false,
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
            const postStats = await syncPostsForContentSignal(db, contentSignalId, {
              forceRegenerate: regeneratePosts,
            });
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

  type ScheduleTickResult = {
    due_count: number;
    started: boolean;
    content_signal_id: string | null;
    skipped?: string;
  };

  const runScheduleTick = async (): Promise<ScheduleTickResult> => {
    if (ingestInFlight) {
      ingestLog("signal_schedule_skip", { reason: "ingest_already_running" });
      return {
        due_count: 0,
        started: false,
        content_signal_id: null,
        skipped: "ingest_already_running",
      };
    }
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const signals = await listScheduledContentSignals(db);
      const due = signals.filter((s) => isContentSignalIngestDue(s));
      if (!due.length) {
        return { due_count: 0, started: false, content_signal_id: null };
      }
      const next = due.sort((a, b) => {
        const aT = a.last_ingest_completed_at?.getTime() ?? 0;
        const bT = b.last_ingest_completed_at?.getTime() ?? 0;
        return aT - bT;
      })[0];
      if (!next) {
        return { due_count: due.length, started: false, content_signal_id: null };
      }
      ingestLog("signal_schedule_start", {
        contentSignalId: next.id,
        intervalMinutes: next.ingest_interval_minutes,
      });
      void startIngest(next.id, "schedule");
      return {
        due_count: due.length,
        started: true,
        content_signal_id: next.id,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ingestLog("signal_schedule_error", { message });
      app.log.error(e);
      throw e;
    }
  };

  app.post("/schedule/tick", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const result = await runScheduleTick();
    ingestLog("signal_schedule_tick", {
      due_count: result.due_count,
      started: result.started,
      content_signal_id: result.content_signal_id,
      skipped: result.skipped ?? null,
    });
    if (result.skipped === "ingest_already_running") {
      return reply.code(409).send({
        error: "ingest_already_running",
        ...result,
      });
    }
    if (result.started) {
      return reply.code(202).send({
        accepted: true,
        message: "Scheduled ingest started.",
        ...result,
      });
    }
    return reply.code(200).send({
      accepted: false,
      message: "No feeds due for scheduled ingest.",
      ...result,
    });
  });

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
    const q = req.query as { content_signal_id?: string; regenerate_posts?: string };
    const bodyJson = req.body as { content_signal_id?: string; regenerate_posts?: boolean } | undefined;
    const contentSignalId =
      (typeof q.content_signal_id === "string" && q.content_signal_id.trim()) ||
      (typeof bodyJson?.content_signal_id === "string" && bodyJson.content_signal_id.trim()) ||
      undefined;
    const regeneratePosts =
      bodyJson?.regenerate_posts === true ||
      q.regenerate_posts === "true" ||
      q.regenerate_posts === "1";

    if (ingestInFlight) {
      return reply.code(409).send({
        error: "ingest_already_running",
        message: "A sync is already running. Wait a minute and refresh the feed.",
      });
    }

    void startIngest(contentSignalId, "http_post", regeneratePosts);
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

  app.post("/posts/generate-image", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const q = req.query as { post_id?: string; organization_id?: string };
    const postId = q.post_id?.trim();
    const organizationId = q.organization_id?.trim();
    if (!postId || !organizationId) {
      return reply.code(400).send({ error: "post_id and organization_id are required" });
    }
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await runGeneratePostImage(db, postId, organizationId);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ error: message });
    }
  });

  app.post("/writer/rewrite", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await runWriterRewrite(db, {
        voice_id: String(body.voice_id ?? "").trim(),
        organization_id: String(body.organization_id ?? "").trim(),
        created_by: String(body.created_by ?? "").trim(),
        source_text: String(body.source_text ?? ""),
        links: Array.isArray(body.links)
          ? (body.links as { url: string; label?: string }[])
          : [],
        writer_article_id: body.writer_article_id
          ? String(body.writer_article_id).trim()
          : undefined,
        rewrite_divergence_min:
          body.rewrite_divergence_min !== undefined &&
          body.rewrite_divergence_min !== null &&
          body.rewrite_divergence_min !== ""
            ? Number(body.rewrite_divergence_min)
            : undefined,
        preserve_instructions: body.preserve_instructions === true,
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status =
        message === "voice_not_found" ||
        message === "writer_article_not_found" ||
        message.includes("at least")
          ? 400
          : message === "openai_not_configured" || message === "voice_persona_not_ready"
            ? 503
            : 500;
      return reply.code(status).send({ error: message });
    }
  });

  app.post("/writer/compose", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const composeBody: WriterComposeBody = {
      voice_id: String(body.voice_id ?? "").trim(),
      organization_id: String(body.organization_id ?? "").trim(),
      created_by: String(body.created_by ?? "").trim(),
      topic: String(body.topic ?? ""),
      reference_urls: Array.isArray(body.reference_urls)
        ? (body.reference_urls as string[])
        : [],
      links: Array.isArray(body.links)
        ? (body.links as { url: string; label?: string }[])
        : [],
      writer_article_id: body.writer_article_id
        ? String(body.writer_article_id).trim()
        : undefined,
      deep_research:
        body.deep_research === true ||
        body.deep_research === "true" ||
        body.deep_research === 1,
      web_search:
        body.web_search === true ||
        body.web_search === "true" ||
        body.web_search === 1,
      web_search_max_queries:
        body.web_search_max_queries != null
          ? Number(body.web_search_max_queries)
          : undefined,
      web_search_max_results:
        body.web_search_max_results != null
          ? Number(body.web_search_max_results)
          : undefined,
      article_depth: body.article_depth != null ? Number(body.article_depth) : undefined,
      subtopics: Array.isArray(body.subtopics) ? (body.subtopics as string[]) : [],
      include_faq:
        body.include_faq === true ||
        body.include_faq === "true" ||
        body.include_faq === 1,
      skip_research:
        body.skip_research === true ||
        body.skip_research === "true" ||
        body.skip_research === 1,
      research_brief:
        body.research_brief != null ? String(body.research_brief) : undefined,
    };
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await startWriterComposeJob(db, composeBody);
      return reply.code(202).send(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const skipResearch = composeBody.skip_research === true;
      const status =
        message === "compose_already_running"
          ? 409
          : message === "voice_not_found" ||
              message === "writer_article_not_found" ||
              message.includes("at least") ||
              message.includes("Topic must") ||
              (message === "research_brief_empty" && skipResearch)
            ? 400
            : message === "openai_not_configured" ||
                message === "voice_persona_not_ready" ||
                message === "research_brief_empty"
              ? 503
              : 500;
      return reply.code(status).send({ error: message });
    }
  });

  app.post("/writer/fingerprints", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const db = await getDb();
      await ensureIndexes(db);
      const result = await runWriterFingerprintsExtract(db, {
        voice_id: String(body.voice_id ?? "").trim(),
        organization_id: String(body.organization_id ?? "").trim(),
        html: String(body.html ?? ""),
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status =
        message === "voice_not_found" || message.includes("required") ? 400 : 500;
      return reply.code(status).send({ error: message });
    }
  });

  app.post("/voices/generate", async (req, reply) => {
    if (!ingestSecretOk(req.headers["x-ingest-secret"])) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const q = req.query as { voice_id?: string; force?: string };
    const voiceId = q.voice_id?.trim();
    if (!voiceId) {
      return reply.code(400).send({ error: "voice_id is required" });
    }
    const forceRebuild = q.force === "1" || q.force === "true";
    if (isVoicePersonaGenerateInFlight(voiceId)) {
      return reply.code(409).send({ error: "voice_generate_already_running" });
    }

    app.log.info({ voice_id: voiceId, force_rebuild: forceRebuild }, "voice_persona_generate_accepted");

    void runVoicePersonaGenerateExclusive(voiceId, async () => {
      const db = await getDb();
      await ensureIndexes(db);
      try {
        await runVoicePersonaGeneration(db, voiceId, { forceRebuild });
        app.log.info({ voice_id: voiceId }, "voice_persona_generate_done");
      } catch (e) {
        app.log.error({ voice_id: voiceId, err: e }, "voice_persona_generate_failed");
        throw e;
      }
    }).catch(async (e) => {
      try {
        const db = await getDb();
        const message = e instanceof Error ? e.message : String(e);
        await updateVoicePersonaStatus(db, voiceId, {
          persona_status: "failed",
          persona_error: message,
        });
      } catch (secondary) {
        app.log.error(secondary);
      }
    });

    return reply.code(202).send({
      accepted: true,
      voice_id: voiceId,
      message: "Voice persona generation started.",
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

  cron.schedule(env.signalScheduleCron, () => {
    void runScheduleTick();
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
