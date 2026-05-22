import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "member";
      organizationId?: string;
      orgRole?: "owner" | "member";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "member";
    organizationId?: string;
    orgRole?: "owner" | "member";
  }
}
