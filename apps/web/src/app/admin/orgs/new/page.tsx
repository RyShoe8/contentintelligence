import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/org-auth";
import { createOrganizationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminNewOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const errorMsg =
    sp.error === "name"
      ? "Organization name is required."
      : sp.error === "owner_email"
        ? "Owner email is required."
        : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/admin/orgs" className="text-sm text-[var(--accent)] hover:underline">
        ← Organizations
      </Link>
      <h1 className="text-2xl font-semibold">Create organization</h1>
      {errorMsg ? <p className="text-sm text-red-400">{errorMsg}</p> : null}
      <form
        action={createOrganizationAction}
        className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Organization name</span>
          <input
            name="name"
            required
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Owner email</span>
          <input
            name="owner_email"
            type="email"
            required
            placeholder="owner@company.com"
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
          />
          <span className="text-xs text-[var(--muted)]">
            If they have not signed in yet, an invite is created; they become owner on first Google
            sign-in.
          </span>
        </label>
        <button
          type="submit"
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create
        </button>
      </form>
    </div>
  );
}
