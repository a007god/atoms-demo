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

          // Pre-generate images for Alex if the task involves UI/pages
          let imageContext = "";
          if (agentId === "alex" && isUiTask(message, turnOutputs)) {
            const imgTempId = `temp-img-gen-${Date.now()}`;
            write({ type: "start", tempId: imgTempId, agent: "alex" });
            write({ type: "delta", tempId: imgTempId, text: "正在生成页面素材图片…\n" });

            try {
              const imagePrompts = await planImages(provider, message, turnOutputs, historyLLM);
              if (imagePrompts.length > 0) {
                const images = await generateBatchImages(imagePrompts);
                const available = images.filter((img) => img.url !== null);
                if (available.length > 0) {
                  imageContext = "\n\n**以下图片已生成，请直接在 HTML 中使用这些 data URL：**\n" +
                    available.map((img, idx) => `- 图${idx + 1}（${img.desc}）: ${img.url}`).join("\n");
                  write({ type: "delta", tempId: imgTempId, text: `已生成 ${available.length} 张图片，开始编写页面…\n` });
                }
              }
            } catch (imgErr) {
              console.error("Pre-generation images failed:", imgErr);
            }

            // Remove the image generation message (it was just a status indicator)
            write({ type: "delta", tempId: imgTempId, text: "" });
            // Save as a brief status message
            const imgSaved = await prisma.message.create({
              data: {
                conversationId,
                role: "assistant",
                agent: "alex",
                content: imageContext ? `已生成 ${imageContext.split("data:image").length - 1} 张素材图片。` : "准备开始编写页面…",
              },
              select: { id: true },
            });
            write({ type: "saved", tempId: imgTempId, messageId: imgSaved.id });
            if (agentId) turnOutputs.push({ id: agentId, content: "" });
            depth++;
            // Now continue to the actual Alex code generation below
            // but DON'T increment i — we want to run Alex again with the image context
          }

          const composedUser = composeUserMessage(message, turnOutputs) + imageContext;
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
          const summaryPrompt = `你是 Mike，团队的 Team Leader。团队已经完成了工作。
用 2-3 句话总结本轮成果：交付了什么、用户可以点击"查看预览"按钮查看效果。
**绝对禁止**：不要输出任何代码、HTML、CSS、markdown代码块。不要 @任何人。只说人话。`;

          // Only pass a brief summary of what agents did, not their full output
          const briefOutputs = turnOutputs.map(o => {
            const a = AGENTS[o.id];
            const brief = o.content.length > 100
              ? o.content.slice(0, 100) + "...(代码已省略)"
              : o.content;
            return `【${a.name}】${brief}`;
          }).join("\n");

          const llmMessages: LLMMessage[] = [
            { role: "system", content: summaryPrompt },
            ...historyLLM,
            { role: "user", content: `用户需求：${message}\n\n团队产出摘要：\n${briefOutputs}` },
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
              { role: "system", content: "你是一个标题生成器。根据用户的消息，生成一个5-10字的中文短标题。只输出标题文字，不要任何标点、引号、markdown、代码或解释。" },
              { role: "user", content: `为以下内容生成标题：${message.slice(0, 100)}` },
            ];
            let title = "";
            for await (const chunk of provider.stream(titleMessages)) {
              title += chunk;
              if (title.length > 30) break;
            }
            title = title.trim().split("\n")[0].replace(/^[#"'"""''`*]+|[#"'"""''`*]+$/g, "").trim().slice(0, 20);
            if (title && !title.includes("```") && !title.includes("<")) {
              await prisma.project.update({
                where: { id: projectId },
                data: { name: title },
              });
              write({ type: "title-updated", title });
            }
          } catch {
            // Title generation is best-effort
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

function isUiTask(message: string, turnOutputs: { id: AgentId; content: string }[]): boolean {
  const combined = message + turnOutputs.map(o => o.content).join(" ");
  const keywords = ["页面", "落地页", "网页", "landing", "page", "UI", "界面", "表单", "form", "app", "工具", "计算器", "展示"];
  return keywords.some(k => combined.toLowerCase().includes(k.toLowerCase()));
}

async function planImages(
  provider: { stream: (msgs: LLMMessage[], opts?: object) => AsyncIterable<string> },
  message: string,
  turnOutputs: { id: AgentId; content: string }[],
  historyLLM: LLMMessage[],
): Promise<string[]> {
  const context = turnOutputs.map(o => `${AGENTS[o.id].name}: ${o.content.slice(0, 200)}`).join("\n");
  const planMessages: LLMMessage[] = [
    { role: "system", content: `你是一个图片规划助手。根据用户需求和团队讨论，列出这个页面需要的图片（最多15张）。
每行一个英文描述，用于 AI 生图。描述要具体（风格、颜色、构图、主体）。
只输出描述列表，每行一个，不要编号、不要其他文字。如果不需要图片就输出空。` },
    { role: "user", content: `需求：${message}\n\n团队讨论：\n${context}` },
  ];

  let result = "";
  for await (const chunk of provider.stream(planMessages, {})) {
    result += chunk;
    if (result.length > 1000) break;
  }

  return result.trim().split("\n").filter(line => line.trim().length > 10).slice(0, 15);
}

async function generateBatchImages(prompts: string[]): Promise<{ desc: string; url: string | null }[]> {
  const results: { desc: string; url: string | null }[] = [];

  for (let batch = 0; batch < prompts.length; batch += 3) {
    const chunk = prompts.slice(batch, batch + 3);
    const batchResults = await Promise.allSettled(
      chunk.map((prompt) => generateImage(prompt, { size: "1024x1024" })),
    );
    for (let j = 0; j < chunk.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push({ desc: chunk[j], url: `data:image/png;base64,${r.value.b64}` });
      } else {
        results.push({ desc: chunk[j], url: null });
      }
    }
  }

  return results;
}
