import {
  GMAIL_AUTH_EXPIRED_MESSAGE,
  GMAIL_REFRESH_TOKEN_TTL_DAYS,
  gmailDaysUntilRefreshExpiry,
  gmailEffectiveIssuedAt,
  gmailRefreshExpirySeverity,
} from "@content-resourcer/db";

type Props = {
  connected: boolean;
  refreshTokenIssuedAt?: Date | null;
  updatedAt?: Date | null;
  lastIngestError?: string | null;
  reconnectHref?: string;
  showTokenAge?: boolean;
};

export function GmailAuthExpiryStatus({
  connected,
  refreshTokenIssuedAt,
  updatedAt,
  lastIngestError,
  reconnectHref,
  showTokenAge = false,
}: Props) {
  if (!connected || !updatedAt) return null;

  const expiryFields = {
    refresh_token_issued_at: refreshTokenIssuedAt ?? undefined,
    updated_at: updatedAt,
  };
  const daysUntilExpiry = gmailDaysUntilRefreshExpiry(expiryFields);
  const severity = gmailRefreshExpirySeverity(daysUntilExpiry, lastIngestError);
  const reconnect = reconnectHref ? (
    <a href={reconnectHref} className="font-medium text-[var(--primary)] hover:underline">
      Re-connect Gmail
    </a>
  ) : (
    <span className="font-medium">Re-connect Gmail</span>
  );

  const tokenAgeLine = showTokenAge ? (
    <p className="mt-1 text-xs text-[var(--muted)]">
      Token issued{" "}
      <time dateTime={gmailEffectiveIssuedAt(expiryFields).toISOString()}>
        {gmailEffectiveIssuedAt(expiryFields).toLocaleDateString()}
      </time>
      {" · "}
      {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} until expiry (Testing mode, ~
      {GMAIL_REFRESH_TOKEN_TTL_DAYS}-day tokens)
    </p>
  ) : null;

  if (severity === "error") {
    const message =
      lastIngestError?.includes("invalid_grant") ||
      lastIngestError?.toLowerCase().includes("authorization expired")
        ? GMAIL_AUTH_EXPIRED_MESSAGE
        : lastIngestError || GMAIL_AUTH_EXPIRED_MESSAGE;
    return (
      <div className="mt-2">
        <p className="text-sm text-red-300/90">
          {message} {reconnectHref ? <>— {reconnect}</> : null}
        </p>
        {tokenAgeLine}
      </div>
    );
  }

  if (severity === "warn") {
    return (
      <div className="mt-2">
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Gmail auth expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} (Testing mode, ~
          {GMAIL_REFRESH_TOKEN_TTL_DAYS}-day tokens). {reconnect} now to avoid feed sync gaps.
        </p>
        {tokenAgeLine}
      </div>
    );
  }

  if (severity === "subtle") {
    return (
      <div className="mt-2">
        <p className="text-xs text-[var(--muted)]">
          Gmail auth expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} (Testing mode).
        </p>
        {tokenAgeLine}
      </div>
    );
  }

  if (showTokenAge && tokenAgeLine) {
    return <div className="mt-2">{tokenAgeLine}</div>;
  }

  return null;
}
