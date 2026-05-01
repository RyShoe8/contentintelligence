import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe auth config (no MongoDB / Node-only APIs).
 * Used by middleware. Full DB adapter and jwt enrichment live in auth.ts.
 */
export default {
  trustHost: true,
  providers: [Google],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? session.user.email ?? "";
        session.user.role = (token.role as "admin" | "member") ?? "member";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
