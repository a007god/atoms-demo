"use client";

import { useEffect, useRef, useState } from "react";
import { AGENTS, type AgentId, type ChatMode } from "@/lib/agents";
import { ActionsMenu } from "../../../_components/actions-menu";
import { MarkdownMessage } from "./markdown-message";

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
};

export function ChatPanel({
  projectId,
  initialMessages,
  initialMode = "chat",
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Stick to bottom whenever messages change.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Pick up ?prompt=... left by the welcome screen and auto-send it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const prompt = sp.get("prompt");
    if (!prompt) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState({}, "", url.toString());

    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;

    const userTempId = `temp-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userTempId, role: "user", agent: null, content: text },
    ]);
    setInput("");
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
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
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
          <div className="rounded-2xl border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize(e.currentTarget);
              }}
              disabled={streaming}
              rows={3}
              maxLength={8000}
              placeholder={
                streaming ? "回复中…" : "输入消息，Enter 发送 · Shift + Enter 换行"
              }
              onKeyDown={(e) => {
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

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

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
              <MarkdownMessage content={message.content} />
            )
          ) : message.role === "assistant" ? (
            <span className="opacity-50">…</span>
          ) : null}
        </div>
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
