import type { ContentSignal } from "@content-resourcer/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export type AppSession = {
  user: {
    id: string;
    email?: string | null;
    role: "admin" | "member";
    organizationId?: string;
    orgRole?: "owner" | "member";
  };
};

export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }
  return session as AppSession;
}

export async function requireOrgMember(): Promise<AppSession & { user: { organizationId: string } }> {
  const session = await requireSession();
  if (session.user.role === "admin" && session.user.organizationId) {
    return session as AppSession & { user: { organizationId: string } };
  }
  if (!session.user.organizationId) {
    redirect("/onboarding");
  }
  return session as AppSession & { user: { organizationId: string } };
}

export async function requireOrgOwner(): Promise<
  AppSession & { user: { organizationId: string; orgRole: "owner" } }
> {
  const session = await requireOrgMember();
  if (session.user.orgRole !== "owner") {
    redirect("/feed");
  }
  return session as AppSession & { user: { organizationId: string; orgRole: "owner" } };
}

export async function requirePlatformAdmin(): Promise<AppSession> {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/feed");
  }
  return session;
}

export function isPlatformAdmin(session: AppSession): boolean {
  return session.user.role === "admin";
}

export function canAccessContentSignal(signal: ContentSignal, session: AppSession): boolean {
  if (isPlatformAdmin(session)) return true;
  return Boolean(
    session.user.organizationId && signal.organization_id === session.user.organizationId,
  );
}

export function canAccessOrganization(organizationId: string, session: AppSession): boolean {
  if (isPlatformAdmin(session)) return true;
  return session.user.organizationId === organizationId;
}
