import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { OrgInvite, OrgInviteRole, OrgRole, Organization } from "./schemas.js";
import { orgInviteSchema, organizationSchema } from "./schemas.js";

const DEFAULT_ORG_NAME = "Default organization";
const FIRST_ADMIN_EMAIL = "ryanschumacher@themediashop.co";
const MIGRATIONS_COLLECTION = "_migrations";
export const ORG_USER_BACKFILL_MIGRATION_ID = "org_user_backfill_v1";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userEmailQuery(email: string): { email: { $regex: RegExp } } {
  const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { email: { $regex: new RegExp(`^${escaped}$`, "i") } };
}

function organizations(db: Db): Collection<Organization> {
  return db.collection<Organization>(COLLECTIONS.organizations);
}

function orgInvites(db: Db): Collection<OrgInvite> {
  return db.collection<OrgInvite>(COLLECTIONS.org_invites);
}

function users(db: Db) {
  return db.collection(COLLECTIONS.users);
}

export async function createOrganization(db: Db, name: string): Promise<Organization> {
  const now = new Date();
  const row: Organization = {
    id: randomUUID(),
    name: name.trim(),
    created_at: now,
    updated_at: now,
  };
  const parsed = organizationSchema.parse(row);
  await organizations(db).insertOne(parsed);
  return parsed;
}

export async function listOrganizations(db: Db): Promise<Organization[]> {
  const docs = await organizations(db).find().sort({ name: 1 }).toArray();
  return docs.map((d) => organizationSchema.parse(d));
}

export async function getOrganization(db: Db, id: string): Promise<Organization | null> {
  const doc = await organizations(db).findOne({ id });
  return doc ? organizationSchema.parse(doc) : null;
}

export async function updateOrganizationName(
  db: Db,
  organizationId: string,
  name: string,
): Promise<Organization | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const doc = await organizations(db).findOneAndUpdate(
    { id: organizationId },
    { $set: { name: trimmed, updated_at: new Date() } },
    { returnDocument: "after" },
  );
  return doc ? organizationSchema.parse(doc) : null;
}

export async function addOrgInvite(
  db: Db,
  data: {
    organization_id: string;
    email: string;
    role?: OrgInviteRole;
    invited_by: string;
  },
): Promise<OrgInvite> {
  const email = normalizeEmail(data.email);
  const now = new Date();
  const existing = await orgInvites(db).findOne({ organization_id: data.organization_id, email });
  if (existing) {
    const updated: OrgInvite = orgInviteSchema.parse({
      ...existing,
      role: data.role ?? existing.role,
      invited_by: data.invited_by,
      created_at: now,
    });
    await orgInvites(db).replaceOne({ id: existing.id }, updated);
    return updated;
  }
  const row: OrgInvite = {
    id: randomUUID(),
    organization_id: data.organization_id,
    email,
    role: data.role ?? "member",
    invited_by: normalizeEmail(data.invited_by),
    created_at: now,
  };
  const parsed = orgInviteSchema.parse(row);
  await orgInvites(db).insertOne(parsed);
  return parsed;
}

export async function listOrgInvites(db: Db, organizationId: string): Promise<OrgInvite[]> {
  const docs = await orgInvites(db).find({ organization_id: organizationId }).sort({ email: 1 }).toArray();
  return docs.map((d) => orgInviteSchema.parse(d));
}

export async function revokeOrgInvite(db: Db, inviteId: string, organizationId: string): Promise<boolean> {
  const r = await orgInvites(db).deleteOne({ id: inviteId, organization_id: organizationId });
  return r.deletedCount > 0;
}

export type OrgMember = {
  email: string;
  org_role: OrgRole;
  name?: string | null;
};

export async function listOrgMembers(db: Db, organizationId: string): Promise<OrgMember[]> {
  const docs = await users(db)
    .find({ organization_id: organizationId })
    .sort({ email: 1 })
    .toArray();
  return docs.map((u) => ({
    email: String(u.email ?? ""),
    org_role: (u.org_role as OrgRole) ?? "member",
    name: u.name != null ? String(u.name) : null,
  }));
}

export async function getUserByEmail(
  db: Db,
  email: string,
): Promise<{
  email: string;
  organization_id?: string;
  org_role?: OrgRole;
  role?: string;
} | null> {
  const doc = await users(db).findOne(userEmailQuery(email));
  if (!doc) return null;
  return {
    email: String(doc.email ?? ""),
    organization_id: doc.organization_id as string | undefined,
    org_role: doc.org_role as OrgRole | undefined,
    role: doc.role as string | undefined,
  };
}

export async function setUserOrganization(
  db: Db,
  email: string,
  organizationId: string,
  orgRole: OrgRole,
): Promise<void> {
  await users(db).updateOne(userEmailQuery(email), {
    $set: { organization_id: organizationId, org_role: orgRole, email: normalizeEmail(email) },
  });
}

/** Add email to org immediately if they have signed in before; otherwise store a pending invite. */
export async function addEmailToOrganization(
  db: Db,
  data: {
    organization_id: string;
    email: string;
    role?: OrgInviteRole;
    invited_by: string;
  },
): Promise<"member" | "invited"> {
  const email = normalizeEmail(data.email);
  const orgRole: OrgRole = data.role === "owner" ? "owner" : "member";
  const existing = await getUserByEmail(db, email);
  if (existing) {
    await setUserOrganization(db, email, data.organization_id, orgRole);
    await orgInvites(db).deleteOne({ organization_id: data.organization_id, email });
    return "member";
  }
  await addOrgInvite(db, { ...data, email, role: data.role ?? "member" });
  return "invited";
}

