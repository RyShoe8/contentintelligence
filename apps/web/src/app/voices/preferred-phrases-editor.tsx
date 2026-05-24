"use client";

import { useState } from "react";
import type { VoicePreferredPhrase } from "@content-resourcer/db";

const MAX_PHRASES = 15;

function labelForLevel(level: number): string {
  const l = Math.max(0, Math.min(100, Math.round(level)));
  if (l === 0) return "Never";
  if (l <= 25) return "Rare";
  if (l <= 50) return "Sometimes";
  if (l <= 75) return "Often";
  return "Always";
}

type PhraseRow = {
  phrase: string;
  url: string;
  frequency_level: number;
};

function toRows(phrases: VoicePreferredPhrase[]): PhraseRow[] {
  return phrases.map((p) => ({
    phrase: p.phrase,
    url: p.url ?? "",
    frequency_level: p.frequency_level ?? 50,
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
      if (prev.length >= MAX_PHRASES) return prev;
      return [...prev, { phrase: "", url: "", frequency_level: 50 }];
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
              <label className="text-xs text-[var(--muted)]">Phrase</label>
              <input
                name="preferred_phrase_phrase"
                value={row.phrase}
                onChange={(e) => updateRow(index, { phrase: e.target.value })}
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                placeholder="Grab it while it lasts"
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
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>Never</span>
                <span>Rare</span>
                <span>Sometimes</span>
                <span>Often</span>
                <span>Always</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove phrase
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_PHRASES}
        className="self-start rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--primary)] disabled:opacity-50"
      >
        Add phrase
      </button>
    </div>
  );
}
