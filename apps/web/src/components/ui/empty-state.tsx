import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  message: string;
  description?: string;
  action?: ReactNode;
  icon?: string; // emoji or short text
  className?: string;
};

export function EmptyState({ message, description, action, icon, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="text-3xl opacity-50" aria-hidden>
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-[var(--fg-secondary)]">{message}</p>
      {description && (
        <p className="max-w-sm text-xs text-[var(--muted)]">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
