import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma, no bcrypt). Used by middleware and spread into
// the full auth.ts config.
export const authConfig = {
  // Trust the host/proxy headers (we run behind Caddy). Avoids Auth.js
  // "UntrustedHost" errors. Can also be forced via AUTH_TRUST_HOST=true.
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const protectedPaths = [
        "/dashboard",
        "/generate",
        "/courses",
        "/settings",
        "/admin",
      ];
      const isProtected = protectedPaths.some((p) =>
        nextUrl.pathname.startsWith(p),
      );
      if (isProtected) return isLoggedIn;
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.id = (user as { id?: string }).id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
