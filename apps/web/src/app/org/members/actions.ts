"use server";

import {
  addOrgInvite,
  clearUserOrganization,
  ensureIndexes,
  getEmailOtherOrganizationId,
  getUserByEmail,
  normalizeEmail,
  revokeOrgInvite,
  updateOrganizationName,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { requireOrgOwner } from "@/lib/org-auth";

const MAX_ORG_NAME_LENGTH = 120;

export async function updateOrganizationNameAction(formData: FormData) {
  const session = await requireOrgOwner();
  const nameRaw = String(formData.get("name") ?? "").trim();
  if (!nameRaw) {
    redirect("/org/members?error=empty_name");
  }
  if (nameRaw.length > MAX_ORG_NAME_LENGTH) {
    redirect("/org/members?error=name_too_long");
  }

  const db = await connectMongo();
  await ensureIndexes(db);
  const updated = await updateOrganizationName(db, session.user.organizationId, nameRaw);
  if (!updated) {
    redirect("/org/members?error=empty_name");
  }

  revalidatePath("/org/members");
  revalidatePath("/admin/orgs");
  redirect("/org/members?renamed=1");
}

export async function inviteMemberAction(formData: FormData) {
  const session = await requireOrgOwner();
  const emailRaw = String(formData.get("email") ?? "").trim();
  if (!emailRaw || !emailRaw.includes("@")) {
    redirect("/org/members?error=invalid_email");
  }

  const db = await connectMongo();
  await ensureIndexes(db);
  const orgId = session.user.organizationId;
  const email = normalizeEmail(emailRaw);

  if (email === normalizeEmail(session.user.email ?? "")) {
    redirect("/org/members?error=self");
  }

  const otherOrg = await getEmailOtherOrganizationId(db, email, orgId);
  if (otherOrg) {
    redirect("/org/members?error=other_org");
  }

  const existing = await getUserByEmail(db, email);
  if (existing?.organization_id === orgId) {
    redirect("/org/members?error=already_member");
  }

  await addOrgInvite(db, {
    organization_id: orgId,
    email,
    role: "member",
    invited_by: session.user.email ?? "",
  });

  revalidatePath("/org/members");
  redirect("/org/members?invited=1");
}

export async function revokeInviteAction(formData: FormData) {
  const session = await requireOrgOwner();
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) redirect("/org/members");

  const db = await connectMongo();
  await revokeOrgInvite(db, inviteId, session.user.organizationId);
  revalidatePath("/org/members");
  redirect("/org/members");
}

export async function removeMemberAction(formData: FormData) {
  const session = await requireOrgOwner();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/org/members");

  if (normalizeEmail(email) === normalizeEmail(session.user.email ?? "")) {
    redirect("/org/members?error=remove_self");
  }

  const db = await connectMongo();
  const member = await getUserByEmail(db, email);
  if (member?.organization_id !== session.user.organizationId) {
    redirect("/org/members?error=not_member");
  }
  if (member.org_role === "owner") {
    redirect("/org/members?error=remove_owner");
  }

  await clearUserOrganization(db, email);
  revalidatePath("/org/members");
  redirect("/org/members?removed=1");
}
