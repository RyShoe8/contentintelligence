"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function FeedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[feed]", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-lg border border-red-500/40 bg-red-500/10 p-6">
      <h2 className="text-lg font-semibold text-red-400">Feed failed to load</h2>
      <p className="text-sm text-[var(--muted)]">
        The feed could not be loaded. This is often temporary — try again, or return to Content
        Signals.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/content-signals"
          className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          Content Signals
        </Link>
      </div>
    </div>
  );
}
