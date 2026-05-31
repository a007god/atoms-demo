"use client";

import { useState, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, Code2 } from "lucide-react";

export function MarkdownMessage({ content, streaming = false }: { content: string; streaming?: boolean }) {
  // During streaming, replace unclosed HTML code blocks with a placeholder
  const processedContent = streaming
    ? replaceStreamingCodeBlock(content)
    : content;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="mt-4 mb-2 first:mt-0 text-base font-semibold">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-4 mb-2 first:mt-0 text-sm font-semibold">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-3 mb-1.5 first:mt-0 text-sm font-semibold">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-border" />,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        pre: ({ children }) => {
          const lang = getChildLanguage(children);
          const isHtml = lang?.toLowerCase() === "html" || lang?.toLowerCase() === "htm";
          if (isHtml && !streaming) {
            return <CollapsibleCodeBlock language="HTML">{children}</CollapsibleCodeBlock>;
          }
          return (
            <pre className="my-3 overflow-x-auto rounded-md border border-border bg-background/60 p-3 text-xs font-mono leading-relaxed">
              {children}
            </pre>
          );
        },
        code: ({ className, children, ...props }) => {
          const isBlock =
            /language-/.test(className ?? "") ||
            String(children).includes("\n");
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="rounded bg-background/70 px-1 py-0.5 text-[0.9em] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-border bg-background/40">
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="border border-border px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">{children}</td>
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}

function getChildLanguage(children: ReactNode): string | null {
  if (!isValidElement(children)) return null;
  const className: string = (children.props as { className?: string }).className ?? "";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : null;
}

function CollapsibleCodeBlock({
  children,
  language,
}: {
  children: ReactNode;
  language: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-3 rounded-md border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          size={14}
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Code2 size={14} />
        <span>{language} 代码</span>
        <span className="ml-auto text-[10px] opacity-60">
          {open ? "收起" : "展开"}
        </span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border p-3 text-xs font-mono leading-relaxed">
          {children}
        </pre>
      )}
    </div>
  );
}

/**
 * During streaming, if there's an unclosed ```html block, replace it with
 * a "generating code" placeholder so the user doesn't see raw HTML scrolling by.
 */
function replaceStreamingCodeBlock(content: string): string {
  // Check if there's a complete HTML block — if so, leave it alone
  if (/```\s*(?:html|htm)\s*\n[\s\S]*?```/i.test(content)) {
    return content;
  }
  // Check for an unclosed HTML block
  const unclosed = content.match(/^([\s\S]*?)(```\s*(?:html|htm)\s*\n[\s\S]*)$/i);
  if (unclosed) {
    const before = unclosed[1];
    const lineCount = (unclosed[2].match(/\n/g) || []).length;
    return `${before}\n\n> ⏳ 代码生成中（已生成 ${lineCount} 行）…\n`;
  }
  return content;
}
