"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMode } from "@/lib/agents";

type Props = {
  mode: ChatMode;
  onModeChange: (m: ChatMode) => void;
  disabled?: boolean;
};

/**
 * Compact "+" button next to the chat input. Opens an upward popover with
 * conversation options (team mode toggle, future attachments, etc.).
 * Hand-rolled (no Radix) per the modal-pattern memory.
 */
export function ActionsMenu({ mode, onModeChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const teamActive = mode === "team";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label="更多选项"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          "grid h-7 w-7 place-items-center rounded-full border transition-colors",
          teamActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          disabled ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
        title={teamActive ? "已开团队接力" : "更多选项"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
        >
          <MenuItem
            checked={teamActive}
            onClick={() => {
              onModeChange(teamActive ? "chat" : "team");
              setOpen(false);
            }}
            title="团队接力模式"
            desc="Mike → Emma → Alex 依次发言"
          />
          <MenuItem
            disabled
            badge="即将上线"
            title="添加附件"
            desc="文档 / 图片 / 链接"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  checked,
  disabled,
  onClick,
  title,
  desc,
  badge,
}: {
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        "block w-full border-b border-border px-3 py-2 text-left transition-colors last:border-b-0",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-accent",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {checked ? (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            ✓ 已开
          </span>
        ) : badge ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{desc}</div>
    </button>
  );
}
