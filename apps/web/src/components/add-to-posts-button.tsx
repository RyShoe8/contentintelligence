"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
        skipped?: number;
      };
      if (!r.ok) {
        setStatus("err");
        setMessage(data.error ?? `HTTP ${r.status}`);
        return;
      }
      const n = (data.created ?? 0) + (data.updated ?? 0);
      if ((data.skipped ?? 0) > 0 && n === 0) {
        setStatus("err");
        setMessage("Could not add to Posts — no deal detected and content push failed.");
        return;
      }
      setStatus("ok");
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
      <Button type="button" variant="secondary" size="sm" disabled={disabled || status === "loading"} onClick={() => void run()}>
        {status === "loading" ? "Adding…" : "Add to Posts"}
      </Button>
      {status === "ok" ? (
        <Alert variant="success" className="text-xs">
          {message}{" "}
          <Link href={`/posts?content_signal_id=${contentSignalId}`} className="underline">
            View Posts
          </Link>
        </Alert>
      ) : null}
      {status === "err" ? <Alert variant="error" className="text-xs">{message}</Alert> : null}
    </div>
  );
}
