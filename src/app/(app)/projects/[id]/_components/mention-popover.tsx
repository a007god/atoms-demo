"use client";

import { useEffect, useRef } from "react";
import { AGENT_LIST, type AgentId } from "@/lib/agents";

type Props = {
  query: string;
  visible: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  selectedIndex: number;
  onSelect: (agentId: AgentId) => void;
  onClose: () => void;
};

export function MentionPopover({
  query,
  visible,
  anchorRef,
  selectedIndex,
  onSelect,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const filtered = AGENT_LIST.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.role.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const el = popoverRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, visible]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
    >
      {filtered.map((agent, i) => (
        <button
          key={agent.id}
          type="button"
          data-index={i}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(agent.id);
          }}
          className={[
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            i === selectedIndex ? "bg-accent" : "hover:bg-accent/50",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-medium",
              agent.accent,
            ].join(" ")}
          >
            {agent.name[0]}
          </span>
          <span className="flex-1">
            <span className="font-medium">{agent.name}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {agent.role}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function getFilteredAgents(query: string) {
  return AGENT_LIST.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.role.toLowerCase().includes(query.toLowerCase()),
  );
}
