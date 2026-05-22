import Link from "next/link";
import {
  ensureIndexes,
  getGmailOAuth,
  listContentSignals,
  listSources,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Getting started",
};

export default async function GettingStartedPage() {
  const db = await connectMongo();
  await ensureIndexes(db);
  const contentSignals = await listContentSignals(db);
  const sources = await listSources(db);
  const inboxEmails = [...new Set(sources.map((s) => s.config.email_address).filter(Boolean))].sort();
  const inboxStatus = await Promise.all(
    inboxEmails.map(async (email) => {
      const doc = await getGmailOAuth(db, email);
      return { email, connected: !!doc?.refresh_token };
    }),
  );

  const gmailOAuthConfigured = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI
  );
  const allConnected = inboxStatus.length > 0 && inboxStatus.every((r) => r.connected);
  const firstSignalId = contentSignals[0]?.id;

  const steps = [
    {
      title: "Create a content signal",
      done: contentSignals.length > 0,
      href: "/content-signals",
      body: "Set keywords, lookback window, and deal unit tokens for a topic you track.",
    },
    {
      title: "Add email sources",
      done: sources.length > 0,
      href: firstSignalId ? `/content-signals/${firstSignalId}` : "/content-signals",
      body: "On each content signal, add Gmail sources (labels, senders) and connect the inbox.",
    },
    {
      title: "Connect Gmail per source",
      done: inboxStatus.length === 0 ? false : allConnected,
      href: firstSignalId ? `/content-signals/${firstSignalId}` : "/content-signals",
      body: "Open each source editor and use Connect Gmail so tokens are stored for the worker.",
    },
    {
      title: "Sync and review on the feed",
      done: false,
      href: firstSignalId ? `/feed?content_signal_id=${firstSignalId}` : "/feed",
      body: "Select a content signal on the feed, run Sync now, then filter results.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Getting started</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Content signals define what to look for; sources are Gmail inboxes that supply mail.
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
                Continue →
              </Link>
            </div>
          </li>
        ))}
      </ol>

      {!gmailOAuthConfigured ? (
        <p className="text-sm text-amber-200/90">
          Set <code className="text-[var(--fg)]">GMAIL_CLIENT_*</code> and{" "}
          <code className="text-[var(--fg)]">GMAIL_REDIRECT_URI</code> on Vercel to enable Connect Gmail.
        </p>
      ) : null}
    </div>
  );
}
