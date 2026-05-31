import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider, type LLMMessage } from "@/lib/llm";
import { generateImage } from "@/lib/llm/image";
import { AGENTS, PIPELINES, DEFAULT_TEAM_FALLBACK, type AgentId } from "@/lib/agents";

const MAX_DEPTH = 8;

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
  | { type: "replace-content"; messageId: string; content: string }
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
  const encoder = new TextEncoder();

  // Build initial worklist
  const initialPipeline: (AgentId | null)[] =
    mentionedAgents && mentionedAgents.length > 0
      ? mentionedAgents
      : PIPELINES[mode];

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

      const turnOutputs: { id: AgentId; content: string }[] = [];
      const visited = new Set<AgentId | null>();

      try {
        // Worklist: starts with the initial pipeline, grows dynamically
        const worklist: (AgentId | null)[] = [...initialPipeline];
        let depth = 0;

        for (let i = 0; i < worklist.length && depth < MAX_DEPTH; i++) {
          const agentId = worklist[i];
          const agent = agentId ? AGENTS[agentId] : null;

          const composedUser = composeUserMessage(message, turnOutputs);
          const llmMessages: LLMMessage[] = [
            ...(agent
              ? [{ role: "system", content: agent.systemPrompt } as LLMMessage]
              : []),
            ...historyLLM,
            { role: "user", content: composedUser },
          ];

          const tempId = `temp-${agentId ?? "assistant"}-${depth}-${Date.now()}`;
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

          // Post-process: generate images if Alex output contains markers
          if (agentId === "alex" && hasImageMarkers(accumulated)) {
            try {
              const processed = await replaceImageMarkers(accumulated, req.signal);
              if (processed !== accumulated) {
                await prisma.message.update({
                  where: { id: saved.id },
                  data: { content: processed },
                });
                write({ type: "replace-content", messageId: saved.id, content: processed });
                // Update turnOutputs with processed content
                const idx = turnOutputs.findIndex(o => o.id === agentId);
                if (idx >= 0) turnOutputs[idx].content = processed;
              }
            } catch (imgErr) {
              console.error("Image generation failed:", imgErr);
            }
          }

          if (agentId) {
            turnOutputs.push({ id: agentId, content: accumulated });
            visited.add(agentId);
          }
          depth++;

          // Dynamic routing: parse @mentions from agent output
          if (mode === "team" || (mentionedAgents && mentionedAgents.length > 0)) {
            const nextAgents = parseAgentMentions(accumulated, agentId);
            if (nextAgents.length > 0) {
              // Agent explicitly routed — replace remaining worklist
              worklist.length = i + 1;
              for (const next of nextAgents) {
                if (!visited.has(next)) {
                  worklist.push(next);
                }
              }
            } else if (mode === "team" && i === worklist.length - 1 && agentId === "mike") {
              // Only Mike gets a fallback if he forgets to @mention
              for (const fallback of DEFAULT_TEAM_FALLBACK) {
                if (!visited.has(fallback)) {
                  worklist.push(fallback);
                }
              }
            }
          }
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
 * Parse @AgentName mentions from an agent's output.
 * Returns agent IDs in order of appearance, excluding the current agent.
 */
function parseAgentMentions(text: string, currentAgent: AgentId | null): AgentId[] {
  const regex = /@\s*(Mike|Emma|Bob|Alex|David|Iris|Sarah)\b/gi;
  const nameToId: Record<string, AgentId> = {
    mike: "mike", emma: "emma", bob: "bob", alex: "alex",
    david: "david", iris: "iris", sarah: "sarah",
  };
  const seen = new Set<AgentId>();
  const result: AgentId[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const id = nameToId[match[1].toLowerCase()];
    if (id && id !== currentAgent && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/**
 * Collapse consecutive assistant rows into a single assistant message
 * so the sequence strictly alternates user/assistant.
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

const IMAGE_MARKER_RE = /\[generate-image:\s*(.+?)\]/g;

function hasImageMarkers(text: string): boolean {
  return IMAGE_MARKER_RE.test(text);
}

async function replaceImageMarkers(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  IMAGE_MARKER_RE.lastIndex = 0;
  const matches: { full: string; prompt: string }[] = [];
  let m;
  while ((m = IMAGE_MARKER_RE.exec(text)) !== null) {
    matches.push({ full: m[0], prompt: m[1] });
  }
  if (matches.length === 0) return text;

  // Generate images in parallel (max 3)
  const toGenerate = matches.slice(0, 3);
  const results = await Promise.allSettled(
    toGenerate.map((item) =>
      generateImage(item.prompt, { size: "1024x1024", signal }),
    ),
  );

  let result = text;
  for (let i = 0; i < toGenerate.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      const dataUrl = `data:image/png;base64,${r.value.b64}`;
      result = result.replace(
        toGenerate[i].full,
        `![${toGenerate[i].prompt}](${dataUrl})`,
      );
    }
  }
  return result;
}
