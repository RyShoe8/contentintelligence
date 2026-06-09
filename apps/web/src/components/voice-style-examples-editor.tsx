"use client";

import { type FormEvent } from "react";
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
};

function confirmDelete(title: string, e: FormEvent<HTMLFormElement>) {
  const label = title.trim() || "this style example";
  if (!confirm(`Remove "${label}" from style examples? It will not be re-imported from RSS.`)) {
    e.preventDefault();
  }
}

export function VoiceStyleExamplesEditor({ voiceId, rssFeedUrl, examples }: Props) {
  const hasRss = !!rssFeedUrl?.trim();

  return (
    <fieldset className="space-y-4 text-sm">
      <legend className="font-medium">Style examples</legend>
      <p className="text-xs text-[var(--muted)]">
        Imported automatically from your RSS feed when you save the voice or generate persona. Remove
        any you do not want used for Writer style or persona research — removed articles stay
        excluded on future syncs.
      </p>

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
                <form action={deleteVoiceStyleExampleAction} onSubmit={(e) => confirmDelete(ex.title, e)}>
                  <input type="hidden" name="voice_id" value={voiceId} />
                  <input type="hidden" name="example_id" value={ex.id} />
                  <Button type="submit" variant="danger" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
