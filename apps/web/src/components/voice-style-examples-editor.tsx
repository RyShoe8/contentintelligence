"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { deleteVoiceStyleExampleAction } from "@/app/voices/actions";

export type VoiceStyleExampleItem = {
  id: string;
  title: string;
  source_url?: string;
  updated_at: string;
  char_count: number;
};

type Props = {
  voiceId: string;
  rssFeedUrl?: string;
  examples: VoiceStyleExampleItem[];
  workerConfigured: boolean;
  syncSummary?: string;
  syncError?: string;
  syncSyncedAt?: string;
  syncIndicator?: ReactNode;
};

export function VoiceStyleExamplesEditor({
  voiceId,
  rssFeedUrl,
  examples,
  workerConfigured,
  syncSummary,
  syncError,
  syncSyncedAt,
  syncIndicator,
}: Props) {
  const hasRss = !!rssFeedUrl?.trim();

  return (
    <fieldset className="space-y-4 text-sm">
      <legend className="font-medium">Style examples</legend>
      <p className="text-xs text-[var(--muted)]">
        Imported automatically from your RSS feed when you save the voice or generate persona. Remove
        any you do not want used for Writer style or persona research — removed articles stay
        excluded on future syncs.
      </p>

      {hasRss && !workerConfigured ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to import articles from
          RSS when you save.
        </p>
      ) : null}

      {syncIndicator}

      {syncError ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
          Last RSS import failed: {syncError}
        </p>
      ) : null}

      {syncSummary && !syncError ? (
        <p className="text-xs text-[var(--muted)]">
          Last RSS import: {syncSummary}
          {syncSyncedAt ? ` · ${new Date(syncSyncedAt).toLocaleString()}` : ""}
        </p>
      ) : null}

      {!hasRss ? (
        <p className="text-xs text-[var(--muted)]">
          Add an RSS feed URL above to import articles automatically.
        </p>
      ) : null}

      {examples.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {hasRss
            ? "No style examples yet. Save the voice or generate persona to import articles from RSS."
            : null}
        </p>
      ) : (
        <ul className="space-y-2">
          {examples.map((ex) => (
            <li key={ex.id} className="rounded border border-[var(--border)] px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--fg)]">{ex.title}</p>
                  {ex.source_url ? (
                    <a
                      href={ex.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      {ex.source_url}
                    </a>
                  ) : null}
                  <p className="text-xs text-[var(--muted)]">
                    {ex.char_count.toLocaleString()} chars · updated{" "}
                    {new Date(ex.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="submit"
                  formAction={deleteVoiceStyleExampleAction.bind(null, voiceId, ex.id)}
                  variant="danger"
                  size="sm"
                  onClick={(e) => {
                    const label = ex.title.trim() || "this style example";
                    if (
                      !confirm(
                        `Remove "${label}" from style examples? It will not be re-imported from RSS.`,
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
