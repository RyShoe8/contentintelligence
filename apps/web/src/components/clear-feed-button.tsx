"use client";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useState } from "react";
import { clearFeedAction } from "@/app/feed/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  contentSignalId: string;
  contentSignalName: string;
  itemCount: number;
  disabled?: boolean;
  className?: string;
};

export function ClearFeedButton({
  contentSignalId,
  contentSignalName,
  itemCount,
  disabled,
  className,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    const noun = itemCount === 1 ? "item" : "items";
    const msg =
      itemCount > 0
        ? `Delete all ${itemCount} feed ${noun} for “${contentSignalName}” from the database? This cannot be undone. The next sync will re-fetch mail using the full lookback window.`
        : `Clear the feed for “${contentSignalName}”? There are no items right now; ingest timing will reset so the next sync uses the full lookback window.`;
    if (!window.confirm(msg)) return;

    setPending(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("content_signal_id", contentSignalId);
      await clearFeedAction(fd);
    } catch (e) {
      if (isRedirectError(e)) throw e;
      setError("Could not clear the feed. Try again.");
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" variant="danger" disabled={disabled || pending} onClick={run}>
        {pending ? "Clearing…" : "Clear feed"}
      </Button>
      {error ? <Alert variant="error" className="mt-2">{error}</Alert> : null}
    </div>
  );
}
