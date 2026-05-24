"use client";

type Props = {
  iso: string;
};

export function PersonaGeneratedAt({ iso }: Props) {
  const formatted = new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <span className="text-xs text-[var(--muted)]">Last generated: {formatted}</span>
  );
}
