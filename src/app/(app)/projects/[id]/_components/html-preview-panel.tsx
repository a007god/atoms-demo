"use client";

import { useState } from "react";
import { Download, Monitor, Smartphone, X } from "lucide-react";

type Props = {
  html: string;
  onClose: () => void;
};

export function HtmlPreviewPanel({ html, onClose }: Props) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  async function handleDownload() {
    const blob = createZipBlob("index.html", html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <button
            type="button"
            onClick={handleDownload}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            title="下载 ZIP"
          >
            <Download size={16} />
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

function createZipBlob(filename: string, content: string): Blob {
  const encoder = new TextEncoder();
  const fileData = encoder.encode(content);
  const nameBytes = encoder.encode(filename);
  const crc = crc32(fileData);
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  // Local file header (30 + name)
  const local = new ArrayBuffer(30 + nameBytes.length);
  const lv = new DataView(local);
  lv.setUint32(0, 0x04034b50, true);   // signature
  lv.setUint16(4, 20, true);            // version needed
  lv.setUint16(6, 0, true);             // flags
  lv.setUint16(8, 0, true);             // compression: stored
  lv.setUint16(10, dosTime, true);
  lv.setUint16(12, dosDate, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, fileData.length, true);  // compressed size
  lv.setUint32(22, fileData.length, true);  // uncompressed size
  lv.setUint16(26, nameBytes.length, true);
  lv.setUint16(28, 0, true);            // extra field length
  new Uint8Array(local).set(nameBytes, 30);

  const localTotal = local.byteLength + fileData.length;

  // Central directory header (46 + name)
  const central = new ArrayBuffer(46 + nameBytes.length);
  const cv = new DataView(central);
  cv.setUint32(0, 0x02014b50, true);    // signature
  cv.setUint16(4, 20, true);             // version made by
  cv.setUint16(6, 20, true);             // version needed
  cv.setUint16(8, 0, true);              // flags
  cv.setUint16(10, 0, true);             // compression: stored
  cv.setUint16(12, dosTime, true);
  cv.setUint16(14, dosDate, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, fileData.length, true);
  cv.setUint32(24, fileData.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint16(30, 0, true);             // extra field length
  cv.setUint16(32, 0, true);             // comment length
  cv.setUint16(34, 0, true);             // disk number start
  cv.setUint16(36, 0, true);             // internal attrs
  cv.setUint32(38, 0, true);             // external attrs
  cv.setUint32(42, 0, true);             // local header offset
  new Uint8Array(central).set(nameBytes, 46);

  // End of central directory (22)
  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  ev.setUint32(0, 0x06054b50, true);     // signature
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // disk with central dir
  ev.setUint16(8, 1, true);              // entries on this disk
  ev.setUint16(10, 1, true);             // total entries
  ev.setUint32(12, central.byteLength, true);  // central dir size
  ev.setUint32(16, localTotal, true);    // central dir offset
  ev.setUint16(20, 0, true);             // comment length

  return new Blob([local, fileData, central, end], { type: "application/zip" });
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
