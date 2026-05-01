import "./env.js";
import { closeDb, getDb, ensureIndexes, saveGmailOAuth } from "@content-resourcer/db";
import Fastify from "fastify";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "./env.js";
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
    if (env.ingestSecret && body !== env.ingestSecret) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const stats = await runIngest();
    return stats;
  });

  const port = env.port;
  await app.listen({ port, host: "0.0.0.0" });

  cron.schedule(env.ingestCron, () => {
    runIngest().catch((e) => app.log.error(e));
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
