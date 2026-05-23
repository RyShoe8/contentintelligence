"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  signalItemId: string;
  contentSignalId: string;
  disabled?: boolean;
  alreadyInPosts?: boolean;
};

export function AddToPostsButton({
  signalItemId,
  contentSignalId,
  disabled,
  alreadyInPosts,
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setStatus("loading");
    setMessage("");
    try {
      const r = await fetch("/api/worker/posts/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal_item_id: signalItemId }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        updated?: number;
      };
      if (!r.ok) {
        setStatus("err");
        setMessage(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setStatus("ok");
      const n = (data.created ?? 0) + (data.updated ?? 0);
      setMessage(n > 0 ? `Added ${n} post${n === 1 ? "" : "s"}.` : "Already in Posts.");
    } catch {
      setStatus("err");
      setMessage("Request failed");
    }
  }

  if (alreadyInPosts && status === "idle") {
    return (
      <span className="text-xs text-[var(--muted)]">
        In Posts ·{" "}
        <Link href={`/posts?content_signal_id=${contentSignalId}`} className="text-[var(--accent)]">
          View
        </Link>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || status === "loading"}
        onClick={() => void run()}
        className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:opacity-50"
      >
        {status === "loading" ? "Adding…" : "Add to Posts"}
      </button>
      {status === "ok" ? (
        <p className="text-xs text-green-400">
          {message}{" "}
          <Link href={`/posts?content_signal_id=${contentSignalId}`} className="underline">
            View Posts
          </Link>
        </p>
      ) : null}
      {status === "err" ? <p className="text-xs text-red-400">{message}</p> : null}
    </div>
  );
}
