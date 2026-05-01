import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--header-border)] bg-[var(--card)]/90 shadow-sm backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/feed" className="flex items-center gap-3 shrink-0">
              <Image
                src="/logo.png"
                alt="ContentIntelligence"
                width={220}
                height={80}
                className="h-11 w-auto"
                priority
              />
              <span className="hidden sm:inline border-l border-[var(--border)] pl-3 text-sm font-medium text-[var(--muted)]">
                Content Resourcer
              </span>
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm font-medium text-[var(--muted)]">
              <Link className="transition-colors hover:text-[var(--accent)]" href="/verticals">
                Verticals
              </Link>
              <Link className="transition-colors hover:text-[var(--accent)]" href="/signals">
                Email signals
              </Link>
              <Link className="transition-colors hover:text-[var(--accent)]" href="/feed">
                Feed
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
