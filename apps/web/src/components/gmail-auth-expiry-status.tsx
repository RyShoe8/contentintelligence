import {
  GMAIL_AUTH_EXPIRED_MESSAGE,
  GMAIL_REFRESH_TOKEN_TTL_DAYS,
  gmailDaysUntilRefreshExpiry,
  gmailRefreshExpirySeverity,
} from "@content-resourcer/db";

type Props = {
  connected: boolean;
  refreshTokenIssuedAt?: Date | null;
  updatedAt?: Date | null;
  lastIngestError?: string | null;
  reconnectHref?: string;
};

export function GmailAuthExpiryStatus({
  connected,
  refreshTokenIssuedAt,
  updatedAt,
  lastIngestError,
  reconnectHref,
}: Props) {
  if (!connected || !updatedAt) return null;

  const daysUntilExpiry = gmailDaysUntilRefreshExpiry({
    refresh_token_issued_at: refreshTokenIssuedAt ?? undefined,
    updated_at: updatedAt,
  });
  const severity = gmailRefreshExpirySeverity(daysUntilExpiry, lastIngestError);
  const reconnect = reconnectHref ? (
    <a href={reconnectHref} className="font-medium text-[var(--primary)] hover:underline">
      Re-connect Gmail
    </a>
  ) : (
    <span className="font-medium">Re-connect Gmail</span>
  );

  if (severity === "error") {
    const message =
      lastIngestError?.includes("invalid_grant") ||
      lastIngestError?.toLowerCase().includes("authorization expired")
        ? GMAIL_AUTH_EXPIRED_MESSAGE
        : lastIngestError || GMAIL_AUTH_EXPIRED_MESSAGE;
    return (
      <p className="mt-2 text-sm text-red-300/90">
        {message} {reconnectHref ? <>— {reconnect}</> : null}
      </p>
    );
  }

  if (severity === "warn") {
    return (
      <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Gmail auth expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} (Testing mode, ~
        {GMAIL_REFRESH_TOKEN_TTL_DAYS}-day tokens). {reconnect} now to avoid feed sync gaps.
      </p>
    );
  }

  if (severity === "subtle") {
    return (
      <p className="mt-2 text-xs text-[var(--muted)]">
        Gmail auth expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} (Testing mode).
      </p>
    );
  }

  return null;
}
