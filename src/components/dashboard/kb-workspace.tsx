"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KbNav } from "./kb-nav";
import { AiAssistantPanel, AI_ASSISTANT_PANEL_WIDTH } from "@/components/assistant/ai-assistant-panel";

/**
 * Owns the AI Assistant open/closed state so the toggle button (in the
 * header) and the panel itself (fixed to the right edge) stay in sync, and
 * so the content column can reserve space for the panel instead of letting
 * it overlay on top as a dimmed modal.
 */
export function KbWorkspace({
  knowledgeBaseId,
  knowledgeBaseName,
  children,
}: {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  children: React.ReactNode;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <>
      <div
        className="transition-[margin] duration-200"
        style={{ marginRight: assistantOpen ? AI_ASSISTANT_PANEL_WIDTH : 0 }}
      >
        <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Knowledge base</p>
              <h1 className="text-xl font-semibold text-foreground">{knowledgeBaseName}</h1>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setAssistantOpen((o) => !o)}>
              <Sparkles className="h-4 w-4" /> AI Assistant
            </Button>
          </div>
          <KbNav knowledgeBaseId={knowledgeBaseId} />
          <div className="pt-6">{children}</div>
        </div>
      </div>

      {assistantOpen && (
        <AiAssistantPanel knowledgeBaseId={knowledgeBaseId} onClose={() => setAssistantOpen(false)} />
      )}
    </>
  );
}
