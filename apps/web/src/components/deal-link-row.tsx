"use client";

import { isNonDealUrl } from "@/lib/deal-url";
import { useState } from "react";

export function CopyTextButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function DealLinkRow({ url }: { url: string }) {
  if (!url?.trim() || isNonDealUrl(url)) return null;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Deal link</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 break-all text-[var(--accent)] hover:underline"
      >
        {url}
      </a>
      <CopyTextButton text={url} label="Copy link" />
    </p>
  );
}
