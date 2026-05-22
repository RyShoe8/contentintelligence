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
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
