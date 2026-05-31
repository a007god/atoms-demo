import type { NextAuthConfig } from "next-auth";

// Edge-safe base config: no provider imports, no DB.
// Consumed by middleware (which runs on edge) and extended by the full
// node-runtime config that adds the Credentials provider.
export const authConfigEdge = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isAuthPage = pathname === "/login" || pathname === "/signup";

      // Logged-in users hitting /login or /signup → kick to home.
      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL("/", request.nextUrl));
      }

      // Public surfaces — always allow.
      if (isAuthPage || pathname.startsWith("/api/auth")) return true;

      // Everything else requires a session.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
