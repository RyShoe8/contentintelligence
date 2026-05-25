import { AdminHeader } from "@/components/admin-header";
import { requirePlatformAdmin } from "@/lib/org-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdmin();

  return (
    <>
      <AdminHeader
        email={session.user.email ?? ""}
        isOrgOwner={session.user.orgRole === "owner"}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-12 lg:py-8">{children}</main>
    </>
  );
}
