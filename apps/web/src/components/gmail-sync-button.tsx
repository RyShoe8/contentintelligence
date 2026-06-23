"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { sanitizeIngestError } from "@/lib/ingest-response";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

type IngestSourceError = {
  sourceId?: string;
  email_address?: string;
  error?: string;
};

type IngestStats = {
  messagesListed?: number;
  storedFull?: number;
  storedMinimal?: number;
  updatedFull?: number;
  sourceErrors?: IngestSourceError[];
  signalErrors?: IngestSourceError[];
};

type IngestStatusResponse = {
  running?: boolean;
  content_signal_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  stats?: IngestStats | null;
  error?: string | null;
  posts_sync_running?: boolean;
  posts_sync_content_signal_id?: string | null;
  posts_sync_error?: string | null;
};

type Props = {
  contentSignalId: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  progressMessage?: string;
  successSuffix?: string;
  regeneratePosts?: boolean;
};

function formatSyncResult(
  stats: IngestStats,
  successSuffix?: string,
  postsSyncError?: string | null,
): { status: "ok" | "err"; message: string } {
  const listed = stats.messagesListed ?? 0;
  const stored =
    (stats.storedFull ?? 0) + (stats.storedMinimal ?? 0) + (stats.updatedFull ?? 0);
  const errors = stats.sourceErrors ?? stats.signalErrors ?? [];

  if (errors.length > 0) {
    const first = errors[0];
    const detail = first?.error ?? "ingest_failed";
    const email = first?.email_address ? ` (${first.email_address})` : "";
    if (detail.includes("invalid_grant")) {
      return {
        status: "err",
        message: `Gmail authorization expired${email}. Re-connect Gmail on the source editor, then sync again.`,
      };
    }
    return {
      status: "err",
      message: `Ingest failed${email}: ${detail}`,
    };
  }

  if (listed === 0 && stored === 0) {
    return {
      status: "err",
      message:
        "Sync completed but no messages matched (0 listed). Check source labels/lookback, or re-connect Gmail.",
    };
  }

  let message = `Sync finished: ${listed} listed, ${stored} stored.${successSuffix ?? ""}`;
  if (postsSyncError) {
    message += ` Posts rebuild failed (${sanitizeIngestError(postsSyncError)}). Try Refresh posts.`;
  }
  return { status: "ok", message };
}

function statusAppliesToSignal(data: IngestStatusResponse, contentSignalId: string): boolean {
  if (data.content_signal_id == null) return true;
  return data.content_signal_id === contentSignalId;
}

function postsSyncAppliesToSignal(data: IngestStatusResponse, contentSignalId: string): boolean {
  const id = data.posts_sync_content_signal_id;
  if (id == null) return true;
  return id === contentSignalId;
}

function isSyncComplete(data: IngestStatusResponse, contentSignalId: string): boolean {
  if (data.running) return false;
  if (!statusAppliesToSignal(data, contentSignalId)) return false;
  if (data.posts_sync_running && postsSyncAppliesToSignal(data, contentSignalId)) {
    return false;
  }
  return true;
}

export function GmailSyncButton({
  contentSignalId,
  disabled,
  className,
  label = "Sync now",
  busyLabel = "Syncing…",
  progressMessage = "Sync in progress…",
  successSuffix,
  regeneratePosts,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finishPolling = useCallback(
    (statusData: IngestStatusResponse) => {
      stopPolling();
      router.refresh();
      if (statusData.stats) {
        const result = formatSyncResult(
          statusData.stats,
          successSuffix,
          statusData.posts_sync_error,
        );
        setStatus(result.status);
        setMessage(result.message);
      } else if (statusData.error) {
        setStatus("err");
        setMessage(sanitizeIngestError(statusData.error));
      } else {
        let okMessage = `Feed updated.${successSuffix ?? ""}`;
        if (statusData.posts_sync_error) {
          okMessage += ` Posts rebuild failed (${sanitizeIngestError(statusData.posts_sync_error)}). Try Refresh posts.`;
        }
        setStatus("ok");
        setMessage(okMessage);
      }
    },
    [router, stopPolling, successSuffix],
  );

  const startPolling = useCallback(
    (waitingMessage?: string) => {
      stopPolling();
      setStatus("loading");
      setMessage(waitingMessage ?? progressMessage);
      pollStartedRef.current = Date.now();

      const tick = async () => {
        if (Date.now() - pollStartedRef.current > POLL_TIMEOUT_MS) {
          stopPolling();
          setStatus("err");
          setMessage("Sync is taking longer than expected — refresh manually.");
          return;
        }
        try {
          const r = await fetch("/api/worker/ingest/status");
          const data = (await r.json().catch(() => ({}))) as IngestStatusResponse;
          if (!r.ok) return;
          if (isSyncComplete(data, contentSignalId)) {
            finishPolling(data);
            return;
          }
          if (data.posts_sync_running && postsSyncAppliesToSignal(data, contentSignalId)) {
            setMessage("Rebuilding posts…");
          } else if (data.running && data.content_signal_id && data.content_signal_id !== contentSignalId) {
            setMessage("Another sync is running — waiting…");
          }
        } catch {
          // keep polling on transient network errors
        }
      };

      void tick();
      pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
    },
    [contentSignalId, finishPolling, progressMessage, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function run() {
    setStatus("loading");
    setMessage("");
    stopPolling();
    try {
      const r = await fetch("/api/worker/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_signal_id: contentSignalId,
          ...(regeneratePosts ? { regenerate_posts: true } : {}),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & IngestStats;

      if (r.status === 409) {
        startPolling("Another sync is running — waiting…");
        return;
      }

      if (!r.ok) {
        setStatus("err");
        setMessage(sanitizeIngestError(data.error ?? data.message ?? `HTTP ${r.status}`));
        return;
      }

      if (data.accepted === true) {
        startPolling();
        return;
      }

      const result = formatSyncResult(data, successSuffix);
      setStatus(result.status);
      setMessage(result.message);
    } catch {
      setStatus("err");
      setMessage("Request failed");
    }
  }

  const busy = status === "loading";

  return (
    <div className={className}>
      <Button type="button" disabled={disabled || busy} onClick={run}>
        {busy ? busyLabel : label}
      </Button>
      {message ? (
        <Alert variant={status === "err" ? "error" : "info"} className="mt-2">
          {message}
        </Alert>
      ) : null}
    </div>
  );
}
