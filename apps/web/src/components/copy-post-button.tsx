"use client";

import { useState } from "react";

export function CopyPostButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
    >
      {copied ? "Copied!" : "Copy post"}
    </button>
  );
}
