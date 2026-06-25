"use client";

import { usePathname } from "next/navigation";
import { NavigationProgress } from "@/components/navigation-progress";
import { SidebarNav, MobileBottomNav } from "@/components/sidebar-nav";
import { UserNavDropdown } from "@/components/user-nav-dropdown";
import { AdminNavDropdown } from "@/components/admin-nav-dropdown";
import Link from "next/link";

type Props = {
  email: string;
  isAdmin: boolean;
  isOrgOwner?: boolean;
  children: React.ReactNode;
};

export function SiteChrome({ email, isAdmin, isOrgOwner, children }: Props) {
  const pathname = usePathname() ?? "";

  // Auth / admin pages bypass the chrome entirely
  if (pathname === "/login" || pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop Sidebar ───────────────────────── */}
      <div className="hidden md:flex md:flex-col">
        <SidebarNav email={email} showQuickStart={true} />
      </div>

      {/* ── Main Area ─────────────────────────────── */}
      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--header-border)] bg-[var(--sidebar-bg)] px-4 md:hidden"
          style={{ backdropFilter: "blur(20px)" }}
        >
          <Link href="/dashboard" className="text-sm font-bold tracking-tight">
            <span className="gradient-text">Content</span>
            <span className="text-[var(--fg-secondary)]">Intelligence</span>
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin && <AdminNavDropdown />}
            <UserNavDropdown email={email} isOrgOwner={isOrgOwner} />
          </div>
        </header>

        {/* Desktop top bar (right side only) */}
        <header className="hidden h-12 items-center justify-end gap-2 border-b border-[var(--header-border)] bg-[var(--sidebar-bg)] px-6 md:flex"
          style={{ backdropFilter: "blur(20px)" }}
        >
          {isAdmin && <AdminNavDropdown />}
          <UserNavDropdown email={email} isOrgOwner={isOrgOwner} />
        </header>

        <NavigationProgress />

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-20 lg:px-8 lg:py-8 lg:pb-12">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ─────────────────────── */}
      <MobileBottomNav />
    </div>
  );
}
