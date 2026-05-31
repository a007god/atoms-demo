import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfigEdge } from "./config.edge";
import { prisma } from "@/lib/db";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfigEdge,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw new InvalidCredentials();

        const ok = await compare(password, user.passwordHash);
        if (!ok) throw new InvalidCredentials();

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
    };
  }
}
