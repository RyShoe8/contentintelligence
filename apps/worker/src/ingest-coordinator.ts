import type { IngestStats } from "./ingest.js";

export type PostsSyncResultSnapshot = {
  created?: number;
  updated?: number;
  archived?: number;
  skipped?: number;
  regenerated?: number;
};

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
  posts_sync_result: PostsSyncResultSnapshot | null;
};

export type IngestCoordinatorDeps = {
  runIngest: (contentSignalId?: string) => Promise<IngestStats>;
  runPostsSync: (contentSignalId: string, regeneratePosts: boolean) => Promise<unknown>;
  log: (step: string, data: Record<string, unknown>) => void;
  onError: (err: unknown) => void;
};

function parsePostsSyncResult(value: unknown): PostsSyncResultSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const result: PostsSyncResultSnapshot = {};
  if (typeof o.created === "number") result.created = o.created;
  if (typeof o.updated === "number") result.updated = o.updated;
  if (typeof o.archived === "number") result.archived = o.archived;
  if (typeof o.skipped === "number") result.skipped = o.skipped;
  if (typeof o.regenerated === "number") result.regenerated = o.regenerated;
  return Object.keys(result).length ? result : null;
}

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
    posts_sync_result: null,
  };
}

export function createIngestCoordinator(deps: IngestCoordinatorDeps) {
  let ingestInFlight: Promise<IngestStats> | null = null;
  let ingestStatus: IngestStatusSnapshot = createInitialIngestStatus();

  const postsSyncFields = (status: IngestStatusSnapshot) => ({
    posts_sync_running: status.posts_sync_running,
    posts_sync_content_signal_id: status.posts_sync_content_signal_id,
    posts_sync_error: status.posts_sync_error,
    posts_sync_result: status.posts_sync_result,
  });

  const runPostsSyncInBackgroundBatch = async (contentSignalIds: string[], regeneratePosts: boolean) => {
    ingestStatus = {
      ...ingestStatus,
      posts_sync_running: true,
      posts_sync_error: null,
      posts_sync_result: null,
    };
    for (const id of contentSignalIds) {
      ingestStatus = {
        ...ingestStatus,
        posts_sync_content_signal_id: id,
      };
      try {
        const postStats = await deps.runPostsSync(id, regeneratePosts);
        const result = parsePostsSyncResult(postStats);
        deps.log("posts_sync_after_ingest", {
          contentSignalId: id,
          ...(result ?? {}),
        });
        ingestStatus = {
          ...ingestStatus,
          posts_sync_result: result,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        deps.log("posts_sync_error", { contentSignalId: id, message });
        deps.onError(e);
        ingestStatus = {
          ...ingestStatus,
          posts_sync_error: message,
        };
      }
    }
    ingestStatus = {
      ...ingestStatus,
      posts_sync_running: false,
      posts_sync_content_signal_id: null,
    };
  };

  const runPostsSyncInBackground = (contentSignalId: string, regeneratePosts: boolean) => {
    void runPostsSyncInBackgroundBatch([contentSignalId], regeneratePosts);
  };

  const startIngest = (
    contentSignalId: string | undefined,
    source: "http_post" | "cron" | "schedule",
    regeneratePosts = false,
  ) => {
    const preservePostsSync = ingestStatus.posts_sync_running;
    const preserved = preservePostsSync ? postsSyncFields(ingestStatus) : postsSyncFields(createInitialIngestStatus());

    ingestStatus = {
      running: true,
      content_signal_id: contentSignalId ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
      stats: null,
      error: null,
      ...preserved,
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
          ...postsSyncFields(ingestStatus),
        };
        const idsToSync = contentSignalId ? [contentSignalId] : (stats.completedSignalIds ?? []);
        if (idsToSync.length > 0 && !ingestStatus.posts_sync_running) {
          void runPostsSyncInBackgroundBatch(idsToSync, regeneratePosts);
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
          ...postsSyncFields(ingestStatus),
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
