import {
  ensureIndexes,
  getOrganization,
  listOrgInvites,
  listOrgMembers,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgOwner } from "@/lib/org-auth";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  updateOrganizationNameAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgMembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    added?: string;
    invited?: string;
    removed?: string;
    renamed?: string;
    email_failed?: string;
    email_skipped?: string;
  }>;
}) {
  const session = await requireOrgOwner();
  const sp = await searchParams;
  const db = await connectMongo();
  await ensureIndexes(db);
  const orgId = session.user.organizationId;
  const org = await getOrganization(db, orgId);
  const members = await listOrgMembers(db, orgId);
  const invites = await listOrgInvites(db, orgId);

  const errorMsg =
    sp.error === "empty_name"
      ? "Organization name cannot be empty."
      : sp.error === "name_too_long"
        ? "Organization name must be 120 characters or fewer."
        : sp.error === "invalid_email"
          ? "Enter a valid email address."
          : sp.error === "self"
            ? "You cannot invite yourself."
            : sp.error === "other_org"
              ? "That email belongs to another organization. Ask a platform admin if they should be moved."
              : sp.error === "already_member"
                ? "That user is already a member."
                : sp.error === "remove_self"
                  ? "You cannot remove yourself."
                  : sp.error === "remove_owner"
                    ? "You cannot remove an organization owner."
                    : sp.error === "not_member"
                      ? "User is not in this organization."
                      : null;

  const emailFailed = sp.email_failed === "1";
  const emailSkipped = sp.email_skipped === "1";
  const emailNote =
    emailFailed
      ? "We could not send the notification email. Check Brevo configuration on Vercel."
      : emailSkipped
        ? "No notification email was sent (Brevo is not configured)."
        : sp.added === "1" || sp.invited === "1"
          ? "A notification email was sent."
          : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Add members by email. If they have signed in before, they are added immediately; otherwise they join on first Google sign-in. When Brevo is configured, they receive a notification email."
      />

      {sp.renamed === "1" ? <Alert variant="success">Organization name updated.</Alert> : null}
      {sp.added === "1" ? (
        <div className="space-y-1 rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          <p>Member added to your organization.</p>
          {emailNote ? (
            <p className={emailFailed ? "text-amber-300" : emailSkipped ? "text-[var(--muted)]" : ""}>
              {emailNote}
            </p>
          ) : null}
        </div>
      ) : null}
      {sp.invited === "1" ? (
        <div className="space-y-1 rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          <p>
            Invite saved. They will join your organization on first sign-in with Google using that
            email.
          </p>
          {emailNote ? (
            <p className={emailFailed ? "text-amber-300" : emailSkipped ? "text-[var(--muted)]" : ""}>
              {emailNote}
            </p>
          ) : null}
        </div>
      ) : null}
      {sp.removed === "1" ? (
        <p className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          Member removed.
        </p>
      ) : null}
      {errorMsg ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {errorMsg}
        </p>
      ) : null}

      <section className="ui-card p-4">
        <h2 className="text-lg font-medium">Organization name</h2>
        <form action={updateOrganizationNameAction} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Name</span>
            <input
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={org?.name ?? ""}
              placeholder="Your organization"
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
            />
          </label>
          <button
            type="submit"
            className="ui-btn-primary"
          >
            Save name
          </button>
        </form>
      </section>

      <section className="ui-card p-4">
        <h2 className="text-lg font-medium">Add member</h2>
        <form action={inviteMemberAction} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="colleague@company.com"
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
            />
          </label>
          <button
            type="submit"
            className="ui-btn-primary"
          >
            Add member
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-medium">Members ({members.length})</h2>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li
              key={m.email}
              className="flex flex-wrap items-center justify-between gap-3 ui-card p-3"
            >
              <div>
                <p className="font-medium">{m.email}</p>
                <p className="text-xs text-[var(--muted)]">Role: {m.org_role}</p>
              </div>
              {m.org_role === "member" ? (
                <form action={removeMemberAction}>
                  <input type="hidden" name="email" value={m.email} />
                  <button
                    type="submit"
                    className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:border-red-400 hover:text-red-400"
                  >
                    Remove
                  </button>
                </form>
              ) : (
                <span className="text-xs text-[var(--muted)]">Owner</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">Pending invites ({invites.length})</h2>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No pending invites.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 ui-card p-3"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Invited {inv.created_at.toLocaleDateString()} · role {inv.role}
                  </p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="invite_id" value={inv.id} />
                  <button
                    type="submit"
                    className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:border-[var(--accent)]"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
