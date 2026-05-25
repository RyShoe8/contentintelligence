function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--border)] ${className ?? ""}`} />;
}

export default function PostsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading posts">
      <div className="space-y-2">
        <SkeletonBar className="h-8 w-32" />
        <SkeletonBar className="h-4 w-96 max-w-full" />
      </div>
      <section className="ui-card p-4">
        <SkeletonBar className="mb-3 h-4 w-24" />
        <SkeletonBar className="h-10 w-full max-w-md" />
      </section>
      <ul className="space-y-3">
        {[0, 1].map((i) => (
          <li key={i} className="ui-card p-4">
            <SkeletonBar className="h-4 w-48" />
            <SkeletonBar className="mt-3 h-20 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
