import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and API routes.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
