import Link from "next/link";
import {
  countOrgContentSignals,
  countOrgInvites,
  countOrgMembers,
  ensureIndexes,
  listOrganizations,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requirePlatformAdmin } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
  await requirePlatformAdmin();
  const db = await connectMongo();
  await ensureIndexes(db);
  const orgs = await listOrganizations(db);

  const rows = await Promise.all(
    orgs.map(async (org) => ({
      org,
      members: await countOrgMembers(db, org.id),
      invites: await countOrgInvites(db, org.id),
      signals: await countOrgContentSignals(db, org.id),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Platform-wide view of tenants, members, and content signals.
          </p>
        </div>
        <Link
          href="/admin/orgs/new"
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create organization
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--card)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Pending invites</th>
              <th className="px-4 py-3 font-medium">Content signals</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ org, members, invites, signals }) => (
              <tr key={org.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/orgs/${org.id}`} className="font-medium text-[var(--accent)] hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{members}</td>
                <td className="px-4 py-3">{invites}</td>
                <td className="px-4 py-3">{signals}</td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {org.created_at.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No organizations yet.</p>
      ) : null}
    </div>
  );
}
