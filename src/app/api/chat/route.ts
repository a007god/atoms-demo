import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider, type LLMMessage } from "@/lib/llm";
import { AGENTS, PIPELINES, type AgentId } from "@/lib/agents";

const agentIdEnum = z.enum([
  "mike", "emma", "bob", "alex", "david", "iris", "sarah",
]);

const bodySchema = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1).max(8000),
  mode: z.enum(["chat", "team"]).default("chat"),
  agents: z.array(agentIdEnum).min(1).optional(),
  userTempId: z.string().optional(),
});

type Event =
  | { type: "user-saved"; tempId: string; messageId: string }
  | { type: "start"; tempId: string; agent: AgentId | null }
  | { type: "delta"; tempId: string; text: string }
  | { type: "saved"; tempId: string; messageId: string }
  | { type: "done" }
  | { type: "error"; message: string };

type HistoryRow = { role: string; agent: string | null; content: string };

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }
  const { projectId, message, mode, agents: mentionedAgents, userTempId } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: { id: true },
  });
  if (!project) return new Response("Not found", { status: 404 });

  let conversation = await prisma.conversation.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { projectId: project.id, mode },
      select: { id: true },
    });
  }
  const conversationId = conversation.id;

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { role: true, agent: true, content: true },
  });

  const userRow = await prisma.message.create({
    data: { conversationId, role: "user", content: message },
    select: { id: true },
  });

  const provider = getProvider();
  const pipeline: (AgentId | null)[] =
    mentionedAgents && mentionedAgents.length > 0
      ? mentionedAgents
      : PIPELINES[mode];
  const encoder = new TextEncoder();

  // Normalize prior turns so messages strictly alternate user/assistant —
  // Anthropic requires this and the team-mode flow naturally produces
  // consecutive assistant rows (one per agent per turn).
  const historyLLM = normalizeHistory(history);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: Event) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      write({
        type: "user-saved",
        tempId: userTempId ?? `temp-user-${Date.now()}`,
        messageId: userRow.id,
      });

      // Outputs from prior agents in THIS user-message turn (not from DB
      // history). Folded into the current user message at each step so the
      // outgoing `messages` array always ends with `user` — necessary for
      // Anthropic, harmless for OpenAI.
      const turnOutputs: { id: AgentId; content: string }[] = [];

      try {
        for (let i = 0; i < pipeline.length; i++) {
          const agentId = pipeline[i];
          const agent = agentId ? AGENTS[agentId] : null;

          const composedUser = composeUserMessage(message, turnOutputs);
          const llmMessages: LLMMessage[] = [
            ...(agent
              ? [{ role: "system", content: agent.systemPrompt } as LLMMessage]
              : []),
            ...historyLLM,
            { role: "user", content: composedUser },
          ];

          const tempId = `temp-${agentId ?? "assistant"}-${i}-${Date.now()}`;
          write({ type: "start", tempId, agent: agentId });

          let accumulated = "";
          for await (const chunk of provider.stream(llmMessages, {
            signal: req.signal,
          })) {
            accumulated += chunk;
            write({ type: "delta", tempId, text: chunk });
          }

          const saved = await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              agent: agentId,
              content: accumulated,
            },
            select: { id: true },
          });
          write({ type: "saved", tempId, messageId: saved.id });

          if (agentId) turnOutputs.push({ id: agentId, content: accumulated });
        }

        write({ type: "done" });
      } catch (err) {
        console.error("/api/chat stream error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        write({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Collapse consecutive assistant rows (one per agent in team mode) into a
 * single assistant message so the resulting sequence strictly alternates
 * user/assistant — required by Anthropic, tolerated by OpenAI.
 */
function normalizeHistory(history: HistoryRow[]): LLMMessage[] {
  const out: LLMMessage[] = [];
  let pendingAssistant: string[] = [];

  const flush = () => {
    if (pendingAssistant.length === 0) return;
    out.push({
      role: "assistant",
      content: pendingAssistant.join("\n\n"),
    });
    pendingAssistant = [];
  };

  for (const m of history) {
    if (m.role === "user") {
      flush();
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const agentName =
        m.agent && m.agent in AGENTS
          ? AGENTS[m.agent as AgentId].name
          : null;
      pendingAssistant.push(
        agentName ? `【${agentName}】${m.content}` : m.content,
      );
    }
    // system rows in DB (rare) are ignored — system goes via the dedicated
    // Anthropic `system` field which we set from agent.systemPrompt.
  }
  flush();
  return out;
}

function composeUserMessage(
  originalUser: string,
  priorOutputs: { id: AgentId; content: string }[],
): string {
  if (priorOutputs.length === 0) return originalUser;

  const blocks = priorOutputs
    .map((o) => {
      const a = AGENTS[o.id];
      return `【${a.name}（${a.role}）的输出】\n${o.content}`;
    })
    .join("\n\n");

  return (
    `${originalUser}\n\n---\n\n本轮已经有以下角色发言，请按你的角色基于上下文继续：\n\n${blocks}`
  );
}
