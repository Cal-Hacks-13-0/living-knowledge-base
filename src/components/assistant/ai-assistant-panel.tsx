"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, Loader2, Bot, User, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "./chat-markdown";
import { apiPost, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_LAYOUT_ID,
  ASSISTANT_SPRING,
  ASSISTANT_CONTENT_VARIANTS,
  ASSISTANT_CONTENT_ITEM_VARIANTS,
} from "./assistant-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  suggestedKnowledgeBase?: { goal: string } | null;
}

/**
 * A persistent, global side panel — always mounted (so chat history survives
 * close/reopen) but only renders its `motion.aside` while `open`, sharing
 * `ASSISTANT_LAYOUT_ID` with `AiAssistantTrigger` so Motion morphs the
 * trigger button directly into this panel (and back) instead of sliding a
 * separate surface in — see assistant-motion.ts. No backdrop, no dimming —
 * the main content column reserves the panel's (user-resizable) width as right
 * margin while open. `currentKnowledgeBaseId` is a default hint for the assistant's
 * tools, not a hard scope — it still operates across every knowledge base.
 */
export function AiAssistantPanel({
  open,
  currentKnowledgeBaseId,
  onClose,
  width,
  resizing,
  resizeHandle,
}: {
  open: boolean;
  currentKnowledgeBaseId: string | null;
  onClose: () => void;
  /** Panel width in px (drag its left edge to change it — see ShellWithAssistant). */
  width: number;
  /** True while the user is dragging the edge: follow the pointer instead of springing. */
  resizing: boolean;
  resizeHandle: React.ReactNode;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the input with its content (3 lines minimum, then scrolls past ~8 lines).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, width, open]);

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
    <AnimatePresence>
      {open && (
        <motion.aside
          layout
          layoutId={ASSISTANT_LAYOUT_ID}
          transition={{ layout: resizing ? { duration: 0 } : ASSISTANT_SPRING }}
          style={{
            width,
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          }}
          className="fixed right-0 top-0 z-20 flex h-dvh shrink-0 flex-col overflow-hidden border-l border-border bg-white shadow-lg"
        >
          {resizeHandle}
          <motion.div
            variants={ASSISTANT_CONTENT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="flex h-full flex-col"
          >
            <motion.div
              variants={ASSISTANT_CONTENT_ITEM_VARIANTS}
              className="flex items-center justify-between border-b border-border px-4 py-3"
            >
              <span className="text-sm font-semibold text-foreground">AI Assistant</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI Assistant"
                className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>

            <motion.div
              variants={ASSISTANT_CONTENT_ITEM_VARIANTS}
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Sparkles className="h-5 w-5 text-accent-strong" />
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
                          m.role === "user" ? "bg-foreground text-background" : "bg-accent-soft text-accent-strong"
                        )}
                      >
                        {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      </span>
                      <div className="flex max-w-[80%] flex-col gap-2">
                        <div
                          className={cn(
                            "rounded-xl px-3 py-2",
                            m.role === "user" ? "bg-chat-bubble text-foreground" : "bg-surface text-foreground",
                            m.error && "border border-red-200 bg-red-50 text-red-700"
                          )}
                        >
                          <ChatMarkdown content={m.content} />
                        </div>
                        {m.suggestedKnowledgeBase && (
                          <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                              New knowledge vault
                            </p>
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
            </motion.div>

            <motion.form
              variants={ASSISTANT_CONTENT_ITEM_VARIANTS}
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={3}
                placeholder="Ask anything, share a link, or describe a new knowledge vault…"
                className="max-h-48 min-h-[4.5rem] flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-white px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30"
              />
              <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </motion.form>
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
