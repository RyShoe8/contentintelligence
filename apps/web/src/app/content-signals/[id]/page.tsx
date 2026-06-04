import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ensureIndexes,
  findVoiceForContentSignal,
  getContentSignal,
  getGmailOAuth,
  listSourcesByContentSignal,
  sourceDisplayLabel,
} from "@content-resourcer/db";
import { GmailAuthExpiryStatus } from "@/components/gmail-auth-expiry-status";
import { connectMongo } from "@/lib/mongo";
import { canAccessContentSignal, requireOrgMember } from "@/lib/org-auth";
import {
  createSourceAction,
  deleteSourceAction,
  toggleSourceAction,
} from "../actions";
import { saveTemplateFromSignalAction } from "../template-actions";

export const dynamic = "force-dynamic";

export default async function ContentSignalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ signal_created?: string; template_saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);
  const contentSignal = await getContentSignal(db, id);
  if (!contentSignal || !canAccessContentSignal(contentSignal, session)) notFound();

  const sources = await listSourcesByContentSignal(db, id);
  const linkedVoice = await findVoiceForContentSignal(db, id);
  const sourcesWithOAuth = await Promise.all(
    sources.map(async (s) => {
      const email = s.config.email_address?.trim();
      const oauth = email ? await getGmailOAuth(db, email) : null;
      const oauthStartUrl = `/api/gmail/oauth/start?source_id=${encodeURIComponent(s.id)}&content_signal_id=${encodeURIComponent(id)}${email ? `&login_hint=${encodeURIComponent(email)}` : ""}`;
      return {
        ...s,
        connected: !!oauth?.refresh_token,
        lastIngestError: oauth?.last_ingest_error ?? null,
        refreshTokenIssuedAt: oauth?.refresh_token_issued_at ?? null,
        oauthUpdatedAt: oauth?.updated_at ?? null,
        oauthStartUrl,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/content-signals" className="text-sm font-medium text-[var(--primary)] hover:underline">
          ← Content Signals
        </Link>
        <h1 className="mt-2">{contentSignal.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {contentSignal.active ? "Active" : "Inactive"} · Lookback {contentSignal.lookback_window_hours}h ·{" "}
          Keywords: {contentSignal.keywords.join(", ") || "—"}
        </p>
        {linkedVoice ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Linked voice:{" "}
            <Link href={`/voices?voice_id=${linkedVoice.id}`} className="text-[var(--primary)] hover:underline">
              {linkedVoice.name}
            </Link>
          </p>
        ) : null}
        {sp.signal_created === "1" ? (
          <p className="ui-alert-success mt-2">
            Content signal created from template. Add a Gmail source below to start ingesting.
          </p>
        ) : null}
        {sp.template_saved === "1" ? (
          <p className="ui-alert-success mt-2">
            Template saved.
          </p>
        ) : null}
        <form
          action={saveTemplateFromSignalAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="content_signal_id" value={id} />
          <input type="hidden" name="return_to" value={`/content-signals/${id}`} />
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Save as template</span>
            <input
              name="template_name"
              placeholder={`${contentSignal.name} template`}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
          >
            Save template
          </button>
        </form>
      </div>

      <section className="ui-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Sources</h2>
          <form action={createSourceAction}>
            <input type="hidden" name="content_signal_id" value={id} />
            <button
              type="submit"
              className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add email source
            </button>
          </form>
        </div>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Each source is a Gmail inbox connection with its own labels and sender filters. Ingest uses this
          signal&apos;s keywords and lookback.
        </p>

        {sourcesWithOAuth.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No sources yet. Add an email source to get started.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] text-sm">
            {sourcesWithOAuth.map((s) => (
              <li key={s.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--fg)]">Email</p>
                    <p className="text-xs text-[var(--muted)]">
                      {s.config.email_address?.trim() || "Gmail not connected"} ·{" "}
                      {sourceDisplayLabel(s.config)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {s.enabled ? "Enabled" : "Disabled"}
                      {s.connected ? " · Gmail connected" : " · Not connected"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/content-signals/${id}/sources/${s.id}`}
                      className="rounded border border-[var(--border)] px-3 py-1 text-xs hover:border-[var(--accent)]"
                    >
                      Configure
                    </Link>
                    <form action={toggleSourceAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="content_signal_id" value={id} />
                      <button
                        type="submit"
                        className="rounded border border-[var(--border)] px-3 py-1 text-xs"
                      >
                        {s.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form action={deleteSourceAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="content_signal_id" value={id} />
                      <button type="submit" className="text-xs text-red-400 hover:underline">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <GmailAuthExpiryStatus
                  connected={s.connected}
                  refreshTokenIssuedAt={s.refreshTokenIssuedAt}
                  updatedAt={s.oauthUpdatedAt}
                  lastIngestError={s.lastIngestError}
                  reconnectHref={s.oauthStartUrl}
                />
                {s.lastIngestError &&
                !s.lastIngestError.includes("invalid_grant") &&
                !s.lastIngestError.toLowerCase().includes("authorization expired") ? (
                  <p className="mt-2 text-xs text-red-300/90">Last ingest error: {s.lastIngestError}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-[var(--muted)]">
        <Link href={`/feed?content_signal_id=${id}`} className="text-[var(--accent)] hover:underline">
          Open feed
        </Link>{" "}
        for this signal to sync and review items.
      </p>
    </div>
  );
}
