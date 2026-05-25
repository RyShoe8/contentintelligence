type Props = {
  points: string[];
  variant?: "detail" | "compact";
};

export function KeyPointsList({ points, variant = "detail" }: Props) {
  if (!points.length) return null;

  if (variant === "compact") {
    return (
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
        {points.slice(0, 3).map((point, i) => (
          <li key={i} className="line-clamp-2">
            {point}
          </li>
        ))}
        {points.length > 3 ? (
          <li className="list-none text-[10px]">+{points.length - 3} more</li>
        ) : null}
      </ul>
    );
  }

  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[var(--fg)]">
      {points.map((point, i) => (
        <li key={i}>{point}</li>
      ))}
    </ul>
  );
}
