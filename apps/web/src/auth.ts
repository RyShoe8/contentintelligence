import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import clientPromise from "@/lib/mongo-auth-adapter";

const FIRST_ADMIN_EMAIL = "ryanschumacher@themediashop.co";
const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: MongoDBAdapter(clientPromise, { databaseName: dbName }),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [Google],
  callbacks: {
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
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? session.user.email ?? "";
        session.user.role = (token.role as "admin" | "member") ?? "member";
      }
      return session;
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
