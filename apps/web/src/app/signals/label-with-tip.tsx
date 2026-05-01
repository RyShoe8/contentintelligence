"use client";

import type { ReactNode } from "react";

type LabelWithTipProps = {
  htmlFor: string;
  tip: string;
  children: ReactNode;
  className?: string;
};

/**
 * Label text + focusable help control. Tip button is a sibling of the label (not inside it) so
 * activating the tip does not toggle adjacent checkboxes.
 */
export function LabelWithTip({ htmlFor, tip, children, className }: LabelWithTipProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="cursor-pointer text-[var(--muted)]">
        {children}
      </label>
      <button
        type="button"
        title={tip}
        aria-label={`More about this field: ${tip}`}
        className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-semibold leading-none text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        onMouseDown={(e) => e.preventDefault()}
      >
        ?
      </button>
    </span>
  );
}
