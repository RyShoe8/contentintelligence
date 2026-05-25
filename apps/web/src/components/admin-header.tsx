"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNavDropdown } from "@/components/user-nav-dropdown";

type Props = {
  email: string;
  isOrgOwner?: boolean;
};

const navItems = [
  { href: "/admin/orgs", label: "Organizations", match: (p: string) => p.startsWith("/admin/orgs") },
  { href: "/admin/users", label: "Users", match: (p: string) => p.startsWith("/admin/users") },
] as const;

export function AdminHeader({ email, isOrgOwner }: Props) {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--header-border)] bg-[var(--card)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-[var(--fg)]">Platform admin</span>
          <nav className="flex flex-wrap gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-[var(--input-bg)] hover:text-[var(--fg)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/feed"
            className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
          >
            Back to app
          </Link>
        </div>
        <UserNavDropdown email={email} isOrgOwner={isOrgOwner} />
      </div>
    </header>
  );
}
