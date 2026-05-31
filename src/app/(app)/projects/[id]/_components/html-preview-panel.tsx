"use client";

import { useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";

type Props = {
  html: string;
  onClose: () => void;
};

export function HtmlPreviewPanel({ html, onClose }: Props) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={[
              "rounded p-1.5 transition-colors",
              viewport === "desktop"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title="桌面视图"
          >
            <Monitor size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={[
              "rounded p-1.5 transition-colors",
              viewport === "mobile"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title="移动视图"
          >
            <Smartphone size={16} />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">预览</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title="关闭预览"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto bg-background/50 p-4">
        <iframe
          srcDoc={injectNavigationGuard(html)}
          sandbox="allow-scripts"
          title="Preview"
          className={[
            "h-full rounded border border-border bg-white",
            viewport === "desktop" ? "w-full" : "w-[375px]",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

function injectNavigationGuard(html: string): string {
  const script = `<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href) return;
  // Allow anchor links (in-page navigation)
  if (href.startsWith('#')) return;
  // Block all other navigation
  e.preventDefault();
});
</script>`;
  // Inject before </body> or at the end
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '</body>');
  }
  return html + script;
}
