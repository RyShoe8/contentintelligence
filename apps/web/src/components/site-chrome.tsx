"use client";

import { usePathname } from "next/navigation";
import { NavigationProgress } from "@/components/navigation-progress";
import { ProductHeader } from "@/components/product-header";

type Props = {
  email: string;
  isAdmin: boolean;
  isOrgOwner?: boolean;
  children: React.ReactNode;
};

export function SiteChrome({ email, isAdmin, isOrgOwner, children }: Props) {
  const pathname = usePathname() ?? "";

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <>
      <ProductHeader email={email} isAdmin={isAdmin} isOrgOwner={isOrgOwner} />
      <NavigationProgress />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
