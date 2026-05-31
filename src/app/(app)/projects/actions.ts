"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const nameSchema = z
  .string()
  .trim()
  .min(1, "项目名不能为空")
  .max(80, "项目名最长 80 字");

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    // Proxy should have caught this, but guard anyway.
    redirect("/login");
  }
  return session.user.id;
}

export async function createProject(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "名称不合法");
  }
  const project = await prisma.project.create({
    data: { name: parsed.data, ownerId: userId },
  });
  // Layout-level revalidate so the sidebar (in (app)/layout.tsx) sees the new row.
  revalidatePath("/", "layout");
  redirect(`/projects/${project.id}`);
}

const messageSchema = z
  .string()
  .trim()
  .min(1, "消息不能为空")
  .max(8000, "消息最长 8000 字");

const modeSchema = z.enum(["chat", "team"]).default("chat");

/**
 * From the home "standby" screen: take the user's first message + mode,
 * derive a project name, create the project, and redirect to the detail
 * page with both stashed in the URL for the chat panel to auto-send.
 */
export async function startNewProject(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const parsedMsg = messageSchema.safeParse(formData.get("message"));
  if (!parsedMsg.success) {
    throw new Error(parsedMsg.error.issues[0]?.message ?? "消息不合法");
  }
  const parsedMode = modeSchema.safeParse(formData.get("mode") ?? "chat");
  if (!parsedMode.success) throw new Error("模式不合法");

  const message = parsedMsg.data;
  const mode = parsedMode.data;

  // Project name = first message, collapsed + truncated; fall back to "新对话".
  const name =
    message.replace(/\s+/g, " ").trim().slice(0, 30) || "新对话";

  const project = await prisma.project.create({
    data: { name, ownerId: userId, defaultMode: mode },
  });
  revalidatePath("/", "layout");
  // Mode is persisted on Project.defaultMode (set above) and re-read by the
  // chat panel via initialMode — no need to round-trip through the URL.
  redirect(`/projects/${project.id}?prompt=${encodeURIComponent(message)}`);
}

export async function renameProject(
  id: string,
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "名称不合法");
  }
  // Ownership check is baked into the where filter — updateMany allows
  // non-unique compounds (regular `update` would not).
  const result = await prisma.project.updateMany({
    where: { id, ownerId: userId },
    data: { name: parsed.data },
  });
  if (result.count === 0) throw new Error("项目不存在或无权操作");
  revalidatePath("/", "layout");
}

export async function deleteProject(id: string): Promise<void> {
  const userId = await requireUserId();
  const result = await prisma.project.deleteMany({
    where: { id, ownerId: userId },
  });
  if (result.count === 0) throw new Error("项目不存在或无权操作");
  revalidatePath("/", "layout");
  redirect("/");
}
