"use client";

import { useCallback, useState } from "react";
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

  const handleHtmlDetected = useCallback((html: string | null) => {
    setPreviewHtml(html);
  }, []);

  return (
    <div className="flex h-full">
      <div className={previewHtml ? "w-1/2 min-w-0" : "w-full"}>
        <ChatPanel
          projectId={projectId}
          initialMessages={initialMessages}
          initialMode={initialMode}
          onHtmlDetected={handleHtmlDetected}
        />
      </div>
      {previewHtml && (
        <div className="w-1/2 min-w-0">
          <HtmlPreviewPanel
            html={previewHtml}
            onClose={() => setPreviewHtml(null)}
          />
        </div>
      )}
    </div>
  );
}
