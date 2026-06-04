import type { GmailOAuthDoc } from "./schemas.js";

/** Google OAuth Testing apps expire refresh tokens after ~7 days. */
export const GMAIL_REFRESH_TOKEN_TTL_DAYS = 7;

/** Re-connect cadence before TTL (calendar habit). */
export const GMAIL_RECONNECT_EVERY_DAYS = 6;

export const GMAIL_AUTH_EXPIRED_MESSAGE =
  "Gmail authorization expired — Re-connect to restore feed sync (Testing tokens last ~7 days).";

export type GmailOAuthExpiryFields = Pick<GmailOAuthDoc, "refresh_token_issued_at" | "updated_at">;

export function gmailEffectiveIssuedAt(oauth: GmailOAuthExpiryFields): Date {
  return oauth.refresh_token_issued_at ?? oauth.updated_at;
}

export function gmailDaysUntilRefreshExpiry(
  oauth: GmailOAuthExpiryFields,
  now: Date = new Date(),
): number {
  const issued = gmailEffectiveIssuedAt(oauth);
  const elapsedMs = now.getTime() - issued.getTime();
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(GMAIL_REFRESH_TOKEN_TTL_DAYS - elapsedDays));
}

export function isGmailRefreshTokenExpired(
  oauth: GmailOAuthExpiryFields,
  now: Date = new Date(),
): boolean {
  const issued = gmailEffectiveIssuedAt(oauth);
  const ageDays = (now.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays >= GMAIL_REFRESH_TOKEN_TTL_DAYS;
}

export type GmailRefreshExpirySeverity = "ok" | "subtle" | "warn" | "error";

export function gmailRefreshExpirySeverity(
  daysUntilExpiry: number,
  lastIngestError?: string | null,
): GmailRefreshExpirySeverity {
  const err = lastIngestError?.toLowerCase() ?? "";
  if (
    err.includes("invalid_grant") ||
    err.includes("authorization expired") ||
    err.includes("testing tokens last")
  ) {
    return "error";
  }
  if (daysUntilExpiry <= 0) return "error";
  if (daysUntilExpiry <= 2) return "warn";
  if (daysUntilExpiry < GMAIL_REFRESH_TOKEN_TTL_DAYS) return "subtle";
  return "ok";
}

export function formatGmailIngestError(raw: string): string {
  if (raw.includes("invalid_grant")) return GMAIL_AUTH_EXPIRED_MESSAGE;
  return raw;
}
