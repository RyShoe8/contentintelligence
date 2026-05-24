"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
};

type Props = {
  contentSignalId: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  progressMessage?: string;
  successSuffix?: string;
};

function formatSyncResult(
  stats: IngestStats,
  successSuffix?: string,
): { status: "ok" | "err"; message: string } {
  const listed = stats.messagesListed ?? 0;
  const stored = (stats.storedFull ?? 0) + (stats.storedMinimal ?? 0);
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

  return {
    status: "ok",
    message: `Sync finished: ${listed} listed, ${stored} stored.${successSuffix ?? ""}`,
  };
}

export function GmailSyncButton({
  contentSignalId,
  disabled,
  className,
  label = "Sync now",
  busyLabel = "Syncing…",
  progressMessage = "Sync in progress…",
  successSuffix,
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
        const result = formatSyncResult(statusData.stats, successSuffix);
        setStatus(result.status);
        setMessage(result.message);
      } else if (statusData.error) {
        setStatus("err");
        setMessage(sanitizeIngestError(statusData.error));
      } else {
        setStatus("ok");
        setMessage(`Feed updated.${successSuffix ?? ""}`);
      }
    },
    [router, stopPolling, successSuffix],
  );

  const startPolling = useCallback(() => {
    stopPolling();
    setStatus("loading");
    setMessage(progressMessage);
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
        if (data.running === false) {
          finishPolling(data);
        }
      } catch {
        // keep polling on transient network errors
      }
    };

    void tick();
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
  }, [finishPolling, progressMessage, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function run() {
    setStatus("loading");
    setMessage("");
    stopPolling();
    try {
      const r = await fetch("/api/worker/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_signal_id: contentSignalId }),
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & IngestStats;

      if (r.status === 409) {
        startPolling();
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
      <button
        type="button"
        disabled={disabled || busy}
        onClick={run}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? busyLabel : label}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === "err" ? "text-red-400" : "text-[var(--muted)]"}`}>{message}</p>
      ) : null}
    </div>
  );
}
