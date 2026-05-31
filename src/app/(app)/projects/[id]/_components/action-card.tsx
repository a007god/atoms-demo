"use client";

import { useState } from "react";
import { ChevronRight, ImageIcon, Loader2 } from "lucide-react";

type ActionType = "images";

export type ParsedAction = {
  type: ActionType;
  status: "generating" | "done";
  items: string[];
};

export function parseActionContent(content: string): ParsedAction | null {
  const match = content.match(/^<<action:(\w+):(\w+)>>/);
  if (!match) return null;

  const type = match[1] as ActionType;
  const status = match[2] as "generating" | "done";

  const items: string[] = [];
  if (status === "done") {
    const endIdx = content.indexOf("<<end>>");
    const body = endIdx !== -1
      ? content.slice(match[0].length, endIdx)
      : content.slice(match[0].length);
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) items.push(trimmed);
    }
  }

  return { type, status, items };
}

const VISIBLE_COUNT = 3;

export function ActionCard({ action }: { action: ParsedAction }) {
  const [expanded, setExpanded] = useState(false);

  if (action.status === "generating") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span>正在生成图片…</span>
      </div>
    );
  }

  if (action.items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <ImageIcon size={14} />
        <span>未生成图片</span>
      </div>
    );
  }

  const visible = expanded ? action.items : action.items.slice(0, VISIBLE_COUNT);
  const hiddenCount = action.items.length - VISIBLE_COUNT;

  return (
    <div className="rounded-md border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          size={14}
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <ImageIcon size={14} />
        <span>生成图像</span>
        <span className="ml-1 opacity-60">({action.items.length} 张)</span>
        {!expanded && hiddenCount > 0 && (
          <span className="ml-auto text-[10px] opacity-60">
            显示 {hiddenCount} 个更多
          </span>
        )}
        {expanded && (
          <span className="ml-auto text-[10px] opacity-60">收起</span>
        )}
      </button>
      <div className="border-t border-border px-3 py-1.5">
        {visible.map((item, i) => (
          <div key={i} className="truncate py-0.5 text-[11px] text-muted-foreground font-mono">
            {truncateImageDesc(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

function truncateImageDesc(desc: string): string {
  if (desc.length <= 40) return desc + ".png";
  return desc.slice(0, 37) + "....png";
}
