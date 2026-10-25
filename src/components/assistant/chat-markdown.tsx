"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

/**
 * Renders an AI Assistant message's Markdown (the model reaches for **bold**,
 * lists, and links fairly often) instead of the previous plain
 * `whitespace-pre-wrap` div, which showed literal `**`/`-` characters.
 * `remark-breaks` keeps single newlines as line breaks (the old div's
 * behavior via `white-space: pre-wrap`) so this is a strict upgrade, not a
 * layout change. Restyled through `components` to match the chat bubble's
 * existing type scale — no default browser margins/headings.
 */
export function ChatMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
          ),
          // The model occasionally reaches for a heading; keep it inline with
          // body text rather than jumping to a much larger browser default.
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
