import Link from "next/link";
import { ensureIndexes, getGmailOAuth, listInputSignals, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { GmailSyncButton } from "@/components/gmail-sync-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Getting started",
};

export default async function GettingStartedPage() {
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);
  const signals = await listInputSignals(db);
  const inboxEmails = [...new Set(signals.map((s) => s.config.email_address))].filter(Boolean).sort();
  const inboxStatus = await Promise.all(
    inboxEmails.map(async (email) => {
      const doc = await getGmailOAuth(db, email);
      return {
        email,
        connected: !!doc?.refresh_token,
        lastIngestError: doc?.last_ingest_error ?? null,
      };
    }),
  );

  const gmailOAuthConfigured = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI
  );
  const workerIngestConfigured = !!process.env.WORKER_URL;
  const allConnected = inboxStatus.length > 0 && inboxStatus.every((r) => r.connected);

  const steps = [
    {
      title: "Create a vertical",
      done: verticals.length > 0,
      href: "/verticals",
      body: "A vertical groups signals and supplies default keywords for filtering.",
    },
    {
      title: "Add email signals",
      done: signals.length > 0,
      href: "/signals",
      body: "Define which Gmail inbox and filters (labels, senders, keywords) feed the pipeline.",
    },
    {
      title: "Connect Gmail for each inbox",
      done: inboxStatus.length === 0 ? false : allConnected,
      href: "/signals",
      body: "Use Connect Gmail on the Email signals page so tokens are stored for the worker.",
    },
    {
      title: "Sync and review",
      done: false,
      href: "/feed",
      body: "Run Sync now (if configured) or wait for the worker cron, then open the feed.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Getting started</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Follow these steps in order. You can return here anytime from the header.
        </p>
      </div>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                step.done ? "bg-green-800/50 text-green-200" : "bg-[var(--input-bg)] text-[var(--muted)]"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-[var(--fg)]">{step.title}</p>
              <p className="text-[var(--muted)]">{step.body}</p>
              <Link className="inline-block text-[var(--accent)] hover:underline" href={step.href}>
                Go to {step.href === "/verticals" ? "Verticals" : step.href === "/signals" ? "Email signals" : "Feed"}
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-3 text-lg font-medium">Gmail connection status</h2>
        {!gmailOAuthConfigured ? (
          <p className="text-sm text-amber-200/90">
            Set <code className="text-[var(--fg)]">GMAIL_CLIENT_*</code> and{" "}
            <code className="text-[var(--fg)]">GMAIL_REDIRECT_URI</code> on Vercel to enable in-app Connect.
          </p>
        ) : inboxStatus.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Add a signal first, then connect each inbox from Email signals.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {inboxStatus.map(({ email, connected, lastIngestError }) => (
              <li key={email} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{email}</span>
                  {lastIngestError ? (
                    <a
                      className="text-[var(--accent)] hover:underline"
                      href={`/api/gmail/oauth/start?login_hint=${encodeURIComponent(email)}`}
                    >
                      Re-connect
                    </a>
                  ) : connected ? (
                    <span className="text-green-400">Connected</span>
                  ) : (
                    <a
                      className="text-[var(--accent)] hover:underline"
                      href={`/api/gmail/oauth/start?login_hint=${encodeURIComponent(email)}`}
                    >
                      Connect Gmail
                    </a>
                  )}
                </div>
                {lastIngestError ? (
                  <p className="text-xs text-red-300/90">
                    Ingest error: re-connect Gmail on Email signals if you see invalid_grant.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-sm text-[var(--muted)]">Trigger ingestion on the worker</p>
          <GmailSyncButton disabled={!workerIngestConfigured} />
          {!workerIngestConfigured ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Add <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel (Render service URL).
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
