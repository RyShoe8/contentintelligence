"use client";

import { useState } from "react";

type Props = {
  disabled?: boolean;
  className?: string;
};

export function GmailSyncButton({ disabled, className }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setStatus("loading");
    setMessage("");
    try {
      const r = await fetch("/api/worker/ingest", { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        setStatus("err");
        setMessage(typeof data.error === "string" ? data.error : `HTTP ${r.status}`);
        return;
      }
      setStatus("ok");
      setMessage("Sync finished. Check the feed in a moment.");
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
