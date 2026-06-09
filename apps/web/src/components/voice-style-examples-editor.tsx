"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LabelWithTip } from "@/app/signals/label-with-tip";
import { VOICE_FIELD_TIPS } from "@/app/voices/field-help";
import {
  deleteVoiceStyleExampleAction,
  importVoiceStyleExampleAction,
  updateVoiceStyleExampleAction,
} from "@/app/voices/actions";

export type VoiceStyleExampleItem = {
  id: string;
  title: string;
  updated_at: string;
  char_count: number;
  html: string;
};

type Props = {
  voiceId: string;
  examples: VoiceStyleExampleItem[];
};

function confirmDelete(title: string, e: FormEvent<HTMLFormElement>) {
  const label = title.trim() || "this style example";
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) {
    e.preventDefault();
  }
}

export function VoiceStyleExamplesEditor({ voiceId, examples }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = examples.find((ex) => ex.id === editingId) ?? null;

  return (
    <fieldset className="space-y-4 text-sm">
      <legend className="font-medium">Style examples</legend>
      <p className="text-xs text-[var(--muted)]">
        Paste your human-written blog articles here. Saved examples train Writer style at write time — not
        research or persona generation.
      </p>

      <form action={importVoiceStyleExampleAction} className="space-y-3 rounded border border-[var(--border)] p-3">
        <input type="hidden" name="voice_id" value={voiceId} />
        <label className="flex flex-col gap-1">
          <LabelWithTip htmlFor="style-example-title" tip={VOICE_FIELD_TIPS.style_examples}>
            Import style example
          </LabelWithTip>
          <span className="text-xs text-[var(--muted)]">
            Title for this example (e.g. The SBD Chair Test)
          </span>
          <input
            id="style-example-title"
            name="title"
            required
            maxLength={200}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
            placeholder="Article title"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Paste HTML or plain text from your blog</span>
          <textarea
            name="content"
            required
            rows={8}
            className="resize-y rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
            placeholder="Paste article HTML or plain text…"
          />
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Import style example
        </Button>
      </form>

      {examples.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No style examples yet.</p>
      ) : (
        <ul className="space-y-2">
          {examples.map((ex) => (
            <li
              key={ex.id}
              className="rounded border border-[var(--border)] px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--fg)]">{ex.title}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {ex.char_count.toLocaleString()} chars · updated{" "}
                    {new Date(ex.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(editingId === ex.id ? null : ex.id)}
                  >
                    {editingId === ex.id ? "Cancel" : "Edit"}
                  </Button>
                  <form action={deleteVoiceStyleExampleAction} onSubmit={(e) => confirmDelete(ex.title, e)}>
                    <input type="hidden" name="voice_id" value={voiceId} />
                    <input type="hidden" name="example_id" value={ex.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>

              {editingId === ex.id && editing ? (
                <form action={updateVoiceStyleExampleAction} className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
                  <input type="hidden" name="voice_id" value={voiceId} />
                  <input type="hidden" name="example_id" value={ex.id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--muted)]">Title</span>
                    <input
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={editing.title}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--muted)]">HTML or plain text</span>
                    <textarea
                      name="content"
                      required
                      rows={10}
                      defaultValue={editing.html}
                      className="resize-y rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
                    />
                  </label>
                  <Button type="submit" variant="primary" size="sm">
                    Save changes
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
