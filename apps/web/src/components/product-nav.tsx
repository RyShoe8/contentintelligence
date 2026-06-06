"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

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
  { href: "/writer", label: "Writer", match: (p: string) => p === "/writer" || p.startsWith("/writer/") },
  { href: "/rewriter", label: "ReWriter", match: (p: string) => p === "/rewriter" || p.startsWith("/rewriter/") },
] as const;

export function ProductNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium">
      {NAV_ITEMS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-light)] hover:text-[var(--fg)]",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
