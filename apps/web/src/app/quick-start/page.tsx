import Link from "next/link";
import {
  ensureIndexes,
  getGmailOAuth,
  listContentSignals,
  listSources,
  listVoices,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quick Start",
  description: "Get up and running with Content Intelligence in a few steps.",
};

export default async function QuickStartPage() {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const [contentSignals, voices] = await Promise.all([
    listContentSignals(db, { organizationId: orgId }),
    listVoices(db, orgId),
  ]);

  const signalIds = new Set(contentSignals.map((s) => s.id));
  const sources = (await listSources(db)).filter((s) =>
    signalIds.has(s.content_signal_id),
  );

  const inboxEmails = [
    ...new Set(
      sources.map((s) => s.config.email_address).filter(Boolean),
    ),
  ].sort();

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

  const allConnected =
    inboxStatus.length > 0 && inboxStatus.every((r) => r.connected);
  const firstSignalId = contentSignals[0]?.id;

  type Step = {
    title: string;
    done: boolean;
    href: string;
    body: string;
  };

  const steps: Step[] = [
    {
      title: "Set up your voice",
      done: voices.length > 0,
      href: "/voices",
      body: "Create a brand voice persona so your articles reflect your unique tone and style.",
    },
    {
      title: "Create a content signal",
      done: contentSignals.length > 0,
      href: "/content-signals",
      body: "Set keywords, lookback window, and deal unit tokens for a topic you track.",
    },
    {
      title: "Add email sources",
      done: sources.length > 0,
      href: firstSignalId
        ? `/content-signals/${firstSignalId}`
        : "/content-signals",
      body: "On each content signal, add Gmail sources (labels, senders) and connect the inbox.",
    },
    {
      title: "Connect Gmail per source",
      done: inboxStatus.length === 0 ? false : allConnected,
      href: firstSignalId
        ? `/content-signals/${firstSignalId}`
        : "/content-signals",
      body: "Open each source editor and use Connect Gmail so tokens are stored for the worker.",
    },
    {
      title: "Sync and review on the feed",
      // Can't auto-detect whether user has reviewed; mark actionable when sources exist and Gmail connected
      done: false,
      href: firstSignalId
        ? `/feed?content_signal_id=${firstSignalId}`
        : "/feed",
      body: "Select a content signal on the feed, run Sync now, then filter results.",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const isSetupComplete = completedCount === totalCount;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          Setup Guide
        </p>
        <h1 className="text-3xl font-bold tracking-tight gradient-text">
          Quick Start
        </h1>
        <p className="text-sm text-[var(--fg-secondary)]">
          Get up and running with Content Intelligence in a few steps.
        </p>
      </div>

      {/* Launch Wizard CTA */}
      {!isSetupComplete && (
        <div className="ui-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between animate-scale-in">
          <div className="space-y-0.5">
            <p className="font-semibold text-[var(--fg)]">
              🚀 Not sure where to start?
            </p>
            <p className="text-sm text-[var(--fg-secondary)]">
              The Launch Wizard walks you through setup step by step.
            </p>
          </div>
          <Link
            href="/launch"
            className="ui-btn-primary shrink-0 text-sm"
            id="launch-wizard-cta"
          >
            Try the Launch Wizard →
          </Link>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>
            {completedCount} of {totalCount} steps complete
          </span>
          <span>{progressPct}%</span>
        </div>
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ background: "var(--surface-raised)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, var(--primary), var(--accent))",
            }}
          />
        </div>
      </div>

      {/* Timeline steps */}
      <ol className="relative space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={step.title} className="flex gap-4">
              {/* Spine */}
              <div className="flex flex-col items-center">
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300",
                    step.done
                      ? "bg-[var(--success-bg,rgba(34,197,94,0.15))] text-[var(--success,#22c55e)]"
                      : "bg-[var(--surface-raised)] text-[var(--muted)]",
                  ].join(" ")}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                {!isLast && (
                  <div
                    className="w-px flex-1 my-1"
                    style={{
                      background: step.done
                        ? "rgba(34,197,94,0.3)"
                        : "var(--border)",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={["min-w-0 flex-1 pb-6", isLast ? "" : ""].join(" ")}>
                <div className="ui-card p-4 space-y-2 text-sm">
                  <p
                    className={[
                      "font-semibold",
                      step.done
                        ? "text-[var(--success,#22c55e)]"
                        : "text-[var(--fg)]",
                    ].join(" ")}
                  >
                    {step.title}
                    {step.done && (
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        Done
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--fg-secondary)]">{step.body}</p>
                  <Link
                    href={step.href}
                    className={[
                      "inline-block font-medium transition-colors",
                      step.done
                        ? "text-[var(--muted)] hover:text-[var(--fg)]"
                        : "text-[var(--accent)] hover:underline",
                    ].join(" ")}
                    id={`step-${i}-link`}
                  >
                    {step.done ? "Review →" : "Continue →"}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Gmail OAuth warning */}
      {!gmailOAuthConfigured && (
        <p className="text-sm text-amber-200/90">
          Set{" "}
          <code className="text-[var(--fg)]">GMAIL_CLIENT_*</code> and{" "}
          <code className="text-[var(--fg)]">GMAIL_REDIRECT_URI</code> on Vercel
          to enable Connect Gmail.
        </p>
      )}
    </div>
  );
}
