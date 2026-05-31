"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AGENTS, AGENT_LIST, type AgentId, type ChatMode } from "@/lib/agents";
import { ActionsMenu } from "../../../_components/actions-menu";
import { MarkdownMessage } from "./markdown-message";
import { MentionPopover, getFilteredAgents } from "./mention-popover";
import { ActionCard, parseActionContent } from "./action-card";
import { FileAttachmentBar, type FileAttachment, readDroppedFiles } from "./file-attachment";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  agent: string | null;
  content: string;
  /** Image previews for display (session-only, not persisted) */
  imagePreviews?: { name: string; url: string }[];
};

type Props = {
  projectId: string;
  initialMessages: ChatMessage[];
  initialMode?: ChatMode;
  onHtmlDetected?: (html: string | null) => void;
  onPreviewToggle?: (html: string) => void;
};

export function ChatPanel({
  projectId,
  initialMessages,
  initialMode = "chat",
  onHtmlDetected,
  onPreviewToggle,
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

  // File attachment state
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (streaming) return;
    const files = Array.from(e.dataTransfer.files);
    const newAttachments = await readDroppedFiles(files);
    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 5));
  }, [streaming]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
  // Also restore any pending attachments from sessionStorage.
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

    // Restore attachments stashed by the welcome page
    let pendingAttachments: FileAttachment[] | undefined;
    const stored = sessionStorage.getItem("__atoms_pending_attachments");
    if (stored) {
      sessionStorage.removeItem("__atoms_pending_attachments");
      try {
        pendingAttachments = JSON.parse(stored) as FileAttachment[];
      } catch { /* ignore */ }
    }

    void send(prompt, pendingAttachments);
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

  async function send(textOverride?: string, attachmentsOverride?: FileAttachment[]) {
    const text = (textOverride ?? input).trim();
    const currentAttachments = attachmentsOverride ?? attachments;
    if ((!text && currentAttachments.length === 0) || streaming) return;
    const finalText = text || "请查看附件内容";

    const mentioned = parseMentions(finalText);

    // Build display content with file markers (matches backend storedContent format)
    const textFiles = currentAttachments.filter((a) => a.type === "text");
    const imageFiles = currentAttachments.filter((a) => a.type === "image");
    const fileSections = [
      ...textFiles.map((a) => `---\n[文件: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``),
      ...imageFiles.map((a) => `[图片: ${a.name}]`),
    ];
    const displayContent = fileSections.length > 0
      ? finalText + "\n\n" + fileSections.join("\n\n")
      : finalText;

    const userTempId = `temp-user-${Date.now()}`;
    const imgPreviews = currentAttachments
      .filter((a) => a.type === "image" && a.preview)
      .map((a) => ({ name: a.name, url: a.preview! }));
    setMessages((prev) => [
      ...prev,
      {
        id: userTempId,
        role: "user",
        agent: null,
        content: displayContent,
        ...(imgPreviews.length > 0 ? { imagePreviews: imgPreviews } : {}),
      },
    ]);
    setInput("");
    setAttachments([]);
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
          message: finalText,
          mode,
          ...(mentioned.length > 0 ? { agents: mentioned } : {}),
          ...(currentAttachments.length > 0 ? { attachments: currentAttachments.map((a) => ({ name: a.name, type: a.type, content: a.content })) } : {}),
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
        if (typeof event.content !== "string") return;
        const matchId = (event.messageId ?? event.tempId) as string | undefined;
        if (!matchId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === matchId ? { ...m, content: event.content as string } : m,
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
    <div
      className="flex h-full flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="rounded-xl border-2 border-dashed border-primary px-8 py-6">
            <span className="text-sm font-medium text-primary">松开以添加文件</span>
          </div>
        </div>
      )}
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
                onShowPreview={onPreviewToggle}
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
          <div
            ref={inputWrapperRef}
            className="relative rounded-2xl border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring"
          >
            <MentionPopover
              query={mentionQuery}
              visible={mentionOpen}
              anchorRef={inputWrapperRef}
              selectedIndex={mentionIndex}
              onSelect={handleMentionSelect}
              onClose={() => setMentionOpen(false)}
            />
            {attachments.length > 0 && (
              <FileAttachmentBar attachments={attachments} onRemove={removeAttachment} />
            )}
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
                streaming ? "回复中…" : "输入消息，@ 可指定 Agent · 拖拽文件到此处 · Enter 发送"
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
              <div className="flex items-center gap-1">
                <ActionsMenu
                  mode={mode}
                  onModeChange={setMode}
                  disabled={streaming}
                />
                <label className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={streaming}
                    accept=".txt,.md,.csv,.json,.xml,.html,.js,.ts,.jsx,.tsx,.css,.py,.yaml,.yml,.toml,.sql,.svg,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      const newAttachments = await readDroppedFiles(files);
                      setAttachments((prev) => [...prev, ...newAttachments].slice(0, 5));
                      e.target.value = "";
                    }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </label>
              </div>
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
                  disabled={!input.trim() && attachments.length === 0}
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

function Bubble({ message, isStreaming = false, onShowPreview }: { message: ChatMessage; isStreaming?: boolean; onShowPreview?: (html: string) => void }) {
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

  // Check if this is an action message (e.g., image generation card)
  const action = !isUser && message.content
    ? parseActionContent(message.content)
    : null;

  // For user messages, parse out file/image attachments from content
  const { cleanText, fileCards, imageNames } = isUser
    ? parseUserAttachments(message.content)
    : { cleanText: message.content, fileCards: [], imageNames: [] };

  // Check if this message has a complete HTML block
  const htmlContent = !isUser && !isStreaming && message.content && !action
    ? extractHtmlFromMessage(message.content)
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
        {/* Attachment cards above the bubble */}
        {isUser && ((message.imagePreviews && message.imagePreviews.length > 0) || imageNames.length > 0 || fileCards.length > 0) ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5 justify-end">
            {message.imagePreviews?.map((img, i) => (
              <div key={`img-${i}`} className="rounded-md border border-border overflow-hidden">
                <img src={img.url} alt={img.name} className="h-16 w-16 object-cover" />
              </div>
            ))}
            {!message.imagePreviews && imageNames.map((name, i) => (
              <div key={`imgref-${i}`} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <span className="max-w-[100px] truncate">{name}</span>
              </div>
            ))}
            {fileCards.map((file, i) => (
              <FileCardChip key={`file-${i}`} name={file.name} content={file.content} />
            ))}
          </div>
        ) : null}
        {action ? (
          <ActionCard action={action} />
        ) : (
          <div
            className={[
              "rounded-lg px-4 py-2.5 text-sm leading-relaxed",
              isUser
                ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            ].join(" ")}
          >
            {isUser ? (
              cleanText || <span className="opacity-70">（附件）</span>
            ) : message.content ? (
              <MarkdownMessage content={message.content} streaming={isStreaming} />
            ) : message.role === "assistant" ? (
              <span className="opacity-50">…</span>
            ) : null}
          </div>
        )}
        {htmlContent && onShowPreview && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onShowPreview(htmlContent)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>查看预览</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileCardChip({ name, content }: { name: string; content: string }) {
  const [open, setOpen] = useState(false);
  const lines = content.split("\n").length;
  return (
    <div className="w-full rounded-md border border-border bg-muted/50 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
        <span className="truncate">{name}</span>
        <span className="ml-auto opacity-60">{lines} 行 · {open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <pre className="max-h-40 overflow-auto border-t border-border px-2 py-1 font-mono text-[10px] text-muted-foreground leading-relaxed">
          {content.length > 2000 ? content.slice(0, 2000) + "\n..." : content}
        </pre>
      )}
    </div>
  );
}

function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
}

/**
 * Parse file/image attachment markers from a user message.
 * Returns the clean text (without attachment sections) and extracted file/image info.
 */
function parseUserAttachments(content: string): {
  cleanText: string;
  fileCards: { name: string; content: string }[];
  imageNames: string[];
} {
  const fileCards: { name: string; content: string }[] = [];
  const imageNames: string[] = [];

  // Extract [图片: name] markers
  let cleaned = content.replace(/\[图片:\s*(.+?)\]/g, (_, name) => {
    imageNames.push(name.trim());
    return "";
  });

  // Extract ---\n[文件: name]\n```\ncontent\n``` blocks
  const fileRe = /---\n\[文件:\s*(.+?)\]\n```\n([\s\S]*?)\n```/g;
  cleaned = cleaned.replace(fileRe, (_, name, fileContent) => {
    fileCards.push({ name: name.trim(), content: fileContent });
    return "";
  });

  // Clean up leftover whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText: cleaned, fileCards, imageNames };
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
    const html = extractHtmlFromMessage(m.content);
    if (html) return html;
  }
  return null;
}

/**
 * Extract HTML content from a fenced code block.
 * Strategy: find the LAST occurrence of ```html...``` pattern.
 * Uses greedy match to find the last closing ```.
 */
function extractHtmlFromMessage(content: string): string | null {
  // Find all ```html or ```htm opening positions
  const openRe = /```\s*(?:html|htm)\s*\n/gi;
  let lastOpenEnd = -1;
  let m;
  while ((m = openRe.exec(content)) !== null) {
    lastOpenEnd = m.index + m[0].length;
  }
  if (lastOpenEnd === -1) return null;

  // From the last opening, find the last ``` that closes it
  const rest = content.slice(lastOpenEnd);
  const closeIdx = rest.lastIndexOf("\n```");
  if (closeIdx !== -1) {
    return rest.slice(0, closeIdx);
  }

  // No closing ``` found — code was likely truncated by token limit.
  // If the content looks like HTML (starts with < or has DOCTYPE), use it anyway.
  const trimmed = rest.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
    return rest;
  }

  return null;
}