export async function clearUserOrganization(db: Db, email: string): Promise<void> {
  await users(db).updateOne(userEmailQuery(email), {
    $unset: { organization_id: "", org_role: "" },
  });
}

export async function acceptInviteForEmail(
  db: Db,
  email: string,
): Promise<{ organization_id: string; org_role: OrgRole } | null> {
  const normalized = normalizeEmail(email);
  const invite = await orgInvites(db).findOne({ email: normalized });
  if (!invite) return null;
  const parsed = orgInviteSchema.parse(invite);
  await users(db).updateOne(userEmailQuery(email), {
    $set: {
      organization_id: parsed.organization_id,
      org_role: parsed.role,
      email: normalized,
    },
  });
  await orgInvites(db).deleteOne({ id: parsed.id });
  return { organization_id: parsed.organization_id, org_role: parsed.role };
}

export async function emailHasOrgMembership(db: Db, email: string): Promise<boolean> {
  const u = await getUserByEmail(db, email);
  return Boolean(u?.organization_id);
}

/** Migration bucket org id (null if the Default organization row does not exist yet). */
export async function getDefaultOrganizationId(db: Db): Promise<string | null> {
  const existing = await organizations(db).findOne({ name: DEFAULT_ORG_NAME });
  return existing?.id ?? null;
}

/**
 * True when the user is only on the migration Default org and may be moved to another org via Team add.
 */
export function isReclaimableDefaultOrgMembership(
  userOrgId: string | undefined,
  targetOrgId: string,
  defaultOrgId: string | null,
): boolean {
  if (!userOrgId || !defaultOrgId) return false;
  return userOrgId === defaultOrgId && userOrgId !== targetOrgId;
}

/** Returns organization id if email belongs to a different org than given (blocks cross-tenant add). */
export async function getEmailOtherOrganizationId(
  db: Db,
  email: string,
  organizationId: string,
): Promise<string | null> {
  const u = await getUserByEmail(db, email);
  if (!u?.organization_id || u.organization_id === organizationId) return null;
  const defaultOrgId = await getDefaultOrganizationId(db);
  if (isReclaimableDefaultOrgMembership(u.organization_id, organizationId, defaultOrgId)) {
    return null;
  }
  return u.organization_id;
}

export async function countOrgMembers(db: Db, organizationId: string): Promise<number> {
  return users(db).countDocuments({ organization_id: organizationId });
}

export async function countOrgInvites(db: Db, organizationId: string): Promise<number> {
  return orgInvites(db).countDocuments({ organization_id: organizationId });
}

export async function countOrgContentSignals(db: Db, organizationId: string): Promise<number> {
  return db.collection(COLLECTIONS.content_signals).countDocuments({ organization_id: organizationId });
}

async function isMigrationComplete(db: Db, migrationId: string): Promise<boolean> {
  const doc = await db.collection(MIGRATIONS_COLLECTION).findOne({ id: migrationId });
  return Boolean(doc?.done);
}

async function markMigrationComplete(db: Db, migrationId: string): Promise<void> {
  await db.collection(MIGRATIONS_COLLECTION).updateOne(
    { id: migrationId },
    { $set: { id: migrationId, done: true, completed_at: new Date() } },
    { upsert: true },
  );
}

/** Assign users without organization_id to the default org (runs once). Exported for tests. */
export async function backfillUsersToDefaultOrg(db: Db, defaultOrgId: string): Promise<number> {
  let count = 0;
  const allUsers = await users(db).find({}).toArray();
  for (const u of allUsers) {
    if (u.organization_id) continue;
    const email = String(u.email ?? "");
    const role = (u.role as string) ?? "member";
    const isAdmin = email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase() || role === "admin";
    await users(db).updateOne(
      { _id: u._id },
      {
        $set: {
          organization_id: defaultOrgId,
          org_role: isAdmin ? "owner" : "member",
        },
      },
    );
    count++;
  }
  return count;
}

/**
 * Backfill organizations, assign users, and scope content_signals / signal_items.
 */
export async function migrateOrganizations(db: Db): Promise<{ defaultOrgId?: string }> {
  let defaultOrgId = await getDefaultOrganizationId(db);
  if (!defaultOrgId) {
    defaultOrgId = (await createOrganization(db, DEFAULT_ORG_NAME)).id;
  }

  await db.collection(COLLECTIONS.content_signals).updateMany(
    { organization_id: { $exists: false } },
    { $set: { organization_id: defaultOrgId } },
  );

  const signals = await db
    .collection(COLLECTIONS.content_signals)
    .find({ organization_id: defaultOrgId })
    .project({ id: 1 })
    .toArray();
  const signalOrgMap = new Map<string, string>();
  for (const s of signals) {
    signalOrgMap.set(String(s.id), defaultOrgId);
  }

  const itemsWithoutOrg = await db
    .collection(COLLECTIONS.signal_items)
    .find({ organization_id: { $exists: false } })
    .project({ id: 1, content_signal_id: 1, vertical_id: 1 })
    .toArray();

  for (const item of itemsWithoutOrg) {
    const csId = String(item.content_signal_id ?? item.vertical_id ?? "");
    const orgId = signalOrgMap.get(csId) ?? defaultOrgId;
    await db.collection(COLLECTIONS.signal_items).updateOne({ id: item.id }, { $set: { organization_id: orgId } });
  }

  if (!(await isMigrationComplete(db, ORG_USER_BACKFILL_MIGRATION_ID))) {
    await backfillUsersToDefaultOrg(db, defaultOrgId);
    await markMigrationComplete(db, ORG_USER_BACKFILL_MIGRATION_ID);
  }

  return { defaultOrgId };
}
