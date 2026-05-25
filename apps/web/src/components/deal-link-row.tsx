"use client";

import { isNonDealUrl } from "@/lib/deal-url";
import { formatDealUrlDisplay } from "@/lib/deal-url-display";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
      {copied ? "Copied!" : label}
    </Button>
  );
}

export function DealLinkRow({
  url,
  variant = "inline",
}: {
  url: string;
  variant?: "inline" | "panel";
}) {
  if (!url?.trim() || isNonDealUrl(url)) return null;

  const label = formatDealUrlDisplay(url);

  if (variant === "panel") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 break-all font-medium text-[var(--primary)] hover:underline"
          title={url}
        >
          {label}
        </a>
        <CopyTextButton text={url} label="Copy link" />
      </div>
    );
  }

  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Deal link</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 break-all text-[var(--primary)] hover:underline"
        title={url}
      >
        {label}
      </a>
      <CopyTextButton text={url} label="Copy link" />
    </p>
  );
}
