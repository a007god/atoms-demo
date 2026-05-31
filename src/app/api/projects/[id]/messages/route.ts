import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = Promise<{ id: string }>;

export async function GET(
  req: Request,
  { params }: { params: Params },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: session.user.id },
    select: { id: true },
  });
  if (!project) return new Response("Not found", { status: 404 });

  const conversation = await prisma.conversation.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!conversation) return Response.json([]);

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, agent: true, content: true },
  });

  return Response.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      agent: m.agent,
      content: m.content,
    })),
  );
}
