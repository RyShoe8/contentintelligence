import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import clientPromise from "@/lib/mongo-auth-adapter";

const FIRST_ADMIN_EMAIL = "ryanschumacher@themediashop.co";
const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(clientPromise, { databaseName: dbName }),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.email) {
        const client = await clientPromise;
        const doc = await client
          .db(dbName)
          .collection("users")
          .findOne<{ role?: string }>({ email: user.email });
        const role =
          (doc?.role as "admin" | "member" | undefined) ??
          (user.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase() ? "admin" : "member");
        token.role = role;
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.email) return;
      const role =
        user.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase() ? "admin" : "member";
      const client = await clientPromise;
      await client
        .db(dbName)
        .collection("users")
        .updateOne({ email: user.email }, { $set: { role } });
    },
  },
});
