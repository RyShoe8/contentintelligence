import type { Db } from "mongodb";
import { getGmailOAuth, listSourcesByContentSignal } from "@content-resourcer/db";
import type { ContentSignalSourceOAuth } from "@/components/content-signal-gmail-auth-alerts";

export async function loadContentSignalGmailOAuth(
  db: Db,
  contentSignalId: string,
): Promise<ContentSignalSourceOAuth[]> {
  const sources = await listSourcesByContentSignal(db, contentSignalId);
  return Promise.all(
    sources.map(async (source) => {
      const email = source.config.email_address?.trim() || null;
      const oauth = email ? await getGmailOAuth(db, email) : null;
      const oauthStartUrl = `/api/gmail/oauth/start?source_id=${encodeURIComponent(source.id)}&content_signal_id=${encodeURIComponent(contentSignalId)}${email ? `&login_hint=${encodeURIComponent(email)}` : ""}`;
      return {
        sourceId: source.id,
        contentSignalId,
        email,
        connected: !!oauth?.refresh_token,
        refreshTokenIssuedAt: oauth?.refresh_token_issued_at ?? null,
        updatedAt: oauth?.updated_at ?? null,
        lastIngestError: oauth?.last_ingest_error ?? null,
        oauthStartUrl,
      };
    }),
  );
}
