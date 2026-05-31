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
  | { type: "title-updated"; title: string }
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
          for await (const chunk of provider.stream(llmMessages, {})) {
            accumulated += chunk;
            // If client disconnected, still accumulate but skip writing
            if (!req.signal.aborted) {
              write({ type: "delta", tempId, text: chunk });
            }
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

          // Post-process: generate images for Alex's HTML output
          if (agentId === "alex" && containsHtmlBlock(accumulated)) {
            try {
              const processed = await processImages(accumulated);
              if (processed !== accumulated) {
                await prisma.message.update({
                  where: { id: saved.id },
                  data: { content: processed },
                });
                write({ type: "replace-content", messageId: saved.id, content: processed });
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

        // Mike closing summary: if team mode and last speaker wasn't Mike
        if (mode === "team" && turnOutputs.length > 0 && turnOutputs[turnOutputs.length - 1].id !== "mike" && depth < MAX_DEPTH) {
          const mike = AGENTS["mike"];
          const summaryPrompt = `你是 Mike，团队的 Team Leader。团队已经完成了工作，请用 2-3 句话总结本轮成果，告诉用户交付了什么、可以在右侧预览查看。不要 @任何人。`;
          const composedUser = composeUserMessage(message, turnOutputs);
          const llmMessages: LLMMessage[] = [
            { role: "system", content: summaryPrompt },
            ...historyLLM,
            { role: "user", content: composedUser },
          ];

          const tempId = `temp-mike-summary-${Date.now()}`;
          write({ type: "start", tempId, agent: "mike" });

          let accumulated = "";
          for await (const chunk of provider.stream(llmMessages, {})) {
            accumulated += chunk;
            if (!req.signal.aborted) {
              write({ type: "delta", tempId, text: chunk });
            }
          }

          const saved = await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              agent: "mike",
              content: accumulated,
            },
            select: { id: true },
          });
          write({ type: "saved", tempId, messageId: saved.id });
        }

        write({ type: "done" });

        // Generate a title for the project if this is the first message
        if (history.length === 0) {
          try {
            const titleMessages: LLMMessage[] = [
              { role: "system", content: "用中文为这段对话生成一个简短标题（5-15字），只输出标题本身，不要引号或其他内容。" },
              { role: "user", content: message },
            ];
            let title = "";
            for await (const chunk of provider.stream(titleMessages)) {
              title += chunk;
            }
            title = title.trim().replace(/^["'"""'']+|["'"""'']+$/g, "").slice(0, 40);
            if (title) {
              await prisma.project.update({
                where: { id: projectId },
                data: { name: title },
              });
              write({ type: "title-updated", title });
            }
          } catch {
            // Title generation is best-effort, don't fail the stream
          }
        }
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

function containsHtmlBlock(text: string): boolean {
  return /```\s*(?:html|htm)\s*\n[\s\S]*?```/i.test(text);
}

/**
 * Process images in Alex's output:
 * 1. Replace [generate-image: prompt] markers
 * 2. Replace placeholder img src (placehold.co, via.placeholder, unsplash, empty src)
 *    using the alt text as the generation prompt
 * Max 3 images per message.
 */
async function processImages(text: string): Promise<string> {
  const targets: { full: string; replacement: string; prompt: string }[] = [];

  // Strategy 1: explicit markers [generate-image: ...]
  const markerRe = /\[generate-image:\s*(.+?)\]/g;
  let m;
  while ((m = markerRe.exec(text)) !== null) {
    targets.push({ full: m[0], replacement: "", prompt: m[1] });
  }

  // Strategy 2: <img> tags with placeholder src or empty src, using alt as prompt
  const imgRe = /<img\s[^>]*src=["']([^"']*)["'][^>]*>/gi;
  while ((m = imgRe.exec(text)) !== null) {
    const src = m[1];
    const isPlaceholder =
      !src ||
      src.includes("placehold") ||
      src.includes("placeholder") ||
      src.includes("unsplash.com/photos") ||
      src.startsWith("#") ||
      src === "about:blank";
    if (!isPlaceholder) continue;

    const altMatch = m[0].match(/alt=["']([^"']+)["']/i);
    if (!altMatch) continue;

    const alreadyHasMarker = targets.some((t) => m![0].includes(t.full));
    if (alreadyHasMarker) continue;

    targets.push({ full: src, replacement: "", prompt: altMatch[1] });
  }

  if (targets.length === 0) return text;

  const toGenerate = targets.slice(0, 3);
  const results = await Promise.allSettled(
    toGenerate.map((item) =>
      generateImage(item.prompt, { size: "1024x1024" }),
    ),
  );

  let result = text;
  for (let i = 0; i < toGenerate.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      const dataUrl = `data:image/png;base64,${r.value.b64}`;
      result = result.replace(toGenerate[i].full, dataUrl);
    }
  }
  return result;
}
