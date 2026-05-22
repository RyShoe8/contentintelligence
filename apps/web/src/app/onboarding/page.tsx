import Link from "next/link";
import { requireSession } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await requireSession();

  if (session.user.organizationId) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">You are all set</h1>
        <p className="text-sm text-[var(--muted)]">Your account is linked to an organization.</p>
        <Link href="/feed" className="text-[var(--accent)] hover:underline">
          Go to feed
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Waiting for an invite</h1>
      <p className="text-sm text-[var(--muted)]">
        Sign-in succeeded for <strong>{session.user.email}</strong>, but this account is not in an
        organization yet.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Ask your organization owner to invite you by email. After they add your address, sign out and
        sign in again (or refresh) to pick up the invite.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Platform admins can create organizations from{" "}
        <Link href="/admin/orgs" className="text-[var(--accent)] hover:underline">
          Admin → Organizations
        </Link>
        .
      </p>
    </div>
  );
}
