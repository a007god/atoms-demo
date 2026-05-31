"use client";

import { useCallback, useState, useRef } from "react";
import { ChatPanel, type ChatMessage } from "./chat-panel";
import { HtmlPreviewPanel } from "./html-preview-panel";
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

  const handleHtmlDetected = useCallback((html: string | null) => {
    if (html) {
      setPreviewHtml(html);
    }
  }, []);

  const handlePreviewToggle = useCallback((html: string) => {
    setPreviewHtml(html);
    setPanelVisible(true);
  }, []);

  const handleClose = () => {
    setPanelVisible(false);
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
          onPreviewToggle={handlePreviewToggle}
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
    </div>
  );
}
