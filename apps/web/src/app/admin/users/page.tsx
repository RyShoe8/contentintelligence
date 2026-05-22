import Link from "next/link";
import { ensureIndexes, listOrganizations } from "@content-resourcer/db";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongo-auth-adapter";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { updateUserRoleAction } from "./actions";

export const dynamic = "force-dynamic";

const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/feed");
  }

  const client = await clientPromise;
  const users = await client
    .db(dbName)
    .collection("users")
    .find({})
    .sort({ email: 1 })
    .limit(200)
    .toArray();

  const db = await connectMongo();
  await ensureIndexes(db);
  const orgs = await listOrganizations(db);
  const orgById = Object.fromEntries(orgs.map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Platform roles and organization membership.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {users.map((u) => {
          const email = String(u.email ?? "");
          const role = ((u as { role?: string }).role as "admin" | "member" | undefined) ?? "member";
          const orgId = (u as { organization_id?: string }).organization_id;
          const orgRole = (u as { org_role?: string }).org_role;
          const org = orgId ? orgById[orgId] : null;
          return (
            <li
              key={String(u._id)}
              className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div>
                <p className="font-medium">{email || "(no email)"}</p>
                <p className="text-xs text-[var(--muted)]">
                  Platform: {role}
                  {org ? (
                    <>
                      {" "}
                      · Org:{" "}
                      <Link href={`/admin/orgs/${org.id}`} className="text-[var(--accent)] hover:underline">
                        {org.name}
                      </Link>
                      {orgRole ? ` (${orgRole})` : ""}
                    </>
                  ) : (
                    " · No organization"
                  )}
                </p>
              </div>
              <form action={updateUserRoleAction} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="email" value={email} />
                <select
                  name="role"
                  defaultValue={role}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1 text-[var(--fg)]"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  type="submit"
                  className="rounded bg-[var(--accent)] px-3 py-1 text-white hover:opacity-90"
                >
                  Save
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {users.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No users yet. Sign in with Google once.</p>
      ) : null}
    </div>
  );
}
