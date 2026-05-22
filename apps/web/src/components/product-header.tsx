import Image from "next/image";
import Link from "next/link";
import { AdminNavDropdown } from "@/components/admin-nav-dropdown";
import { ProductNav } from "@/components/product-nav";
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
          <Link href="/feed" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="ContentIntelligence"
              width={168}
              height={61}
              className="h-12 w-auto"
              priority
            />
          </Link>
          <ProductNav />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? <AdminNavDropdown /> : null}
          <UserNavDropdown email={email} isOrgOwner={isOrgOwner} />
        </div>
      </div>
    </header>
  );
}
