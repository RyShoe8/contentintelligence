"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  postId: string;
  initialStatus: string;
  initialError?: string;
  hasImage: boolean;
  workerConfigured: boolean;
  personaReady: boolean;
};

export function GeneratePostImageButton({
  postId,
  initialStatus,
  initialError,
  hasImage,
  workerConfigured,
  personaReady,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!workerConfigured || !personaReady) return;
    setLoading(true);
    setError(undefined);
    setStatus("pending");
    try {
      const r = await fetch("/api/worker/posts/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setStatus("failed");
        setError(data.error ?? "Image generation failed");
        return;
      }
      setStatus("ready");
      window.location.reload();
    } catch {
      setStatus("failed");
      setError("Image generation failed");
    } finally {
      setLoading(false);
    }
  }

  if (!workerConfigured) {
    return (
      <span className="text-xs text-[var(--muted)]">Set WORKER_URL to generate images</span>
    );
  }

  if (!personaReady) {
    return (
      <span className="text-xs text-[var(--muted)]">Generate persona on Voices first</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading || status === "pending"}
        onClick={() => void generate()}
      >
        {loading || status === "pending"
          ? "Generating image…"
          : hasImage
            ? "Regenerate image"
            : "Generate image"}
      </Button>
      {status === "failed" && error ? (
        <span className="max-w-[12rem] text-right text-xs text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
