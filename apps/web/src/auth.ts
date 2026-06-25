import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { acceptInviteForEmail, normalizeEmail } from "@content-resourcer/db";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import clientPromise from "@/lib/mongo-auth-adapter";
import { connectMongo, withMongo } from "@/lib/mongo";
import { shouldRefreshJwtFromDb } from "@/lib/auth-jwt";

const FIRST_ADMIN_EMAIL = "ryanschumacher@themediashop.co";
const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";

async function loadUserOrgFields(email: string): Promise<{
  role: "admin" | "member";
  organizationId?: string;
  orgRole?: "owner" | "member";
}> {
  return withMongo(async (db) => {
    const doc = await db
      .collection("users")
      .findOne<{ role?: string; organization_id?: string; org_role?: string }>({
        email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });
    const role =
      (doc?.role as "admin" | "member" | undefined) ??
      (email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase() ? "admin" : "member");
    return {
      role,
      organizationId: doc?.organization_id,
      orgRole: doc?.org_role as "owner" | "member" | undefined,
    };
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(clientPromise, { databaseName: dbName }),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email) as string | undefined;
      if (!email) return token;

      if (!shouldRefreshJwtFromDb({ token, user, trigger })) {
        return token;
      }

      const db = await connectMongo();
      if (user) {
        await acceptInviteForEmail(db, email);
      } else if (!token.organizationId) {
        await acceptInviteForEmail(db, email);
      }

      const fields = await loadUserOrgFields(email);
      token.role = fields.role;
      token.organizationId = fields.organizationId;
      token.orgRole = fields.orgRole;
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.email) return;
      const db = await connectMongo();
      const accepted = await acceptInviteForEmail(db, user.email);
      const role =
        user.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase() ? "admin" : "member";
      const client = await clientPromise;
      const set: Record<string, unknown> = {
        role,
        email: normalizeEmail(user.email),
      };
      if (accepted) {
        set.organization_id = accepted.organization_id;
        set.org_role = accepted.org_role;
      }
      await client.db(dbName).collection("users").updateOne(
        { email: { $regex: new RegExp(`^${user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        { $set: set },
      );
    },
  },
});
