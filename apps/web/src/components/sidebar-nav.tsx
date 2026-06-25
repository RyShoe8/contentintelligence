"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// ── Icons (inline SVG to avoid adding an icon library) ─────────
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  dashboard:    "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  quickStart:   "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  topics:       "M22 12h-4l-3 9L9 3l-3 9H2",
  feed:         "M4 11a9 9 0 0 1 9 9 M4 4a16 16 0 0 1 16 16 M5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  drafts:       "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  studio:       "M12 20h9 M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  voice:        "M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8",
  team:         "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  chevronLeft:  "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  launch:       "M5 3l14 9-14 9V3z",
  signOut:      "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
};

// ── Nav structure ───────────────────────────────────────────────
type NavItem = {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: ICONS.dashboard,
        match: (p) => p === "/dashboard" || p === "/",
      },
      {
        href: "/quick-start",
        label: "Quick Start",
        icon: ICONS.quickStart,
        match: (p) => p === "/quick-start" || p === "/getting-started",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/topics",
        label: "Topics",
        icon: ICONS.topics,
        match: (p) => p === "/topics" || p.startsWith("/topics/") || p === "/content-signals" || p.startsWith("/content-signals/"),
      },
      {
        href: "/feed",
        label: "Signal Feed",
        icon: ICONS.feed,
        match: (p) => p === "/feed" || p.startsWith("/feed/"),
      },
      {
        href: "/posts",
        label: "Social Drafts",
        icon: ICONS.drafts,
        match: (p) => p === "/posts" || p.startsWith("/posts/") || p === "/drafts",
      },
    ],
  },
  {
    label: "Creation",
    items: [
      {
        href: "/studio",
        label: "Article Studio",
        icon: ICONS.studio,
        match: (p) =>
          p === "/studio" || p.startsWith("/studio/") ||
          p === "/writer" || p.startsWith("/writer/") ||
          p === "/rewriter" || p.startsWith("/rewriter/"),
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/voices",
        label: "My Voice",
        icon: ICONS.voice,
        match: (p) => p === "/voices" || p.startsWith("/voices/"),
      },
      {
        href: "/org/members",
        label: "Team",
        icon: ICONS.team,
        match: (p) => p === "/org/members" || p.startsWith("/org/"),
      },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────
type Props = {
  email: string;
  showQuickStart?: boolean;
};

export function SidebarNav({ email, showQuickStart = true }: Props) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapse state
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "sidebar flex flex-col",
        collapsed && "collapsed",
      )}
      aria-label="Main navigation"
    >
      {/* ── Logo + Collapse Toggle ─────────────────── */}
      <div className="flex h-14 items-center justify-between px-3 border-b border-[var(--sidebar-border)]">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 transition-opacity",
            collapsed && "pointer-events-none opacity-0 w-0 overflow-hidden",
          )}
          aria-label="ContentIntelligence"
        >
          {/* Logo text mark — shown when expanded */}
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">
            <span className="gradient-text">Content</span>
            <span className="text-[var(--fg-secondary)]">Intelligence</span>
          </span>
        </Link>

        <button
          onClick={toggleCollapse}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-all",
            "hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]",
            collapsed && "mx-auto",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon d={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} size={16} />
        </button>
      </div>

      {/* ── Nav Groups ─────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-6">
        {NAV_GROUPS.map((group) => {
          // Hide Quick Start if not needed
          const items = group.items.filter((item) => {
            if (item.href === "/quick-start" && !showQuickStart) return false;
            return true;
          });
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.match(pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "sidebar-item",
                          active && "active",
                          collapsed && "justify-center px-0 w-10 mx-auto",
                        )}
                      >
                        <Icon d={item.icon} size={18} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {!collapsed && item.badge && (
                          <span className="ml-auto badge badge-success text-[10px]">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* ── User Footer ────────────────────────────── */}
      <div className="border-t border-[var(--sidebar-border)] p-2">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-2",
            collapsed && "justify-center",
          )}
        >
          {/* Avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-dim)] text-[var(--primary)] text-xs font-bold">
            {email.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--fg-secondary)]">{email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Mobile Bottom Nav (5 key items) ────────────────────────────
export function MobileBottomNav() {
  const pathname = usePathname() ?? "";

  const mobileItems: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: ICONS.dashboard, match: (p) => p === "/dashboard" || p === "/" },
    { href: "/topics",    label: "Topics",  icon: ICONS.topics,  match: (p) => p === "/topics" || p.startsWith("/topics/") },
    { href: "/feed",      label: "Feed",    icon: ICONS.feed,    match: (p) => p === "/feed"   || p.startsWith("/feed/") },
    { href: "/posts",     label: "Drafts",  icon: ICONS.drafts,  match: (p) => p === "/posts"  || p.startsWith("/posts/") },
    { href: "/voices",    label: "Voice",   icon: ICONS.voice,   match: (p) => p === "/voices" || p.startsWith("/voices/") },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] pb-safe md:hidden"
      style={{ backdropFilter: "blur(20px)" }}
      aria-label="Mobile navigation"
    >
      {mobileItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors",
              active ? "text-[var(--primary)]" : "text-[var(--muted)]",
            )}
          >
            <Icon d={item.icon} size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
