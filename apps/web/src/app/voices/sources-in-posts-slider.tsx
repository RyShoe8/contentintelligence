"use client";

import { useState } from "react";
import { LabelWithTip } from "../signals/label-with-tip";
import { VOICE_FIELD_TIPS } from "./field-help";

function labelForLevel(level: number): string {
  const l = Math.max(0, Math.min(100, Math.round(level)));
  if (l === 0) return "Never";
  if (l <= 25) return "Rare";
  if (l <= 50) return "Sometimes";
  if (l <= 75) return "Often";
  return "Always";
}

type SourcesInPostsSliderProps = {
  defaultValue?: number;
};

export function SourcesInPostsSlider({ defaultValue = 0 }: SourcesInPostsSliderProps) {
  const [level, setLevel] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <LabelWithTip htmlFor="voice-sources-in-posts-level" tip={VOICE_FIELD_TIPS.sources_in_posts_level}>
          Use sources in posts
        </LabelWithTip>
        <span className="text-xs font-medium text-[var(--muted)]">
          {labelForLevel(level)} ({level})
        </span>
      </div>
      <input
        id="voice-sources-in-posts-level"
        name="sources_in_posts_level"
        type="range"
        min={0}
        max={100}
        step={1}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>Never</span>
        <span>Rare</span>
        <span>Sometimes</span>
        <span>Often</span>
        <span>Always</span>
      </div>
      <span className="text-xs text-[var(--muted)]">
        How often generated post copy names the email source label (e.g. inbox or Gmail label). Refresh posts
        after saving to apply to new drafts.
      </span>
    </div>
  );
}
