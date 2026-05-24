"use client";

type Props = {
  iso: string;
};

export function LocalDateTime({ iso }: Props) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    <time dateTime={iso}>
      {d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
