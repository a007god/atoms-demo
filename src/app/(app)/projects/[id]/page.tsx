import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ChatMode } from "@/lib/agents";
import type { ChatMessage } from "./_components/chat-panel";
import { ProjectWorkspace } from "./_components/project-workspace";

type Params = Promise<{ id: string }>;

export default async function ProjectDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const project = await prisma.project.findFirst({
    where: { id, ownerId: userId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      defaultMode: true,
      conversations: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              agent: true,
              content: true,
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const initialMessages: ChatMessage[] =
    project.conversations[0]?.messages.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage["role"],
      agent: m.agent,
      content: m.content,
    })) ?? [];

  const initialMode: ChatMode =
    project.defaultMode === "team" ? "team" : "chat";

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold">{project.name}</h1>
        <p className="text-xs text-muted-foreground">
          创建于 {project.createdAt.toLocaleString("zh-CN")}
        </p>
      </header>
      <div className="flex-1 overflow-hidden">
        <ProjectWorkspace
          projectId={project.id}
          initialMessages={initialMessages}
          initialMode={initialMode}
        />
      </div>
    </div>
  );
}
