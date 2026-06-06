import Link from "next/link";
import { GmailAuthExpiryStatus } from "@/components/gmail-auth-expiry-status";

export type ContentSignalSourceOAuth = {
  sourceId: string;
  contentSignalId: string;
  email: string | null;
  connected: boolean;
  refreshTokenIssuedAt: Date | null;
  updatedAt: Date | null;
  lastIngestError: string | null;
  oauthStartUrl: string;
};

type Props = {
  sources: ContentSignalSourceOAuth[];
  className?: string;
};

export function ContentSignalGmailAuthAlerts({ sources, className }: Props) {
  const withEmail = sources.filter((s) => s.email);
  if (!withEmail.length) return null;

  return (
    <div className={className}>
      {withEmail.map((source) => (
        <div key={source.sourceId} className="mt-2">
          {withEmail.length > 1 && source.email ? (
            <p className="mb-1 text-xs text-[var(--muted)]">
              {source.email} —{" "}
              <Link
                href={`/content-signals/${source.contentSignalId}/sources/${source.sourceId}`}
                className="text-[var(--primary)] hover:underline"
              >
                Edit source
              </Link>
            </p>
          ) : null}
          <GmailAuthExpiryStatus
            connected={source.connected}
            refreshTokenIssuedAt={source.refreshTokenIssuedAt}
            updatedAt={source.updatedAt}
            lastIngestError={source.lastIngestError}
            reconnectHref={source.oauthStartUrl}
            showTokenAge
          />
        </div>
      ))}
    </div>
  );
}
