"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/getting-started", label: "Getting started", match: (p: string) => p === "/getting-started" },
  {
    href: "/content-signals",
    label: "Content Signals",
    match: (p: string) => p === "/content-signals" || p.startsWith("/content-signals/"),
  },
  { href: "/feed", label: "Feed", match: (p: string) => p === "/feed" || p.startsWith("/feed/") },
  { href: "/posts", label: "Posts", match: (p: string) => p === "/posts" || p.startsWith("/posts/") },
  {
    href: "/voices",
    label: "Voices",
    match: (p: string) => p === "/voices" || p.startsWith("/voices/"),
  },
] as const;

export function ProductNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-4 text-sm font-medium text-[var(--muted)]">
      {NAV_ITEMS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-[var(--accent)]"
                : "transition-colors hover:text-[var(--accent)]"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
