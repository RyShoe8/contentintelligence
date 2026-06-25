import Link from "next/link";
import {
  ensureIndexes,
  listContentSignals,
  listVoices,
  listSavedWriterArticlesByOrg,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard",
};

// ── Stat Card ──────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  href,
  color = "primary",
}: {
  label: string;
  value: number | string;
  icon: string;
  href: string;
  color?: "primary" | "accent" | "success" | "warning";
}) {
  const colorMap = {
    primary: "text-[var(--primary)] bg-[var(--primary-dim)]",
    accent:  "text-[var(--accent)] bg-[var(--accent-dim)]",
    success: "text-[var(--success)] bg-[var(--success-bg)]",
    warning: "text-[var(--warning)] bg-[var(--warning-bg)]",
  };

  return (
    <Link
      href={href}
      className="ui-card-hover group block p-5 animate-fade-in"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--fg)]">{value}</p>
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${colorMap[color]}`}
        >
          {icon}
        </span>
      </div>
    </Link>
  );
}

// ── Quick Access Card ──────────────────────────────────────────
function QuickCard({
  title,
  description,
  href,
  icon,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
  cta: string;
}) {
  return (
    <Link href={href} className="ui-card-hover group flex flex-col gap-3 p-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-lg">
          {icon}
        </span>
        <h3 className="font-semibold text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors">
          {title}
        </h3>
      </div>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{description}</p>
      <span className="mt-auto text-xs font-medium text-[var(--primary)]">
        {cta} →
      </span>
    </Link>
  );
}

// ── Launch Banner ──────────────────────────────────────────────
function LaunchBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 md:p-8 animate-fade-in"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(0,212,200,0.08) 100%)",
        borderColor: "rgba(99,102,241,0.3)",
      }}
    >
      {/* Background glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
      />
      <div className="pointer-events-none absolute -bottom-8 left-32 h-48 w-48 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
      />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
            Get started fast
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--fg)] md:text-2xl">
            Launch your content engine
          </h2>
          <p className="mt-2 max-w-lg text-sm text-[var(--fg-secondary)] leading-relaxed">
            One guided flow: set your voice, define a topic, pull your first content, and generate
            social drafts + a full article — all in under 5 minutes.
          </p>
        </div>
        <Link
          href="/launch"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all"
          style={{
            background: "linear-gradient(135deg, var(--primary), #7c3aed)",
            boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
          }}
        >
          <span>▶</span> Launch wizard
        </Link>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default async function DashboardPage() {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const [topics, voices, articles] = await Promise.all([
    listContentSignals(db, { organizationId: orgId }),
    listVoices(db, orgId),
    listSavedWriterArticlesByOrg(db, orgId, "compose"),
  ]);

  const activeTopics  = topics.filter((t) => t.active).length;
  const voicesReady   = voices.filter((v) => v.persona_status === "ready").length;
  const articlesDraft = articles.filter((a) => a.status === "draft").length;

  // Show launch banner if user hasn't fully set up yet
  const isNewUser = voices.length === 0 || topics.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Welcome back"
        title="Dashboard"
        description="Your content intelligence hub."
      />

      {/* Launch banner for new users */}
      {isNewUser && <LaunchBanner />}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Topics"
          value={activeTopics}
          icon="📡"
          href="/topics"
          color="primary"
        />
        <StatCard
          label="Brand Voices"
          value={voicesReady}
          icon="🎙️"
          href="/voices"
          color="accent"
        />
        <StatCard
          label="Articles"
          value={articlesDraft}
          icon="✍️"
          href="/studio"
          color="success"
        />
        <StatCard
          label="Topics Total"
          value={topics.length}
          icon="📊"
          href="/topics"
          color="warning"
        />
      </div>

      {/* Quick Access */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-[var(--fg-secondary)]">Quick access</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickCard
            title="Topics"
            description="Define the topics you track and connect your content sources."
            href="/topics"
            icon="📡"
            cta="Manage topics"
          />
          <QuickCard
            title="Signal Feed"
            description="Browse and filter content items pulled from your sources."
            href="/feed"
            icon="📬"
            cta="View feed"
          />
          <QuickCard
            title="Social Drafts"
            description="AI-generated social posts ready to copy and publish."
            href="/posts"
            icon="💬"
            cta="View drafts"
          />
          <QuickCard
            title="Article Studio"
            description="Compose researched articles or rewrite content in your voice."
            href="/studio"
            icon="✍️"
            cta="Open studio"
          />
        </div>
      </div>

      {/* Setup status for new users */}
      {isNewUser && (
        <div className="ui-card p-5 animate-fade-in">
          <h2 className="mb-4 text-base font-semibold text-[var(--fg)]">Setup checklist</h2>
          <div className="space-y-3">
            {[
              {
                done: voices.length > 0,
                label: "Create your first voice",
                href: "/voices",
                detail: "Define your brand's writing style, tone, and persona.",
              },
              {
                done: topics.length > 0,
                label: "Create a topic",
                href: "/topics",
                detail: "Set up what content you want to track and from where.",
              },
              {
                done: false,
                label: "Connect a content source",
                href: "/topics",
                detail: "Add Gmail or website URLs to start pulling content.",
              },
              {
                done: false,
                label: "Run your first feed",
                href: "/feed",
                detail: "Sync your sources and see what content comes in.",
              },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? "bg-[var(--success-bg)] text-[var(--success)]"
                    : "bg-[var(--surface-raised)] text-[var(--muted)]"
                }`}>
                  {step.done ? "✓" : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={step.href}
                    className={`text-sm font-medium transition-colors ${
                      step.done
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--fg)] hover:text-[var(--primary)]"
                    }`}
                  >
                    {step.label}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">{step.detail}</p>
                </div>
                {!step.done && (
                  <Link href={step.href} className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline">
                    Go →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
