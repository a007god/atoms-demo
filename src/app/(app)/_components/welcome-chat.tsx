"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startNewProject } from "../projects/actions";
import { ActionsMenu } from "./actions-menu";
import type { ChatMode, AgentId } from "@/lib/agents";
import { AGENTS } from "@/lib/agents";
import { readDroppedFiles, FileAttachmentBar, type FileAttachment } from "../projects/[id]/_components/file-attachment";
import { MentionPopover, getFilteredAgents } from "../projects/[id]/_components/mention-popover";

const SUGGESTIONS = [
  "让 Alex 生成一个咖啡店落地页",
  "帮我做一个简约风格的个人简历页面",
  "让 Emma 拆解一个 SaaS 产品的功能需求",
  "做一个带动画效果的倒计时器",
  "让 Bob 设计一个微服务架构方案",
  "设计一个暗色主题的 Dashboard",
  "让 David 分析一下用户留存数据",
  "帮我写一个 Todo List 小工具",
  "让 Iris 调研一下竞品的定价策略",
  "做一个带轮播图的旅游网站首页",
  "让 Sarah 优化一下这个页面的 SEO",
  "设计一个渐变风格的登录页面",
  "让团队帮我做一个天气预报卡片",
  "让 Mike 帮我规划一个电商首页改版",
  "帮我做一个音乐播放器界面",
  "让 Alex 写一个 Markdown 编辑器",
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

type Props = { userName: string };

export function WelcomeChat({ userName }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [dragging, setDragging] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [placeholder, setPlaceholder] = useState("");
  const [inputValue, setInputValue] = useState("");

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  function handleInputChange(value: string) {
    setInputValue(value);
    if (textareaRef.current) {
      textareaRef.current.value = value;
    }
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
    const textBeforeCursor = inputValue.slice(0, cursorPos);
    const atIdx = textBeforeCursor.lastIndexOf("@");
    const agentName = AGENTS[agentId].name;
    const before = inputValue.slice(0, atIdx);
    const after = inputValue.slice(cursorPos);
    const newValue = `${before}@${agentName} ${after}`;
    setInputValue(newValue);
    if (ta) ta.value = newValue;
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

  // Typewriter effect for placeholder suggestions
  useEffect(() => {
    let cancelled = false;
    let charIdx = 0;
    let suggIdx = Math.floor(Math.random() * SUGGESTIONS.length);
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    function tick() {
      if (cancelled) return;
      const current = SUGGESTIONS[suggIdx];

      if (!deleting) {
        charIdx++;
        setPlaceholder(current.slice(0, charIdx));
        if (charIdx >= current.length) {
          timeout = setTimeout(() => { deleting = true; tick(); }, 3500);
          return;
        }
        timeout = setTimeout(tick, 80 + Math.random() * 50);
      } else {
        charIdx--;
        setPlaceholder(current.slice(0, charIdx));
        if (charIdx <= 0) {
          deleting = false;
          suggIdx = (suggIdx + 1) % SUGGESTIONS.length;
          timeout = setTimeout(tick, 600);
          return;
        }
        timeout = setTimeout(tick, 30);
      }
    }

    tick();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const newAttachments = await readDroppedFiles(files);
    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 5));
  }, []);

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

  function handleSubmit() {
    if (!textareaRef.current || !formRef.current) return;
    if (attachments.length > 0) {
      sessionStorage.setItem(
        "__atoms_pending_attachments",
        JSON.stringify(attachments.map((a) => ({ name: a.name, type: a.type, content: a.content }))),
      );
    }
    formRef.current.requestSubmit();
  }

  const greeting = getGreeting();

  return (
    <div
      className="grid h-full place-items-center px-6 relative"
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
      <div className="w-full max-w-2xl space-y-6 text-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            {greeting}{userName ? `，${userName}` : ""}
          </h1>
        </div>

        <form
          ref={formRef}
          action={startNewProject}
          className="rounded-2xl border border-border bg-card text-left shadow-sm focus-within:ring-2 focus-within:ring-ring"
        >
          <input type="hidden" name="mode" value={mode} />
          <div ref={inputWrapperRef} className="relative">
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
              name="message"
              required
              rows={3}
              maxLength={8000}
              autoFocus
              placeholder={placeholder}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (handleMentionKeyDown(e)) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              onInput={(e) => autoResize(e.currentTarget)}
              className="block w-full resize-none bg-transparent p-4 text-base leading-relaxed outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <ActionsMenu mode={mode} onModeChange={setMode} />
              <label className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <input
                  type="file"
                  multiple
                  className="hidden"
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
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              发送
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`;
}
