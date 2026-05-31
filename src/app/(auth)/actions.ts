"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").max(200),
});

const signupSchema = credentialsSchema.extend({
  name: z.string().trim().min(1, "请填写姓名").max(80).optional(),
});

export type FormState = { error?: string } | undefined;

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "邮箱或密码错误" };
    }
    // Re-throw redirect errors so Next can act on them.
    throw error;
  }
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "该邮箱已注册" };

  const passwordHash = await hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, name: name ?? null },
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "注册成功但自动登录失败，请到登录页重试" };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
