import type { IngestStats } from "./ingest.js";

export type IngestStatusSnapshot = {
  running: boolean;
  content_signal_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  stats: IngestStats | null;
  error: string | null;
  posts_sync_running: boolean;
  posts_sync_content_signal_id: string | null;
  posts_sync_error: string | null;
};

export type IngestCoordinatorDeps = {
  runIngest: (contentSignalId?: string) => Promise<IngestStats>;
  runPostsSync: (contentSignalId: string, regeneratePosts: boolean) => Promise<unknown>;
  log: (step: string, data: Record<string, unknown>) => void;
  onError: (err: unknown) => void;
};

export function createInitialIngestStatus(): IngestStatusSnapshot {
  return {
    running: false,
    content_signal_id: null,
    started_at: null,
    finished_at: null,
    stats: null,
    error: null,
    posts_sync_running: false,
    posts_sync_content_signal_id: null,
    posts_sync_error: null,
  };
}

export function createIngestCoordinator(deps: IngestCoordinatorDeps) {
  let ingestInFlight: Promise<IngestStats> | null = null;
  let ingestStatus: IngestStatusSnapshot = createInitialIngestStatus();

  const runPostsSyncInBackground = (contentSignalId: string, regeneratePosts: boolean) => {
    ingestStatus = {
      ...ingestStatus,
      posts_sync_running: true,
      posts_sync_content_signal_id: contentSignalId,
      posts_sync_error: null,
    };
    void deps
      .runPostsSync(contentSignalId, regeneratePosts)
      .then((postStats) => {
        deps.log("posts_sync_after_ingest", {
          contentSignalId,
          ...(typeof postStats === "object" && postStats ? postStats : {}),
        });
        ingestStatus = {
          ...ingestStatus,
          posts_sync_running: false,
          posts_sync_content_signal_id: null,
          posts_sync_error: null,
        };
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        deps.log("posts_sync_error", { contentSignalId, message });
        deps.onError(e);
        ingestStatus = {
          ...ingestStatus,
          posts_sync_running: false,
          posts_sync_content_signal_id: null,
          posts_sync_error: message,
        };
      });
  };

  const startIngest = (
    contentSignalId: string | undefined,
    source: "http_post" | "cron" | "schedule",
    regeneratePosts = false,
  ) => {
    ingestStatus = {
      running: true,
      content_signal_id: contentSignalId ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
      stats: null,
      error: null,
      posts_sync_running: false,
      posts_sync_content_signal_id: null,
      posts_sync_error: null,
    };
    ingestInFlight = deps
      .runIngest(contentSignalId)
      .then((stats) => {
        deps.log("ingest_response", { source, contentSignalId: contentSignalId ?? null, ...stats });
        ingestStatus = {
          running: false,
          content_signal_id: contentSignalId ?? null,
          started_at: ingestStatus.started_at,
          finished_at: new Date().toISOString(),
          stats,
          error: null,
          posts_sync_running: ingestStatus.posts_sync_running,
          posts_sync_content_signal_id: ingestStatus.posts_sync_content_signal_id,
          posts_sync_error: ingestStatus.posts_sync_error,
        };
        if (contentSignalId) {
          runPostsSyncInBackground(contentSignalId, regeneratePosts);
        }
        return stats;
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        deps.log("ingest_fatal", { source, message });
        deps.onError(e);
        ingestStatus = {
          running: false,
          content_signal_id: contentSignalId ?? null,
          started_at: ingestStatus.started_at,
          finished_at: new Date().toISOString(),
          stats: null,
          error: message,
          posts_sync_running: false,
          posts_sync_content_signal_id: null,
          posts_sync_error: null,
        };
        throw e;
      })
      .finally(() => {
        ingestInFlight = null;
      });
    return ingestInFlight;
  };

  return {
    startIngest,
    startPostsSync: runPostsSyncInBackground,
    getStatus: () => ingestStatus,
    isInFlight: () => ingestInFlight !== null,
  };
}
