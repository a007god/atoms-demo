"use client";

import { useCallback, useState, useRef } from "react";
import { ChatPanel, type ChatMessage } from "./chat-panel";
import { HtmlPreviewPanel } from "./html-preview-panel";
import { AppWindow } from "lucide-react";
import type { ChatMode } from "@/lib/agents";

type Props = {
  projectId: string;
  initialMessages: ChatMessage[];
  initialMode: ChatMode;
};

export function ProjectWorkspace({
  projectId,
  initialMessages,
  initialMode,
}: Props) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const latestHtmlRef = useRef<string | null>(null);

  const handleHtmlDetected = useCallback((html: string | null) => {
    if (html) {
      latestHtmlRef.current = html;
      setPreviewHtml(html);
    }
  }, []);

  const handleClose = () => {
    setPanelVisible(false);
  };

  const handleReopen = () => {
    setPanelVisible(true);
  };

  const showPanel = panelVisible && previewHtml;

  return (
    <div className="flex h-full">
      <div className={showPanel ? "w-1/2 min-w-0" : "w-full"}>
        <ChatPanel
          projectId={projectId}
          initialMessages={initialMessages}
          initialMode={initialMode}
          onHtmlDetected={handleHtmlDetected}
        />
      </div>
      {showPanel && (
        <div className="w-1/2 min-w-0">
          <HtmlPreviewPanel
            html={previewHtml}
            onClose={handleClose}
          />
        </div>
      )}
      {!showPanel && previewHtml && (
        <button
          type="button"
          onClick={handleReopen}
          className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg hover:bg-accent transition-colors"
          title="显示预览"
        >
          <AppWindow size={16} />
          <span>预览</span>
        </button>
      )}
    </div>
  );
}
