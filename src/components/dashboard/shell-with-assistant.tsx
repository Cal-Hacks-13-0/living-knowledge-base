"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Sidebar, type SidebarKnowledgeBase } from "./sidebar";
import { AiAssistantPanel } from "@/components/assistant/ai-assistant-panel";
import { AssistantContext } from "@/components/assistant/assistant-context";
import { AI_ASSISTANT_PANEL_WIDTH, ASSISTANT_SPRING } from "@/components/assistant/assistant-motion";

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
 */
export function ShellWithAssistant({
  knowledgeBases,
  inboxCount,
  userEmail,
  children,
}: {
  knowledgeBases: SidebarKnowledgeBase[];
  inboxCount: number;
  userEmail?: string;
  children: React.ReactNode;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const pathname = usePathname();
  const kbMatch = pathname?.match(/^\/kb\/([^/]+)/);
  const currentKnowledgeBaseId = kbMatch ? kbMatch[1] : null;

  return (
    <MotionConfig reducedMotion="user">
      <AssistantContext.Provider value={{ open: assistantOpen, toggle: () => setAssistantOpen((o) => !o) }}>
        <div className="flex h-dvh">
          <Sidebar knowledgeBases={knowledgeBases} inboxCount={inboxCount} userEmail={userEmail} />
          <motion.main
            animate={{ marginRight: assistantOpen ? AI_ASSISTANT_PANEL_WIDTH : "0rem" }}
            transition={ASSISTANT_SPRING}
            className="flex-1 overflow-y-auto"
          >
            {children}
          </motion.main>
          <AiAssistantPanel
            open={assistantOpen}
            currentKnowledgeBaseId={currentKnowledgeBaseId}
            onClose={() => setAssistantOpen(false)}
          />
        </div>
      </AssistantContext.Provider>
    </MotionConfig>
  );
}
