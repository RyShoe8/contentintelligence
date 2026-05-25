export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <p className="text-center text-xs text-[var(--muted)] sm:text-left">
          ContentIntelligence · Content Resourcer · © {year}
        </p>
      </div>
    </footer>
  );
}
