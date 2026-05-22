"use client";

import { useState } from "react";

type IngestSignalError = {
  signalId?: string;
  email_address?: string;
  error?: string;
};

type IngestStats = {
  messagesListed?: number;
  storedFull?: number;
  storedMinimal?: number;
  signalErrors?: IngestSignalError[];
};

type Props = {
  disabled?: boolean;
  className?: string;
};

function formatSyncResult(stats: IngestStats): { status: "ok" | "err"; message: string } {
  const listed = stats.messagesListed ?? 0;
  const stored = (stats.storedFull ?? 0) + (stats.storedMinimal ?? 0);
  const errors = stats.signalErrors ?? [];

  if (errors.length > 0) {
    const first = errors[0];
    const detail = first?.error ?? "ingest_failed";
    const email = first?.email_address ? ` (${first.email_address})` : "";
    if (detail.includes("invalid_grant")) {
      return {
        status: "err",
        message: `Gmail authorization expired${email}. Use Re-connect on this page, then sync again.`,
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
        "Sync completed but no messages matched (0 listed). Check Gmail labels/lookback, or Re-connect Gmail if access was revoked.",
    };
  }

  return {
    status: "ok",
    message: `Sync finished: ${listed} listed, ${stored} stored. Check the feed.`,
  };
}

export function GmailSyncButton({ disabled, className }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setStatus("loading");
    setMessage("");
    try {
      const r = await fetch("/api/worker/ingest", { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & IngestStats;
      if (!r.ok) {
        setStatus("err");
        setMessage(typeof data.error === "string" ? data.error : `HTTP ${r.status}`);
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
        className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--card)] disabled:opacity-50"
      >
        {status === "loading" ? "Syncing…" : "Sync now"}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === "err" ? "text-red-400" : "text-[var(--muted)]"}`}>{message}</p>
      ) : null}
    </div>
  );
}
