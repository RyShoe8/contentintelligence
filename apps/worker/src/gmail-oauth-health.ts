import type { Db } from "mongodb";
import {
  formatGmailIngestError,
  GMAIL_AUTH_EXPIRED_MESSAGE,
  isGmailRefreshTokenExpired,
  setGmailOAuthIngestError,
  type GmailOAuthDoc,
} from "@content-resourcer/db";
import { createGmailClient } from "./gmail-client.js";

export async function ensureGmailOAuthHealthy(
  db: Db,
  email: string,
  oauth: GmailOAuthDoc,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isGmailRefreshTokenExpired(oauth)) {
    await setGmailOAuthIngestError(db, email, GMAIL_AUTH_EXPIRED_MESSAGE);
    return { ok: false, message: GMAIL_AUTH_EXPIRED_MESSAGE };
  }

  try {
    const gmail = createGmailClient(oauth.refresh_token);
    await gmail.users.getProfile({ userId: "me" });
    await setGmailOAuthIngestError(db, email, null);
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const msg = formatGmailIngestError(raw);
    await setGmailOAuthIngestError(db, email, msg);
    return { ok: false, message: msg };
  }
}
