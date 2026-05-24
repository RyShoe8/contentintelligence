import Link from "next/link";
import {
  ensureIndexes,
  findVoiceForContentSignal,
  getSignalItemsByIds,
  isContentOnlyPost,
  listContentSignals,
  listPosts,
} from "@content-resourcer/db";
import { GmailSyncButton } from "@/components/gmail-sync-button";
import { CopyPostButton } from "@/components/copy-post-button";
import { DealLinkRow } from "@/components/deal-link-row";
import { DealStrengthBadge } from "@/components/deal-strength-badge";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { LocalDateTime } from "@/components/local-date-time";
import { connectMongo } from "@/lib/mongo";
import { formatDealRow } from "@/lib/deal-display";
import { requireOrgMember } from "@/lib/org-auth";
import {
  archivePostAction,
  savePostSettingsAction,
} from "./actions";
import { SCHEDULE_OPTIONS } from "./constants";

export const dynamic = "force-dynamic";

function scheduleLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "Off";
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 hour";
  if (minutes === 120) return "2 hours";
  if (minutes === 360) return "6 hours";
  if (minutes === 1440) return "24 hours";
  return `${minutes} minutes`;
}

function nextSyncLabel(
  last: Date | undefined,
  intervalMinutes: number | null | undefined,
): string {
  if (intervalMinutes == null || intervalMinutes <= 0) return "Not scheduled";
  if (!last || !Number.isFinite(last.getTime())) return "Due on next schedule tick";
  const next = new Date(last.getTime() + intervalMinutes * 60_000);
  if (next.getTime() <= Date.now()) return "Due now (waits for worker schedule tick)";
  return next.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    content_signal_id?: string;
    saved?: string;
    archived?: string;
    sync_failed?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);
  const contentSignals = await listContentSignals(db, { organizationId: orgId });
  const selectedId = sp.content_signal_id || contentSignals[0]?.id || "";
  const selectedSignal = contentSignals.find((cs) => cs.id === selectedId);
  const linkedVoice = selectedId ? await findVoiceForContentSignal(db, selectedId) : null;
  const workerIngestConfigured = !!process.env.WORKER_URL;

  const posts = selectedId
    ? await listPosts(db, {
        organizationId: orgId,
        content_signal_id: selectedId,
        status: "draft",
      })
    : [];

  const signalItemsById = await getSignalItemsByIds(
    db,
    orgId,
    posts.map((p) => p.signal_item_id),
  );

  const errorMsg =
    sp.error === "missing_signal"
      ? "Select a content signal."
      : sp.error === "not_found"
        ? "Content signal not found."
        : sp.error === "sync_failed"
          ? "Could not refresh posts. Check worker configuration."
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Posts</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Social-ready drafts from feed deals that meet your threshold. Sync on a schedule to keep
          posts updated automatically.
        </p>
      </div>

      {sp.saved === "1" ? (
        <p className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          Settings saved.
          {sp.sync_failed === "1"
            ? " Post refresh failed — try Refresh posts."
            : " Posts refreshed."}
        </p>
      ) : null}
      {sp.archived === "1" ? (
        <p className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          Post dismissed.
        </p>
      ) : null}
      {errorMsg ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {errorMsg}
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Content signal</span>
            <select
              name="content_signal_id"
              defaultValue={selectedId}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              required
            >
              {contentSignals.length === 0 ? (
                <option value="">No content signals</option>
              ) : (
                contentSignals.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            Select
          </button>
        </form>
      </section>

      {selectedId && selectedSignal ? (
        <>
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-lg font-medium">Settings for {selectedSignal.name}</h2>
            {linkedVoice ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Voice:{" "}
                <Link href={`/voices?voice_id=${linkedVoice.id}`} className="text-[var(--primary)] hover:underline">
                  {linkedVoice.name}
                </Link>
                {linkedVoice.persona_status !== "ready" ? (
                  <span className="text-amber-700">
                    {" "}
                    · Persona {linkedVoice.persona_status} — generate or edit on Voices page
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No voice linked.{" "}
                <Link href="/voices" className="text-[var(--primary)] hover:underline">
                  Create a voice
                </Link>{" "}
                and link this content signal to shape post copy.
              </p>
            )}
            <form action={savePostSettingsAction} className="mt-4 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="content_signal_id" value={selectedId} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Min Deal Strength for Auto Posts</span>
                <input
                  name="post_min_deal_pct"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={selectedSignal.post_min_deal_pct ?? 50}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Feed sync schedule</span>
                <select
                  name="ingest_interval_minutes"
                  defaultValue={
                    selectedSignal.ingest_interval_minutes == null
                      ? ""
                      : String(selectedSignal.ingest_interval_minutes)
                  }
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                >
                  <option value="">Off</option>
                  {SCHEDULE_OPTIONS.filter((m) => m != null).map((m) => (
                    <option key={m} value={m}>
                      {scheduleLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="md:col-span-2 text-xs text-[var(--muted)]">
                Last sync:{" "}
                {selectedSignal.last_ingest_completed_at ? (
                  <LocalDateTime iso={selectedSignal.last_ingest_completed_at.toISOString()} />
                ) : (
                  "Never"
                )}
                {" · "}
                Next scheduled:{" "}
                {nextSyncLabel(
                  selectedSignal.last_ingest_completed_at,
                  selectedSignal.ingest_interval_minutes,
                )}
              </p>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Save settings
                </button>
              </div>
            </form>
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <GmailSyncButton
                contentSignalId={selectedId}
                disabled={!workerIngestConfigured}
                label="Refresh posts"
                busyLabel="Refreshing…"
                progressMessage="Fetching feed and rebuilding posts…"
                successSuffix=" Posts updated."
                regeneratePosts
              />
              {!workerIngestConfigured ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable refresh.
                </p>
              ) : (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Fetches new mail into the feed, rebuilds draft posts above your threshold, and
                  rewrites all draft copy using the linked voice.
                </p>
              )}
            </div>
          </section>

          <section>
            <p className="mb-3 text-sm text-[var(--muted)]">
              {posts.length} draft {posts.length === 1 ? "post" : "posts"} · threshold{" "}
              {selectedSignal.post_min_deal_pct ?? 50}%
            </p>
            <ul className="space-y-4">
              {posts.map((post) => {
                const signalItem = signalItemsById.get(post.signal_item_id);
                const images = signalItem?.email_images;
                const dealUrl = signalItem?.original_url;
                return (
                <li
                  key={post.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            post.source === "manual" ? "badge-manual" : "badge-auto"
                          }
                        >
                          {post.source === "manual" ? "Manual" : "Auto"}
                        </span>
                        {isContentOnlyPost(post.deal_key, post.deal_metrics) ? (
                          <span className="text-xs text-[var(--muted)]">Content post</span>
                        ) : (
                          <DealStrengthBadge dealMetrics={post.deal_metrics} />
                        )}
                      </div>
                      <Link
                        href={`/feed/${post.signal_item_id}`}
                        className="mt-1 block font-medium hover:text-[var(--accent)] hover:underline"
                      >
                        {post.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {post.source_name}
                        {post.sender_from ? ` · ${post.sender_from}` : ""}
                        {post.email_sent_at
                          ? ` · ${post.email_sent_at.toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}`
                          : ""}
                      </p>
                      {!isContentOnlyPost(post.deal_key, post.deal_metrics) ? (
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          {formatDealRow(post.deal_metrics)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyPostButton text={post.social_copy} />
                      <form action={archivePostAction}>
                        <input type="hidden" name="post_id" value={post.id} />
                        <input type="hidden" name="content_signal_id" value={selectedId} />
                        <button
                          type="submit"
                          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-red-400 hover:text-red-400"
                        >
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--fg)]">
                    {post.social_copy}
                  </pre>
                  {dealUrl ? <DealLinkRow url={dealUrl} /> : null}
                  {images?.length ? <EmailImageGallery images={images} /> : null}
                </li>
              );
              })}
            </ul>
            {posts.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No posts yet. Lower the threshold, refresh posts, or add deals manually from the feed
                page.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
