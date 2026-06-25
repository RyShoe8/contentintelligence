import { PostsPageClient } from "@/components/posts-page-client";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    content_signal_id?: string;
    saved?: string;
    archived?: string;
    sync_failed?: string;
    sync_in_progress?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  await requireOrgMember();
  const workerIngestConfigured = !!process.env.WORKER_URL;

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
      <PageHeader
        eyebrow="Creation"
        title="Social Drafts"
        description="AI-generated social posts from your signal feed. Set a deal threshold and your posts update automatically when the feed runs."
      />

      {sp.saved === "1" ? (
        <Alert variant="success">
          Settings saved.
          {sp.sync_failed === "1"
            ? " Post refresh failed — try Refresh posts."
            : sp.sync_in_progress === "1"
              ? " Post refresh already in progress — drafts will update shortly."
              : " Posts refreshed."}
        </Alert>
      ) : null}
      {sp.archived === "1" ? <Alert variant="info">Post dismissed.</Alert> : null}
      {errorMsg ? <Alert variant="error">{errorMsg}</Alert> : null}

      <PostsPageClient
        searchParams={{ content_signal_id: sp.content_signal_id }}
        workerIngestConfigured={workerIngestConfigured}
      />
    </div>
  );
}
