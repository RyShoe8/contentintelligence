"use client";

import { useMemo, useState } from "react";
import {
  getSocialPlatform,
  SOCIAL_PLATFORM_IDS,
  type SocialPlatformId,
} from "@content-resourcer/db/social-platforms";
import { CopyPostButton } from "@/components/copy-post-button";

type Props = {
  platforms: SocialPlatformId[];
  copies: Partial<Record<SocialPlatformId, string>>;
  fallbackCopy: string;
  copyButtonSlot?: React.ReactNode;
};

function resolveDisplayPlatforms(
  platforms: SocialPlatformId[],
  copies: Partial<Record<SocialPlatformId, string>>,
): SocialPlatformId[] {
  const fromVoice = platforms.filter((id) => SOCIAL_PLATFORM_IDS.includes(id));
  if (fromVoice.length) return fromVoice;
  const withCopy = SOCIAL_PLATFORM_IDS.filter((id) => copies[id]?.trim());
  if (withCopy.length) return withCopy;
  return ["twitter"];
}

export function PostPlatformTabs({
  platforms,
  copies,
  fallbackCopy,
  copyButtonSlot,
}: Props) {
  const tabs = useMemo(() => resolveDisplayPlatforms(platforms, copies), [platforms, copies]);
  const [active, setActive] = useState<SocialPlatformId>(tabs[0] ?? "twitter");

  const activeText = copies[active]?.trim() || fallbackCopy || "—";
  const maxChars = getSocialPlatform(active).maxChars;
  const charCount = activeText === "—" ? 0 : activeText.length;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((id) => {
          const label = getSocialPlatform(id).label;
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={
                isActive
                  ? "border-b-2 border-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary)]"
                  : "px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2 pt-2">
        <p className="text-xs text-[var(--muted)]">
          {charCount.toLocaleString()} / {maxChars.toLocaleString()} characters
        </p>
        {copyButtonSlot ?? <CopyPostButton text={activeText === "—" ? "" : activeText} />}
      </div>
      <pre className="mt-2 whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--fg)]">
        {activeText}
      </pre>
    </div>
  );
}
