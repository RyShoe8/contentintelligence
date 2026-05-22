"use client";

import { useState } from "react";
import { sanitizeIngestError } from "@/lib/ingest-response";

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

type Props = {
  contentSignalId: string;
  disabled?: boolean;
  className?: string;
};

function formatSyncResult(stats: IngestStats): { status: "ok" | "err"; message: string } {
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
    message: `Sync finished: ${listed} listed, ${stored} stored.`,
  };
}

export function GmailSyncButton({ contentSignalId, disabled, className }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setStatus("loading");
    setMessage("");
    try {
      const r = await fetch("/api/worker/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_signal_id: contentSignalId }),
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & IngestStats;
      if (!r.ok) {
        setStatus("err");
        setMessage(sanitizeIngestError(data.error ?? data.message ?? `HTTP ${r.status}`));
        return;
      }
      if (data.accepted === true) {
        setStatus("ok");
        setMessage(
          typeof data.message === "string"
            ? data.message
            : "Sync started in the background. Refresh the feed in a minute to see new items.",
        );
        return;
      }
      const result = formatSyncResult(data);
      setStatus(result.status);
      setMessage(result.message);
    } catch {
      setStatus("err");
      setMessage("Request failed");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled || status === "loading"}
        onClick={run}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Syncing…" : "Sync now"}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === "err" ? "text-red-400" : "text-[var(--muted)]"}`}>{message}</p>
      ) : null}
    </div>
  );
}
