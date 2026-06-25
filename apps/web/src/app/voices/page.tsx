import Link from "next/link";
import {
  ensureIndexes,
  listVoices,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import { shouldPollPersona } from "./persona-poll";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

function personaStatusDot(status: string, inProgress?: boolean) {
  if (inProgress || status === "pending") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] animate-pulse"
        title="Generating persona…"
      />
    );
  }
  if (status === "ready") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
        title="Persona ready"
      />
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-red-400"
        title="Persona failed"
      />
    );
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-[var(--muted)]"
      title="No persona"
    />
  );
}

function personaStatusLabel(status: string, inProgress?: boolean): string {
  if (inProgress) return "Generating…";
  if (status === "ready") return "Persona ready";
  if (status === "failed") return "Persona failed";
  return "No persona";
}

export default async function VoicesHubPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const voices = await listVoices(db, orgId);

  return (
    <div className="animate-fade-in space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="My Voice"
          description="Your brand voices shape how content is written, posted, and styled."
        />
        <Link
          href="/voices/new"
          className="ui-btn-primary shrink-0 self-start px-5 py-2.5 text-sm font-semibold"
        >
          + New Voice
        </Link>
      </div>

      {sp.deleted === "1" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--muted)]">
          Voice deleted.
        </div>
      )}

      {/* Voice Grid */}
      {voices.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {voices.map((v) => {
            const inProgress =
              shouldPollPersona(v, undefined) &&
              v.persona_status === "pending";
            const keywordsPreview = v.keywords.slice(0, 4);

            return (
              <div
                key={v.id}
                className="group relative flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all duration-200 hover:border-[var(--primary)]/50 hover:shadow-lg hover:shadow-[var(--primary)]/5"
              >
                {/* Name + persona status */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)]/20 to-[var(--accent)]/20 text-lg font-bold text-[var(--primary)]">
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {personaStatusDot(v.persona_status, inProgress)}
                      <h3 className="truncate font-semibold text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors">
                        {v.name}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {personaStatusLabel(v.persona_status, inProgress)}
                    </p>
                  </div>
                </div>

                {/* Keywords preview */}
                {keywordsPreview.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {keywordsPreview.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--fg-secondary)]"
                      >
                        {kw}
                      </span>
                    ))}
                    {v.keywords.length > 4 && (
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--muted)]">
                        +{v.keywords.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                  {v.content_signal_ids.length > 0 && (
                    <span>
                      {v.content_signal_ids.length} linked topic
                      {v.content_signal_ids.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {v.website_url && (
                    <span className="truncate">
                      {new URL(v.website_url).hostname}
                    </span>
                  )}
                </div>

                {/* Edit button */}
                <div className="mt-auto border-t border-[var(--border)] pt-3">
                  <Link
                    href={`/voices/${v.id}`}
                    className="ui-btn-secondary block w-full px-4 py-2 text-center text-sm font-medium"
                  >
                    Edit Voice
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
            <svg
              className="h-7 w-7 text-[var(--primary)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-[var(--fg)]">
            No voices yet
          </h3>
          <p className="mb-6 text-sm text-[var(--muted)]">
            Create your first brand voice to shape how content is written and styled.
          </p>
          <Link href="/voices/new" className="ui-btn-primary px-5 py-2.5 text-sm">
            + New Voice
          </Link>
        </div>
      )}
    </div>
  );
}
