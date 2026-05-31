"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AGENTS, AGENT_LIST, type AgentId, type ChatMode } from "@/lib/agents";
import { ActionsMenu } from "../../../_components/actions-menu";
import { MarkdownMessage } from "./markdown-message";
import { MentionPopover, getFilteredAgents } from "./mention-popover";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  agent: string | null;
  content: string;
};

type Props = {
  projectId: string;
  initialMessages: ChatMessage[];
  initialMode?: ChatMode;
  onHtmlDetected?: (html: string | null) => void;
};

export function ChatPanel({
  projectId,
  initialMessages,
  initialMode = "chat",
  onHtmlDetected,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const userAtBottomRef = useRef(true);

  // Track whether user is scrolled to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 80;
      userAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Only auto-scroll if user is already at the bottom
  useEffect(() => {
    if (!userAtBottomRef.current) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // On real unmount (page navigation), do NOT abort the request —
  // let the server finish generating and persist messages to DB.
  // User will see the completed messages when they navigate back.
  // Only the explicit "stop" button aborts.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Pick up ?prompt=... left by the welcome screen and auto-send it.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoSentRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    const prompt = sp.get("prompt");
    if (!prompt) return;

    autoSentRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState({}, "", url.toString());

    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent when HTML code blocks are detected in messages
  useEffect(() => {
    if (!onHtmlDetected) return;
    onHtmlDetected(extractLatestHtml(messages));
  }, [messages, onHtmlDetected]);

  // Mention helpers
  function handleInputChange(value: string) {
    setInput(value);
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionOpen(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  }

  function handleMentionSelect(agentId: AgentId) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIdx = textBeforeCursor.lastIndexOf("@");
    const agentName = AGENTS[agentId].name;
    const before = input.slice(0, atIdx);
    const after = input.slice(cursorPos);
    const newValue = `${before}@${agentName} ${after}`;
    setInput(newValue);
    setMentionOpen(false);
    setMentionQuery("");
    setTimeout(() => {
      const newPos = atIdx + agentName.length + 2;
      ta.selectionStart = newPos;
      ta.selectionEnd = newPos;
      ta.focus();
    }, 0);
  }

  function handleMentionKeyDown(e: React.KeyboardEvent): boolean {
    if (!mentionOpen) return false;
    const filtered = getFilteredAgents(mentionQuery);
    if (filtered.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % filtered.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleMentionSelect(filtered[mentionIndex].id);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMentionOpen(false);
      return true;
    }
    return false;
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;

    const mentioned = parseMentions(text);

    const userTempId = `temp-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userTempId, role: "user", agent: null, content: text },
    ]);
    setInput("");
    setMentionOpen(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: text,
          mode,
          ...(mentioned.length > 0 ? { agents: mentioned } : {}),
          userTempId,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${await safeText(res)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            handleEvent(JSON.parse(payload), userTempId);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleEvent(
    event: { type: string; [k: string]: unknown },
    userTempId: string,
  ) {
    switch (event.type) {
      case "user-saved": {
        if (typeof event.messageId !== "string") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userTempId ? { ...m, id: event.messageId as string } : m,
          ),
        );
        return;
      }
      case "start": {
        if (typeof event.tempId !== "string") return;
        const agent =
          typeof event.agent === "string" ? (event.agent as AgentId) : null;
        const tempId = event.tempId;
        setMessages((prev) => [
          ...prev,
          { id: tempId, role: "assistant", agent, content: "" },
        ]);
        return;
      }
      case "delta": {
        if (typeof event.tempId !== "string" || typeof event.text !== "string") return;
        const { tempId, text } = event;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, content: m.content + text } : m,
          ),
        );
        return;
      }
      case "saved": {
        if (typeof event.tempId !== "string" || typeof event.messageId !== "string") return;
        const { tempId, messageId } = event;
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: messageId } : m)),
        );
        return;
      }
      case "replace-content": {
        if (typeof event.messageId !== "string" || typeof event.content !== "string") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: event.content as string } : m,
          ),
        );
        return;
      }
      case "title-updated": {
        router.refresh();
        return;
      }
      case "error": {
        if (typeof event.message === "string") setError(event.message);
        return;
      }
      // "done" — no-op (streaming flag is flipped in the finally block).
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">
            从下方开始与 Agent 对话。模式切换决定是单 Agent 回答还是 Mike → Emma → Alex 团队接力。
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((m, i) => (
              <Bubble
                key={m.id}
                message={m}
                isStreaming={streaming && i === messages.length - 1 && m.role === "assistant"}
              />
            ))}
            {error && (
              <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto max-w-2xl px-6 py-4"
        >
          <div ref={inputWrapperRef} className="relative rounded-2xl border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <MentionPopover
              query={mentionQuery}
              visible={mentionOpen}
              anchorRef={inputWrapperRef}
              selectedIndex={mentionIndex}
              onSelect={handleMentionSelect}
              onClose={() => setMentionOpen(false)}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e.target.value);
                autoResize(e.currentTarget);
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              disabled={streaming}
              rows={3}
              maxLength={8000}
              placeholder={
                streaming ? "回复中…" : "输入消息，@ 可指定 Agent · Enter 发送 · Shift+Enter 换行"
              }
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (handleMentionKeyDown(e)) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!streaming) formRef.current?.requestSubmit();
                }
              }}
              className="block w-full resize-none bg-transparent p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <ActionsMenu
                mode={mode}
                onModeChange={setMode}
                disabled={streaming}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
                >
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  发送
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Bubble({ message, isStreaming = false }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const [previewOpen, setPreviewOpen] = useState(false);

  // Resolve agent display info from the central definitions table.
  const agentDef =
    message.agent && message.agent in AGENTS
      ? AGENTS[message.agent as AgentId]
      : null;

  const label = isUser
    ? "你"
    : agentDef
      ? `${agentDef.name} · ${agentDef.role}`
      : "assistant";

  // Check if this message has a complete HTML block for inline preview
  const htmlContent = !isUser && !isStreaming && message.content
    ? (() => {
        const matches = [...message.content.matchAll(/```(?:html|htm)\s*\n([\s\S]*?)```/gi)];
        return matches.length > 0 ? matches[matches.length - 1][1] : null;
      })()
    : null;

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[85%]">
        <div
          className={[
            "mb-1 inline-flex items-center gap-1.5 text-[11px]",
            isUser ? "ml-auto text-muted-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          {agentDef && (
            <span
              className={[
                "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                agentDef.accent,
              ].join(" ")}
            >
              {agentDef.name[0]}
            </span>
          )}
          <span>{label}</span>
        </div>
        <div
          className={[
            "rounded-lg px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "whitespace-pre-wrap bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          ].join(" ")}
        >
          {message.content ? (
            isUser ? (
              message.content
            ) : (
              <MarkdownMessage content={message.content} streaming={isStreaming} />
            )
          ) : message.role === "assistant" ? (
            <span className="opacity-50">…</span>
          ) : null}
        </div>
        {htmlContent && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(!previewOpen)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{previewOpen ? "收起预览" : "查看预览"}</span>
            </button>
            {previewOpen && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <iframe
                  srcDoc={htmlContent}
                  sandbox="allow-scripts"
                  title="Preview"
                  className="h-[400px] w-full bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(response body unreadable)";
  }
}

const AGENT_NAME_TO_ID: Record<string, AgentId> = Object.fromEntries(
  AGENT_LIST.map((a) => [a.name.toLowerCase(), a.id]),
) as Record<string, AgentId>;

function parseMentions(text: string): AgentId[] {
  const regex = /@(Mike|Emma|Bob|Alex|David|Iris|Sarah)\b/gi;
  const seen = new Set<AgentId>();
  const result: AgentId[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const id = AGENT_NAME_TO_ID[match[1].toLowerCase()];
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function extractLatestHtml(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    // Case-insensitive, match the LAST complete ```html block in the message
    // (agent might output multiple code blocks; we want the final HTML one)
    const allMatches = [...m.content.matchAll(/```(?:html|htm)\s*\n([\s\S]*?)```/gi)];
    if (allMatches.length > 0) {
      return allMatches[allMatches.length - 1][1];
    }
  }
  return null;
}
