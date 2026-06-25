export const INGEST_POLL_INTERVAL_MS = 3000;
export const INGEST_POLL_TIMEOUT_MS = 15 * 60 * 1000;

export type IngestSourceError = {
  sourceId?: string;
  email_address?: string;
  error?: string;
};

export type IngestStats = {
  messagesListed?: number;
  storedFull?: number;
  storedMinimal?: number;
  updatedFull?: number;
  sourceErrors?: IngestSourceError[];
  signalErrors?: IngestSourceError[];
};

export type PostsSyncResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  archived?: number;
};

export type IngestStatusResponse = {
  running?: boolean;
  content_signal_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  stats?: IngestStats | null;
  error?: string | null;
  posts_sync_running?: boolean;
  posts_sync_content_signal_id?: string | null;
  posts_sync_error?: string | null;
  posts_sync_result?: PostsSyncResult | null;
};

export function statusAppliesToSignal(data: IngestStatusResponse, contentSignalId: string): boolean {
  if (data.content_signal_id == null) return true;
  return data.content_signal_id === contentSignalId;
}

export function postsSyncAppliesToSignal(
  data: IngestStatusResponse,
  contentSignalId: string,
): boolean {
  const id = data.posts_sync_content_signal_id;
  if (id == null) return true;
  return id === contentSignalId;
}

export function isPostsSyncRunningForSignal(
  data: IngestStatusResponse,
  contentSignalId: string,
): boolean {
  return Boolean(data.posts_sync_running && postsSyncAppliesToSignal(data, contentSignalId));
}

export function isIngestRunningForSignal(
  data: IngestStatusResponse,
  contentSignalId: string,
): boolean {
  return Boolean(data.running && statusAppliesToSignal(data, contentSignalId));
}

export function isSyncInProgressForSignal(
  data: IngestStatusResponse,
  contentSignalId: string,
): boolean {
  return (
    isIngestRunningForSignal(data, contentSignalId) ||
    isPostsSyncRunningForSignal(data, contentSignalId)
  );
}

export function isSyncComplete(data: IngestStatusResponse, contentSignalId: string): boolean {
  if (data.running) return false;
  if (!statusAppliesToSignal(data, contentSignalId)) return false;
  if (data.posts_sync_running && postsSyncAppliesToSignal(data, contentSignalId)) {
    return false;
  }
  return true;
}

export async function fetchIngestStatus(): Promise<IngestStatusResponse | null> {
  try {
    const r = await fetch("/api/worker/ingest/status");
    const data = (await r.json().catch(() => ({}))) as IngestStatusResponse;
    if (!r.ok) return null;
    return data;
  } catch {
    return null;
  }
}
