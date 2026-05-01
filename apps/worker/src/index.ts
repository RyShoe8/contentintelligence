import "./env.js";
import { closeDb, getDb, ensureIndexes, saveGmailOAuth } from "@content-resourcer/db";
import Fastify from "fastify";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "./env.js";
import { ingestLog } from "./ingest-log.js";
import { runIngest } from "./ingest.js";
import { createOAuthState, consumeOAuthState } from "./oauth-state.js";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

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

  app.post("/ingest", async (req, reply) => {
    const body = req.headers["x-ingest-secret"];
    const secretRequired = Boolean(env.ingestSecret);
    const secretMatched = !env.ingestSecret || body === env.ingestSecret;
    ingestLog("ingest_request", {
      source: "http_post",
      secretRequired,
      secretHeaderPresent: body !== undefined && body !== "",
      secretMatched,
    });
    if (env.ingestSecret && body !== env.ingestSecret) {
      ingestLog("ingest_reject", { reason: "unauthorized" });
      return reply.code(401).send({ error: "unauthorized" });
    }
    try {
      const stats = await runIngest();
      ingestLog("ingest_response", { source: "http_post", ...stats });
      return stats;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ingestLog("ingest_fatal", { source: "http_post", message });
      throw e;
    }
  });

  const port = env.port;
  await app.listen({ port, host: "0.0.0.0" });

  cron.schedule(env.ingestCron, () => {
    ingestLog("ingest_cron_tick", { cron: env.ingestCron });
    runIngest()
      .then((stats) => {
        ingestLog("ingest_response", { source: "cron", ...stats });
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        ingestLog("ingest_fatal", { source: "cron", message });
        app.log.error(e);
      });
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
