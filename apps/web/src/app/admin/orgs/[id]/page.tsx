import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countOrgContentSignals,
  ensureIndexes,
  getOrganization,
  listOrgInvites,
  listOrgMembers,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requirePlatformAdmin } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function AdminOrgDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; email_failed?: string; email_skipped?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = await connectMongo();
  await ensureIndexes(db);
  const org = await getOrganization(db, id);
  if (!org) notFound();

  const members = await listOrgMembers(db, id);
  const invites = await listOrgInvites(db, id);
  const signalCount = await countOrgContentSignals(db, id);

  return (
    <div className="space-y-8">
      <Link href="/admin/orgs" className="text-sm text-[var(--accent)] hover:underline">
        ← Organizations
      </Link>
      {sp.created === "1" ? (
        <div className="space-y-1 rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          <p>Organization created.</p>
          {sp.email_failed === "1" ? (
            <p className="text-amber-300">
              Owner invite saved, but the invite email could not be sent. Check Brevo on Vercel.
            </p>
          ) : null}
          {sp.email_skipped === "1" ? (
            <p className="text-[var(--muted)]">
              Owner invite saved. No invite email was sent (Brevo is not configured).
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          ID {org.id} · {signalCount} content signal{signalCount === 1 ? "" : "s"} · created{" "}
          {org.created_at.toLocaleDateString()}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium">Members ({members.length})</h2>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li
              key={m.email}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
            >
              <span className="font-medium">{m.email}</span>
              <span className="ml-2 text-[var(--muted)]">({m.org_role})</span>
            </li>
          ))}
          {members.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">No members yet.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">Pending invites ({invites.length})</h2>
        <ul className="mt-3 space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
            >
              <span className="font-medium">{inv.email}</span>
              <span className="ml-2 text-[var(--muted)]">
                ({inv.role}) · invited {inv.created_at.toLocaleDateString()}
              </span>
            </li>
          ))}
          {invites.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">No pending invites.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
