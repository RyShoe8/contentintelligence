import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/getting-started", label: "Getting started" },
  { href: "/content-signals", label: "Content Signals" },
  { href: "/voices", label: "Voices" },
  { href: "/feed", label: "Feed" },
  { href: "/posts", label: "Posts" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]">
          ContentIntelligence · Content Resourcer · © {year}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
