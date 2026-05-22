function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--border)] ${className ?? ""}`} />;
}

export default function FeedLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading feed">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-8 w-40" />
          <SkeletonBar className="h-4 w-72 max-w-full" />
        </div>
        <SkeletonBar className="h-4 w-24" />
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <SkeletonBar className="mb-3 h-4 w-28" />
        <div className="flex flex-wrap items-end gap-4">
          <SkeletonBar className="h-10 min-w-[200px] flex-1" />
          <SkeletonBar className="h-10 w-20" />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--border)] pt-4">
          <SkeletonBar className="h-9 w-24" />
          <SkeletonBar className="h-9 w-24" />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <SkeletonBar className="h-10 md:col-span-2" />
          <SkeletonBar className="h-10" />
          <SkeletonBar className="h-10" />
        </div>
      </section>

      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="mt-2 h-5 w-3/4 max-w-md" />
            <SkeletonBar className="mt-3 h-4 w-full" />
            <SkeletonBar className="mt-1 h-4 w-5/6 max-w-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}
