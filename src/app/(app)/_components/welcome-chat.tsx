"use client";

import { useRef, useState } from "react";
import { startNewProject } from "../projects/actions";
import { ActionsMenu } from "./actions-menu";
import type { ChatMode } from "@/lib/agents";

export function WelcomeChat() {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<ChatMode>("chat");

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">从这里开始</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            描述你想做的事，多 Agent 团队接力把它做出来。第一条消息会自动建一个项目。
          </p>
        </div>

        <form
          ref={formRef}
          action={startNewProject}
          className="rounded-2xl border border-border bg-card text-left shadow-sm focus-within:ring-2 focus-within:ring-ring"
        >
          <input type="hidden" name="mode" value={mode} />
          <textarea
            ref={textareaRef}
            name="message"
            required
            rows={4}
            maxLength={8000}
            autoFocus
            placeholder="例如：帮我做一个咖啡店的营销 Landing Page，要醒目的 Hero 和功能区。"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            onInput={(e) => autoResize(e.currentTarget)}
            className="block w-full resize-none bg-transparent p-4 text-base leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <ActionsMenu mode={mode} onModeChange={setMode} />
              <span className="text-xs text-muted-foreground">
                Enter 发送 · Shift + Enter 换行
              </span>
            </div>
            <button
              type="submit"
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
