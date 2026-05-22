import { google } from "googleapis";
import { ensureIndexes, getDb, getSource, saveGmailOAuth, upsertSource } from "@content-resourcer/db";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const STATE_COOKIE = "gmail_oauth_state";
const RETURN_COOKIE = "gmail_oauth_return";

function redirectTo(req: NextRequest, path: string, params: Record<string, string>) {
  const u = new URL(path, req.url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const err = q.get("error");
  const cookieStore = await cookies();
  const returnRaw = cookieStore.get(RETURN_COOKIE)?.value;
  cookieStore.delete(RETURN_COOKIE);

  let returnPath = "/content-signals";
  let sourceId: string | undefined;
  let contentSignalId: string | undefined;
  if (returnRaw) {
    try {
      const parsed = JSON.parse(returnRaw) as { sourceId?: string; contentSignalId?: string };
      if (parsed.sourceId && parsed.contentSignalId) {
        sourceId = parsed.sourceId;
        contentSignalId = parsed.contentSignalId;
        returnPath = `/content-signals/${contentSignalId}/sources/${sourceId}`;
      }
    } catch {
      /* ignore */
    }
  }

  if (err) {
    return redirectTo(req, returnPath, { gmail_error: err });
  }

  const code = q.get("code");
  const state = q.get("state");
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!state || !expected || state !== expected) {
    return redirectTo(req, returnPath, { gmail_error: "invalid_state" });
  }
  if (!code) {
    return redirectTo(req, returnPath, { gmail_error: "missing_code" });
  }

  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!id || !secret || !redirectUri) {
    return redirectTo(req, returnPath, { gmail_error: "server_config" });
  }

  try {
    const oauth2 = new google.auth.OAuth2(id, secret, redirectUri);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    if (!tokens.refresh_token) {
      return redirectTo(req, returnPath, { gmail_error: "missing_refresh_token" });
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;
    if (!email) {
      return redirectTo(req, returnPath, { gmail_error: "missing_email" });
    }

    const db = await getDb();
    await ensureIndexes(db);
    await saveGmailOAuth(db, {
      email_address: email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? undefined,
      access_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    });

    if (sourceId && contentSignalId) {
      const existing = await getSource(db, sourceId);
      if (existing && existing.content_signal_id === contentSignalId) {
        await upsertSource(db, {
          id: existing.id,
          content_signal_id: existing.content_signal_id,
          enabled: existing.enabled,
          config: {
            ...existing.config,
            email_address: email,
          },
        });
      }
    }

    return redirectTo(req, returnPath, { gmail: "ok", email });
  } catch {
    return redirectTo(req, returnPath, { gmail_error: "token_exchange_failed" });
  }
}
