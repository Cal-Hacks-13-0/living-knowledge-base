"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Sidebar, type SidebarKnowledgeBase } from "./sidebar";
import { AiAssistantPanel } from "@/components/assistant/ai-assistant-panel";
import { AssistantContext } from "@/components/assistant/assistant-context";
import { ASSISTANT_SPRING } from "@/components/assistant/assistant-motion";
import { AxionLogo } from "@/components/brand/axion-logo";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { AmbientBackdrop } from "@/components/ambient/ambient-backdrop";
import { CursorTrailToggle } from "@/components/ambient/cursor-trail-toggle";
import { StarField } from "@/components/ambient/star-field";
import {
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  SIDEBAR_COLLAPSE_AT,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  setLayoutPrefs,
  useLayoutPrefs,
} from "@/lib/client/layout-prefs";
import { cn } from "@/lib/utils";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Owns the global AI Assistant's open/closed state, exposed via context so
 * any page can render its own `<AiAssistantTrigger>` button (see
 * docs/architecture-handoff.md §14 — there's deliberately no single
 * "AI Assistant" entry in the Sidebar's nav list; Home/Search/Inbox/Settings
 * don't get a trigger, every other page does). Also derives
 * `currentKnowledgeBaseId` from the URL so the assistant has a sensible
 * default when the user doesn't name a knowledge base explicitly — it still
 * operates globally across all of them.
 *
 * `AiAssistantPanel` is always rendered (not conditionally mounted) so its
 * chat history survives closing and reopening the panel — it only decides
 * internally whether to render its `motion.aside` based on `open`.
 * `MotionConfig reducedMotion="user"` makes every Motion animation here
 * respect the OS-level reduced-motion preference automatically.
 *
 * Both side columns are user-resizable by dragging their inner edge (widths
 * remembered per browser, lib/client/layout-prefs.ts). Dragging the sidebar
 * nearly closed collapses it; the Axion logo then stays top-left as the
 * button that reopens it.
 */
export function ShellWithAssistant({
  knowledgeBases,
  inboxCount,
  children,
}: {
  knowledgeBases: SidebarKnowledgeBase[];
  inboxCount: number;
  children: React.ReactNode;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [dragging, setDragging] = useState<"sidebar" | "assistant" | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const prefs = useLayoutPrefs();
  const pathname = usePathname();
  const kbMatch = pathname?.match(/^\/kb\/([^/]+)/);
  const currentKnowledgeBaseId = kbMatch ? kbMatch[1] : null;

  function resizeSidebar(proposed: number) {
    // Dragged far enough left — or stepped past the minimum with the keyboard — closes it.
    const steppingPastMin =
      dragging !== "sidebar" && proposed < SIDEBAR_MIN_WIDTH && prefs.sidebarWidth <= SIDEBAR_MIN_WIDTH;
    if (proposed < SIDEBAR_COLLAPSE_AT || steppingPastMin) {
      setLayoutPrefs({ sidebarCollapsed: true });
      setDragging(null);
      return;
    }
    setLayoutPrefs({ sidebarWidth: clamp(proposed, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH) }, { persist: false });
  }

  // Write the final size to storage once a drag (or key press) ends.
  const persist = () => setLayoutPrefs({});

  return (
    <MotionConfig reducedMotion="user">
      <AssistantContext.Provider value={{ open: assistantOpen, toggle: () => setAssistantOpen((o) => !o) }}>
        <div className={cn("relative flex h-dvh", dragging && "cursor-col-resize select-none")}>
          {/* Base behind the whole workspace, so the frosted sidebar has a starfield to blur. */}
          <div aria-hidden className="ambient-charcoal pointer-events-none absolute inset-0">
            <StarField density={2.4} />
          </div>
          <Link
            href="/"
            aria-label="Axion home"
            className="fixed left-3 top-3 z-30 flex items-center gap-2 rounded-xl px-3 py-2 text-sidebar-foreground sm:hidden"
          >
            <AxionLogo className="h-6 w-auto" />
            <span className="text-sm font-semibold">Axion</span>
          </Link>
          {prefs.sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setLayoutPrefs({ sidebarCollapsed: false })}
              aria-label="Open sidebar"
              title="Open sidebar"
              className="fixed left-3 top-3 z-30 hidden items-center gap-2 chrome-glass rounded-xl px-3 py-2 text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:flex"
            >
              <AxionLogo className="h-6 w-auto" />
              <span className="text-sm font-semibold">Axion</span>
            </button>
          ) : (
            <Sidebar knowledgeBases={knowledgeBases} inboxCount={inboxCount} width={prefs.sidebarWidth}>
              <ResizeHandle
                edge="right"
                width={prefs.sidebarWidth}
                min={SIDEBAR_MIN_WIDTH}
                max={SIDEBAR_MAX_WIDTH}
                label="Resize sidebar (drag to the far left to close)"
                onResize={resizeSidebar}
                onResizeEnd={persist}
                onDraggingChange={(d) => setDragging(d ? "sidebar" : null)}
              />
            </Sidebar>
          )}
          {/* Main content region: the ambient background (starfield, cursor fluid,
              smoked veil) lives here only — never under the sidebar or the
              Assistant panel — and `.ambient` gives its content the dark glass
              theme. The region doesn't scroll; <main> inside it does, so the
              background stays put. */}
          <motion.div
            ref={regionRef}
            animate={{ marginRight: assistantOpen ? prefs.assistantWidth : 0 }}
            // Follow a drag directly; spring only for opening/closing.
            transition={dragging === "assistant" ? { duration: 0 } : ASSISTANT_SPRING}
            className="ambient relative min-w-0 flex-1"
          >
            <AmbientBackdrop mode="fluid" regionRef={regionRef} />
            <main className="relative z-10 h-full overflow-y-auto pt-14 sm:pt-0">{children}</main>
            <CursorTrailToggle className="absolute bottom-4 right-4 hidden sm:flex" />
          </motion.div>
          <AiAssistantPanel
            open={assistantOpen}
            currentKnowledgeBaseId={currentKnowledgeBaseId}
            onClose={() => setAssistantOpen(false)}
            width={prefs.assistantWidth}
            resizing={dragging === "assistant"}
            resizeHandle={
              <ResizeHandle
                edge="left"
                width={prefs.assistantWidth}
                className="left-0"
                min={ASSISTANT_MIN_WIDTH}
                max={ASSISTANT_MAX_WIDTH}
                label="Resize AI Assistant panel"
                onResize={(w) =>
                  setLayoutPrefs(
                    {
                      assistantWidth: clamp(
                        w,
                        ASSISTANT_MIN_WIDTH,
                        Math.max(ASSISTANT_MIN_WIDTH, Math.min(ASSISTANT_MAX_WIDTH, window.innerWidth * 0.7))
                      ),
                    },
                    { persist: false }
                  )
                }
                onResizeEnd={persist}
                onDraggingChange={(d) => setDragging(d ? "assistant" : null)}
              />
            }
          />
        </div>
      </AssistantContext.Provider>
    </MotionConfig>
  );
}
