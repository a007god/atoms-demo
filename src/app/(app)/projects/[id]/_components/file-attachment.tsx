"use client";

import { X, FileText, ImageIcon } from "lucide-react";

export type FileAttachment = {
  name: string;
  type: "text" | "image";
  content: string;
  preview?: string;
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "html", "htm",
  "js", "ts", "jsx", "tsx", "css", "scss",
  "py", "rb", "go", "rs", "java", "c", "cpp", "h",
  "yaml", "yml", "toml", "ini", "env", "sh", "bat",
  "sql", "graphql", "svg",
]);

const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
]);

const MAX_TEXT_SIZE = 100 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function readDroppedFiles(files: File[]): Promise<FileAttachment[]> {
  const results: FileAttachment[] = [];

  for (const file of files.slice(0, 5)) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (IMAGE_TYPES.has(file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        alert(`${file.name} 超过 5MB 限制`);
        continue;
      }
      const dataUrl = await readAsDataURL(file);
      results.push({
        name: file.name,
        type: "image",
        content: dataUrl,
        preview: dataUrl,
      });
    } else if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) {
      if (file.size > MAX_TEXT_SIZE) {
        alert(`${file.name} 超过 100KB 限制`);
        continue;
      }
      const text = await readAsText(file);
      results.push({
        name: file.name,
        type: "text",
        content: text,
      });
    } else {
      alert(`不支持的文件格式: ${file.name}`);
    }
  }

  return results;
}

export function FileAttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: FileAttachment[];
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {attachments.map((att, i) => (
        <div
          key={`${att.name}-${i}`}
          className="group flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px]"
        >
          {att.type === "image" ? (
            att.preview ? (
              <img
                src={att.preview}
                alt={att.name}
                className="h-5 w-5 rounded object-cover"
              />
            ) : (
              <ImageIcon size={12} className="text-muted-foreground" />
            )
          ) : (
            <FileText size={12} className="text-muted-foreground" />
          )}
          <span className="max-w-[120px] truncate text-muted-foreground">
            {att.name}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
