import { ensureIndexes, getGmailOAuth, listInputSignals, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { GmailOAuthDiagnostics } from "@/components/gmail-oauth-diagnostics";
import { GmailSyncButton } from "@/components/gmail-sync-button";
import { deleteSignalAction, saveSignalAction } from "./actions";
import { SIGNAL_FIELD_TIPS } from "./field-help";
import { LabelWithTip } from "./label-with-tip";

export const dynamic = "force-dynamic";

function gmailErrorMessage(code: string) {
  switch (code) {
    case "invalid_state":
      return "The sign-in link expired or was invalid. Use Connect Gmail again.";
    case "missing_code":
      return "Google did not return an authorization code. Try again.";
    case "missing_refresh_token":
      return "Google did not return a refresh token. Try Connect again and accept access (you may need to remove the app in Google Account permissions first).";
    case "missing_email":
      return "Could not read your Gmail address from Google.";
    case "server_config":
      return "Gmail OAuth is not configured on the server.";
    case "token_exchange_failed":
      return "Could not exchange the authorization code with Google.";
    default:
      return `Something went wrong (${code}).`;
  }
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; email?: string; gmail_error?: string }>;
}) {
  const sp = await searchParams;
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);
  const signals = await listInputSignals(db);

  const gmailOAuthConfigured = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI
  );
  const workerIngestConfigured = !!process.env.WORKER_URL;

  const inboxEmails = [...new Set(signals.map((s) => s.config.email_address))].filter(Boolean).sort();
  const inboxStatus = await Promise.all(
    inboxEmails.map(async (email) => {
      const doc = await getGmailOAuth(db, email);
      return {
        email,
        connected: !!doc?.refresh_token,
        lastIngestError: doc?.last_ingest_error ?? null,
        lastIngestErrorAt: doc?.last_ingest_error_at ?? null,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Gmail input signals</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Each signal is a Gmail ingestion rule. Connect the inbox here so the worker can read mail from Mongo-stored
          tokens.
        </p>
      </div>

      {sp.gmail === "ok" && sp.email ? (
        <p className="rounded-md border border-green-700/40 bg-green-900/20 px-3 py-2 text-sm text-green-200">
          Gmail connected for <strong>{sp.email}</strong>. You can run a sync below or wait for the worker schedule.
        </p>
      ) : null}
      {sp.gmail_error ? (
        <p className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          {gmailErrorMessage(sp.gmail_error)}
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-2 text-lg font-medium">Gmail inboxes</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Each address below appears on at least one signal. Connect grants read-only Gmail access for ingestion.
        </p>
        {!gmailOAuthConfigured ? (
          <p className="text-sm text-amber-200/90">
            Gmail OAuth is not configured on this deployment (set{" "}
            <code className="text-[var(--fg)]">GMAIL_CLIENT_ID</code>,{" "}
            <code className="text-[var(--fg)]">GMAIL_CLIENT_SECRET</code>, and{" "}
            <code className="text-[var(--fg)]">GMAIL_REDIRECT_URI</code> on Vercel).
          </p>
        ) : inboxStatus.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Save a signal with a Gmail address to see connection status here.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] text-sm">
            {inboxStatus.map(({ email, connected, lastIngestError, lastIngestErrorAt }) => (
              <li key={email} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium text-[var(--fg)]">{email}</span>
                  <span
                    className={
                      lastIngestError
                        ? "text-red-400"
                        : connected
                          ? "text-green-400"
                          : "text-amber-200"
                    }
                  >
                    {lastIngestError
                      ? "Ingest error"
                      : connected
                        ? "Connected"
                        : "Not connected"}
                  </span>
                  {!connected ? (
                    <a
                      className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                      href={`/api/gmail/oauth/start?login_hint=${encodeURIComponent(email)}`}
                    >
                      Connect Gmail
                    </a>
                  ) : (
                    <a
                      className="text-xs text-[var(--accent)] hover:underline"
                      href={`/api/gmail/oauth/start?login_hint=${encodeURIComponent(email)}`}
                    >
                      Re-connect
                    </a>
                  )}
                </div>
                {lastIngestError ? (
                  <p className="mt-2 text-xs text-red-300/90">
                    Last ingest failed
                    {lastIngestErrorAt
                      ? ` (${lastIngestErrorAt.toLocaleString()})`
                      : ""}
                    :{" "}
                    {lastIngestError.includes("invalid_grant")
                      ? "Gmail authorization expired or OAuth client mismatch — use Re-connect, and ensure Render GMAIL_CLIENT_ID/SECRET match Vercel."
                      : lastIngestError}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <GmailOAuthDiagnostics />
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-sm text-[var(--muted)]">Pull new messages once (calls the Render worker).</p>
          <GmailSyncButton disabled={!workerIngestConfigured} />
          {!workerIngestConfigured ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable (your Render service URL,
              no trailing slash).
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-medium">Add signal</h2>
        <form action={saveSignalAction} className="grid gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-vertical_id" tip={SIGNAL_FIELD_TIPS.vertical_id}>
              Vertical
            </LabelWithTip>
            <select
              id="signal-add-vertical_id"
              name="vertical_id"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            >
              <option value="">Select…</option>
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-name" tip={SIGNAL_FIELD_TIPS.name}>
              Signal name
            </LabelWithTip>
            <input
              id="signal-add-name"
              name="name"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-email_address" tip={SIGNAL_FIELD_TIPS.email_address}>
              Gmail account email (must match OAuth)
            </LabelWithTip>
            <input
              id="signal-add-email_address"
              name="email_address"
              type="email"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-labels" tip={SIGNAL_FIELD_TIPS.labels}>
              Labels (optional, one per line)
            </LabelWithTip>
            <textarea
              id="signal-add-labels"
              name="labels"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-sender_addresses" tip={SIGNAL_FIELD_TIPS.sender_addresses}>
              Sender addresses (optional)
            </LabelWithTip>
            <textarea
              id="signal-add-sender_addresses"
              name="sender_addresses"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-sender_domains" tip={SIGNAL_FIELD_TIPS.sender_domains}>
              Sender domains (optional, e.g. casino.com)
            </LabelWithTip>
            <textarea
              id="signal-add-sender_domains"
              name="sender_domains"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-subject_keywords" tip={SIGNAL_FIELD_TIPS.subject_keywords}>
              Subject keywords (optional)
            </LabelWithTip>
            <textarea
              id="signal-add-subject_keywords"
              name="subject_keywords"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-keywords" tip={SIGNAL_FIELD_TIPS.keywords}>
              Signal keywords (comma or newline)
            </LabelWithTip>
            <textarea
              id="signal-add-keywords"
              name="keywords"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-deal_unit_tokens" tip={SIGNAL_FIELD_TIPS.deal_unit_tokens}>
              Deal unit tokens (optional, comma or newline)
            </LabelWithTip>
            <textarea
              id="signal-add-deal_unit_tokens"
              name="deal_unit_tokens"
              rows={2}
              placeholder="e.g. $, SC, FP"
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-lookback_window_hours" tip={SIGNAL_FIELD_TIPS.lookback_window_hours}>
              Lookback window (hours)
            </LabelWithTip>
            <input
              id="signal-add-lookback_window_hours"
              name="lookback_window_hours"
              type="number"
              min={1}
              max={2160}
              defaultValue={168}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="signal-add-scan_body"
              type="checkbox"
              name="scan_body"
              defaultChecked
              className="h-4 w-4 shrink-0"
            />
            <LabelWithTip htmlFor="signal-add-scan_body" tip={SIGNAL_FIELD_TIPS.scan_body}>
              Scan body
            </LabelWithTip>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="signal-add-ai_summary_enabled"
              type="checkbox"
              name="ai_summary_enabled"
              defaultChecked
              className="h-4 w-4 shrink-0"
            />
            <LabelWithTip htmlFor="signal-add-ai_summary_enabled" tip={SIGNAL_FIELD_TIPS.ai_summary_enabled}>
              AI email summary
            </LabelWithTip>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="signal-add-enabled"
              type="checkbox"
              name="enabled"
              defaultChecked
              className="h-4 w-4 shrink-0"
            />
            <LabelWithTip htmlFor="signal-add-enabled" tip={SIGNAL_FIELD_TIPS.enabled}>
              Enabled
            </LabelWithTip>
          </div>
          <button type="submit" className="w-fit rounded bg-[var(--accent)] px-4 py-2 font-medium text-white">
            Save signal
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configured signals</h2>
        <ul className="space-y-4">
          {signals.map((s) => {
            const p = `signal-edit-${s.id}`;
            return (
              <li key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {s.enabled ? "Enabled" : "Disabled"} · {s.id}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Account: {s.config.email_address} · lookback {s.config.lookback_window_hours}h
                    </p>
                  </div>
                  <form action={deleteSignalAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-sm text-red-400 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--accent)]">Edit</summary>
                  <form action={saveSignalAction} className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 text-sm">
                    <input type="hidden" name="id" value={s.id} />
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-vertical_id`} tip={SIGNAL_FIELD_TIPS.vertical_id}>
                        Vertical
                      </LabelWithTip>
                      <select
                        id={`${p}-vertical_id`}
                        name="vertical_id"
                        required
                        defaultValue={s.vertical_id}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      >
                        {verticals.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-name`} tip={SIGNAL_FIELD_TIPS.name}>
                        Name
                      </LabelWithTip>
                      <input
                        id={`${p}-name`}
                        name="name"
                        defaultValue={s.name}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-email_address`} tip={SIGNAL_FIELD_TIPS.email_address}>
                        Gmail email
                      </LabelWithTip>
                      <input
                        id={`${p}-email_address`}
                        name="email_address"
                        type="email"
                        defaultValue={s.config.email_address}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-labels`} tip={SIGNAL_FIELD_TIPS.labels}>
                        Labels
                      </LabelWithTip>
                      <textarea
                        id={`${p}-labels`}
                        name="labels"
                        rows={2}
                        defaultValue={(s.config.labels ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-sender_addresses`} tip={SIGNAL_FIELD_TIPS.sender_addresses}>
                        Sender addresses
                      </LabelWithTip>
                      <textarea
                        id={`${p}-sender_addresses`}
                        name="sender_addresses"
                        rows={2}
                        defaultValue={(s.config.sender_addresses ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-sender_domains`} tip={SIGNAL_FIELD_TIPS.sender_domains}>
                        Sender domains
                      </LabelWithTip>
                      <textarea
                        id={`${p}-sender_domains`}
                        name="sender_domains"
                        rows={2}
                        defaultValue={(s.config.sender_domains ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-subject_keywords`} tip={SIGNAL_FIELD_TIPS.subject_keywords}>
                        Subject keywords
                      </LabelWithTip>
                      <textarea
                        id={`${p}-subject_keywords`}
                        name="subject_keywords"
                        rows={2}
                        defaultValue={(s.config.subject_keywords ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-keywords`} tip={SIGNAL_FIELD_TIPS.keywords}>
                        Keywords
                      </LabelWithTip>
                      <textarea
                        id={`${p}-keywords`}
                        name="keywords"
                        rows={2}
                        defaultValue={s.keywords.join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-deal_unit_tokens`} tip={SIGNAL_FIELD_TIPS.deal_unit_tokens}>
                        Deal unit tokens
                      </LabelWithTip>
                      <textarea
                        id={`${p}-deal_unit_tokens`}
                        name="deal_unit_tokens"
                        rows={2}
                        defaultValue={(s.config.deal_unit_tokens ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-lookback_window_hours`} tip={SIGNAL_FIELD_TIPS.lookback_window_hours}>
                        Lookback (hours)
                      </LabelWithTip>
                      <input
                        id={`${p}-lookback_window_hours`}
                        name="lookback_window_hours"
                        type="number"
                        min={1}
                        max={2160}
                        defaultValue={s.config.lookback_window_hours}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${p}-scan_body`}
                        type="checkbox"
                        name="scan_body"
                        defaultChecked={s.config.scan_body}
                        className="h-4 w-4 shrink-0"
                      />
                      <LabelWithTip htmlFor={`${p}-scan_body`} tip={SIGNAL_FIELD_TIPS.scan_body}>
                        Scan body
                      </LabelWithTip>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${p}-ai_summary_enabled`}
                        type="checkbox"
                        name="ai_summary_enabled"
                        defaultChecked={s.config.ai_summary_enabled !== false}
                        className="h-4 w-4 shrink-0"
                      />
                      <LabelWithTip htmlFor={`${p}-ai_summary_enabled`} tip={SIGNAL_FIELD_TIPS.ai_summary_enabled}>
                        AI email summary
                      </LabelWithTip>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${p}-enabled`}
                        type="checkbox"
                        name="enabled"
                        defaultChecked={s.enabled}
                        className="h-4 w-4 shrink-0"
                      />
                      <LabelWithTip htmlFor={`${p}-enabled`} tip={SIGNAL_FIELD_TIPS.enabled}>
                        Enabled
                      </LabelWithTip>
                    </div>
                    <button type="submit" className="w-fit rounded bg-[var(--accent)] px-3 py-1 text-white">
                      Update
                    </button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
