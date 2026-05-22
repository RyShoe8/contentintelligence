import Image from "next/image";
import Link from "next/link";
import { AdminNavDropdown } from "@/components/admin-nav-dropdown";
import { UserNavDropdown } from "@/components/user-nav-dropdown";

type Props = {
  email: string;
  isAdmin: boolean;
  isOrgOwner?: boolean;
};

export function ProductHeader({ email, isAdmin, isOrgOwner }: Props) {
  return (
    <header className="border-b border-[var(--header-border)] bg-[var(--card)]/90 shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/feed" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="ContentIntelligence"
              width={280}
              height={102}
              className="h-20 w-auto"
              priority
            />
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-[var(--muted)]">
            <Link className="transition-colors hover:text-[var(--accent)]" href="/getting-started">
              Getting started
            </Link>
            <Link className="transition-colors hover:text-[var(--accent)]" href="/content-signals">
              Content Signals
            </Link>
            <Link className="transition-colors hover:text-[var(--accent)]" href="/feed">
              Feed
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? <AdminNavDropdown /> : null}
          <UserNavDropdown email={email} isOrgOwner={isOrgOwner} />
        </div>
      </div>
    </header>
  );
}
