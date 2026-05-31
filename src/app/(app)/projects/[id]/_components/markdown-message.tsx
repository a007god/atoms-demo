"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Assistant message renderer with GitHub-flavored markdown.
 * v1: no syntax highlighting — bare `<code>` styling. Add `shiki` later if needed.
 */
export function MarkdownMessage({ content }: { content: string }) {
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
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-md border border-border bg-background/60 p-3 text-xs font-mono leading-relaxed">
            {children}
          </pre>
        ),
        code: ({ className, children, ...props }) => {
          // react-markdown v9+: code inside `pre` keeps its `language-*`
          // className; standalone inline code has no className.
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
      {content}
    </ReactMarkdown>
  );
}
