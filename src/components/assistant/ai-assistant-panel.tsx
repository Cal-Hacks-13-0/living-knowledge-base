"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Loader2, Bot, User, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  suggestedKnowledgeBase?: { goal: string } | null;
}

export const AI_ASSISTANT_PANEL_WIDTH = "26rem";

/**
 * A persistent, global side panel (not an overlay/modal) — it coexists with
 * the main content, which is expected to reserve AI_ASSISTANT_PANEL_WIDTH of
 * right margin while this is open. No backdrop, no dimming. Works across
 * every knowledge base; `currentKnowledgeBaseId` is just a default hint for
 * the assistant's tools when the user doesn't name one explicitly.
 */
export function AiAssistantPanel({
  currentKnowledgeBaseId,
  onClose,
}: {
  currentKnowledgeBaseId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
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
      const { reply, suggestedKnowledgeBase } = await apiPost<{
        reply: string;
        suggestedKnowledgeBase: { goal: string } | null;
      }>("/api/assistant/chat", {
        message: text,
        history,
        currentKnowledgeBaseId: currentKnowledgeBaseId ?? undefined,
      });
      setMessages((m) => [...m, { role: "assistant", content: reply, suggestedKnowledgeBase }]);
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
            <p className="text-sm font-medium text-foreground">Ask anything, across all your knowledge vaults</p>
            <p className="text-xs text-muted">
              I can also archive a link you share, run research on demand, or help start a new knowledge vault.
            </p>
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
                <div className="flex max-w-[80%] flex-col gap-2">
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                      m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface text-foreground",
                      m.error && "border border-red-200 bg-red-50 text-red-700"
                    )}
                  >
                    {m.content}
                  </div>
                  {m.suggestedKnowledgeBase && (
                    <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">New knowledge vault</p>
                      <p className="mt-1 text-sm text-foreground">&ldquo;{m.suggestedKnowledgeBase.goal}&rdquo;</p>
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          router.push(`/new?goal=${encodeURIComponent(m.suggestedKnowledgeBase!.goal)}`)
                        }
                      >
                        Create this knowledge vault <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
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
          placeholder="Ask anything, share a link, or describe a new knowledge vault…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30"
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
