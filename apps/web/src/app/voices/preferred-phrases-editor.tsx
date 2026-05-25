"use client";

import { useState } from "react";
import type { VoicePreferredPhrase } from "@content-resourcer/db";

const MAX_ROWS = 15;

function labelForLevel(level: number): string {
  const l = Math.max(0, Math.min(100, Math.round(level)));
  if (l === 0) return "Never";
  if (l <= 25) return "Rare";
  if (l <= 50) return "Sometimes";
  if (l <= 75) return "Often";
  return "Always";
}

type PhraseRow = {
  phrasesText: string;
  url: string;
  frequency_level: number;
  allow_ai_variations: boolean;
};

function toRows(phrases: VoicePreferredPhrase[]): PhraseRow[] {
  return phrases.map((p) => ({
    phrasesText: (p.phrases ?? []).join(", "),
    url: p.url ?? "",
    frequency_level: p.frequency_level ?? 50,
    allow_ai_variations: Boolean(p.allow_ai_variations),
  }));
}

type Props = {
  defaultPhrases?: VoicePreferredPhrase[];
};

export function PreferredPhrasesEditor({ defaultPhrases = [] }: Props) {
  const [rows, setRows] = useState<PhraseRow[]>(() => toRows(defaultPhrases));

  function updateRow(index: number, patch: Partial<PhraseRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev;
      return [
        ...prev,
        { phrasesText: "", url: "", frequency_level: 50, allow_ai_variations: false },
      ];
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No preferred phrases yet.</p>
      ) : (
        rows.map((row, index) => (
          <div
            key={index}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)]/40 p-3 space-y-2"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--muted)]">Phrases (comma-separated)</label>
              <input
                name="preferred_phrase_phrase"
                value={row.phrasesText}
                onChange={(e) => updateRow(index, { phrasesText: e.target.value })}
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                placeholder="Grab it, Act now, Don't miss out"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--muted)]">Optional link (https)</label>
              <input
                name="preferred_phrase_url"
                type="url"
                value={row.url}
                onChange={(e) => updateRow(index, { url: e.target.value })}
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                placeholder="https://example.com/promo"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">Use frequency</span>
                <span className="text-xs font-medium text-[var(--muted)]">
                  {labelForLevel(row.frequency_level)} ({row.frequency_level})
                </span>
              </div>
              <input
                name="preferred_phrase_frequency"
                type="range"
                min={0}
                max={100}
                step={1}
                value={row.frequency_level}
                onChange={(e) =>
                  updateRow(index, { frequency_level: Number(e.target.value) })
                }
                className="w-full accent-[var(--accent)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="hidden"
                name="preferred_phrase_allow_variations"
                value={row.allow_ai_variations ? "1" : "0"}
              />
              <button
                type="button"
                onClick={() =>
                  updateRow(index, { allow_ai_variations: !row.allow_ai_variations })
                }
                className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                  row.allow_ai_variations
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]"
                }`}
              >
                {row.allow_ai_variations
                  ? "AI variations: on"
                  : "AI variations: off"}
              </button>
              <span className="text-[10px] text-[var(--muted)]">
                When on, posts may paraphrase listed phrases with similar wording.
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove phrase group
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_ROWS}
        className="self-start rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--primary)] disabled:opacity-50"
      >
        Add phrase group
      </button>
    </div>
  );
}
