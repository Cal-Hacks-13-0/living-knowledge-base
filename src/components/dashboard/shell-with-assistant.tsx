"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarKnowledgeBase } from "./sidebar";
import { AiAssistantPanel, AI_ASSISTANT_PANEL_WIDTH } from "@/components/assistant/ai-assistant-panel";
import { AssistantContext } from "@/components/assistant/assistant-context";

/**
 * Owns the global AI Assistant's open/closed state, exposed via context so
 * any page can render its own `<AiAssistantTrigger>` button (see
 * docs/architecture-handoff.md §14 — there's deliberately no single
 * "AI Assistant" entry in the Sidebar's nav list; Home/Search/Inbox/Settings
 * don't get a trigger, every other page does). Also derives
 * `currentKnowledgeBaseId` from the URL so the assistant has a sensible
 * default when the user doesn't name a knowledge base explicitly — it still
 * operates globally across all of them.
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
  const pathname = usePathname();
  const kbMatch = pathname?.match(/^\/kb\/([^/]+)/);
  const currentKnowledgeBaseId = kbMatch ? kbMatch[1] : null;

  return (
    <AssistantContext.Provider value={{ open: assistantOpen, toggle: () => setAssistantOpen((o) => !o) }}>
      <div className="flex h-dvh">
        <Sidebar knowledgeBases={knowledgeBases} inboxCount={inboxCount} />
        <main
          className="flex-1 overflow-y-auto transition-[margin] duration-200"
          style={{ marginRight: assistantOpen ? AI_ASSISTANT_PANEL_WIDTH : 0 }}
        >
          {children}
        </main>
        {assistantOpen && (
          <AiAssistantPanel
            currentKnowledgeBaseId={currentKnowledgeBaseId}
            onClose={() => setAssistantOpen(false)}
          />
        )}
      </div>
    </AssistantContext.Provider>
  );
}
