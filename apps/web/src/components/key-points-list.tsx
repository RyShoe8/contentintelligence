import type { KeyPoint } from "@content-resourcer/db";
import { KEY_POINT_CATEGORIES } from "@content-resourcer/db";
import { categoryLabel, groupKeyPointsByCategory } from "@/lib/key-points-display";

type Props = {
  points: KeyPoint[];
  variant?: "detail" | "compact" | "structured";
};

export function KeyPointsList({ points, variant = "detail" }: Props) {
  if (!points.length) return null;

  if (variant === "structured") {
    const grouped = groupKeyPointsByCategory(points);
    const categories = KEY_POINT_CATEGORIES.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0);

    return (
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {categoryLabel(cat)}
            </p>
            <ul className="mt-2 space-y-2">
              {grouped.get(cat)!.map((point, i) => (
                <KeyPointRow key={`${cat}-${i}-${point.text.slice(0, 24)}`} point={point} showChip={false} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <ul className="mt-2 space-y-2">
        {points.map((point, i) => (
          <KeyPointRow key={i} point={point} showChip />
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-2 space-y-2">
      {points.map((point, i) => (
        <KeyPointRow key={i} point={point} showChip />
      ))}
    </ul>
  );
}

function KeyPointRow({ point, showChip }: { point: KeyPoint; showChip: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]">
      {showChip ? (
        <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
          {categoryLabel(point.category)}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">{point.text}</span>
    </li>
  );
}
