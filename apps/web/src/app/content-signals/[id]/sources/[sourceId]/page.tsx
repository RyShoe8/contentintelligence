import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getContentSignal, getGmailOAuth, getSource } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { canAccessContentSignal, requireOrgMember } from "@/lib/org-auth";
import { GmailAuthExpiryStatus } from "@/components/gmail-auth-expiry-status";
import { GmailOAuthDiagnostics } from "@/components/gmail-oauth-diagnostics";
import { saveSourceAction } from "../../../actions";
import { LabelWithTip } from "@/app/signals/label-with-tip";
import { SOURCE_FIELD_TIPS } from "../../../field-help";

export const dynamic = "force-dynamic";

function linesJoin(arr: string[] | undefined): string {
  return (arr ?? []).join("\n");
}

export default async function SourceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sourceId: string }>;
  searchParams: Promise<{ gmail?: string; email?: string; gmail_error?: string; saved?: string }>;
}) {
  const { id: contentSignalId, sourceId } = await params;
  const sp = await searchParams;
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);

  const contentSignal = await getContentSignal(db, contentSignalId);
  const source = await getSource(db, sourceId);
  if (
    !contentSignal ||
    !source ||
    source.content_signal_id !== contentSignalId ||
    !canAccessContentSignal(contentSignal, session)
  ) {
    notFound();
  }

  const email = source.config.email_address?.trim();
  const oauth = email ? await getGmailOAuth(db, email) : null;
  const connected = !!oauth?.refresh_token;

  const gmailOAuthConfigured = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI
  );

  const oauthStartUrl = `/api/gmail/oauth/start?source_id=${encodeURIComponent(sourceId)}&content_signal_id=${encodeURIComponent(contentSignalId)}${email ? `&login_hint=${encodeURIComponent(email)}` : ""}`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/content-signals/${contentSignalId}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← {contentSignal.name} sources
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Email source</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Connect Gmail and set inbox filters. Keywords and lookback are on the content signal.
        </p>
      </div>

      {sp.saved === "1" ? (
        <p className="ui-alert-success">
          Source saved.
        </p>
      ) : null}
      {sp.gmail === "ok" && sp.email ? (
        <p className="ui-alert-success">
          Gmail connected for <strong>{sp.email}</strong>.
        </p>
      ) : null}
      {sp.gmail_error ? (
        <p className="ui-alert-error">
          Gmail error: {sp.gmail_error}
        </p>
      ) : null}

      <section className="ui-card p-6">
        <h2 className="mb-3 text-lg font-medium">Gmail connection</h2>
        {!gmailOAuthConfigured ? (
          <p className="text-sm text-amber-200/90">
            Set <code className="text-[var(--fg)]">GMAIL_CLIENT_*</code> on Vercel to enable Connect Gmail.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--muted)]">
              Inbox:{" "}
              <strong className="text-[var(--fg)]">
                {email || "Not connected"}
              </strong>{" "}
              {connected ? (
                <span className="text-green-400">(authorized)</span>
              ) : (
                <span className="text-amber-200">(connect required)</span>
              )}
            </p>
            <a
              href={oauthStartUrl}
              className="inline-block rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {connected ? "Re-connect Gmail" : "Connect Gmail"}
            </a>
            <GmailAuthExpiryStatus
              connected={connected}
              refreshTokenIssuedAt={oauth?.refresh_token_issued_at ?? null}
              updatedAt={oauth?.updated_at ?? null}
              lastIngestError={oauth?.last_ingest_error ?? null}
              reconnectHref={oauthStartUrl}
            />
            <div className="mt-3">
              <GmailOAuthDiagnostics />
            </div>
          </>
        )}
      </section>

      <section className="ui-card p-6">
        <h2 className="mb-4 text-lg font-medium">Source settings</h2>
        <form action={saveSourceAction} className="grid gap-4 text-sm">
          <input type="hidden" name="id" value={sourceId} />
          <input type="hidden" name="content_signal_id" value={contentSignalId} />

          <label className="flex flex-col gap-1">
            <LabelWithTip htmlFor="src-labels" tip={SOURCE_FIELD_TIPS.labels}>
              Gmail labels (one per line)
            </LabelWithTip>
            <textarea
              id="src-labels"
              name="labels"
              rows={3}
              defaultValue={linesJoin(source.config.labels)}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="Casinos"
            />
          </label>

          <label className="flex flex-col gap-1">
            <LabelWithTip htmlFor="src-senders" tip={SOURCE_FIELD_TIPS.sender_addresses}>
              Sender addresses (optional)
            </LabelWithTip>
            <textarea
              id="src-senders"
              name="sender_addresses"
              rows={2}
              defaultValue={linesJoin(source.config.sender_addresses)}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <LabelWithTip htmlFor="src-domains" tip={SOURCE_FIELD_TIPS.sender_domains}>
              Sender domains (optional)
            </LabelWithTip>
            <textarea
              id="src-domains"
              name="sender_domains"
              rows={2}
              defaultValue={linesJoin(source.config.sender_domains)}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="scan_body"
              defaultChecked={source.config.scan_body}
              className="h-4 w-4"
            />
            <LabelWithTip htmlFor="src-scan" tip={SOURCE_FIELD_TIPS.scan_body}>
              Scan body
            </LabelWithTip>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="ai_summary_enabled"
              defaultChecked={source.config.ai_summary_enabled}
              className="h-4 w-4"
            />
            <LabelWithTip htmlFor="src-ai" tip={SOURCE_FIELD_TIPS.ai_summary_enabled}>
              AI email summary
            </LabelWithTip>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={source.enabled} className="h-4 w-4" />
            <span>Source enabled for ingest</span>
          </label>

          <button
            type="submit"
            className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Save source
          </button>
        </form>
      </section>
    </div>
  );
}
