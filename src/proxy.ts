import NextAuth from "next-auth";
import { authConfigEdge } from "@/lib/auth/config.edge";

// Next 16: this file is the "proxy" convention (formerly middleware.ts).
// Auth.js v5 returns a multi-overloaded `auth` function that doubles as
// middleware when invoked by the framework with (req, event).
const { auth } = NextAuth(authConfigEdge);

export default auth;

export const config = {
  // Exclude /api/* entirely — those routes do their own auth checks and need
  // honest 401/JSON responses, not HTML redirects to /login.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
