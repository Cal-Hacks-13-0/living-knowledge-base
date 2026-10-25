"use client";

import { useRef, useState, useEffect } from "react";
import { Sparkles, Send, Loader2, Bot, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

export const AI_ASSISTANT_PANEL_WIDTH = "26rem";

/**
 * A persistent side panel (not an overlay/modal) — it coexists with the main
 * content, which is expected to reserve AI_ASSISTANT_PANEL_WIDTH of right
 * margin while this is open (see KbWorkspace). No backdrop, no dimming.
 */
export function AiAssistantPanel({ knowledgeBaseId, onClose }: { knowledgeBaseId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setDraft("");
    setSending(true);
    try {
      const { reply } = await apiPost<{ reply: string }>(`/api/knowledge-bases/${knowledgeBaseId}/chat`, {
        message: text,
        history,
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: text, error: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      style={{ width: AI_ASSISTANT_PANEL_WIDTH }}
      className="fixed right-0 top-0 z-20 flex h-dvh shrink-0 flex-col border-l border-border bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">AI Assistant</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI Assistant"
          className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Sparkles className="h-5 w-5 text-accent" />
            <p className="text-sm font-medium text-foreground">Ask anything about this knowledge vault</p>
            <p className="text-xs text-muted">Answers are grounded in what&apos;s actually stored here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex items-start gap-2", m.role === "user" && "flex-row-reverse")}>
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    m.role === "user" ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent"
                  )}
                >
                  {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                    m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface text-foreground",
                    m.error && "border border-red-200 bg-red-50 text-red-700"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Ask anything about your knowledge vault…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30"
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
