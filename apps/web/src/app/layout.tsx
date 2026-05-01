import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "ContentIntelligence · Content Resourcer",
    template: "%s · ContentIntelligence",
  },
  description: "Gmail signal ingestion for content creation",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="border-b border-[var(--header-border)] bg-[var(--card)]/90 shadow-sm backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-2">
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/feed" className="flex shrink-0 items-center gap-2">
                  <Image
                    src="/logo.png"
                    alt="ContentIntelligence"
                    width={280}
                    height={102}
                    className="h-14 w-auto"
                    priority
                  />
                  <span className="hidden sm:inline border-l border-[var(--border)] pl-2 text-sm font-medium text-[var(--muted)]">
                    Content Resourcer
                  </span>
                </Link>
                <nav className="flex flex-wrap gap-4 text-sm font-medium text-[var(--muted)]">
                  <Link className="transition-colors hover:text-[var(--accent)]" href="/getting-started">
                    Getting started
                  </Link>
                  <Link className="transition-colors hover:text-[var(--accent)]" href="/verticals">
                    Verticals
                  </Link>
                  <Link className="transition-colors hover:text-[var(--accent)]" href="/signals">
                    Email signals
                  </Link>
                  <Link className="transition-colors hover:text-[var(--accent)]" href="/feed">
                    Feed
                  </Link>
                  {session?.user?.role === "admin" ? (
                    <Link className="transition-colors hover:text-[var(--accent)]" href="/admin/users">
                      Admin
                    </Link>
                  ) : null}
                </nav>
              </div>
              {session?.user ? (
                <div className="flex max-w-full items-center gap-3 text-sm">
                  <span className="truncate text-[var(--muted)]" title={session.user.email ?? ""}>
                    {session.user.email}
                  </span>
                  <SignOutButton />
                </div>
              ) : null}
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
