"use server";

import {
  addOrgInvite,
  createOrganization,
  ensureIndexes,
  getUserByEmail,
  normalizeEmail,
  setUserOrganization,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { requirePlatformAdmin } from "@/lib/org-auth";

export async function createOrganizationAction(formData: FormData) {
  await requirePlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim();
  if (!name) redirect("/admin/orgs/new?error=name");
  if (!ownerEmail || !ownerEmail.includes("@")) redirect("/admin/orgs/new?error=owner_email");

  const db = await connectMongo();
  await ensureIndexes(db);
  const org = await createOrganization(db, name);
  const email = normalizeEmail(ownerEmail);

  const existing = await getUserByEmail(db, email);
  if (existing) {
    await setUserOrganization(db, email, org.id, "owner");
  } else {
    await addOrgInvite(db, {
      organization_id: org.id,
      email,
      role: "owner",
      invited_by: "platform-admin",
    });
  }

  revalidatePath("/admin/orgs");
  redirect(`/admin/orgs/${org.id}?created=1`);
}
